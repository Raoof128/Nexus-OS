"""Authentication middleware for Supabase JWT validation."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKClient
from litestar.connection import ASGIConnection
from litestar.exceptions import NotAuthorizedException
from litestar.middleware import MiddlewareProtocol
from litestar.types import ASGIApp, Receive, Scope, Send

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

logger = logging.getLogger(__name__)

# Exact public paths (no auth required at all)
_PUBLIC_EXACT: frozenset[str] = frozenset({"/healthz"})
# Prefix-public paths: the path must equal the prefix OR start with prefix + "/"
# so that /auth matches but /authentication does not.
_PUBLIC_STRICT_PREFIXES: tuple[str, ...] = ("/schema", "/auth")


def _is_public_path(path: str) -> bool:
    """Return True when *path* requires no authentication.

    Uses exact matching for single paths and strict prefix matching
    (prefix == path  OR  path.startswith(prefix + "/")) to prevent
    accidental bypass via prefix collision (e.g. /authentication would
    have matched the old startswith("/auth") check).
    """

    if path in _PUBLIC_EXACT:
        return True
    return any(
        path == prefix or path.startswith(prefix + "/")
        for prefix in _PUBLIC_STRICT_PREFIXES
    )


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient | None:
    """Return a cached JWKS client for ES256 token verification."""

    settings = get_settings()
    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        return PyJWKClient(jwks_url, cache_keys=True)
    except Exception:  # pragma: no cover
        logger.warning("Failed to initialize JWKS client from %s", jwks_url)
        return None


def decode_supabase_token(token: str) -> dict[str, Any]:
    """Decode and validate a Supabase JWT (supports both HS256 and ES256)."""

    settings = get_settings()
    issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1"
    decode_options = {"require": ["exp", "iat", "sub", "aud"]}

    # Peek at the header to determine algorithm
    try:
        header = jwt.get_unverified_header(token)
    except jwt.DecodeError as exc:
        raise jwt.InvalidTokenError("Malformed token header") from exc

    # Reject tokens with missing `alg` outright rather than defaulting — a missing
    # header should never be silently treated as HS256 (algorithm-substitution).
    alg = header.get("alg")
    if alg not in ("HS256", "ES256"):
        raise jwt.InvalidTokenError("Unsupported or missing algorithm")

    if alg == "HS256":
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            issuer=issuer,
            options=decode_options,
        )

    # ES256 / asymmetric — use the JWKS endpoint
    jwks_client = _get_jwks_client()
    if jwks_client is None:
        raise jwt.InvalidTokenError("JWKS client unavailable for asymmetric token")

    signing_key = jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256"],
        audience="authenticated",
        issuer=issuer,
        options=decode_options,
    )


class SupabaseAuthMiddleware(MiddlewareProtocol):
    """Validate Supabase JWTs and inject the authenticated user ID."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            method = scope.get("method", "")
            path = scope.get("path", "")
            if method == "OPTIONS" or _is_public_path(path):
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
                scope["state"]["access_token"] = token
            except jwt.ExpiredSignatureError as exc:
                raise NotAuthorizedException("Token expired") from exc
            except jwt.InvalidTokenError as exc:
                raise NotAuthorizedException("Invalid token") from exc

        await self.app(scope, receive, send)
