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
        "\n<trusted_library_context>\n"
        + json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        + "\n</trusted_library_context>\n"
    )


def serialize_email_context_for_llm(
    emails: list[dict[str, Any]],
) -> str:
    """Wrap email thread in strict XML delimiters to resist prompt injection."""

    items = []
    for e in emails:
        items.append(
            {
                "from": sanitize_llm_text(str(e.get("from_address") or "Unknown")),
                "date": sanitize_llm_text(str(e.get("provider_date") or "Unknown")),
                "subject": sanitize_llm_text(str(e.get("subject") or "(no subject)")),
                "body": sanitize_llm_text(str(e.get("body_text") or "")),
            }
        )
    payload = {"emails": items}
    return (
        "\n<untrusted_email_thread_context>\n"
        + json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        + "\n</untrusted_email_thread_context>\n"
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


def hydrate_media_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a media record with sensitive fields restored for the UI."""

    hydrated = dict(record)
    hydrated["takeaway"] = decrypt_takeaway(record.get("takeaway"))
    return hydrated


def hydrate_chat_message_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a chat message record with encrypted content restored for the UI."""

    hydrated = dict(record)
    hydrated["content"] = decrypt_takeaway(record.get("content"))
    return hydrated


def protect_task_notes(notes: str | None) -> str | None:
    """Encrypt task notes when a field-level key is configured, else plaintext.

    Mirrors ``protect_chat_content``: graceful in dev (no key -> plaintext) while
    the ``enc::`` prefix lets ``decrypt_takeaway`` transparently restore on read.
    """

    if notes is None:
        return None

    cipher = get_takeaway_cipher()
    if cipher is None:
        return notes

    token = cipher.encrypt(notes.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def hydrate_task_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a task record with the notes body decrypted for the UI."""

    hydrated = dict(record)
    hydrated["notes_encrypted"] = decrypt_takeaway(record.get("notes_encrypted"))
    return hydrated


def protect_note_text(text: str | None) -> str | None:
    """Encrypt note text (title/body/checklist) when a key is configured, else plaintext.

    Mirrors ``protect_chat_content`` / ``protect_task_notes``: graceful in dev
    (no key -> plaintext) while the ``enc::`` prefix lets ``decrypt_takeaway``
    transparently restore on read.
    """

    if text is None:
        return None

    cipher = get_takeaway_cipher()
    if cipher is None:
        return text

    token = cipher.encrypt(text.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def hydrate_note_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a note record with encrypted text fields decrypted for the UI."""

    hydrated = dict(record)
    if "title_encrypted" in record:
        hydrated["title_encrypted"] = decrypt_takeaway(record.get("title_encrypted"))
    if "content_encrypted" in record:
        hydrated["content_encrypted"] = decrypt_takeaway(
            record.get("content_encrypted")
        )
    if "text_encrypted" in record:
        hydrated["text_encrypted"] = decrypt_takeaway(record.get("text_encrypted"))
    return hydrated
