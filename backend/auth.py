"""Authentication middleware for Supabase JWT validation."""

from __future__ import annotations

import logging
import threading
from functools import lru_cache
from time import monotonic
from typing import Any

import jwt
from anyio import to_thread
from jwt import PyJWKClient, PyJWKClientError
from litestar.connection import ASGIConnection
from litestar.exceptions import NotAuthorizedException
from litestar.middleware import MiddlewareProtocol
from litestar.types import ASGIApp, Receive, Scope, Send

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

logger = logging.getLogger(__name__)

_JWKS_REFRESH_COOLDOWN_SECONDS = 60.0
_JWKS_FAILURE_BACKOFF_SECONDS = 15.0
_JWKS_NEGATIVE_CACHE_TTL_SECONDS = 60.0
_JWKS_NEGATIVE_CACHE_MAX_ENTRIES = 1024
_JWKS_MAX_KID_LENGTH = 128
_jwks_lookup_lock = threading.Lock()
_jwks_negative_kids: dict[str, float] = {}
_jwks_last_refresh_at = 0.0
_jwks_unavailable_until = 0.0

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
        return PyJWKClient(
            jwks_url,
            cache_keys=False,
            cache_jwk_set=True,
            lifespan=300,
            timeout=5,
        )
    except Exception:  # pragma: no cover
        logger.warning("Failed to initialize JWKS client from %s", jwks_url)
        return None


def _reset_jwks_lookup_state() -> None:
    """Reset process-local lookup state (used by tests and settings reloads)."""

    global _jwks_last_refresh_at, _jwks_unavailable_until
    with _jwks_lookup_lock:
        _jwks_negative_kids.clear()
        _jwks_last_refresh_at = 0.0
        _jwks_unavailable_until = 0.0
    cache_clear = getattr(_get_jwks_client, "cache_clear", None)
    if cache_clear is not None:
        cache_clear()


def _cache_unknown_kid(kid: str, now: float) -> None:
    """Bound negative-key memory while suppressing repeated bad-key work."""

    expired = [
        cached_kid
        for cached_kid, expires_at in _jwks_negative_kids.items()
        if expires_at <= now
    ]
    for cached_kid in expired:
        _jwks_negative_kids.pop(cached_kid, None)
    while len(_jwks_negative_kids) >= _JWKS_NEGATIVE_CACHE_MAX_ENTRIES:
        _jwks_negative_kids.pop(next(iter(_jwks_negative_kids)))
    _jwks_negative_kids[kid] = now + _JWKS_NEGATIVE_CACHE_TTL_SECONDS


def _get_es256_signing_key(header: dict[str, Any]):
    """Resolve one ES256 key with bounded refresh and outage backoff.

    PyJWKClient normally force-refreshes the remote JWKS for every unknown
    ``kid``. Since ``kid`` is read before signature verification, an attacker
    could otherwise turn arbitrary tokens into synchronous outbound requests.
    """

    global _jwks_last_refresh_at, _jwks_unavailable_until

    kid = header.get("kid")
    if (
        not isinstance(kid, str)
        or not kid
        or len(kid) > _JWKS_MAX_KID_LENGTH
        or any(not char.isprintable() or char.isspace() for char in kid)
    ):
        raise jwt.InvalidTokenError("Invalid or missing key identifier")

    now = monotonic()
    with _jwks_lookup_lock:
        now = monotonic()
        if _jwks_negative_kids.get(kid, 0.0) > now:
            raise jwt.InvalidTokenError("Unknown signing key")
        if _jwks_unavailable_until > now:
            raise jwt.InvalidTokenError("JWKS temporarily unavailable")

        jwks_client = _get_jwks_client()
        if jwks_client is None:
            _jwks_unavailable_until = now + _JWKS_FAILURE_BACKOFF_SECONDS
            raise jwt.InvalidTokenError("JWKS client unavailable")

        try:
            signing_keys = jwks_client.get_signing_keys()
            # The first successful load is already fresh. Record it so an
            # attacker cannot immediately force a redundant second request.
            if _jwks_last_refresh_at == 0.0:
                _jwks_last_refresh_at = now
            signing_key = PyJWKClient.match_kid(signing_keys, kid)

            if (
                signing_key is None
                and now - _jwks_last_refresh_at >= _JWKS_REFRESH_COOLDOWN_SECONDS
            ):
                # Set the timestamp before I/O so a failed refresh is still
                # globally rate-bounded for concurrent attacker-selected kids.
                _jwks_last_refresh_at = now
                signing_keys = jwks_client.get_signing_keys(refresh=True)
                signing_key = PyJWKClient.match_kid(signing_keys, kid)
        except PyJWKClientError as exc:
            _jwks_unavailable_until = now + _JWKS_FAILURE_BACKOFF_SECONDS
            raise jwt.InvalidTokenError("JWKS temporarily unavailable") from exc

        if signing_key is None:
            _cache_unknown_kid(kid, now)
            raise jwt.InvalidTokenError("Unknown signing key")
        return signing_key


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

    # ES256 / asymmetric — use the bounded JWKS lookup above. Callers execute
    # this synchronous helper in a worker thread so initial network I/O cannot
    # stall the ASGI event loop.
    signing_key = _get_es256_signing_key(header)
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
                payload = await to_thread.run_sync(decode_supabase_token, token)
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
