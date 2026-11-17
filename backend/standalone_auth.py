"""Bridge Nexus's cookie API to a private Better Auth service."""

import re
from datetime import datetime
from http.cookies import CookieError, SimpleCookie
from uuid import UUID

import httpx
from litestar import Controller, Request, Response, get, post
from litestar.connection import ASGIConnection
from litestar.exceptions import (
    HTTPException,
    NotAuthorizedException,
    PermissionDeniedException,
)
from litestar.params import JSONBody

from .auth_controller import (
    _INVALID_CREDENTIALS_DETAIL,
    _account_digest,
    _clear_auth_cookies,
    _client_ip,
    _enforce_limit,
    _enforce_request_origin,
    _keyed_digest,
)
from .config import get_settings
from .postgres_data import DatabaseIdentity
from .rate_limit import (
    check_auth_account_rate_limit_async,
    enforce_refresh_ip_rate_limit_async,
    enforce_refresh_session_rate_limit_async,
    record_auth_account_failure_async,
)
from .schemas import (
    MAX_RECOVERY_TOKEN_LENGTH,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
)

SESSION_COOKIES = ("__Secure-better-auth.session_token", "better-auth.session_token")
COOKIE_VALUE = re.compile(r"[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]{1,8192}")


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="Authentication service unavailable")


def _cookie_header(connection: ASGIConnection) -> str:
    for name in SESSION_COOKIES:
        if value := connection.cookies.get(name):
            if COOKIE_VALUE.fullmatch(value):
                return f"{name}={value}"
    return ""


async def _request(
    connection: ASGIConnection,
    method: str,
    action: str,
    payload: dict | None = None,
) -> httpx.Response:
    origin = get_settings().nexus_auth_url.rstrip("/")
    headers = {"Origin": origin}
    if cookie := _cookie_header(connection):
        headers["Cookie"] = cookie
    try:
        async with httpx.AsyncClient(
            base_url=origin, timeout=5, trust_env=False
        ) as client:
            response = await client.request(
                method, f"/api/auth/{action}", headers=headers, json=payload
            )
    except httpx.RequestError:
        raise _unavailable() from None
    if response.status_code >= 500 or response.is_redirect:
        raise _unavailable()
    return response


def _body(response: httpx.Response) -> dict | None:
    try:
        payload = response.json()
        if payload is None or isinstance(payload, dict):
            return payload
    except ValueError:
        pass
    raise _unavailable()


def _session(payload: dict) -> dict:
    try:
        identity = UUID(payload["user"]["id"])
        expires = None
        if session := payload.get("session"):
            if UUID(session["userId"]) != identity:
                raise ValueError
            expires = int(datetime.fromisoformat(session["expiresAt"]).timestamp())
        return {
            "user": {"id": str(identity), "email": payload["user"]["email"]},
            "expires_at": expires,
        }
    except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
        raise _unavailable() from None


async def session_response(
    connection: ASGIConnection,
    *,
    renew: bool = True,
) -> tuple[dict | None, httpx.Response | None]:
    if not _cookie_header(connection):
        return None, None
    action = "get-session" if renew else "get-session?disableRefresh=true"
    response = await _request(connection, "GET", action)
    if response.status_code in {401, 403}:
        return None, response
    if not response.is_success:
        raise _unavailable()
    payload = _body(response)
    return (_session(payload) if payload else None), response


async def verify_identity(connection: ASGIConnection) -> DatabaseIdentity:
    result, _ = await session_response(connection, renew=False)
    if not result:
        raise NotAuthorizedException("Missing or invalid session")
    return DatabaseIdentity(UUID(result["user"]["id"]))


def _reply(content: dict, upstream: httpx.Response | None = None) -> Response:
    result = Response(content=content, headers={"Cache-Control": "no-store"})
    if upstream is None:
        return result
    settings = get_settings()
    for value in upstream.headers.get_list("set-cookie"):
        try:
            cookies: SimpleCookie = SimpleCookie(value)
            for name in SESSION_COOKIES:
                if name in cookies:
                    cookie = cookies[name]
                    result.set_cookie(
                        name,
                        cookie.value,
                        max_age=int(cookie["max-age"]) if cookie["max-age"] else None,
                        path="/",
                        domain=settings.cookie_domain,
                        httponly=True,
                        samesite="lax",
                        secure=bool(cookie["secure"]) or settings.cookie_secure,
                    )
        except (CookieError, ValueError):
            raise _unavailable() from None
    return result


class StandaloneAuthController(Controller):
    path = "/auth"

    @post("/login")
    async def login(self, data: JSONBody[LoginRequest], request: Request) -> Response:
        _enforce_request_origin(request)
        key = _account_digest(data.email)
        await _enforce_limit(f"login:{_client_ip(request)}:{key}")
        await check_auth_account_rate_limit_async(key)
        response = await _request(
            request,
            "POST",
            "sign-in/email",
            {"email": data.email, "password": data.password},
        )
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Too many sign-in attempts")
        if response.status_code in {400, 401, 403, 422}:
            await record_auth_account_failure_async(key)
            raise NotAuthorizedException(_INVALID_CREDENTIALS_DETAIL)
        if not response.is_success:
            raise _unavailable()
        payload = _body(response)
        if not payload:
            raise _unavailable()
        return _reply(_session(payload), response)

    @post("/register")
    async def register(
        self, data: JSONBody[RegisterRequest], request: Request
    ) -> Response:
        _enforce_request_origin(request)
        await _enforce_limit(f"register:{_client_ip(request)}")
        response = await _request(
            request,
            "POST",
            "sign-up/email",
            {
                "email": data.email,
                "password": data.password,
                "name": data.email.split("@")[0],
            },
        )
        if not response.is_success:
            raise HTTPException(status_code=400, detail="Unable to register account")
        return _reply({"ok": True})

    @get("/session")
    async def session(self, request: Request) -> Response:
        payload, upstream = await session_response(request)
        return _reply(payload or {"authenticated": False}, upstream)

    @post("/refresh")
    async def refresh(self, request: Request) -> Response:
        _enforce_request_origin(request)
        await enforce_refresh_ip_rate_limit_async(_client_ip(request))
        if cookie := _cookie_header(request):
            await enforce_refresh_session_rate_limit_async(_keyed_digest(cookie))
        payload, upstream = await session_response(request)
        if not payload and cookie:
            raise NotAuthorizedException("Session expired")
        return _reply(payload or {"authenticated": False}, upstream)

    @post("/logout")
    async def logout(self, request: Request) -> Response:
        _enforce_request_origin(request)
        upstream = None
        if _cookie_header(request):
            upstream = await _request(request, "POST", "sign-out", {})
            if not upstream.is_success and upstream.status_code not in {401, 403}:
                raise _unavailable()
        result = _reply({"ok": True}, upstream)
        for name in SESSION_COOKIES:
            result.delete_cookie(name, path="/", domain=get_settings().cookie_domain)
        _clear_auth_cookies(result)
        return result

    @post("/forgot-password")
    async def forgot_password(
        self, data: JSONBody[ForgotPasswordRequest], request: Request
    ) -> Response:
        _enforce_request_origin(request)
        await _enforce_limit(f"forgot:{_client_ip(request)}")
        from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

        settings = get_settings()
        target = urlsplit(
            settings.password_reset_redirect_url or settings.allowed_origins[0]
        )
        query = dict(parse_qsl(target.query)) | {"type": "recovery"}
        redirect = urlunsplit(target._replace(query=urlencode(query)))
        response = await _request(
            request,
            "POST",
            "request-password-reset",
            {
                "email": data.email,
                "redirectTo": redirect,
            },
        )
        if not response.is_success:
            raise _unavailable()
        return _reply({"ok": True})

    @post("/reset-password")
    async def reset_password(
        self, data: JSONBody[ResetPasswordRequest], request: Request
    ) -> Response:
        _enforce_request_origin(request)
        await _enforce_limit(f"reset:{_client_ip(request)}")
        token = request.headers.get("x-recovery-access-token", "")
        if not token or len(token) > MAX_RECOVERY_TOKEN_LENGTH or not token.isascii():
            raise PermissionDeniedException("Missing or invalid recovery token")
        response = await _request(
            request,
            "POST",
            "reset-password",
            {
                "token": token,
                "newPassword": data.new_password,
            },
        )
        if not response.is_success:
            raise HTTPException(
                status_code=400, detail="Recovery link is invalid or has expired"
            )
        return _reply({"ok": True})

    @post("/verify-email")
    async def verify_email(self, request: Request) -> Response:
        _enforce_request_origin(request)
        await _enforce_limit(f"verify:{_client_ip(request)}")
        token = request.headers.get("x-recovery-access-token", "")
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,2048}", token):
            raise PermissionDeniedException("Missing or invalid verification token")
        upstream = await _request(request, "GET", f"verify-email?token={token}")
        if not upstream.is_success:
            raise HTTPException(
                status_code=400, detail="Verification link expired or invalid"
            )
        return _reply({"ok": True})
