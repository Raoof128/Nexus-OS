"""ASGI application entrypoint for the backend."""

from litestar import Litestar
from litestar.config.compression import CompressionConfig
from litestar.config.cors import CORSConfig
from litestar.openapi.config import OpenAPIConfig
from litestar.openapi.plugins import SwaggerRenderPlugin

try:
    from .auth import SupabaseAuthMiddleware
    from .auth_controller import AuthController
    from .chat_controller import ChatController
    from .config import get_settings
    from .controllers import MediaController
    from .email_controller import EmailController
    from .email_poller import start_email_poller, stop_email_poller
    from .health import healthcheck
    from .logging_config import configure_logging
    from .oauth_controller import OAuthController
    from .observability import configure_observability
    from .security import SecurityHeadersMiddleware
except ImportError:  # pragma: no cover - supports backend cwd execution
    from auth import SupabaseAuthMiddleware
    from auth_controller import AuthController
    from chat_controller import ChatController
    from config import get_settings
    from controllers import MediaController
    from email_controller import EmailController
    from email_poller import start_email_poller, stop_email_poller
    from health import healthcheck
    from logging_config import configure_logging
    from oauth_controller import OAuthController
    from observability import configure_observability
    from security import SecurityHeadersMiddleware

configure_logging()
configure_observability()
settings = get_settings()

cors_config = CORSConfig(
    allow_origins=list(settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    # Cache CORS preflight (OPTIONS) responses in the browser so each PUT/PATCH/
    # DELETE mutation doesn't pay an extra round-trip re-negotiating CORS.
    max_age=600,
)

# Gzip-compress responses (media lists, chat history) above ~1 KB. Shrinks
# payloads ~70-80% on JSON-heavy endpoints for a snappier frontend.
compression_config = CompressionConfig(backend="gzip", minimum_size=1024)


_openapi_config: OpenAPIConfig | None = (
    None
    if settings.environment == "production"
    else OpenAPIConfig(
        title="Nexus OS API",
        version="0.3.0",
        description=(
            "Authenticated API for the Nexus cyberpunk OS, including"
            " cookie-backed auth, health probes, and AI-assisted recommendation"
            " workflows."
        ),
        path="/schema",
        use_handler_docstrings=True,
        render_plugins=[SwaggerRenderPlugin(path="/")],
    )
)

app = Litestar(
    route_handlers=[
        healthcheck,
        AuthController,
        ChatController,
        MediaController,
        OAuthController,
        EmailController,
    ],
    middleware=[SecurityHeadersMiddleware, SupabaseAuthMiddleware],
    cors_config=cors_config,
    compression_config=compression_config,
    allowed_hosts=list(settings.allowed_hosts),
    openapi_config=_openapi_config,
    on_startup=[start_email_poller],
    on_shutdown=[stop_email_poller],
)
