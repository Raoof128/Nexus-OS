"""OAuth2 authorization-code flow with PKCE for connecting Google and Microsoft mail.

Flow:

1. ``GET /api/email/accounts/connect?provider=...`` stores ``state``, the PKCE
   verifier, the provider, the redirect URI, the connecting ``user_id`` and an
   issue timestamp in an HttpOnly cookie, then redirects to the consent screen.
2. ``GET /api/email/accounts/callback`` validates that cookie against the
   request, exchanges the code, resolves the account address, encrypts the
   tokens and upserts the ``email_accounts`` row. A provider ``error`` (for
   example ``access_denied``) clears the cookie and redirects back to the app.

The state cookie is not signed. The callback therefore re-checks the state
value, the authenticated user and the cookie age before it uses anything in it.
"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import json
import logging
import secrets
import time
import urllib.parse
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Annotated, Final

import httpx
from litestar import Controller, Request, Response, get
from litestar.exceptions import HTTPException
from litestar.params import QueryParameter
from postgrest.types import ReturnMethod

try:
    from .config import BackendSettings, get_settings
    from .email_service import encrypt_oauth_token
    from .services import create_supabase_user_client, run_blocking
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import BackendSettings, get_settings
    from email_service import encrypt_oauth_token
    from services import create_supabase_user_client, run_blocking

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider OAuth configuration
# ---------------------------------------------------------------------------

_GMAIL_PROFILE_URL: Final = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
_GRAPH_ME_URL: Final = "https://graph.microsoft.com/v1.0/me"

# Per-phase timeouts (connect, read, write, pool), not a total budget.
_HTTP_TIMEOUT: Final = httpx.Timeout(10.0, connect=5.0)

_OAUTH_COOKIE: Final = "nexus_oauth_state"
_COOKIE_TTL: Final = 600  # seconds (10 minutes)
_CLOCK_SKEW: Final = 60  # seconds a cookie timestamp may lead the server clock
_DEFAULT_EXPIRES_IN: Final = 3600
_MAX_EXPIRES_IN: Final = (
    366 * 24 * 3600
)  # keeps timedelta and datetime arithmetic in range
_MAX_EMAIL_LENGTH: Final = 320  # RFC 5321 path limit

# Provider error codes forwarded to the app. Anything else maps to a generic value.
_PROVIDER_ERRORS: Final[Mapping[str, str]] = {"access_denied": "access_denied"}


@dataclass(frozen=True, slots=True)
class _ProviderSpec:
    """Static endpoints, scopes and per-provider parameters for one OAuth provider."""

    label: str
    auth_url: str
    token_url: str
    scopes: str
    extra_auth_params: Mapping[str, str]
    client_id: Callable[[BackendSettings], str]
    client_secret: Callable[[BackendSettings], str]


_PROVIDERS: Final[Mapping[str, _ProviderSpec]] = {
    "google": _ProviderSpec(
        label="Google",
        auth_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",  # nosec B106
        scopes=(
            "https://www.googleapis.com/auth/gmail.modify "
            "https://www.googleapis.com/auth/gmail.compose "
            "https://www.googleapis.com/auth/gmail.labels"
        ),
        # Google issues a refresh token only when access_type=offline is sent.
        extra_auth_params={"access_type": "offline"},
        client_id=lambda s: s.google_oauth_client_id,
        client_secret=lambda s: s.google_oauth_client_secret,
    ),
    "microsoft": _ProviderSpec(
        label="Microsoft",
        auth_url="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_url="https://login.microsoftonline.com/common/oauth2/v2.0/token",  # nosec B106
        # User.Read is the least-privileged delegated permission for GET /me.
        # offline_access is what makes Microsoft return a refresh token.
        scopes="User.Read Mail.ReadWrite Mail.Send MailboxSettings.Read offline_access",
        extra_auth_params={},
        client_id=lambda s: s.microsoft_oauth_client_id,
        client_secret=lambda s: s.microsoft_oauth_client_secret,
    ),
}


def _configured_credentials(
    spec: _ProviderSpec, settings: BackendSettings
) -> tuple[str, str]:
    """Return ``(client_id, client_secret)`` or raise 503 when either is unset."""

    client_id = spec.client_id(settings)
    client_secret = spec.client_secret(settings)
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503, detail=f"{spec.label} OAuth not configured"
        )
    return client_id, client_secret


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------


def _generate_pkce_pair() -> tuple[str, str]:
    """Return ``(verifier, challenge)`` for S256 PKCE (RFC 7636 section 4.2)."""

    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


# ---------------------------------------------------------------------------
# State cookie helpers
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _StateCookie:
    """Shape-checked contents of the OAuth state cookie."""

    state: str
    verifier: str
    provider: str
    redirect_uri: str
    user_id: str
    issued_at: int


def _malformed_cookie() -> HTTPException:
    return HTTPException(status_code=400, detail="Malformed OAuth state cookie")


def _parse_state_cookie(raw: str) -> _StateCookie:
    """Decode and shape-check the state cookie. Any defect raises 400."""

    try:
        payload = json.loads(raw)
    except ValueError as exc:  # json.JSONDecodeError is a ValueError
        raise _malformed_cookie() from exc
    if not isinstance(payload, dict):
        raise _malformed_cookie()

    fields = {
        key: payload.get(key)
        for key in ("state", "verifier", "provider", "redirect_uri", "user_id")
    }
    issued_at = payload.get("ts")
    if (
        not all(isinstance(value, str) and value for value in fields.values())
        or not isinstance(issued_at, int)
        or isinstance(issued_at, bool)
    ):
        raise _malformed_cookie()

    return _StateCookie(
        state=fields["state"],
        verifier=fields["verifier"],
        provider=fields["provider"],
        redirect_uri=fields["redirect_uri"],
        user_id=fields["user_id"],
        issued_at=issued_at,
    )


def _same_value(expected: str, actual: str) -> bool:
    """Constant-time equality over UTF-8 bytes (compare_digest rejects non-ASCII)."""

    return hmac.compare_digest(
        expected.encode("utf-8", "surrogatepass"),
        actual.encode("utf-8", "surrogatepass"),
    )


def _clear_state_cookie(response: Response, settings: BackendSettings) -> None:
    response.set_cookie(
        _OAUTH_COOKIE,
        "",
        max_age=0,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def _redirect(location: str, settings: BackendSettings) -> Response:
    """302 to ``location`` and clear the OAuth state cookie."""

    response = Response(content=None, status_code=302, headers={"Location": location})
    _clear_state_cookie(response, settings)
    return response


def _current_user_id(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return str(user_id)


# ---------------------------------------------------------------------------
# Token exchange and account lookup
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Tokens:
    access_token: str
    refresh_token: str
    expires_in: int


def _coerce_expires_in(value: object) -> int:
    """Return the provider's lifetime in seconds, or the default when it is unusable."""

    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return _DEFAULT_EXPIRES_IN
    try:
        seconds = int(value)  # int(inf) raises OverflowError, int(nan) ValueError
    except (ValueError, OverflowError):
        return _DEFAULT_EXPIRES_IN
    if seconds <= 0:
        return _DEFAULT_EXPIRES_IN
    return min(seconds, _MAX_EXPIRES_IN)


async def _exchange_code(
    spec: _ProviderSpec,
    *,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
    verifier: str,
    provider: str,
) -> _Tokens:
    """Exchange an authorization code. Provider failures map to 502, timeouts to 504."""

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as http:
            resp = await http.post(
                spec.token_url,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code_verifier": verifier,
                },
            )
            resp.raise_for_status()
            payload = resp.json()
    except httpx.TimeoutException as exc:
        logger.exception("Token exchange timed out for provider %s", provider)
        raise HTTPException(status_code=504, detail="Token exchange failed") from exc
    except (httpx.HTTPError, ValueError) as exc:
        logger.exception("Token exchange failed for provider %s", provider)
        raise HTTPException(status_code=502, detail="Token exchange failed") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="No access token in response")
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise HTTPException(status_code=502, detail="No access token in response")
    refresh_token = payload.get("refresh_token")

    return _Tokens(
        access_token=access_token,
        refresh_token=refresh_token if isinstance(refresh_token, str) else "",
        expires_in=_coerce_expires_in(payload.get("expires_in")),
    )


async def _fetch_email_address(provider: str, access_token: str) -> str:
    """Return the account email address, or ``""`` if the provider omits it.

    Google uses the Gmail profile endpoint, which the requested ``gmail.modify``
    scope already covers, so connecting does not need extra consent. Raises
    ``httpx.HTTPError`` or ``ValueError`` on transport or body failures.
    """

    headers = {"Authorization": f"Bearer {access_token}"}
    address: object = None
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        if provider == "google":
            resp = await client.get(_GMAIL_PROFILE_URL, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):
                address = data.get("emailAddress")
        elif provider == "microsoft":
            resp = await client.get(
                _GRAPH_ME_URL,
                headers=headers,
                params={"$select": "mail,userPrincipalName"},
            )
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):
                address = data.get("mail") or data.get("userPrincipalName")
    return address.strip() if isinstance(address, str) else ""


def _is_plausible_email(address: str) -> bool:
    """Cheap sanity check before an address is used as a database key."""

    return (
        bool(address)
        and "@" in address
        and len(address) <= _MAX_EMAIL_LENGTH
        and not any(ch.isspace() for ch in address)
    )


# ---------------------------------------------------------------------------
# Controller
# ---------------------------------------------------------------------------


class OAuthController(Controller):
    """OAuth2 PKCE flow for connecting Google and Microsoft email accounts."""

    path = "/api/email/accounts"

    @get("/connect")
    async def connect(
        self,
        request: Request,
        provider: Annotated[str, QueryParameter(name="provider")],
    ) -> Response:
        """Start the OAuth2 PKCE flow and redirect to the provider consent screen."""

        settings = get_settings()

        spec = _PROVIDERS.get(provider)
        if spec is None:
            raise HTTPException(
                status_code=400, detail="Unknown provider. Use 'google' or 'microsoft'."
            )
        client_id, _ = _configured_credentials(spec, settings)
        user_id = _current_user_id(request)

        # Build redirect_uri from request origin, but only after confirming the
        # Host header matches a configured allowed host. Otherwise an attacker
        # with a spoofed Host could steer the provider back to their domain.
        host = (request.headers.get("host") or "").split(":")[0].lower()
        if host and host not in {h.lower() for h in settings.allowed_hosts}:
            raise HTTPException(status_code=400, detail="Invalid Host header")
        base = str(request.base_url).rstrip("/")
        redirect_uri = f"{base}/api/email/accounts/callback"

        state = secrets.token_urlsafe(32)
        verifier, challenge = _generate_pkce_pair()

        cookie_payload = json.dumps(
            {
                "state": state,
                "verifier": verifier,
                "provider": provider,
                "redirect_uri": redirect_uri,
                "user_id": user_id,
                "ts": int(time.time()),
            }
        )

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": spec.scopes,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "consent",
            **spec.extra_auth_params,
        }
        consent_url = f"{spec.auth_url}?{urllib.parse.urlencode(params)}"

        response = Response(
            content=None,
            status_code=302,
            headers={"Location": consent_url},
        )
        response.set_cookie(
            _OAUTH_COOKIE,
            cookie_payload,
            max_age=_COOKIE_TTL,
            httponly=True,
            samesite="lax",
            secure=settings.cookie_secure,
            path="/",
        )
        return response

    @get("/callback")
    async def callback(
        self,
        request: Request,
        code: Annotated[str | None, QueryParameter(name="code")] = None,
        oauth_state: Annotated[str | None, QueryParameter(name="state")] = None,
        error: Annotated[str | None, QueryParameter(name="error")] = None,
    ) -> Response:
        """Handle the callback: store the account, or redirect with a provider error."""

        user_id = _current_user_id(request)
        settings = get_settings()

        if not oauth_state:
            raise HTTPException(
                status_code=400, detail="Missing required query parameter 'state'"
            )
        if error is None and not code:
            raise HTTPException(
                status_code=400, detail="Missing required query parameter 'code'"
            )

        raw_cookie = request.cookies.get(_OAUTH_COOKIE)
        if not raw_cookie:
            raise HTTPException(status_code=400, detail="Missing OAuth state cookie")
        cookie = _parse_state_cookie(raw_cookie)

        # Constant-time checks. The state must match the query, and the cookie
        # must belong to the user who is calling back now.
        if not _same_value(cookie.state, oauth_state) or not _same_value(
            cookie.user_id, user_id
        ):
            raise HTTPException(status_code=400, detail="OAuth state mismatch")

        age = int(time.time()) - cookie.issued_at
        if not -_CLOCK_SKEW <= age <= _COOKIE_TTL:
            raise HTTPException(status_code=400, detail="OAuth state expired")

        base = str(request.base_url).rstrip("/")

        if error is not None:
            # The user denied consent or the provider failed. Only a fixed set of
            # values reaches the URL, never the raw provider string.
            reason = _PROVIDER_ERRORS.get(error, "provider_error")
            return _redirect(f"{base}/?email_error={reason}", settings)

        spec = _PROVIDERS.get(cookie.provider)
        if spec is None:
            raise HTTPException(status_code=400, detail="Unknown provider in state")
        client_id, client_secret = _configured_credentials(spec, settings)

        tokens = await _exchange_code(
            spec,
            client_id=client_id,
            client_secret=client_secret,
            code=code or "",
            redirect_uri=cookie.redirect_uri,
            verifier=cookie.verifier,
            provider=cookie.provider,
        )

        try:
            email_address = await _fetch_email_address(
                cookie.provider, tokens.access_token
            )
        except (httpx.HTTPError, ValueError) as exc:
            logger.exception("Failed to fetch email address from %s", cookie.provider)
            raise HTTPException(
                status_code=502, detail="Failed to retrieve account email"
            ) from exc
        if not _is_plausible_email(email_address):
            logger.warning(
                "Provider %s returned no usable account address", cookie.provider
            )
            raise HTTPException(
                status_code=502, detail="Failed to retrieve account email"
            )

        access_cookie = request.cookies.get(settings.access_cookie_name)
        if not access_cookie:
            raise HTTPException(status_code=401, detail="Not authenticated")

        token_expires_at = (
            dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=tokens.expires_in)
        ).isoformat()

        row: dict[str, object] = {
            "user_id": user_id,
            "provider": cookie.provider,
            "email_address": email_address,
            "access_token_enc": encrypt_oauth_token(tokens.access_token),
            "token_expires_at": token_expires_at,
            # Must satisfy the CHECK (status IN ('connected', 'disconnected')) in
            # supabase/migrations/20260410000001_email_inbox.sql.
            "status": "connected",
        }
        # Omit the refresh-token column when the provider sent no new token, so a
        # re-consent does not overwrite a stored working refresh token with "".
        if tokens.refresh_token:
            row["refresh_token_enc"] = encrypt_oauth_token(tokens.refresh_token)

        try:
            db = create_supabase_user_client(access_cookie)
            builder = db.from_("email_accounts").upsert(
                row,
                on_conflict="user_id,email_address",
                returning=ReturnMethod.minimal,
            )
            await run_blocking(builder.execute)
        except Exception as exc:
            # DB or client failure. The client message stays generic on purpose.
            logger.exception("Failed to store email account for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to store account"
            ) from exc

        return _redirect(f"{base}/?email_connected=1", settings)
