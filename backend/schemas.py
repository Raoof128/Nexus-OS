"""Pydantic schemas for request and response validation."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

BookStatus = Literal["To Read", "Reading", "Finished"]

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


class BookCreate(BaseModel):
    """Incoming payload for a user-created book entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200, pattern=r"^[^<>]*$")
    author: str = Field(min_length=1, max_length=100, pattern=r"^[^<>]*$")
    genre: str | None = Field(default=None, max_length=80, pattern=r"^[^<>]*$")
    status: BookStatus = "To Read"
    rating: int | None = Field(default=None, ge=1, le=5)
    takeaway: str | None = Field(default=None, max_length=2000)

    @field_validator("title", "author", "genre", mode="before")
    @classmethod
    def validate_identity_fields(cls, value: str | None) -> str | None:
        """Reject payloads that resemble injection or XSS probes."""

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

    @field_validator("takeaway", mode="before")
    @classmethod
    def validate_takeaway(cls, value: str | None) -> str | None:
        """Reject unsafe markup and normalize user-authored notes."""

        if value is None:
            return value

        normalized = _normalize_text(value)
        if XSS_PATTERN.search(normalized):
            raise ValueError("HTML or script payloads are not allowed")
        return normalized


class BookUpdate(BaseModel):
    """Incoming payload for updating an existing book entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(
        default=None, min_length=1, max_length=200, pattern=r"^[^<>]*$"
    )
    author: str | None = Field(
        default=None, min_length=1, max_length=100, pattern=r"^[^<>]*$"
    )
    genre: str | None = Field(default=None, max_length=80, pattern=r"^[^<>]*$")
    status: BookStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    takeaway: str | None = Field(default=None, max_length=2000)

    @field_validator("title", "author", "genre", mode="before")
    @classmethod
    def validate_identity_fields(cls, value: str | None) -> str | None:
        """Reject payloads that resemble injection or XSS probes."""

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

    @field_validator("takeaway", mode="before")
    @classmethod
    def validate_takeaway(cls, value: str | None) -> str | None:
        """Reject unsafe markup and normalize user-authored notes."""

        if value is None:
            return value

        normalized = _normalize_text(value)
        if XSS_PATTERN.search(normalized):
            raise ValueError("HTML or script payloads are not allowed")
        return normalized


class BookResponse(BookCreate):
    """Serialized book record returned from persistence."""

    id: str
    user_id: str
    created_at: str


class SuggestionResponse(BaseModel):
    """Recommendation response returned from the suggestion endpoint."""

    suggestion: str
    reasoning: str
    source: Literal["gemini", "local"]
