"""Central logging configuration and request correlation for backend services.

Each request gets a correlation ID. It is taken from an inbound ``X-Request-ID``
header only when the value is short and alphanumeric, otherwise a server-side
UUID4 is generated. The ID is echoed in the response and appears in every log
line emitted while the request is active.
"""

from __future__ import annotations

import logging
import re
import uuid
from contextvars import ContextVar
from typing import Any, Final

from litestar import Request, Response
from litestar.enums import ScopeType
from litestar.exceptions import HTTPException
from litestar.exceptions.responses import create_exception_response
from litestar.middleware import ASGIMiddleware
from litestar.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

LOG_FORMAT: Final[str] = (
    "%(asctime)s %(levelname)s [%(name)s] [req=%(request_id)s] %(message)s"
)

# Third-party clients log every full request URL at INFO. Those URLs can carry
# query strings (search text, identifiers), so keep them at WARNING.
_QUIET_LOGGERS: Final[tuple[str, ...]] = ("httpx", "httpcore")

_NO_REQUEST: Final[str] = "-"
_REQUEST_ID_HEADER: Final[bytes] = b"x-request-id"
_VALID_INBOUND_ID: Final[re.Pattern[str]] = re.compile(r"[A-Za-z0-9-]{1,64}")

request_id_var: ContextVar[str] = ContextVar("request_id", default=_NO_REQUEST)


class RequestIdFilter(logging.Filter):
    """Attach the active request ID to each record as ``record.request_id``.

    Attach it to handlers, not loggers: a logger-level filter does not see
    records propagated up from child loggers.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def install_request_id_filter() -> None:
    """Add ``RequestIdFilter`` to every root handler (idempotent)."""

    for handler in logging.getLogger().handlers:
        if not any(isinstance(f, RequestIdFilter) for f in handler.filters):
            handler.addFilter(RequestIdFilter())


def configure_logging() -> None:
    """Configure backend logging once at application startup."""

    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, force=True)
    install_request_id_filter()
    for name in _QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)


def _inbound_request_id(scope: Scope) -> str:
    """Return a validated inbound request ID, or a fresh UUID4."""

    for name, value in scope.get("headers", []):
        if name == _REQUEST_ID_HEADER:
            candidate = value.decode("latin-1")
            if _VALID_INBOUND_ID.fullmatch(candidate):
                return candidate
            break
    return str(uuid.uuid4())


class RequestIdMiddleware(ASGIMiddleware):
    """Bind a correlation ID to the request context and echo it in the response.

    Uses ``ASGIMiddleware``: ``litestar.middleware.AbstractMiddleware`` has been
    deprecated since Litestar 2.15 (``LitestarDeprecationWarning`` on subclass).
    Instantiate it in ``middleware=[RequestIdMiddleware()]``.
    """

    scopes = (ScopeType.HTTP,)

    async def handle(
        self, scope: Scope, receive: Receive, send: Send, next_app: ASGIApp
    ) -> None:
        request_id = _inbound_request_id(scope)
        token = request_id_var.set(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers: list[Any] = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        try:
            await next_app(scope, receive, send_with_request_id)
        finally:
            request_id_var.reset(token)


def log_unhandled_exception(
    request: Request[Any, Any, Any], exc: Exception
) -> Response[Any]:
    """Log non-HTTP exceptions with a traceback and return Litestar's error response.

    Litestar only logs uncaught exceptions when ``logging_config`` is set, and the
    app disables it, so without this handler a 500 leaves no traceback in the logs.
    ``HTTPException`` (404, 422, ...) is an expected client error and is returned
    without a log line. The request path is not logged because it can carry
    credential-bearing segments.
    """

    if not isinstance(exc, HTTPException):
        logger.error(
            "Unhandled %s during %s request",
            type(exc).__name__,
            request.method,
            exc_info=exc,
        )
    return create_exception_response(request, exc)


__all__ = [
    "LOG_FORMAT",
    "RequestIdFilter",
    "RequestIdMiddleware",
    "configure_logging",
    "install_request_id_filter",
    "log_unhandled_exception",
    "request_id_var",
]
