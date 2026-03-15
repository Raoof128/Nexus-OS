"""ASGI application entrypoint for the backend."""

from litestar import Litestar
from litestar.config.cors import CORSConfig

try:
    from .auth import SupabaseAuthMiddleware
    from .controllers import BookController
except ImportError:  # pragma: no cover - supports backend cwd execution
    from auth import SupabaseAuthMiddleware
    from controllers import BookController

# Explicitly configure CORS. No allow_origins=["*"] nonsense.
cors_config = CORSConfig(
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"]
)

app = Litestar(
    route_handlers=[BookController],
    middleware=[SupabaseAuthMiddleware],
    cors_config=cors_config,
)
