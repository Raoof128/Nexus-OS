"""Observability bootstrap helpers."""

from __future__ import annotations

import logging
import re
from typing import Any

import sentry_sdk

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

logger = logging.getLogger(__name__)

# Keys that must never appear in Sentry request bodies or query strings.
_SCRUB_KEYS = frozenset(
    {
        "access_token",
        "refresh_token",
        "token_hash",
        "new_password",
        "password",
        "client_secret",
    }
)


def _scrub_event(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    """Strip auth material from Sentry events before transmission."""

    request = event.get("request", {})

    # Scrub cookies — session tokens live here
    if request.get("cookies"):
        request["cookies"] = "[Filtered]"

    # Scrub known sensitive keys from POST body (dict or string form)
    body = request.get("data")
    if isinstance(body, dict):
        for key in _SCRUB_KEYS:
            if key in body:
                body[key] = "[Filtered]"
    elif isinstance(body, str):
        # Best-effort: redact obvious key=value patterns in form-encoded strings
        for key in _SCRUB_KEYS:
            body = re.sub(
                rf"({re.escape(key)}=)[^&\"'\s]*",
                r"\1[Filtered]",
                body,
                flags=re.IGNORECASE,
            )
        request["data"] = body

    # Scrub sensitive query parameters
    qs = request.get("query_string", "")
    if qs:
        for key in _SCRUB_KEYS:
            qs = re.sub(
                rf"({re.escape(key)}=)[^&\"'\s]*",
                r"\1[Filtered]",
                qs,
                flags=re.IGNORECASE,
            )
        request["query_string"] = qs

    return event


def configure_observability() -> None:
    """Initialize optional error tracking for backend runtime failures."""

    settings = get_settings()
    if not settings.backend_sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.backend_sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.backend_sentry_traces_sample_rate,
        send_default_pii=False,  # Correct Python SDK kwarg (was `sendDefaultPii`)
        before_send=_scrub_event,
    )
    logger.info("Sentry observability enabled for backend")
