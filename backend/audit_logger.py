"""Audit logging helpers for security-sensitive user actions."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

audit_logger = logging.getLogger("nexus.audit")


def _hash_user_id(user_id: str) -> str:
    """Hash a user identifier so logs remain useful without leaking raw IDs."""

    salt = get_settings().audit_log_salt
    return hashlib.sha256(f"{salt}:{user_id}".encode("utf-8")).hexdigest()


def log_audit_event(
    action: str,
    user_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Write a structured audit record for user actions."""

    payload = {
        "action": action,
        "user_hash": _hash_user_id(user_id),
        "metadata": metadata or {},
    }
    audit_logger.info(json.dumps(payload, sort_keys=True))
