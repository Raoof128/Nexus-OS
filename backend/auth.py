"""Authentication middleware for Supabase JWT validation."""

from __future__ import annotations

from typing import Any

import jwt
from litestar.connection import ASGIConnection
from litestar.exceptions import NotAuthorizedException
from litestar.middleware import MiddlewareProtocol
from litestar.types import ASGIApp, Receive, Scope, Send

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

PUBLIC_PATH_PREFIXES = (
    "/healthz",
    "/schema",
    "/schema/",
    "/auth",
    "/auth/",
)


def decode_supabase_token(token: str) -> dict[str, Any]:
    """Decode and validate a Supabase JWT."""

    return jwt.decode(
        token,
        get_settings().supabase_jwt_secret,
        algorithms=["HS256"],
        audience="authenticated",
    )


class SupabaseAuthMiddleware(MiddlewareProtocol):
    """Validate Supabase JWTs and inject the authenticated user ID."""

    def __init__(self, app: ASGIApp):
        self.app = app
        self.jwt_secret = get_settings().supabase_jwt_secret

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            method = scope.get("method", "")
            path = scope.get("path", "")
            if method == "OPTIONS" or path.startswith(PUBLIC_PATH_PREFIXES):
                await self.app(scope, receive, send)
                return

            connection = ASGIConnection(scope)
            auth_header = connection.headers.get("Authorization")
            token = None
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1]
            else:
                token = connection.cookies.get(get_settings().access_cookie_name)

            if not token:
                raise NotAuthorizedException("Missing or invalid authorization token")

            try:
                payload = decode_supabase_token(token)
                user_id = payload.get("sub")
                if not user_id:
                    raise NotAuthorizedException("Invalid token subject")
                scope.setdefault("state", {})["user_id"] = user_id
                scope["state"]["auth_payload"] = payload
            except jwt.ExpiredSignatureError as exc:
                raise NotAuthorizedException("Token expired") from exc
            except jwt.InvalidTokenError as exc:
                raise NotAuthorizedException("Invalid token") from exc

        await self.app(scope, receive, send)
