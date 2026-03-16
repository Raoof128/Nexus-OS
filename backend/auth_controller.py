"""Cookie-backed authentication endpoints."""

from __future__ import annotations

import logging

from litestar import Controller, Request, Response, get, post
from litestar.exceptions import HTTPException

try:
    from .auth import decode_supabase_token
    from .config import get_settings
    from .rate_limit import enforce_auth_rate_limit
    from .schemas import (
        AuthSessionResponse,
        ForgotPasswordRequest,
        LoginRequest,
        RegisterRequest,
        ResetPasswordRequest,
        SessionUser,
    )
    from .services import create_supabase_auth_client
except ImportError:  # pragma: no cover - supports backend cwd execution
    from auth import decode_supabase_token
    from config import get_settings
    from rate_limit import enforce_auth_rate_limit
    from schemas import (
        AuthSessionResponse,
        ForgotPasswordRequest,
        LoginRequest,
        RegisterRequest,
        ResetPasswordRequest,
        SessionUser,
    )
    from services import create_supabase_auth_client

logger = logging.getLogger(__name__)


def _client_ip(request: Request) -> str:
    """Return the nearest client IP for auth abuse controls."""

    direct_client_ip = request.client.host if request.client else "unknown"
    settings = get_settings()

    # Only honor proxy-forwarded addresses when the immediate peer is trusted.
    if direct_client_ip not in settings.trusted_proxy_ips:
        return direct_client_ip

    forwarded_for = request.headers.get("x-forwarded-for", "")
    if not forwarded_for:
        return direct_client_ip

    forwarded_chain = [
        part.strip() for part in forwarded_for.split(",") if part.strip()
    ]
    return forwarded_chain[0] if forwarded_chain else direct_client_ip


def _build_session_response(access_token: str) -> AuthSessionResponse:
    """Derive a frontend-safe session snapshot from a Supabase access token."""

    payload = decode_supabase_token(access_token)
    return AuthSessionResponse(
        user=SessionUser(
            id=payload.get("sub", ""),
            email=payload.get("email"),
        ),
        expires_at=payload.get("exp"),
        access_token=access_token,
    )


def _attach_auth_cookies(
    response: Response, access_token: str, refresh_token: str
) -> None:
    """Set the secure session cookies returned to the browser."""

    settings = get_settings()
    cookie_options = {
        "domain": settings.cookie_domain,
        "path": "/",
        "secure": settings.cookie_secure,
        "httponly": True,
        "samesite": "strict",
    }
    response.set_cookie(
        settings.access_cookie_name,
        access_token,
        max_age=settings.access_cookie_max_age,
        **cookie_options,
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        refresh_token,
        max_age=settings.refresh_cookie_max_age,
        **cookie_options,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Expire both auth cookies."""

    settings = get_settings()
    cookie_options = {
        "domain": settings.cookie_domain,
        "path": "/",
        "secure": settings.cookie_secure,
        "httponly": True,
        "samesite": "strict",
    }
    response.set_cookie(settings.access_cookie_name, "", max_age=0, **cookie_options)
    response.set_cookie(settings.refresh_cookie_name, "", max_age=0, **cookie_options)


class AuthController(Controller):
    """Authentication endpoints that keep tokens out of browser storage."""

    path = "/auth"

    @post("/login")
    async def login(self, data: LoginRequest, request: Request) -> Response:
        """Authenticate with Supabase and set secure session cookies."""

        enforce_auth_rate_limit(f"login:{_client_ip(request)}:{data.email.lower()}")
        try:
            auth_response = create_supabase_auth_client().auth.sign_in_with_password(
                {"email": data.email, "password": data.password}
            )
        except Exception as exc:  # pragma: no cover - upstream auth failure
            logger.exception("Supabase sign-in failed for %s", data.email)
            raise HTTPException(status_code=401, detail="Invalid credentials") from exc

        if not auth_response.session:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        payload = _build_session_response(auth_response.session.access_token)
        response = Response(content=payload.model_dump())
        _attach_auth_cookies(
            response,
            access_token=auth_response.session.access_token,
            refresh_token=auth_response.session.refresh_token,
        )
        return response

    @post("/refresh")
    async def refresh(self, request: Request) -> Response:
        """Rotate the session using the refresh token cookie."""

        enforce_auth_rate_limit(f"refresh:{_client_ip(request)}")
        refresh_token = request.cookies.get(get_settings().refresh_cookie_name)
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Missing refresh token")

        try:
            auth_response = create_supabase_auth_client().auth.refresh_session(
                refresh_token
            )
        except Exception as exc:  # pragma: no cover - upstream auth failure
            logger.exception("Supabase token refresh failed")
            raise HTTPException(
                status_code=401, detail="Session refresh failed"
            ) from exc

        if not auth_response.session:
            raise HTTPException(status_code=401, detail="Session refresh failed")

        payload = _build_session_response(auth_response.session.access_token)
        response = Response(content=payload.model_dump())
        _attach_auth_cookies(
            response,
            access_token=auth_response.session.access_token,
            refresh_token=auth_response.session.refresh_token,
        )
        return response

    @post("/logout")
    async def logout(self, request: Request) -> Response:
        """Clear authentication cookies on the client."""

        access_token = request.cookies.get(get_settings().access_cookie_name)
        refresh_token = request.cookies.get(get_settings().refresh_cookie_name)
        if access_token and refresh_token:
            try:
                client = create_supabase_auth_client()
                client.auth.set_session(access_token, refresh_token)
                client.auth.sign_out()
            except Exception:  # pragma: no cover - upstream auth failure
                logger.warning(
                    "Supabase session revocation failed during logout",
                    exc_info=True,
                )
        response = Response(content={"ok": True})
        _clear_auth_cookies(response)
        return response

    @post("/register")
    async def register(self, data: RegisterRequest, request: Request) -> Response:
        """Create a new account and set secure session cookies."""

        enforce_auth_rate_limit(f"register:{_client_ip(request)}")
        try:
            auth_response = create_supabase_auth_client().auth.sign_up(
                {"email": data.email, "password": data.password}
            )
        except Exception as exc:  # pragma: no cover - upstream auth failure
            logger.exception("Supabase sign-up failed for %s", data.email)
            raise HTTPException(status_code=400, detail="Registration failed") from exc

        if not auth_response.session:
            return Response(
                content={"ok": True, "message": "Check your email to confirm"},
                status_code=200,
            )

        payload = _build_session_response(auth_response.session.access_token)
        response = Response(content=payload.model_dump())
        _attach_auth_cookies(
            response,
            access_token=auth_response.session.access_token,
            refresh_token=auth_response.session.refresh_token,
        )
        return response

    @post("/forgot-password")
    async def forgot_password(
        self, data: ForgotPasswordRequest, request: Request
    ) -> dict:
        """Send a password reset email. Always succeeds to block enumeration."""

        enforce_auth_rate_limit(f"forgot:{_client_ip(request)}")
        settings = get_settings()
        redirect_url = settings.password_reset_redirect_url
        try:
            create_supabase_auth_client().auth.reset_password_email(
                data.email,
                options={"redirect_to": redirect_url} if redirect_url else {},
            )
        except Exception:  # pragma: no cover - upstream auth failure
            logger.warning("Supabase password reset request failed", exc_info=True)
        return {"ok": True, "message": "If that email exists, check your inbox"}

    @post("/reset-password")
    async def reset_password(
        self, data: ResetPasswordRequest, request: Request
    ) -> Response:
        """Set a new password using the recovery access token."""

        enforce_auth_rate_limit(f"reset:{_client_ip(request)}")
        try:
            client = create_supabase_auth_client()
            refresh = data.refresh_token or data.access_token
            client.auth.set_session(data.access_token, refresh)
            user_response = client.auth.update_user({"password": data.new_password})
        except Exception as exc:  # pragma: no cover - upstream auth failure
            logger.exception("Password reset failed")
            raise HTTPException(
                status_code=400,
                detail="Password reset failed. The link may have expired.",
            ) from exc

        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=400,
                detail="Password reset failed. The link may have expired.",
            )

        try:
            login_response = client.auth.sign_in_with_password(
                {
                    "email": user_response.user.email,
                    "password": data.new_password,
                }
            )
        except Exception as exc:  # pragma: no cover - upstream auth failure
            logger.exception("Post-reset sign-in failed")
            raise HTTPException(
                status_code=400, detail="Password updated but login failed"
            ) from exc

        if not login_response.session:
            raise HTTPException(
                status_code=400, detail="Password updated but login failed"
            )

        payload = _build_session_response(login_response.session.access_token)
        response = Response(content=payload.model_dump())
        _attach_auth_cookies(
            response,
            access_token=login_response.session.access_token,
            refresh_token=login_response.session.refresh_token,
        )
        return response

    @get("/session")
    async def session(self, request: Request) -> AuthSessionResponse:
        """Return a frontend-safe session snapshot from the access cookie."""

        access_token = request.cookies.get(get_settings().access_cookie_name)
        if not access_token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return _build_session_response(access_token)
