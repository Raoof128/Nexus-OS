"""Audit logging for security-sensitive user actions.

Each audit record is one JSON object on the ``nexus.audit`` logger with the
keys ``action``, ``request_id``, ``user_hash`` and ``metadata``.

Privacy rules:

* The raw user identifier is never logged. ``user_hash`` is a salted SHA-256
  digest. Use ``hash_identifier`` for values that are not user IDs, such as a
  normalised login email on a failed attempt.
* Metadata is allowlisted per action in ``ALLOWED_METADATA_KEYS``. Keys outside
  the list are dropped and only their names are logged, never their values.
  Values must be scalar (str, int, float, bool or None). Strings are capped at
  ``MAX_STRING_LENGTH`` characters.
* Logging never changes the outcome of the action it records. A serialization
  failure falls back to a record without metadata and does not raise.

The privacy approach follows the OWASP Logging Cheat Sheet guidance to exclude
PII and session identifiers and to de-identify identifiers where identity is not
needed.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
from collections.abc import Mapping
from typing import Any, Final

try:
    from .config import get_settings
    from .logging_config import request_id_var
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from logging_config import request_id_var

audit_logger: Final[logging.Logger] = logging.getLogger("nexus.audit")

MAX_STRING_LENGTH: Final[int] = 200

ScalarValue = str | int | float | bool | None

ALLOWED_METADATA_KEYS: Final[Mapping[str, frozenset[str]]] = {
    "media.create": frozenset({"type", "status"}),
    "media.update": frozenset({"media_id"}),
    "media.delete": frozenset({"media_id"}),
    "media.suggest": frozenset({"type", "library_size", "source"}),
    # Schema for the auth, OAuth, email and task events. Call sites in the
    # controllers record outcome as "success" or "failure" and never include
    # passwords, tokens, OAuth codes, email addresses or bodies, or titles.
    "auth.login": frozenset({"outcome", "reason"}),
    "auth.logout": frozenset({"outcome"}),
    "auth.refresh": frozenset({"outcome", "reason"}),
    "auth.password_reset_request": frozenset({"outcome"}),
    "auth.password_reset": frozenset({"outcome"}),
    "oauth.connect": frozenset({"outcome", "provider"}),
    "oauth.disconnect": frozenset({"outcome", "provider"}),
    "email.send": frozenset({"outcome"}),
    "email.move": frozenset({"outcome"}),
    "task.create": frozenset({"outcome", "task_id"}),
    "task.update": frozenset({"outcome", "task_id"}),
    "task.delete": frozenset({"outcome", "task_id"}),
    # Emitted by rate_limit._enforce_ai on a rejected AI request. "feature" is
    # a fixed code-level label such as "suggest", never user input.
    "ai.rate_limited": frozenset({"feature"}),
}
"""Permitted metadata keys per audit action. Unlisted actions log no metadata."""

ALLOWED_OUTCOME_VALUES: Final[frozenset[str]] = frozenset({"success", "failure"})
"""The only values an ``outcome`` key may carry. Anything else is dropped."""


def hash_identifier(value: str) -> str:
    """Return a salted SHA-256 digest of *value*.

    Used for ``user_hash`` and for identifiers that are not user IDs, such as a
    normalised email address on a failed login.
    """

    salt = get_settings().audit_log_salt
    return hashlib.sha256(f"{salt}:{value}".encode("utf-8")).hexdigest()


def _hash_user_id(user_id: str) -> str:
    """Hash a user identifier so logs remain useful without leaking raw IDs."""

    return hash_identifier(user_id)


def _is_loggable_scalar(value: object) -> bool:
    """Return True for values that may appear in audit metadata."""

    if value is None or isinstance(value, (str, bool, int)):
        return True
    return isinstance(value, float) and math.isfinite(value)


def sanitize_metadata(
    action: str,
    metadata: Mapping[str, Any] | None,
) -> dict[str, ScalarValue]:
    """Return only the allowlisted, scalar, length-capped metadata for *action*.

    Dropped keys are reported by name in one warning. Their values are never
    logged.
    """

    if not metadata:
        return {}

    allowed = ALLOWED_METADATA_KEYS.get(action)
    if allowed is None:
        audit_logger.warning(
            "Audit action %s has no metadata schema; dropped %d key(s)",
            action,
            len(metadata),
        )
        return {}

    clean: dict[str, ScalarValue] = {}
    dropped: list[str] = []
    for key in sorted(metadata, key=str):
        value = metadata[key]
        if key not in allowed or not _is_loggable_scalar(value):
            dropped.append(str(key))
            continue
        if key == "outcome" and value not in ALLOWED_OUTCOME_VALUES:
            dropped.append(str(key))
            continue
        if isinstance(value, str) and len(value) > MAX_STRING_LENGTH:
            value = value[:MAX_STRING_LENGTH]
        clean[str(key)] = value

    if dropped:
        audit_logger.warning(
            "Audit action %s dropped metadata key(s): %s",
            action,
            ", ".join(dropped),
        )
    return clean


def _current_request_id() -> str:
    """Return the correlation ID bound to the active request, if any."""

    return request_id_var.get()


def log_audit_event(
    action: str,
    user_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Write one structured audit record for a user action.

    Never raises for bad metadata. If serialization fails, a record with
    ``metadata_error`` set is written instead, so a committed user action is
    not turned into an error response by its audit record.
    """

    payload: dict[str, Any] = {
        "action": action,
        "request_id": _current_request_id(),
        "user_hash": _hash_user_id(user_id),
        "metadata": sanitize_metadata(action, metadata),
    }
    try:
        line = json.dumps(payload, sort_keys=True, default=str, allow_nan=False)
    except (TypeError, ValueError):
        fallback = {
            "action": action,
            "request_id": payload["request_id"],
            "user_hash": payload["user_hash"],
            "metadata": {},
            "metadata_error": True,
        }
        line = json.dumps(fallback, sort_keys=True)
    audit_logger.info(line)


__all__ = [
    "ALLOWED_METADATA_KEYS",
    "MAX_STRING_LENGTH",
    "audit_logger",
    "hash_identifier",
    "log_audit_event",
    "sanitize_metadata",
]
