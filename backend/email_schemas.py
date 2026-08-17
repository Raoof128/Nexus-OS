"""Pydantic v2 schemas for the Unified Inbox feature."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Pragmatic email-shape check: a local part, an @, and a dotted domain with no
# whitespace. Final delivery validity is still enforced by the provider; this
# just rejects obviously malformed recipients up front with a clear 422.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_TOTAL_RECIPIENTS = 100
_MAX_EMAIL_ADDRESS_LENGTH = 320
_MAX_BODY_HTML_LENGTH = 1_000_000


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


class ComposeEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    account_id: str = Field(min_length=1, max_length=128)
    to: list[str] = Field(min_length=1, max_length=_MAX_TOTAL_RECIPIENTS)
    cc: list[str] = Field(default_factory=list, max_length=_MAX_TOTAL_RECIPIENTS)
    bcc: list[str] = Field(default_factory=list, max_length=_MAX_TOTAL_RECIPIENTS)
    subject: str = Field(max_length=998)
    body_html: str = Field(max_length=_MAX_BODY_HTML_LENGTH)
    in_reply_to: str | None = Field(default=None, max_length=1024)
    thread_id: str | None = Field(default=None, max_length=1024)

    @field_validator("to", "cc", "bcc", mode="before")
    @classmethod
    def strip_email_addresses(cls, value: list[str]) -> list[str]:
        if not isinstance(value, list):
            return value
        cleaned = [
            addr.strip() for addr in value if isinstance(addr, str) and addr.strip()
        ]
        for addr in cleaned:
            if len(addr) > _MAX_EMAIL_ADDRESS_LENGTH:
                raise ValueError("Email address is too long")
            if not _EMAIL_RE.match(addr):
                raise ValueError(f"Invalid email address: {addr}")
        return cleaned

    @model_validator(mode="after")
    def validate_total_recipient_count(self) -> "ComposeEmailRequest":
        """Bound provider fan-out even when recipients span multiple fields."""

        if len(self.to) + len(self.cc) + len(self.bcc) > _MAX_TOTAL_RECIPIENTS:
            raise ValueError(
                f"At most {_MAX_TOTAL_RECIPIENTS} total recipients are allowed"
            )
        return self


class MoveEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    folder: Literal["inbox", "archive", "trash", "spam"]


class LabelEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    add: list[str] = Field(default_factory=list)
    remove: list[str] = Field(default_factory=list)


class ReadEmailRequest(BaseModel):
    """Body payload for the mark-read/unread endpoint."""

    model_config = ConfigDict(str_strip_whitespace=True)
    is_read: bool


class ToggleStarRequest(BaseModel):
    """Body payload for the star/unstar endpoint."""

    model_config = ConfigDict(str_strip_whitespace=True)
    is_starred: bool


class AIDraftRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email_id: str
    instruction: str = Field(default="", max_length=500)


class AISummarizeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email_ids: list[str] = Field(min_length=1, max_length=20)
