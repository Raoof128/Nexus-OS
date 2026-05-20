"""Central logging configuration for backend services."""

from __future__ import annotations

import logging


def configure_logging() -> None:
    """Configure backend logging once at application startup."""

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        force=True,
    )
