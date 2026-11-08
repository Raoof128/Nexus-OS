"""Pydantic v2 request and response schemas for the Unified Inbox feature.

Request models validate client input before any provider call. Validation
failures surface as HTTP 400 through Litestar's ``ValidationException`` (its
``ClientException`` default status), with pydantic's error list in the body.

Wire contract: the frontend posts camelCase keys (``accountId``, ``body``) and
comma-separated recipient strings. The snake_case names used by the Python
attributes are also accepted, so both callers keep working.
"""

from __future__ import annotations

import re
import unicodedata
from enum import StrEnum
from typing import Annotated, Any

from email_validator import EmailNotValidError, validate_email
from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

# Schema-level ceiling on the combined to + cc + bcc recipients of one message.
# The controller applies a stricter per-list and total cap (100) and answers
# with 422 before any provider call; this bound only stops oversized input early.
MAX_RECIPIENTS_PER_MESSAGE = 500

# Maximum length of one label name, in characters.
MAX_LABEL_LENGTH = 100

# Maximum number of labels accepted in each of ``add`` and ``remove``.
MAX_LABELS_PER_REQUEST = 50

# RFC 5321 caps a forward path at 256 octets, which bounds one address.
MAX_ADDRESS_LENGTH = 254

# Upper bound for opaque identifiers (account, thread, email ids).
MAX_ID_LENGTH = 128

# Recipient list separators accepted from the frontend (commas or semicolons).
_RECIPIENT_SPLIT_RE = re.compile(r"[,;]")

Label = Annotated[str, Field(min_length=1, max_length=MAX_LABEL_LENGTH)]
EmailId = Annotated[str, Field(min_length=1, max_length=MAX_ID_LENGTH)]


def _has_header_breaking_chars(value: str) -> bool:
    """True when the value holds a control, line- or paragraph-separator char.

    Such characters can split an SMTP/MIME header or smuggle a second header.
    Horizontal tab is the one control character allowed through.
    """
    return any(
        ch != "\t" and unicodedata.category(ch) in ("Cc", "Zl", "Zp") for ch in value
    )


class Folder(StrEnum):
    """Closed set of folders a message may be moved to.

    Each value is a folder the frontend offers, or one the Gmail provider maps
    to labels. ``starred`` is a filter view, not a move target.
    """

    INBOX = "inbox"
    ARCHIVE = "archive"
    TRASH = "trash"
    SENT = "sent"
    DRAFTS = "drafts"
    SPAM = "spam"


class _RequestModel(BaseModel):
    """Base for client-facing request bodies. Unknown keys are rejected."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _split_recipient_text(value: str) -> list[str]:
    """Split a comma- or semicolon-separated recipient string into parts."""
    return _RECIPIENT_SPLIT_RE.split(value)


def normalize_recipients(value: Any) -> Any:
    """Normalise a raw recipient value into a deduplicated list of addresses.

    Accepts a list of strings or a comma/semicolon-separated string. Every
    entry must be a string: non-string entries are rejected rather than
    dropped, so the sent recipient list never silently differs from the one
    submitted. Blank entries are skipped. Each remaining entry is validated as a
    bare address (display-name forms such as ``Bob <bob@x.com>`` are rejected).
    Duplicates are removed case-insensitively, keeping the first occurrence.

    Non-list, non-string values are returned unchanged so pydantic reports the
    type error itself.
    """
    if isinstance(value, str):
        raw_items: list[Any] = [value]
    elif isinstance(value, list):
        raw_items = list(value)
    else:
        return value

    parts: list[str] = []
    for item in raw_items:
        if not isinstance(item, str):
            raise ValueError("Recipient must be a string")
        parts.extend(_split_recipient_text(item))

    seen: set[str] = set()
    cleaned: list[str] = []
    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue
        if len(stripped) > MAX_ADDRESS_LENGTH:
            raise ValueError(f"Invalid email address: {stripped[:40]}...")
        try:
            # check_deliverability=False keeps validation offline (no DNS).
            # allow_smtputf8=False rejects non-ASCII local parts, so every
            # accepted address has an ASCII form with a punycode domain.
            result = validate_email(
                stripped, check_deliverability=False, allow_smtputf8=False
            )
        except EmailNotValidError as exc:
            raise ValueError(f"Invalid email address: {stripped}") from exc
        address = result.ascii_email or result.normalized
        key = address.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(address)
    return cleaned


class EmailAccountResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str
    provider: str
    email_address: str
    status: str
    created_at: str


class EmailMessageResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str
    account_id: str
    provider_id: str
    thread_id: str | None = None
    folder: str
    labels: list[str] = Field(default_factory=list)
    from_address: str
    from_name: str = ""
    to_addresses: list[dict] = Field(default_factory=list)
    cc_addresses: list[dict] = Field(default_factory=list)
    subject: str = "(no subject)"
    snippet: str = ""
    is_read: bool = False
    is_starred: bool = False
    has_attachments: bool = False
    attachments_meta: list[dict] = Field(default_factory=list)
    provider_date: str


class ComposeEmailRequest(_RequestModel):
    """Body for send, draft, reply and forward.

    ``in_reply_to`` is derived by the server, never by the client. Any value a
    client sends for it is rejected, so a caller cannot set a threading header
    to an arbitrary address.
    """

    account_id: str = Field(
        min_length=1,
        max_length=MAX_ID_LENGTH,
        validation_alias=AliasChoices("account_id", "accountId"),
    )
    to: list[str] = Field(min_length=1, max_length=MAX_RECIPIENTS_PER_MESSAGE)
    cc: list[str] = Field(default_factory=list, max_length=MAX_RECIPIENTS_PER_MESSAGE)
    bcc: list[str] = Field(default_factory=list, max_length=MAX_RECIPIENTS_PER_MESSAGE)
    subject: str = Field(max_length=998)
    body_html: str = Field(
        validation_alias=AliasChoices("body_html", "bodyHtml", "body"),
    )
    # Server-derived threading value. Excluded from output and never accepted
    # from the client (see reject_client_in_reply_to).
    in_reply_to: str | None = Field(default=None, exclude=True)
    thread_id: str | None = Field(default=None, max_length=MAX_ID_LENGTH)

    @model_validator(mode="before")
    @classmethod
    def reject_client_in_reply_to(cls, data: Any) -> Any:
        if isinstance(data, dict) and (
            data.get("in_reply_to") is not None or data.get("inReplyTo") is not None
        ):
            raise ValueError("in_reply_to is set by the server and cannot be supplied")
        return data

    @field_validator("to", "cc", "bcc", mode="before")
    @classmethod
    def normalize_recipient_fields(cls, value: Any) -> Any:
        return normalize_recipients(value)

    @field_validator("subject", "account_id", "thread_id")
    @classmethod
    def reject_header_breaking_characters(cls, value: str | None) -> str | None:
        if value is not None and _has_header_breaking_chars(value):
            raise ValueError("Must not contain control characters, line breaks or NUL")
        return value

    @model_validator(mode="after")
    def cap_total_recipients(self) -> ComposeEmailRequest:
        total = len(self.to) + len(self.cc) + len(self.bcc)
        if total > MAX_RECIPIENTS_PER_MESSAGE:
            raise ValueError(
                f"A message may have at most {MAX_RECIPIENTS_PER_MESSAGE} "
                f"recipients in total (to, cc and bcc combined); got {total}"
            )
        return self


class MoveEmailRequest(_RequestModel):
    folder: Folder


class LabelEmailRequest(_RequestModel):
    add: list[Label] = Field(default_factory=list, max_length=MAX_LABELS_PER_REQUEST)
    remove: list[Label] = Field(default_factory=list, max_length=MAX_LABELS_PER_REQUEST)

    @model_validator(mode="after")
    def reject_overlapping_labels(self) -> LabelEmailRequest:
        overlap = {label.casefold() for label in self.add} & {
            label.casefold() for label in self.remove
        }
        if overlap:
            raise ValueError(
                "A label cannot be both added and removed: "
                + ", ".join(sorted(overlap))
            )
        return self


class ReadEmailRequest(_RequestModel):
    """Body payload for the mark-read/unread endpoint."""

    is_read: bool


class ToggleStarRequest(_RequestModel):
    """Body payload for the star/unstar endpoint."""

    is_starred: bool


class AIDraftRequest(_RequestModel):
    email_id: EmailId
    instruction: str = Field(default="", max_length=500)


class AISummarizeRequest(_RequestModel):
    email_ids: list[EmailId] = Field(min_length=1, max_length=20)
