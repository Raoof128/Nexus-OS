"""Security middleware and header helpers."""

from __future__ import annotations

from urllib.parse import urlparse

from litestar.middleware import MiddlewareProtocol
from litestar.types import ASGIApp, Message, Receive, Scope, Send

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings


def _build_csp() -> str:
    """Build a CSP that protects API/docs routes without blocking built-in docs."""

    settings = get_settings()
    connect_sources = {"'self'", settings.supabase_url}
    connect_sources.update(settings.allowed_origins)

    supabase_parsed = urlparse(settings.supabase_url)
    if supabase_parsed.scheme and supabase_parsed.netloc:
        connect_sources.add(f"wss://{supabase_parsed.netloc}")
        connect_sources.add(f"https://{supabase_parsed.netloc}")

    return "; ".join(
        [
            "default-src 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline'",
            f"connect-src {' '.join(sorted(connect_sources))}",
            "form-action 'self'",
        ]
    )


SECURITY_HEADERS = (
    ("content-security-policy", _build_csp),
    ("referrer-policy", lambda: "strict-origin-when-cross-origin"),
    ("strict-transport-security", lambda: "max-age=31536000; includeSubDomains"),
    ("x-content-type-options", lambda: "nosniff"),
    ("x-frame-options", lambda: "DENY"),
    ("permissions-policy", lambda: "camera=(), geolocation=(), microphone=()"),
)


class SecurityHeadersMiddleware(MiddlewareProtocol):
    """Attach secure default headers to every HTTP response."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                for key, value_factory in SECURITY_HEADERS:
                    headers.append(
                        (key.encode("latin-1"), value_factory().encode("latin-1"))
                    )
            await send(message)

        await self.app(scope, receive, send_with_headers)
