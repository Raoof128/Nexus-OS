"""HTTP security controls: response headers, CSP, and cross-site request guard.

Three ASGI-level controls live here:

* ``SecurityHeadersMiddleware`` adds the baseline response headers (CSP,
  HSTS, framing, referrer and isolation headers, and ``Cache-Control``) to
  every response it sees.
* ``security_exception_handlers`` produces the same headers for 404 and 405
  responses, which Litestar does not pass through app-level middleware.
* ``CrossSiteRequestMiddleware`` rejects state-changing requests that carry
  ambient cookie credentials but do not originate from an allowed origin.

Browsers send ``Origin`` on cross-origin POST, PUT, PATCH and DELETE requests,
so the Origin allowlist is the primary control. Fetch Metadata
(``Sec-Fetch-Site``) is only a fallback for the rare case where ``Origin`` is
missing. ``SameSite=Lax`` cookies are not a CSRF defence on their own, because
sibling subdomains of the same site are not cross-site.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable, Iterable
from typing import Any
from urllib.parse import urlparse

from litestar.exceptions import MethodNotAllowedException, NotFoundException
from litestar.middleware import MiddlewareProtocol
from litestar.openapi.plugins import SwaggerRenderPlugin
from litestar.response import Response
from litestar.types import ASGIApp, Message, Receive, Scope, Send

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

logger = logging.getLogger(__name__)

DOCS_PATH: str = "/schema"
"""Root of the OpenAPI schema and Swagger UI routes (development only)."""

# app.py serves Swagger UI through SwaggerRenderPlugin, whose default assets
# are pinned in litestar/openapi/plugins.py. Derive the CSP prefix from that
# same plugin so the policy and the served asset URLs cannot drift apart.
SWAGGER_UI_CDN_PREFIX: str = (
    SwaggerRenderPlugin(path="/").js_url.rsplit("/", 1)[0] + "/"
)
"""Exact asset directory Litestar's Swagger UI plugin loads its files from."""

UNSAFE_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_SAFE_FETCH_SITES: frozenset[str] = frozenset({"same-origin", "none"})

# Cache-Control is set only when a route has not already chosen one.
_NO_STORE: bytes = b"no-store"


def is_docs_path(path: str) -> bool:
    """Return True for ``/schema`` and ``/schema/...`` but not ``/schemas``.

    The check mirrors the segment-aware matching used by ``auth._is_public_path``
    so the two prefix rules cannot drift apart.
    """

    return path == DOCS_PATH or path.startswith(DOCS_PATH + "/")


def _build_csp(path: str) -> str:
    """Build the Content-Security-Policy value for *path*.

    Docs routes get a policy that lets Swagger UI run. Its inline init block
    needs ``'unsafe-inline'``, and its assets come from the jsdelivr path
    above. Every other route gets the strict API policy.
    """

    settings = get_settings()
    connect_sources = {"'self'", settings.supabase_url}
    connect_sources.update(settings.allowed_origins)

    supabase_parsed = urlparse(settings.supabase_url)
    if supabase_parsed.scheme and supabase_parsed.netloc:
        connect_sources.add(f"wss://{supabase_parsed.netloc}")
        connect_sources.add(f"https://{supabase_parsed.netloc}")

    docs_policy = [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        # 'unsafe-inline' is needed for Swagger's inline SwaggerUIBundle init
        # block, which Litestar does not expose a nonce hook for. Swagger's
        # CSS and JS are allowed by exact jsdelivr path, not the whole host.
        f"style-src 'self' 'unsafe-inline' {SWAGGER_UI_CDN_PREFIX}",
        f"script-src 'self' 'unsafe-inline' {SWAGGER_UI_CDN_PREFIX}",
        f"connect-src {' '.join(sorted(connect_sources))}",
        "form-action 'self'",
    ]
    api_policy = [
        "default-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data:",
        "style-src 'self'",
        "script-src 'self'",
        f"connect-src {' '.join(sorted(connect_sources))}",
        "form-action 'none'",
    ]
    return "; ".join(docs_policy if is_docs_path(path) else api_policy)


SECURITY_HEADERS: tuple[tuple[str, Callable[[], str]], ...] = (
    ("referrer-policy", lambda: "strict-origin-when-cross-origin"),
    (
        "strict-transport-security",
        lambda: "max-age=31536000; includeSubDomains; preload",
    ),
    ("x-content-type-options", lambda: "nosniff"),
    ("x-frame-options", lambda: "DENY"),
    ("permissions-policy", lambda: "camera=(), geolocation=(), microphone=()"),
    ("cross-origin-opener-policy", lambda: "same-origin"),
    ("cross-origin-resource-policy", lambda: "same-origin"),
)


def security_header_pairs(path: str) -> list[tuple[bytes, bytes]]:
    """Return every baseline security header for *path* as ASGI byte pairs.

    ``cache-control: no-store`` is included for API paths only. Its presence
    in the list does not mean it overrides a route's own Cache-Control; the
    merge step decides that.
    """

    pairs: list[tuple[bytes, bytes]] = [
        (b"content-security-policy", _build_csp(path).encode("latin-1")),
    ]
    pairs.extend(
        (name.encode("latin-1"), value_factory().encode("latin-1"))
        for name, value_factory in SECURITY_HEADERS
    )
    if not is_docs_path(path):
        pairs.append((b"cache-control", _NO_STORE))
    return pairs


def merge_security_headers(
    headers: list[tuple[bytes, bytes]],
    path: str,
) -> None:
    """Merge baseline security headers into *headers* in place.

    Existing headers with the same name are replaced, so a response never
    carries two CSP or two HSTS values. ``cache-control`` is added only when
    the response has none, so a route that deliberately sets its own policy
    keeps it.
    """

    for name, value in security_header_pairs(path):
        if name == b"cache-control":
            if any(key.lower() == name for key, _ in headers):
                continue
        else:
            headers[:] = [(key, val) for key, val in headers if key.lower() != name]
        headers.append((name, value))


class SecurityHeadersMiddleware(MiddlewareProtocol):
    """Attach secure default headers to every HTTP response this app emits."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers: list[tuple[bytes, bytes]] = list(message.get("headers", []))
                merge_security_headers(headers, scope.get("path", ""))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


def _error_response(request: Any, status_code: int, detail: str) -> Response[Any]:
    """Build a JSON error response that carries the baseline security headers."""

    path = request.scope.get("path", "") if hasattr(request, "scope") else ""
    headers: dict[str, str] = {}
    for name, value in security_header_pairs(path):
        headers[name.decode("latin-1")] = value.decode("latin-1")
    return Response(
        content={"status_code": status_code, "detail": detail},
        status_code=status_code,
        headers=headers,
    )


def _not_found_handler(request: Any, exc: NotFoundException) -> Response[Any]:
    """Return a 404 that carries the same headers as other responses."""

    return _error_response(request, 404, str(exc.detail or "Not Found"))


def _method_not_allowed_handler(
    request: Any, exc: MethodNotAllowedException
) -> Response[Any]:
    """Return a 405 that carries the same headers as other responses."""

    return _error_response(request, 405, str(exc.detail or "Method Not Allowed"))


security_exception_handlers: dict[Any, Callable[..., Response[Any]]] = {
    NotFoundException: _not_found_handler,
    MethodNotAllowedException: _method_not_allowed_handler,
}
"""Exception handlers that add security headers to unmatched-route errors.

Litestar's app-level middleware does not wrap responses for routes that do not
match, so a 404 would otherwise leave without CSP or HSTS. Register this mapping
as ``exception_handlers`` on the ``Litestar`` app.
"""


def _header_values(scope: Scope, name: bytes) -> list[str]:
    """Return every value of header *name* (lowercase bytes) from *scope*."""

    return [
        value.decode("latin-1")
        for key, value in scope.get("headers", [])
        if key == name
    ]


def _normalise_origin(origin: str) -> str:
    """Compare origins case-insensitively and without a trailing slash."""

    return origin.strip().rstrip("/").lower()


def cross_site_rejection_reason(
    scope: Scope,
    allowed_origins: Iterable[str],
) -> str | None:
    """Return why an unsafe request must be rejected, or None to allow it.

    Decision table for unsafe methods (POST, PUT, PATCH, DELETE):

    * A ``Bearer`` Authorization header means token auth, not ambient cookies,
      so the request is allowed. A cross-site page cannot set that header
      without a CORS preflight, which the allowlist denies.
    * An ``Origin`` header must exactly match an allowed origin. ``null`` is
      always rejected, and so is any second Origin header.
    * With no ``Origin``, ``Sec-Fetch-Site`` must be ``same-origin`` or
      ``none``. ``same-site`` is rejected here: sibling hosts such as
      ``evil.home-notes-app.uk`` are same-site and must not pass on that basis.
    * With neither header, the request is rejected. Every browser that sends
      cookies on an unsafe request sends one of them. Non-browser clients must
      authenticate with a Bearer token.
    """

    if scope.get("method", "").upper() not in UNSAFE_METHODS:
        return None

    if any(
        value.strip().lower().startswith("bearer ")
        for value in _header_values(scope, b"authorization")
    ):
        return None

    origins = _header_values(scope, b"origin")
    if len(origins) > 1:
        return "ambiguous_origin"
    if origins:
        origin = origins[0].strip()
        if origin.lower() == "null":
            return "null_origin"
        allowed = {_normalise_origin(item) for item in allowed_origins}
        if _normalise_origin(origin) in allowed:
            return None
        return "origin_not_allowed"

    fetch_sites = _header_values(scope, b"sec-fetch-site")
    if len(fetch_sites) == 1 and fetch_sites[0].strip().lower() in _SAFE_FETCH_SITES:
        return None
    return "cross_site_fetch" if fetch_sites else "missing_origin"


class CrossSiteRequestMiddleware(MiddlewareProtocol):
    """Reject cross-site unsafe requests before they reach a route handler.

    Register on the Litestar app (``middleware=[...]``) once the frontend and
    the Cloudflare Worker forward ``origin`` and ``sec-fetch-site``. See
    ``cross_site_rejection_reason`` for the rules.
    """

    def __init__(self, app: ASGIApp, exempt_paths: frozenset[str] = frozenset()):
        self.app = app
        self.exempt_paths = exempt_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope.get("type") != "http" or path in self.exempt_paths:
            await self.app(scope, receive, send)
            return

        reason = cross_site_rejection_reason(scope, get_settings().allowed_origins)
        if reason is None:
            await self.app(scope, receive, send)
            return

        logger.warning("Rejected unsafe request to %s: %s", path, reason)
        await _send_json_error(send, path, 403, "Cross-site request rejected")


async def _send_json_error(
    send: Callable[[Message], Awaitable[None]],
    path: str,
    status_code: int,
    detail: str,
) -> None:
    """Send a JSON error with the baseline security headers."""

    body = json.dumps({"status_code": status_code, "detail": detail}).encode("utf-8")
    headers: list[tuple[bytes, bytes]] = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode("latin-1")),
    ]
    merge_security_headers(headers, path)
    await send(
        {"type": "http.response.start", "status": status_code, "headers": headers}
    )
    await send({"type": "http.response.body", "body": body})


__all__ = [
    "CrossSiteRequestMiddleware",
    "DOCS_PATH",
    "SECURITY_HEADERS",
    "SWAGGER_UI_CDN_PREFIX",
    "SecurityHeadersMiddleware",
    "UNSAFE_METHODS",
    "cross_site_rejection_reason",
    "is_docs_path",
    "merge_security_headers",
    "security_exception_handlers",
    "security_header_pairs",
]
