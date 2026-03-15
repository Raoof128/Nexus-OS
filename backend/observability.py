"""Observability bootstrap helpers."""

from __future__ import annotations

import logging

import sentry_sdk

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

logger = logging.getLogger(__name__)


def configure_observability() -> None:
    """Initialize optional error tracking for backend runtime failures."""

    settings = get_settings()
    if not settings.backend_sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.backend_sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.backend_sentry_traces_sample_rate,
    )
    logger.info("Sentry observability enabled for backend")
