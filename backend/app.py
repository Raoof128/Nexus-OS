"""ASGI application entrypoint for the backend.

Startup order matters: logging is configured before the Litestar app is built,
and Litestar's own logging config is disabled (``logging_config=None``) so it
does not replace the handlers installed by ``configure_logging``.
"""

from __future__ import annotations

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
    from .logging_config import (
        RequestIdMiddleware,
        configure_logging,
        log_unhandled_exception,
    )
    from .notes_controller import NotesController
    from .oauth_controller import OAuthController
    from .observability import configure_observability
    from .security import SecurityHeadersMiddleware
    from .tasks_controller import TasksController
except ImportError:  # pragma: no cover - supports backend cwd execution
    from auth import SupabaseAuthMiddleware
    from auth_controller import AuthController
    from chat_controller import ChatController
    from config import get_settings
    from controllers import MediaController
    from email_controller import EmailController
    from email_poller import start_email_poller, stop_email_poller
    from health import healthcheck
    from logging_config import (
        RequestIdMiddleware,
        configure_logging,
        log_unhandled_exception,
    )
    from notes_controller import NotesController
    from oauth_controller import OAuthController
    from observability import configure_observability
    from security import SecurityHeadersMiddleware
    from tasks_controller import TasksController

configure_logging()
configure_observability()
settings = get_settings()

cors_config = CORSConfig(
    allow_origins=list(settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    # Let browser code read the correlation ID for support and bug reports.
    expose_headers=["X-Request-ID"],
    # Cache CORS preflight (OPTIONS) responses in the browser so each PUT/PATCH/
    # DELETE mutation doesn't pay an extra round-trip re-negotiating CORS.
    max_age=600,
)

# Gzip-compress responses (media lists, chat history) above ~1 KB. Shrinks
# payloads ~70-80% on JSON-heavy endpoints for a snappier frontend.
compression_config = CompressionConfig(backend="gzip", minimum_size=1024)


DOCS_ENVIRONMENT: str = "development"


def build_openapi_config(environment: str) -> OpenAPIConfig | None:
    """Return the OpenAPI/Swagger config, enabled only for development.

    This is an allowlist: any other value, including unknown spellings and
    ``staging``, gets no schema or Swagger UI. Unknown values fail closed.
    """

    if environment != DOCS_ENVIRONMENT:
        return None
    return OpenAPIConfig(
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


_openapi_config: OpenAPIConfig | None = build_openapi_config(settings.environment)

app = Litestar(
    route_handlers=[
        healthcheck,
        AuthController,
        ChatController,
        MediaController,
        NotesController,
        OAuthController,
        EmailController,
        TasksController,
    ],
    # Request ID first so every later log line, including auth, carries it.
    middleware=[
        RequestIdMiddleware(),
        SecurityHeadersMiddleware,
        SupabaseAuthMiddleware,
    ],
    cors_config=cors_config,
    compression_config=compression_config,
    allowed_hosts=list(settings.allowed_hosts),
    openapi_config=_openapi_config,
    # Logs uncaught exceptions, because logging_config=None disables Litestar's own.
    exception_handlers={Exception: log_unhandled_exception},
    on_startup=[start_email_poller],
    on_shutdown=[stop_email_poller],
    # Disabled on purpose: configure_logging() owns root logging. Litestar's
    # default config would replace its handlers and format.
    logging_config=None,
)
