"""ASGI application entrypoint for the backend."""

from litestar import Litestar
from litestar.config.cors import CORSConfig
from litestar.openapi.config import OpenAPIConfig

try:
    from .auth import SupabaseAuthMiddleware
    from .auth_controller import AuthController
    from .chat_controller import ChatController
    from .config import get_settings
    from .controllers import MediaController
    from .email_controller import EmailController
    from .email_poller import start_email_poller
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
    from email_poller import start_email_poller
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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

_openapi_config: OpenAPIConfig | None = (
    None
    if settings.environment == "production"
    else OpenAPIConfig(
        title="Nexus Archive API",
        version="0.3.0",
        description=(
            "Authenticated API for the Nexus cyberpunk book library, including"
            " cookie-backed auth, health probes, and AI-assisted recommendation"
            " workflows."
        ),
        path="/schema",
        use_handler_docstrings=True,
        root_schema_site="swagger",
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
    allowed_hosts=list(settings.allowed_hosts),
    openapi_config=_openapi_config,
    on_startup=[start_email_poller],
)
