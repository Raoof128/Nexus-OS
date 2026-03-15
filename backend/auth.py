"""Authentication middleware for Supabase JWT validation."""

import jwt
from litestar.middleware import MiddlewareProtocol
from litestar.connection import ASGIConnection
from litestar.exceptions import NotAuthorizedException
from litestar.types import ASGIApp, Receive, Scope, Send

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

class SupabaseAuthMiddleware(MiddlewareProtocol):
    def __init__(self, app: ASGIApp):
        self.app = app
        self.jwt_secret = get_settings().supabase_jwt_secret

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            connection = ASGIConnection(scope)
            auth_header = connection.headers.get("Authorization")

            if not auth_header or not auth_header.startswith("Bearer "):
                raise NotAuthorizedException("Missing or invalid authorization header")

            token = auth_header.split(" ")[1]
            try:
                # Decode the Supabase JWT. Supabase uses HS256.
                payload = jwt.decode(
                    token,
                    self.jwt_secret,
                    algorithms=["HS256"],
                    audience="authenticated",
                )
                # Inject the user_id into the request state
                scope["state"]["user_id"] = payload.get("sub")
            except jwt.ExpiredSignatureError:
                raise NotAuthorizedException("Token expired")
            except jwt.InvalidTokenError:
                raise NotAuthorizedException("Invalid token")

        await self.app(scope, receive, send)
