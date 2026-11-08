"""Authentication middleware for Supabase JWT validation.

Requests are authenticated with a Supabase access token, read from the
``Authorization: Bearer`` header when present and from the HttpOnly access
cookie otherwise. Only routes listed in ``_PUBLIC_ROUTES`` (or the GET-only
``/schema`` docs tree) skip authentication, and CORS preflight (OPTIONS) is
passed through untouched. Every other route is protected by default.

Cookie-authenticated state-changing requests must also carry the
``X-Requested-With: XMLHttpRequest`` header. A cross-site HTML form cannot
set custom headers, so this blocks cookie-riding CSRF on top of SameSite=Lax.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from functools import lru_cache
from typing import Any, Final

import jwt
from anyio import to_thread
from jwt import PyJWKClient
from litestar.connection import ASGIConnection
from litestar.exceptions import (
    NotAuthorizedException,
    PermissionDeniedException,
    ServiceUnavailableException,
)
from litestar.middleware import MiddlewareProtocol
from litestar.types import ASGIApp, Receive, Scope, Send

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

logger = logging.getLogger(__name__)

# Explicit allowlist of unauthenticated routes, one entry per (method, path).
# A new route is protected by default; making it public is a deliberate edit here.
_PUBLIC_ROUTES: Final[frozenset[tuple[str, str]]] = frozenset(
    {
        ("GET", "/healthz"),
        ("POST", "/auth/login"),
        ("POST", "/auth/refresh"),
        ("POST", "/auth/logout"),
        ("POST", "/auth/register"),
        ("POST", "/auth/forgot-password"),
        ("POST", "/auth/reset-password"),
        ("GET", "/auth/session"),
    }
)
# OpenAPI docs are public for GET only: the root and everything beneath it.
_SCHEMA_ROOT: Final[str] = "/schema"
# Public routes that read the auth cookies, so they also need the CSRF header.
_COOKIE_CONSUMING_PUBLIC_ROUTES: Final[frozenset[tuple[str, str]]] = frozenset(
    {("POST", "/auth/refresh"), ("POST", "/auth/logout")}
)
_UNSAFE_METHODS: Final[frozenset[str]] = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_CSRF_HEADER: Final[str] = "X-Requested-With"
_CSRF_HEADER_VALUE: Final[str] = "XMLHttpRequest"


def _is_public_path(method: str, path: str) -> bool:
    """Return True when a request to *method* *path* requires no authentication.

    Matching is exact on the (method, path) pair. HEAD is treated as GET, since
    it returns the same resource without a body. OPTIONS is handled by the
    middleware itself and is not considered here.
    """

    normalised = "GET" if method == "HEAD" else method
    if (normalised, path) in _PUBLIC_ROUTES:
        return True
    return normalised == "GET" and (
        path == _SCHEMA_ROOT or path.startswith(_SCHEMA_ROOT + "/")
    )


def _jwks_url() -> str:
    """Return the Supabase JWKS endpoint for the configured project."""

    return f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient | None:
    """Return a cached JWKS client for ES256 token verification.

    Construction does not touch the network. Key fetches happen lazily inside
    ``get_signing_key_from_jwt``.
    """

    jwks_url = _jwks_url()
    try:
        return PyJWKClient(jwks_url, cache_keys=True)
    except Exception:  # pragma: no cover
        logger.warning("Failed to initialize JWKS client from %s", jwks_url)
        return None


def _resolve_es256_key(token: str) -> Any:
    """Return the public key that signed *token*, translating lookup failures.

    A JWKS connection failure is an infrastructure fault and becomes a 503.
    Any other lookup failure (unknown ``kid``, empty or malformed key set) means
    the token cannot be matched to a trusted key, so it is rejected as invalid.
    """

    jwks_client = _get_jwks_client()
    if jwks_client is None:
        raise jwt.InvalidTokenError("JWKS client unavailable for asymmetric token")

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as exc:
        # Log the endpoint and exception class only: never the token or its kid.
        logger.error(
            "JWKS endpoint unreachable at %s (%s)", _jwks_url(), type(exc).__name__
        )
        raise ServiceUnavailableException(
            "Authentication service temporarily unavailable"
        ) from exc
    except jwt.PyJWTError as exc:
        raise jwt.InvalidTokenError("Unknown signing key") from exc
    return signing_key.key


def decode_supabase_token(token: str) -> dict[str, Any]:
    """Decode and validate a Supabase access token (HS256 or ES256).

    Raises:
        jwt.InvalidTokenError: The token is malformed, uses an unsupported
            algorithm, fails signature or claim checks, or its signing key is
            unknown. Maps to HTTP 401.
        jwt.ExpiredSignatureError: The token's ``exp`` claim is in the past.
        litestar.exceptions.ServiceUnavailableException: The JWKS endpoint
            could not be reached, so the token cannot be checked. Maps to HTTP 503.

    This function performs blocking network I/O for ES256 tokens. Async code
    should call ``decode_supabase_token_async`` instead.
    """

    settings = get_settings()
    issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1"
    decode_options = {"require": ["exp", "iat", "sub", "aud"]}

    # Peek at the header to determine algorithm
    try:
        header = jwt.get_unverified_header(token)
    except jwt.DecodeError as exc:
        raise jwt.InvalidTokenError("Malformed token header") from exc

    # Reject tokens with missing `alg` outright rather than defaulting. A missing
    # header should never be silently treated as HS256 (algorithm substitution).
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

    # ES256 / asymmetric: the key comes from the JWKS endpoint
    return jwt.decode(
        token,
        _resolve_es256_key(token),
        algorithms=["ES256"],
        audience="authenticated",
        issuer=issuer,
        options=decode_options,
    )


async def decode_supabase_token_async(token: str) -> dict[str, Any]:
    """Run ``decode_supabase_token`` in a worker thread.

    Keeps JWKS fetches (cold cache, key rotation, unknown ``kid`` probes) off
    the event loop, so one slow upstream call cannot stall other requests.
    """

    return await to_thread.run_sync(decode_supabase_token, token)


def _extract_token(connection: ASGIConnection) -> tuple[str | None, bool]:
    """Return ``(token, from_cookie)`` for the request.

    A Bearer header wins. Any other Authorization value is ignored and the
    access cookie is used instead.
    """

    auth_header = connection.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1], False
    return connection.cookies.get(get_settings().access_cookie_name), True


def _require_csrf_header(connection: ASGIConnection, method: str, path: str) -> None:
    """Reject a cookie-authenticated request that lacks the CSRF header."""

    headers: Mapping[str, str] = connection.headers
    if headers.get(_CSRF_HEADER) != _CSRF_HEADER_VALUE:
        logger.warning(
            "Rejected cookie-authenticated %s %s without %s",
            method,
            path,
            _CSRF_HEADER,
        )
        raise PermissionDeniedException("Missing required request header")


class SupabaseAuthMiddleware(MiddlewareProtocol):
    """Validate Supabase access tokens and populate the request state.

    On success, ``scope["state"]`` gains ``user_id`` (the ``sub`` claim),
    ``auth_payload`` (the decoded claims) and ``access_token``.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        path = scope.get("path", "")

        # CORS preflight carries no credentials and is answered upstream.
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        if _is_public_path(method, path):
            if (method, path) in _COOKIE_CONSUMING_PUBLIC_ROUTES:
                _require_csrf_header(ASGIConnection(scope), method, path)
            await self.app(scope, receive, send)
            return

        connection = ASGIConnection(scope)
        token, from_cookie = _extract_token(connection)

        if not token:
            logger.debug("Request without access token: %s %s", method, path)
            raise NotAuthorizedException("Missing or invalid authorization token")

        if from_cookie and method in _UNSAFE_METHODS:
            _require_csrf_header(connection, method, path)

        try:
            payload = await decode_supabase_token_async(token)
        except jwt.ExpiredSignatureError as exc:
            # Expiry is routine: the client refreshes silently, so keep it quiet.
            logger.debug("Rejected expired access token")
            raise NotAuthorizedException("Token expired") from exc
        except jwt.InvalidTokenError as exc:
            # Only the exception class is logged, never the token or its claims.
            logger.warning("Rejected access token: %s", type(exc).__name__)
            raise NotAuthorizedException("Invalid token") from exc

        user_id = payload.get("sub")
        if not user_id:
            raise NotAuthorizedException("Invalid token subject")

        state = scope.setdefault("state", {})
        state["user_id"] = user_id
        state["auth_payload"] = payload
        state["access_token"] = token

        await self.app(scope, receive, send)
