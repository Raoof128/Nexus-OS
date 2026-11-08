"""Cookie-backed authentication endpoints.

Token model
-----------
The browser never stores Supabase tokens. ``access_token`` and
``refresh_token`` are set as HttpOnly, SameSite=Lax cookies (see
``_attach_auth_cookies``). The access token is also returned in the JSON body
of ``POST /auth/login`` and ``POST /auth/register`` only. The frontend keeps
that body token in JavaScript memory to authenticate Supabase Realtime
subscriptions (``useMedia.js``, ``useEmails.js``). Page JavaScript can read
that token, so its lifetime is the only bound on that exposure.

``/auth/refresh``, ``/auth/reset-password`` and ``/auth/session`` never return
a token. The Aion companion app uses its own anonymous Supabase session, not
this token. Known gap: ``/auth/session`` does not return the token, so Realtime
is not authenticated after a page reload until the user signs in again.

Error mapping
-------------
A credential rejection from Supabase (status 400, 401, 403 or 422) maps to a
client error the frontend can act on. Every other upstream failure (network,
Supabase 5xx, unexpected exceptions) maps to 503 with no credential hint, so
an outage is never reported as a wrong password or an expired session.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import logging
from typing import Any, Union

import jwt
from litestar import Controller, Request, Response, get, post
from litestar.exceptions import HTTPException, ServiceUnavailableException
from litestar.params import JSONBody
from supabase_auth.errors import AuthError
from supabase_auth.types import Session

try:
    from .auth import decode_supabase_token
    from .config import get_settings
    from .rate_limit import enforce_auth_rate_limit_async
    from .schemas import (
        AuthSessionResponse,
        ForgotPasswordRequest,
        LoginRequest,
        RegisterRequest,
        ResetPasswordRequest,
        SessionUser,
    )
    from .services import create_supabase_auth_client, run_blocking
except ImportError:  # pragma: no cover - supports backend cwd execution
    from auth import decode_supabase_token
    from config import get_settings
    from rate_limit import enforce_auth_rate_limit_async
    from schemas import (
        AuthSessionResponse,
        ForgotPasswordRequest,
        LoginRequest,
        RegisterRequest,
        ResetPasswordRequest,
        SessionUser,
    )
    from services import create_supabase_auth_client, run_blocking

logger = logging.getLogger(__name__)

# Upstream statuses that mean "the credentials or token were rejected".
# Everything else is treated as an infrastructure failure (503).
_REJECTED_STATUSES: frozenset[int] = frozenset({400, 401, 403, 422})

_AUTH_UNAVAILABLE_DETAIL = "Authentication service unavailable"
_INVALID_CREDENTIALS_DETAIL = "Invalid credentials"
_REGISTRATION_FAILED_DETAIL = "Registration failed"
_RESET_FAILED_DETAIL = "Password reset failed. The link may have expired."
_RESET_LOGIN_FAILED_DETAIL = "Password updated but login failed"
_SESSION_INVALID_DETAIL = "Session expired or invalid"
_FORGOT_PASSWORD_MESSAGE = "If that email exists, check your inbox"  # nosec B105

_TrustedNet = Union[
    ipaddress.IPv4Network,
    ipaddress.IPv6Network,
    ipaddress.IPv4Address,
    ipaddress.IPv6Address,
]


# ── Client identity and abuse controls ────────────────────────────────────


def _parsed_trusted_nets() -> tuple[_TrustedNet, ...]:
    """Parse ``TRUSTED_PROXY_IPS`` entries into IP addresses or CIDR networks.

    Accepts either ``10.0.0.5`` (exact) or ``10.0.0.0/24`` (subnet). Invalid
    entries are dropped with a warning so a single bad value cannot silently
    disable forwarded-header trust. Not cached: settings is itself cached and
    caching here pinned stale values across tests that flush settings.
    """

    parsed: list[_TrustedNet] = []
    for entry in get_settings().trusted_proxy_ips:
        try:
            if "/" in entry:
                parsed.append(ipaddress.ip_network(entry, strict=False))
            else:
                parsed.append(ipaddress.ip_address(entry))
        except ValueError:
            logger.warning("Ignoring malformed TRUSTED_PROXY_IPS entry: %r", entry)
    return tuple(parsed)


def _is_trusted_peer(direct_client_ip: str) -> bool:
    """Return ``True`` when the address belongs to a configured trusted proxy."""

    try:
        peer = ipaddress.ip_address(direct_client_ip)
    except ValueError:
        return False
    for net in _parsed_trusted_nets():
        if isinstance(net, (ipaddress.IPv4Network, ipaddress.IPv6Network)):
            if peer in net:
                return True
        elif peer == net:
            return True
    return False


def _client_ip(request: Request) -> str:
    """Return the client IP used as the auth rate-limit identity.

    ``X-Forwarded-For`` is only honoured when the direct peer is a trusted
    proxy. The leftmost entry is used: in production the Cloudflare Worker
    overwrites the header with ``CF-Connecting-IP`` before any later hop
    appends, so the leftmost entry is the real client. A malformed entry falls
    back to the direct peer, so arbitrary text never becomes a rate-limit key.

    Deliberately not the rightmost-untrusted hop: that needs every Cloudflare
    and nginx hop listed in ``TRUSTED_PROXY_IPS``, otherwise all users share
    one bucket. See docs/backend-audit.md (deferred items).
    """

    direct_client_ip = request.client.host if request.client else "unknown"

    if not _is_trusted_peer(direct_client_ip):
        return direct_client_ip

    forwarded_for = request.headers.get("x-forwarded-for", "")
    hops = [part.strip() for part in forwarded_for.split(",") if part.strip()]
    if not hops:
        return direct_client_ip
    try:
        return str(ipaddress.ip_address(hops[0]))
    except ValueError:
        return direct_client_ip


def _account_digest(email: str) -> str:
    """Return a keyed digest of an email for use in rate-limit keys.

    Keeps raw addresses out of Redis keys and the in-memory limiter. HMAC uses
    the server-side ``AUDIT_LOG_SALT`` so the digest cannot be reversed by
    hashing guessed addresses.
    """

    key = get_settings().audit_log_salt.encode("utf-8")
    message = email.strip().lower().encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


async def _enforce_limit(key: str) -> None:
    """Apply an auth rate limit without blocking the event loop.

    Delegates to the async limiter variant, which moves Redis round trips to a
    worker thread and keeps the in-memory path inline.
    """

    await enforce_auth_rate_limit_async(key)


def _enforce_request_origin(request: Request) -> None:
    """Reject cross-site browser requests to the cookie-issuing endpoints.

    Defence in depth on top of SameSite=Lax cookies. A present ``Origin`` must
    be in ``allowed_origins`` (``null`` is rejected). Without ``Origin``, a
    ``Sec-Fetch-Site: cross-site`` request is rejected. Requests with neither
    header (non-browser clients) are allowed.
    """

    origin = request.headers.get("origin")
    if origin is not None:
        if origin not in get_settings().allowed_origins:
            logger.warning("Rejected auth request from disallowed Origin")
            raise HTTPException(status_code=403, detail="Forbidden origin")
        return

    if request.headers.get("sec-fetch-site", "").lower() == "cross-site":
        logger.warning("Rejected cross-site auth request without Origin")
        raise HTTPException(status_code=403, detail="Forbidden origin")


# ── Session and cookie helpers ────────────────────────────────────────────


def _status_of(exc: BaseException) -> int | None:
    """Return the HTTP status attached to a Supabase auth error, if any."""

    status = getattr(exc, "status", None)
    return status if isinstance(status, int) else None


def _is_rejection(exc: BaseException) -> bool:
    """Return ``True`` when Supabase rejected the request's credentials or token."""

    return isinstance(exc, AuthError) and _status_of(exc) in _REJECTED_STATUSES


def _unavailable() -> HTTPException:
    """Build the generic 503 returned for upstream or infrastructure failures."""

    return HTTPException(status_code=503, detail=_AUTH_UNAVAILABLE_DETAIL)


def _session_snapshot(session: Session, *, include_token: bool) -> AuthSessionResponse:
    """Build the frontend-safe session view from a Supabase session.

    Uses the identity Supabase just returned, so the JWKS signature path is not
    needed here. A decode failure can therefore never discard a freshly rotated
    refresh token.
    """

    return AuthSessionResponse(
        user=SessionUser(id=session.user.id, email=session.user.email),
        expires_at=session.expires_at,
        access_token=session.access_token if include_token else None,
    )


def _session_response(session: Session, *, include_token: bool) -> Response:
    """Return the session snapshot and set the auth cookies on the response."""

    response = Response(
        content=_session_snapshot(session, include_token=include_token).model_dump()
    )
    _attach_auth_cookies(
        response,
        access_token=session.access_token,
        refresh_token=session.refresh_token,
    )
    return response


def _cookie_options() -> dict[str, Any]:
    """Return the attributes shared by the session cookies."""

    settings = get_settings()
    return {
        "domain": settings.cookie_domain,
        "path": "/",
        "secure": settings.cookie_secure,
        "httponly": True,
        "samesite": "lax",
    }


def _attach_auth_cookies(
    response: Response, access_token: str, refresh_token: str
) -> None:
    """Set the secure session cookies returned to the browser."""

    settings = get_settings()
    options = _cookie_options()
    response.set_cookie(
        settings.access_cookie_name,
        access_token,
        max_age=settings.access_cookie_max_age,
        **options,
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        refresh_token,
        max_age=settings.refresh_cookie_max_age,
        **options,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Expire both auth cookies."""

    settings = get_settings()
    options = _cookie_options()
    response.set_cookie(settings.access_cookie_name, "", max_age=0, **options)
    response.set_cookie(settings.refresh_cookie_name, "", max_age=0, **options)


# ── Controller ────────────────────────────────────────────────────────────


class AuthController(Controller):
    """Cookie-session endpoints. Tokens are never stored in browser storage.

    See the module docstring for the token exposure model and error mapping.
    """

    path = "/auth"

    @post("/login")
    async def login(self, data: JSONBody[LoginRequest], request: Request) -> Response:
        """Authenticate with Supabase and set secure session cookies."""

        _enforce_request_origin(request)
        await _enforce_limit(
            f"login:{_client_ip(request)}:{_account_digest(data.email)}"
        )
        # Built outside the upstream try so a configuration error surfaces as a
        # server error instead of a credential rejection.
        client = create_supabase_auth_client()
        try:
            auth_response = await run_blocking(
                client.auth.sign_in_with_password,
                {"email": data.email, "password": data.password},
            )
        except Exception as exc:
            if _is_rejection(exc):
                logger.info("Sign-in rejected by Supabase")
                raise HTTPException(
                    status_code=401, detail=_INVALID_CREDENTIALS_DETAIL
                ) from exc
            logger.exception("Supabase sign-in unavailable")
            raise _unavailable() from exc

        if not auth_response.session:
            raise HTTPException(status_code=401, detail=_INVALID_CREDENTIALS_DETAIL)

        return _session_response(auth_response.session, include_token=True)

    @post("/refresh")
    async def refresh(self, request: Request) -> Response:
        """Rotate the session using the refresh token cookie.

        Returns 200 ``{"authenticated": false}`` (not 401) when no refresh
        cookie is present, so the browser console stays clean for logged-out
        visitors. A rejected refresh token returns 401. An upstream outage
        returns 503, so the client keeps its session.
        """

        _enforce_request_origin(request)
        await _enforce_limit(f"refresh:{_client_ip(request)}")
        refresh_token = request.cookies.get(get_settings().refresh_cookie_name)
        if not refresh_token:
            return Response(content={"authenticated": False})

        client = create_supabase_auth_client()
        try:
            auth_response = await run_blocking(
                client.auth.refresh_session, refresh_token
            )
        except Exception as exc:
            if _is_rejection(exc):
                logger.info("Session refresh rejected by Supabase")
                raise HTTPException(
                    status_code=401, detail="Session refresh failed"
                ) from exc
            logger.exception("Supabase token refresh unavailable")
            raise _unavailable() from exc

        if not auth_response.session:
            raise HTTPException(status_code=401, detail="Session refresh failed")

        return _session_response(auth_response.session, include_token=False)

    @post("/logout")
    async def logout(self, request: Request) -> Response:
        """Revoke the current session on the server and clear the cookies.

        Runs when either session cookie is present. A browser that holds only
        the refresh cookie still has a live refresh token, so it must be
        revoked too. Scope ``local`` revokes only this session. Other devices
        stay signed in.
        """

        _enforce_request_origin(request)
        access_token = request.cookies.get(get_settings().access_cookie_name)
        refresh_token = request.cookies.get(get_settings().refresh_cookie_name)
        if access_token or refresh_token:
            try:

                def _revoke_session() -> None:
                    client = create_supabase_auth_client()
                    # An empty access token makes set_session use the refresh
                    # path, so a refresh-only browser is still revoked.
                    client.auth.set_session(access_token or "", refresh_token or "")
                    client.auth.sign_out({"scope": "local"})

                await run_blocking(_revoke_session)
            except Exception:
                logger.warning(
                    "Supabase session revocation failed during logout",
                    exc_info=True,
                )
        response = Response(content={"ok": True})
        _clear_auth_cookies(response)
        return response

    @post("/register")
    async def register(
        self, data: JSONBody[RegisterRequest], request: Request
    ) -> Response:
        """Create a new account and set secure session cookies.

        Credential rejections, including weak passwords, return 400. Upstream
        outages return 503.
        """

        _enforce_request_origin(request)
        await _enforce_limit(f"register:{_client_ip(request)}")
        client = create_supabase_auth_client()
        try:
            auth_response = await run_blocking(
                client.auth.sign_up,
                {"email": data.email, "password": data.password},
            )
        except Exception as exc:
            if _is_rejection(exc):
                logger.info("Sign-up rejected by Supabase")
                raise HTTPException(
                    status_code=400, detail=_REGISTRATION_FAILED_DETAIL
                ) from exc
            logger.exception("Supabase sign-up unavailable")
            raise _unavailable() from exc

        if not auth_response.session:
            return Response(
                content={"ok": True, "message": "Check your email to confirm"},
                status_code=200,
            )

        return _session_response(auth_response.session, include_token=True)

    @post("/forgot-password")
    async def forgot_password(
        self, data: JSONBody[ForgotPasswordRequest], request: Request
    ) -> dict:
        """Send a password reset email. Always succeeds to block enumeration.

        A per-account budget (keyed by a digest of the email) caps reset emails
        to one inbox from many IPs. When that budget is spent the endpoint
        returns the same generic response and sends nothing, so it stays
        indistinguishable from a normal success.
        """

        _enforce_request_origin(request)
        await _enforce_limit(f"forgot:{_client_ip(request)}")
        try:
            await _enforce_limit(f"forgot-email:{_account_digest(data.email)}")
        except HTTPException:
            logger.info("Password reset email budget spent for an account")
            return {"ok": True, "message": _FORGOT_PASSWORD_MESSAGE}

        settings = get_settings()
        redirect_url = settings.password_reset_redirect_url
        try:
            client = create_supabase_auth_client()
            await run_blocking(
                client.auth.reset_password_email,
                data.email,
                options={"redirect_to": redirect_url} if redirect_url else {},
            )
        except Exception:
            logger.warning("Supabase password reset request failed", exc_info=True)
        return {"ok": True, "message": _FORGOT_PASSWORD_MESSAGE}

    @post("/reset-password")
    async def reset_password(
        self, data: JSONBody[ResetPasswordRequest], request: Request
    ) -> Response:
        """Set a new password using the recovery access token.

        Tokens are read from ``X-Recovery-Access-Token`` /
        ``X-Recovery-Refresh-Token`` request headers in preference to the body
        so that they are never captured in request-body logging or Sentry
        error events. Body fields are accepted as a fallback for clients that
        cannot set custom headers. When no refresh token is supplied, the
        access token is reused for ``set_session``.
        """

        _enforce_request_origin(request)
        await _enforce_limit(f"reset:{_client_ip(request)}")
        access_token = (
            request.headers.get("x-recovery-access-token") or data.access_token
        )
        refresh_token = (
            request.headers.get("x-recovery-refresh-token")
            or data.refresh_token
            or access_token
        )
        if not access_token:
            raise HTTPException(status_code=400, detail="Recovery token is required.")

        client = create_supabase_auth_client()
        try:
            await run_blocking(client.auth.set_session, access_token, refresh_token)
            user_response = await run_blocking(
                client.auth.update_user, {"password": data.new_password}
            )
        except Exception as exc:
            if _is_rejection(exc):
                logger.info("Password reset rejected by Supabase")
                raise HTTPException(
                    status_code=400, detail=_RESET_FAILED_DETAIL
                ) from exc
            logger.exception("Supabase password reset unavailable")
            raise _unavailable() from exc

        if not user_response or not user_response.user:
            raise HTTPException(status_code=400, detail=_RESET_FAILED_DETAIL)

        try:
            login_response = await run_blocking(
                client.auth.sign_in_with_password,
                {
                    "email": user_response.user.email,
                    "password": data.new_password,
                },
            )
        except Exception as exc:
            if _is_rejection(exc):
                logger.info("Post-reset sign-in rejected by Supabase")
                raise HTTPException(
                    status_code=400, detail=_RESET_LOGIN_FAILED_DETAIL
                ) from exc
            logger.exception("Post-reset sign-in unavailable")
            raise _unavailable() from exc

        if not login_response.session:
            raise HTTPException(status_code=400, detail=_RESET_LOGIN_FAILED_DETAIL)

        return _session_response(login_response.session, include_token=False)

    @get("/session")
    async def session(self, request: Request) -> dict:
        """Return a frontend-safe session snapshot from the access cookie.

        Returns 200 ``{"authenticated": false}`` (not 401) when no access
        cookie is present. This covers logged-out and first-visit browsers.
        Returns 401 when the token is invalid or expired, which tells the
        client to attempt a silent refresh. Returns 503 when signature
        verification cannot reach the JWKS endpoint, so a verifier outage
        does not log the user out.
        """

        access_token = request.cookies.get(get_settings().access_cookie_name)
        if not access_token:
            return {"authenticated": False}

        try:
            # ES256 verification may fetch the JWKS over the network, so it
            # runs in a worker thread.
            payload = await run_blocking(decode_supabase_token, access_token)
        except (jwt.PyJWKClientConnectionError, ServiceUnavailableException) as exc:
            # auth.py raises ServiceUnavailableException for JWKS network faults.
            logger.warning("JWKS unavailable while verifying session", exc_info=True)
            raise _unavailable() from exc
        except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
            # Expired, malformed, bad-signature, unknown-key (kid) and
            # missing-key tokens are all invalid credentials.
            raise HTTPException(
                status_code=401, detail=_SESSION_INVALID_DETAIL
            ) from exc
        except Exception as exc:
            logger.exception("Session verification failed unexpectedly")
            raise _unavailable() from exc

        return AuthSessionResponse(
            user=SessionUser(
                id=payload.get("sub", ""),
                email=payload.get("email"),
            ),
            expires_at=payload.get("exp"),
        ).model_dump()
