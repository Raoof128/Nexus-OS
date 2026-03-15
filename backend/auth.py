"""Authentication middleware for Supabase JWT validation."""

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

            if not auth_header or not auth_header.startswith("Bearer "):
                raise NotAuthorizedException("Missing or invalid authorization header")

            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(
                    token,
                    self.jwt_secret,
                    algorithms=["HS256"],
                    audience="authenticated",
                )
                user_id = payload.get("sub")
                if not user_id:
                    raise NotAuthorizedException("Invalid token subject")
                scope.setdefault("state", {})["user_id"] = user_id
            except jwt.ExpiredSignatureError as exc:
                raise NotAuthorizedException("Token expired") from exc
            except jwt.InvalidTokenError as exc:
                raise NotAuthorizedException("Invalid token") from exc

        await self.app(scope, receive, send)
