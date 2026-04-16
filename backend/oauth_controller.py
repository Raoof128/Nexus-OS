"""OAuth2 PKCE + state-parameter flow for connecting Google/Microsoft email accounts."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import urllib.parse

import httpx
from litestar import Controller, Request, Response, get
from litestar.exceptions import HTTPException
from litestar.params import Parameter

try:
    from .config import get_settings
    from .email_service import encrypt_oauth_token
    from .services import create_supabase_user_client
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from email_service import encrypt_oauth_token
    from services import create_supabase_user_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider OAuth configuration
# ---------------------------------------------------------------------------

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_SCOPES = (
    "https://www.googleapis.com/auth/gmail.modify "
    "https://www.googleapis.com/auth/gmail.compose "
    "https://www.googleapis.com/auth/gmail.labels"
)

_MICROSOFT_AUTH_URL = (
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
)
_MICROSOFT_TOKEN_URL = (
    "https://login.microsoftonline.com/common/oauth2/v2.0/token"
)
_MICROSOFT_SCOPES = (
    "Mail.ReadWrite Mail.Send MailboxSettings.Read offline_access"
)

_OAUTH_COOKIE = "nexus_oauth_state"
_COOKIE_TTL = 600  # 10 minutes


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------


def _generate_pkce_pair() -> tuple[str, str]:
    """Return (verifier, challenge) using SHA-256 PKCE."""

    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = (
        urllib.parse.quote(
            __import__("base64").urlsafe_b64encode(digest).rstrip(b"=").decode("ascii"),
            safe="",
        )
    )
    return verifier, challenge


# ---------------------------------------------------------------------------
# Controller
# ---------------------------------------------------------------------------


class OAuthController(Controller):
    """OAuth2 PKCE flow for connecting Google/Microsoft email accounts."""

    path = "/api/email/accounts"

    @get("/connect")
    async def connect(
        self,
        request: Request,
        provider: str = Parameter(query="provider"),
    ) -> Response:
        """Initiate OAuth2 PKCE flow; redirect to provider consent screen."""

        settings = get_settings()

        if provider == "google":
            if not settings.google_oauth_client_id:
                raise HTTPException(
                    status_code=503, detail="Google OAuth not configured"
                )
            client_id = settings.google_oauth_client_id
            auth_url = _GOOGLE_AUTH_URL
            scopes = _GOOGLE_SCOPES
        elif provider == "microsoft":
            if not settings.microsoft_oauth_client_id:
                raise HTTPException(
                    status_code=503, detail="Microsoft OAuth not configured"
                )
            client_id = settings.microsoft_oauth_client_id
            auth_url = _MICROSOFT_AUTH_URL
            scopes = _MICROSOFT_SCOPES
        else:
            raise HTTPException(
                status_code=400, detail="Unknown provider. Use 'google' or 'microsoft'."
            )

        state = secrets.token_urlsafe(32)
        verifier, challenge = _generate_pkce_pair()

        # Build redirect_uri from request origin, but only after confirming the
        # Host header matches a configured allowed host — otherwise an attacker
        # with a spoofed Host could steer the provider back to their domain.
        host = (request.headers.get("host") or "").split(":")[0].lower()
        if host and host not in {h.lower() for h in settings.allowed_hosts}:
            raise HTTPException(status_code=400, detail="Invalid Host header")
        base = str(request.base_url).rstrip("/")
        redirect_uri = f"{base}/api/email/accounts/callback"

        # Persist state + verifier in an HttpOnly cookie (JSON-encoded)
        cookie_payload = json.dumps(
            {
                "state": state,
                "verifier": verifier,
                "provider": provider,
                "redirect_uri": redirect_uri,
                "ts": int(time.time()),
            }
        )

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scopes,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",  # Google: request refresh token
            "prompt": "consent",
        }
        consent_url = auth_url + "?" + urllib.parse.urlencode(params)

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
        code: str = Parameter(query="code"),
        oauth_state: str = Parameter(query="state"),
    ) -> Response:
        """Handle OAuth2 callback: exchange code for tokens and store them."""

        # Retrieve and validate state cookie
        raw_cookie = request.cookies.get(_OAUTH_COOKIE)
        if not raw_cookie:
            raise HTTPException(status_code=400, detail="Missing OAuth state cookie")

        try:
            cookie_data = json.loads(raw_cookie)
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(
                status_code=400, detail="Malformed OAuth state cookie"
            ) from exc

        stored_state = cookie_data.get("state", "")
        # Constant-time comparison to prevent timing attacks
        if not hmac.compare_digest(stored_state, oauth_state):
            raise HTTPException(status_code=400, detail="OAuth state mismatch")

        # Check cookie age
        issued_at = cookie_data.get("ts", 0)
        if int(time.time()) - issued_at > _COOKIE_TTL:
            raise HTTPException(status_code=400, detail="OAuth state expired")

        provider = cookie_data.get("provider", "")
        verifier = cookie_data.get("verifier", "")
        redirect_uri = cookie_data.get("redirect_uri", "")

        settings = get_settings()

        if provider == "google":
            client_id = settings.google_oauth_client_id
            client_secret = settings.google_oauth_client_secret
            token_url = _GOOGLE_TOKEN_URL
        elif provider == "microsoft":
            client_id = settings.microsoft_oauth_client_id
            client_secret = settings.microsoft_oauth_client_secret
            token_url = _MICROSOFT_TOKEN_URL
        else:
            raise HTTPException(status_code=400, detail="Unknown provider in state")

        # Exchange authorization code for tokens
        try:
            async with httpx.AsyncClient() as http:
                resp = await http.post(
                    token_url,
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
                token_data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.exception("Token exchange failed for provider %s", provider)
            raise HTTPException(
                status_code=502, detail="Token exchange failed"
            ) from exc

        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token", "")
        expires_in = token_data.get("expires_in", 3600)

        if not access_token:
            raise HTTPException(status_code=502, detail="No access token in response")

        # Fetch the email address for this account
        try:
            email_address = await _fetch_email_address(provider, access_token)
        except Exception as exc:  # pragma: no cover - provider lookup failure
            logger.exception("Failed to fetch email address from %s", provider)
            raise HTTPException(
                status_code=502, detail="Failed to retrieve account email"
            ) from exc

        # Encrypt tokens at rest
        encrypted_access = encrypt_oauth_token(access_token)
        encrypted_refresh = encrypt_oauth_token(refresh_token) if refresh_token else ""

        # Persist in email_accounts table using the user's RLS-scoped client
        access_cookie = request.cookies.get(settings.access_cookie_name)
        if not access_cookie:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user_id = getattr(request.state, "user_id", None)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        import datetime as dt

        token_expires_at = (
            dt.datetime.now(dt.timezone.utc)
            + dt.timedelta(seconds=int(expires_in))
        ).isoformat()

        row = {
            "user_id": user_id,
            "provider": provider,
            "email_address": email_address,
            "access_token_enc": encrypted_access,
            "refresh_token_enc": encrypted_refresh,
            "token_expires_at": token_expires_at,
            "status": "active",
        }

        try:
            db = create_supabase_user_client(access_cookie)
            db.from_("email_accounts").upsert(
                row, on_conflict="user_id,email_address"
            ).execute()
        except Exception as exc:  # pragma: no cover - DB failure
            logger.exception("Failed to store email account for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to store account"
            ) from exc

        # Clear the OAuth state cookie and redirect back to the app
        base = str(request.base_url).rstrip("/")
        app_redirect = f"{base}/?email_connected=1"

        response = Response(
            content=None,
            status_code=302,
            headers={"Location": app_redirect},
        )
        response.set_cookie(
            _OAUTH_COOKIE,
            "",
            max_age=0,
            httponly=True,
            samesite="lax",
            secure=settings.cookie_secure,
            path="/",
        )
        return response


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------


async def _fetch_email_address(provider: str, access_token: str) -> str:
    """Return the primary email address for the authenticated account."""

    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient() as client:
        if provider == "google":
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json().get("email", "")
        elif provider == "microsoft":
            resp = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers=headers,
                params={"$select": "mail,userPrincipalName"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("mail") or data.get("userPrincipalName", "")
    return ""
