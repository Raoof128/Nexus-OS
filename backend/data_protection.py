"""Helpers for protecting sensitive data and untrusted LLM input.

Protection layers, strongest first:

* Field-level Fernet encryption for takeaways, chat content and task notes.
  ``TAKEAWAY_ENCRYPTION_KEY`` may hold several comma-separated keys (newest
  first) so a rotated key does not orphan existing rows.
* Structural separation for model input: untrusted values are JSON-encoded
  inside XML-style wrappers, with ``<``, ``>`` and ``&`` escaped so the
  wrapper's own closing tag is the only one the model can see.
* Best-effort redaction (PII masking, invisible-character stripping and the
  prompt-attack keyword filter). These are hardening measures, not security
  boundaries; they never replace permission checks or validating tool
  arguments outside the model.
"""

from __future__ import annotations

import functools
import json
import logging
import re
import unicodedata
from typing import Any

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

logger = logging.getLogger(__name__)

TakeawayCipher = Fernet | MultiFernet

# Maximum characters of any single untrusted value that reaches the model.
# Applied before normalization and regex matching (bounds regex cost too).
MAX_LLM_FIELD_CHARS = 8_000

# C0 controls, DEL and the C1 range U+0080-U+009F. Replaced with a space.
CONTROL_CHARS_PATTERN = re.compile(r"[\x00-\x1F\x7F-\x9F]")
# Format characters (Unicode category Cf) are removed outright, except ZWNJ
# (U+200C, needed for Persian orthography) and ZWJ (U+200D, needed for emoji
# sequences). Surrogate code points (category Cs) cannot be encoded as UTF-8.
_PRESERVED_FORMAT_CHARS = frozenset({"‌", "‍"})
_DROPPED_CATEGORIES = frozenset({"Cf", "Cs"})
MARKDOWN_FENCE_PATTERN = re.compile(r"`{3,}.*?`{3,}", re.DOTALL)
# Best-effort keyword filter for common prompt-attack phrasings. Easily bypassed
# (paraphrase, other languages, encodings); it is defence in depth only.
PROMPT_ATTACK_PATTERN = re.compile(
    r"(ignore\s+all\s+previous\s+instructions|system\s+prompt|developer\s+message|"
    r"dump\s+the\s+prompt|tool\s+call|reveal\s+instructions)",
    re.IGNORECASE,
)
# Linear-time form: the lookbehind stops a match from starting mid-token, so a
# long run of dots and letters is not rescanned from every position.
EMAIL_PATTERN = re.compile(
    r"(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z0-9-])",
    re.IGNORECASE,
)
PHONE_PATTERN = re.compile(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b")
ENCRYPTED_PREFIX = "enc::"

# JSON-safe escapes for characters that could close or open an XML-style tag.
_TAG_BREAKING_ESCAPES = {"<": "\\u003c", ">": "\\u003e", "&": "\\u0026"}


def _strip_format_characters(value: str) -> str:
    """Remove invisible format characters and lone surrogates.

    ZWNJ and ZWJ are kept. Characters are removed without a replacement so that
    masking still sees contiguous text (``john\u200b@example.com`` stays maskable).
    """

    return "".join(
        char
        for char in value
        if char in _PRESERVED_FORMAT_CHARS
        or unicodedata.category(char) not in _DROPPED_CATEGORIES
    )


def _normalize_text(value: str) -> str:
    """Normalize arbitrary text for safer downstream usage."""

    sanitized = _strip_format_characters(value)
    sanitized = CONTROL_CHARS_PATTERN.sub(" ", sanitized)
    sanitized = MARKDOWN_FENCE_PATTERN.sub("[redacted-code-block]", sanitized)
    sanitized = " ".join(sanitized.split())
    return sanitized.strip()


def mask_sensitive_text(value: str) -> str:
    """Mask obvious PII before text leaves the server boundary."""

    masked = EMAIL_PATTERN.sub("[redacted-email]", value)
    return PHONE_PATTERN.sub("[redacted-phone]", masked)


def sanitize_llm_text(value: str | None) -> str:
    """Return untrusted text as plain, redacted prose for model input.

    The result is not JSON-encoded. Serializers encode the whole payload exactly
    once, so quotes, backslashes and non-ASCII text survive intact.
    """

    if not value:
        return ""

    sanitized = _normalize_text(value[:MAX_LLM_FIELD_CHARS])
    sanitized = PROMPT_ATTACK_PATTERN.sub("[redacted-instruction]", sanitized)
    return mask_sensitive_text(sanitized)


def sanitize_chat_message_for_llm(value: str | None) -> str:
    """Reduce prompt-injection and PII exposure in chat content sent upstream."""

    if not value:
        return ""

    sanitized = _normalize_text(value)
    sanitized = PROMPT_ATTACK_PATTERN.sub("[redacted-instruction]", sanitized)
    return mask_sensitive_text(sanitized)


def _json_for_llm(payload: Any) -> str:
    """Encode a payload once as compact JSON that cannot close a wrapper tag."""

    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    for char, escape in _TAG_BREAKING_ESCAPES.items():
        encoded = encoded.replace(char, escape)
    return encoded


def _wrap_context(tag: str, payload: Any) -> str:
    """Wrap an encoded payload in ``<tag>...</tag>`` delimiters."""

    return f"\n<{tag}>\n{_json_for_llm(payload)}\n</{tag}>\n"


def serialize_media_context_for_llm(
    media_context: list[dict[str, Any]],
) -> str:
    """Wrap library metadata in XML delimiters for the model.

    The wrapper name says ``trusted`` because the library is the owner's own
    data, but the values are still user-entered and are treated as data only.
    """

    items = []
    for item in media_context:
        rating = item.get("rating")
        entry = {
            "title": sanitize_llm_text(str(item.get("title") or "Unknown")),
            "genre": sanitize_llm_text(str(item.get("genre") or "Unknown")),
            "rating": sanitize_llm_text("unrated" if rating is None else str(rating)),
        }
        if item.get("type"):
            entry["type"] = sanitize_llm_text(str(item["type"]))
        if item.get("creator"):
            entry["creator"] = sanitize_llm_text(str(item["creator"]))
        items.append(entry)
    return _wrap_context("trusted_library_context", {"media": items})


def serialize_email_context_for_llm(
    emails: list[dict[str, Any]],
) -> str:
    """Wrap an email thread in XML delimiters for the model.

    Bodies are capped by ``sanitize_llm_text`` before matching, so very long
    messages are truncated rather than scanned in full.
    """

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
    return _wrap_context("untrusted_email_thread_context", {"emails": items})


def _parse_takeaway_keys(raw: str) -> list[str]:
    """Split the configured key value into its non-empty, stripped parts."""

    return [part.strip() for part in raw.split(",") if part.strip()]


@functools.lru_cache(maxsize=4)
def _build_takeaway_cipher(raw: str) -> TakeawayCipher | None:
    """Build the cipher for one raw key string. Cached per distinct value.

    Exceptions are not cached by ``lru_cache``, so an invalid key raises again
    on every call until the configuration is fixed.
    """

    keys = _parse_takeaway_keys(raw)
    if not keys:
        return None
    try:
        fernets = [Fernet(key.encode("utf-8")) for key in keys]
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "TAKEAWAY_ENCRYPTION_KEY must be one base64-encoded Fernet key, or "
            "several comma-separated keys (newest first). Generate one with "
            "`python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'`."
        ) from exc
    if len(fernets) == 1:
        return fernets[0]
    return MultiFernet(fernets)


def get_takeaway_cipher() -> TakeawayCipher | None:
    """Return the field cipher, or ``None`` when encryption is not configured.

    ``TAKEAWAY_ENCRYPTION_KEY`` may contain several comma-separated Fernet keys,
    newest first. Encryption uses the first key; decryption tries each key in
    order. A single key returns a plain ``Fernet``.

    Raises a clear ``RuntimeError`` at first use if any key is not a valid
    Fernet key, so misconfiguration surfaces immediately rather than as an
    opaque ``binascii`` error from deeper in ``cryptography``.
    """

    raw = get_settings().takeaway_encryption_key
    if not raw:
        return None
    return _build_takeaway_cipher(raw)


def _encrypt_value(cipher: TakeawayCipher, plaintext: str) -> str:
    """Encrypt text with ``cipher`` and return the prefixed storage form."""

    token = cipher.encrypt(plaintext.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def encrypt_takeaway(takeaway: str | None) -> str | None:
    """Encrypt sensitive takeaway notes before persistence."""

    if takeaway is None:
        return None

    cipher = get_takeaway_cipher()
    if cipher is None:
        raise RuntimeError(
            "TAKEAWAY_ENCRYPTION_KEY must be configured before storing takeaways"
        )
    return _encrypt_value(cipher, takeaway)


def protect_chat_content(content: str | None) -> str | None:
    """Encrypt chat content when a field-level encryption key is configured."""

    if content is None:
        return None

    cipher = get_takeaway_cipher()
    if cipher is None:
        return content
    return _encrypt_value(cipher, content)


def decrypt_takeaway(takeaway: str | None) -> str | None:
    """Decrypt a stored value. Plain values pass through unchanged.

    An ``enc::`` value that cannot be decrypted (no key configured, or no
    configured key matches) returns ``None``. The ciphertext is never returned,
    so it cannot leak into a response or be reused as a credential. A warning is
    logged without the value. Callers that have a record id should use
    ``_decrypt_for_display`` so the log names the record.
    """

    if takeaway is None or not takeaway.startswith(ENCRYPTED_PREFIX):
        return takeaway
    return _decrypt_for_display(takeaway, record_id="unknown", field="value")


def rotate_takeaway_token(stored: str) -> str:
    """Re-encrypt a stored value under the newest configured key.

    Pure function: it does not touch the database. A rotation job calls it per
    row and writes the result back. Values without the ``enc::`` prefix are
    returned unchanged. Raises ``InvalidToken`` if no configured key can decrypt
    the value, and ``RuntimeError`` if no key is configured.
    """

    if not stored.startswith(ENCRYPTED_PREFIX):
        return stored

    cipher = get_takeaway_cipher()
    if cipher is None:
        raise RuntimeError("TAKEAWAY_ENCRYPTION_KEY must be configured to rotate")

    rotator = cipher if isinstance(cipher, MultiFernet) else MultiFernet([cipher])
    token = stored.removeprefix(ENCRYPTED_PREFIX).encode("utf-8")
    return f"{ENCRYPTED_PREFIX}{rotator.rotate(token).decode('utf-8')}"


def _decrypt_for_display(
    value: str | None,
    *,
    record_id: object,
    field: str,
) -> str | None:
    """Return a stored value for the UI, or ``None`` when it cannot be shown.

    Plain values pass through. An ``enc::`` value with no key configured, or one
    that no configured key can decrypt, yields ``None`` and a warning that
    carries only the record id and field name, never plaintext or key material.
    """

    if value is None or not value.startswith(ENCRYPTED_PREFIX):
        return value

    cipher = get_takeaway_cipher()
    if cipher is None:
        logger.warning(
            "Encrypted %s on record %s hidden: no encryption key configured",
            field,
            record_id,
        )
        return None

    token = value.removeprefix(ENCRYPTED_PREFIX).encode("utf-8")
    try:
        return cipher.decrypt(token).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError):
        logger.warning(
            "Encrypted %s on record %s hidden: could not be decrypted "
            "(key mismatch or corrupt value)",
            field,
            record_id,
        )
        return None


def hydrate_media_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a media record with sensitive fields restored for the UI."""

    hydrated = dict(record)
    hydrated["takeaway"] = _decrypt_for_display(
        record.get("takeaway"), record_id=record.get("id"), field="takeaway"
    )
    return hydrated


def hydrate_chat_message_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a chat message record with encrypted content restored for the UI."""

    hydrated = dict(record)
    hydrated["content"] = _decrypt_for_display(
        record.get("content"), record_id=record.get("id"), field="content"
    )
    return hydrated


def protect_task_notes(notes: str | None) -> str | None:
    """Encrypt task notes when a field-level key is configured, else plaintext.

    Mirrors ``protect_chat_content``: graceful in dev (no key -> plaintext) while
    the ``enc::`` prefix lets reads restore the value transparently.
    """

    if notes is None:
        return None

    cipher = get_takeaway_cipher()
    if cipher is None:
        return notes
    return _encrypt_value(cipher, notes)


def hydrate_task_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a task record with the notes body decrypted for the UI."""

    hydrated = dict(record)
    hydrated["notes_encrypted"] = _decrypt_for_display(
        record.get("notes_encrypted"),
        record_id=record.get("id"),
        field="notes",
    )
    return hydrated


def protect_note_text(text: str | None) -> str | None:
    """Encrypt note text (title, body, checklist item) like task notes."""

    return protect_task_notes(text)


def hydrate_note_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a note record with encrypted text fields restored for the UI.

    A value that cannot be decrypted becomes ``None``, as for media and tasks.
    """

    hydrated = dict(record)
    for field in ("title_encrypted", "content_encrypted", "text_encrypted"):
        if field in record:
            hydrated[field] = _decrypt_for_display(
                record.get(field), record_id=record.get("id"), field=field
            )
    return hydrated
