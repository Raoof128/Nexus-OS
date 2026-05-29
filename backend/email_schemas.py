"""Pydantic v2 schemas for the Unified Inbox feature."""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Pragmatic email-shape check: a local part, an @, and a dotted domain with no
# whitespace. Final delivery validity is still enforced by the provider; this
# just rejects obviously malformed recipients up front with a clear 422.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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

    account_id: str
    to: list[str] = Field(min_length=1)
    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)
    subject: str = Field(max_length=998)
    body_html: str
    in_reply_to: str | None = None
    thread_id: str | None = None

    @field_validator("to", "cc", "bcc", mode="before")
    @classmethod
    def strip_email_addresses(cls, value: list[str]) -> list[str]:
        if not isinstance(value, list):
            return value
        cleaned = [
            addr.strip() for addr in value if isinstance(addr, str) and addr.strip()
        ]
        for addr in cleaned:
            if not _EMAIL_RE.match(addr):
                raise ValueError(f"Invalid email address: {addr}")
        return cleaned


class MoveEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    folder: str = Field(min_length=1, max_length=100)


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
