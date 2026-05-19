"""Pydantic schemas for request and response validation."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

MediaType = Literal["book", "movie", "anime", "job"]
MediaStatus = Literal[
    "To Read",
    "Reading",
    "Finished",
    "To Watch",
    "Watching",
    "Applied",
    "Rejected",
    "Got the Job",
]

CONTROL_CHARS_PATTERN = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
XSS_PATTERN = re.compile(
    r"(<\s*script|javascript:|data:text/html|on[a-z]+\s*=|<\s*img)",
    re.IGNORECASE,
)
INJECTION_PATTERN = re.compile(
    r"(\bunion\s+select\b|\bdrop\s+table\b|'\s*or\s+'?\d+'?\s*=\s*'?\d+'?|\$where\b|\bdb\.)",
    re.IGNORECASE,
)
ANGLE_BRACKET_PATTERN = re.compile(r"[<>]")


def _normalize_text(value: str) -> str:
    """Collapse whitespace and strip control characters from free-form input."""

    if CONTROL_CHARS_PATTERN.search(value):
        raise ValueError("Control characters are not allowed")
    return " ".join(value.split())


class LoginRequest(BaseModel):
    """Login request submitted by the frontend."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class SessionUser(BaseModel):
    """Minimal user identity returned to the frontend."""

    id: str
    email: EmailStr | None = None


class AuthSessionResponse(BaseModel):
    """Frontend-safe session snapshot."""

    user: SessionUser
    expires_at: int | None = None
    access_token: str | None = None


class RegisterRequest(BaseModel):
    """Registration request submitted by the frontend."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    """Forgot password request — email only."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Password reset request with the recovery tokens."""

    access_token: str = Field(min_length=1)
    refresh_token: str = ""
    new_password: str = Field(min_length=8, max_length=128)


def _validate_text_field(value: str | None) -> str | None:
    """Shared validator for identity/text fields."""

    if value is None:
        return value
    normalized = _normalize_text(value)
    if ANGLE_BRACKET_PATTERN.search(normalized):
        raise ValueError("HTML tag delimiters are not allowed")
    if XSS_PATTERN.search(normalized):
        raise ValueError("HTML or script payloads are not allowed")
    if INJECTION_PATTERN.search(normalized):
        raise ValueError("Potential injection payload detected")
    return normalized


def _validate_takeaway_field(value: str | None) -> str | None:
    """Shared validator for takeaway notes."""

    if value is None:
        return value
    normalized = _normalize_text(value)
    if XSS_PATTERN.search(normalized):
        raise ValueError("HTML or script payloads are not allowed")
    return normalized


class MediaCreate(BaseModel):
    """Incoming payload for a user-created media entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    type: MediaType = "book"
    title: str = Field(min_length=1, max_length=200, pattern=r"^[^<>]*$")
    creator: str = Field(min_length=1, max_length=100, pattern=r"^[^<>]*$")
    genre: str | None = Field(default=None, max_length=80, pattern=r"^[^<>]*$")
    status: MediaStatus = "To Read"
    rating: int | None = Field(default=None, ge=1, le=5)
    takeaway: str | None = Field(default=None, max_length=2000)
    sub_info: str | None = Field(default=None, max_length=100, pattern=r"^[^<>]*$")

    @field_validator("title", "creator", "genre", "sub_info", mode="before")
    @classmethod
    def validate_identity_fields(cls, value: str | None) -> str | None:
        """Reject payloads that resemble injection or XSS probes."""
        return _validate_text_field(value)

    @field_validator("takeaway", mode="before")
    @classmethod
    def validate_takeaway(cls, value: str | None) -> str | None:
        """Reject unsafe markup and normalize user-authored notes."""
        return _validate_takeaway_field(value)


class MediaUpdate(BaseModel):
    """Incoming payload for updating an existing media entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(
        default=None, min_length=1, max_length=200, pattern=r"^[^<>]*$"
    )
    creator: str | None = Field(
        default=None, min_length=1, max_length=100, pattern=r"^[^<>]*$"
    )
    genre: str | None = Field(default=None, max_length=80, pattern=r"^[^<>]*$")
    status: MediaStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    takeaway: str | None = Field(default=None, max_length=2000)
    sub_info: str | None = Field(default=None, max_length=100, pattern=r"^[^<>]*$")

    @field_validator("title", "creator", "genre", "sub_info", mode="before")
    @classmethod
    def validate_identity_fields(cls, value: str | None) -> str | None:
        """Reject payloads that resemble injection or XSS probes."""
        return _validate_text_field(value)

    @field_validator("takeaway", mode="before")
    @classmethod
    def validate_takeaway(cls, value: str | None) -> str | None:
        """Reject unsafe markup and normalize user-authored notes."""
        return _validate_takeaway_field(value)


ChatCategory = Literal["books", "movies", "anime", "jobs", "general"]


class ChatSessionCreate(BaseModel):
    """Create a new chat session."""

    title: str = Field(min_length=1, max_length=200)
    category: ChatCategory = "general"

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        """Reject payloads that resemble injection or XSS probes."""
        return _validate_text_field(value)


class ChatSessionResponse(BaseModel):
    """Chat session returned from the API."""

    id: str
    title: str
    category: ChatCategory
    created_at: str


class ChatMessageRequest(BaseModel):
    """User message sent to the AI chat."""

    content: str = Field(min_length=1, max_length=4000)


class ChatMessageResponse(BaseModel):
    """AI response returned from the chat endpoint."""

    role: str
    content: str


class SuggestionItem(BaseModel):
    """A single media recommendation."""

    title: str
    creator: str = ""
    genre: str = ""
    pitch: str = ""
    year: str = ""


class SuggestionResponse(BaseModel):
    """Recommendation response returned from the suggestion endpoint."""

    suggestions: list[SuggestionItem]
    source: Literal["gemini", "local"]
