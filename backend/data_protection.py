"""Helpers for protecting sensitive data and untrusted LLM input."""

from __future__ import annotations

import json
import re
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

CONTROL_CHARS_PATTERN = re.compile(r"[\x00-\x1F\x7F]")
MARKDOWN_FENCE_PATTERN = re.compile(r"`{3,}.*?`{3,}", re.DOTALL)
PROMPT_ATTACK_PATTERN = re.compile(
    r"(ignore\s+all\s+previous\s+instructions|system\s+prompt|developer\s+message|"
    r"dump\s+the\s+prompt|tool\s+call|reveal\s+instructions)",
    re.IGNORECASE,
)
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b")
ENCRYPTED_PREFIX = "enc::"


def _normalize_text(value: str) -> str:
    """Normalize arbitrary text for safer downstream usage."""

    sanitized = CONTROL_CHARS_PATTERN.sub(" ", value)
    sanitized = MARKDOWN_FENCE_PATTERN.sub("[redacted-code-block]", sanitized)
    sanitized = " ".join(sanitized.split())
    return sanitized.strip()


def mask_sensitive_text(value: str) -> str:
    """Mask obvious PII before text leaves the server boundary."""

    masked = EMAIL_PATTERN.sub("[redacted-email]", value)
    return PHONE_PATTERN.sub("[redacted-phone]", masked)


def sanitize_llm_text(value: str | None) -> str:
    """Convert untrusted media metadata into inert model input."""

    if not value:
        return ""

    sanitized = _normalize_text(value)
    sanitized = PROMPT_ATTACK_PATTERN.sub("[redacted-instruction]", sanitized)
    sanitized = mask_sensitive_text(sanitized)
    return json.dumps(sanitized, ensure_ascii=True)[1:-1]


def sanitize_chat_message_for_llm(value: str | None) -> str:
    """Reduce prompt-injection and PII exposure in chat content sent upstream."""

    if not value:
        return ""

    sanitized = _normalize_text(value)
    sanitized = PROMPT_ATTACK_PATTERN.sub("[redacted-instruction]", sanitized)
    return mask_sensitive_text(sanitized)


def serialize_media_context_for_llm(
    media_context: list[dict[str, Any]],
) -> str:
    """Wrap model input in strict XML delimiters to resist prompt injection."""

    items = []
    for item in media_context:
        entry = {
            "title": sanitize_llm_text(str(item.get("title") or "Unknown")),
            "genre": sanitize_llm_text(str(item.get("genre") or "Unknown")),
            "rating": sanitize_llm_text(str(item.get("rating") or "unrated")),
        }
        if item.get("type"):
            entry["type"] = sanitize_llm_text(str(item["type"]))
        if item.get("creator"):
            entry["creator"] = sanitize_llm_text(str(item["creator"]))
        items.append(entry)
    payload = {"media": items}
    return (
        "<trusted_library_context>"
        + json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        + "</trusted_library_context>"
    )


def get_takeaway_cipher() -> Fernet | None:
    """Return a Fernet cipher when field-level encryption is configured.

    Raises a clear ``RuntimeError`` at first use if the configured key is not a
    valid Fernet key so misconfiguration surfaces immediately rather than
    masquerading as an opaque ``binascii`` error from deeper in ``cryptography``.
    """

    key = get_settings().takeaway_encryption_key
    if not key:
        return None
    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "TAKEAWAY_ENCRYPTION_KEY is not a valid base64-encoded Fernet key. "
            "Generate one with `python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'`."
        ) from exc


def encrypt_takeaway(takeaway: str | None) -> str | None:
    """Encrypt sensitive takeaway notes before persistence."""

    if takeaway is None:
        return None

    cipher = get_takeaway_cipher()
    if cipher is None:
        raise RuntimeError(
            "TAKEAWAY_ENCRYPTION_KEY must be configured before storing takeaways"
        )

    token = cipher.encrypt(takeaway.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def protect_chat_content(content: str | None) -> str | None:
    """Encrypt chat content when a field-level encryption key is configured."""

    if content is None:
        return None

    cipher = get_takeaway_cipher()
    if cipher is None:
        return content

    token = cipher.encrypt(content.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def decrypt_takeaway(takeaway: str | None) -> str | None:
    """Decrypt sensitive takeaway notes after retrieval."""

    if takeaway is None or not takeaway.startswith(ENCRYPTED_PREFIX):
        return takeaway

    cipher = get_takeaway_cipher()
    if cipher is None:
        return takeaway

    token = takeaway.removeprefix(ENCRYPTED_PREFIX).encode("utf-8")
    try:
        return cipher.decrypt(token).decode("utf-8")
    except InvalidToken:
        return takeaway


def hydrate_book_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a media record with sensitive fields restored for the UI."""

    hydrated = dict(record)
    hydrated["takeaway"] = decrypt_takeaway(record.get("takeaway"))
    return hydrated


def hydrate_chat_message_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a chat message record with encrypted content restored for the UI."""

    hydrated = dict(record)
    hydrated["content"] = decrypt_takeaway(record.get("content"))
    return hydrated
