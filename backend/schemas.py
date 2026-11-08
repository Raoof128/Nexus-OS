"""Pydantic schemas for request and response validation.

Validation policy shared by the models in this module:

- Non-string input to a free-text field raises a ``ValidationError`` (never a
  ``TypeError``), so clients get a clean 400/422 instead of a leaked Python
  error message.
- Control characters other than tab, newline and carriage return are rejected.
  Unicode bidirectional overrides and isolates are stripped, because they can
  make titles render differently from how they are stored.
- Identity fields (title, creator, genre, sub_info) are single-line: whitespace
  is collapsed and angle brackets are rejected.
- Takeaway notes are plain text that keeps its line breaks. Markup is tolerated
  and rendered as text by the React frontend, so output encoding is the XSS
  control. Only script and handler payloads are rejected.
- The denylist patterns below are defence in depth. Parameterised queries
  (PostgREST) and output encoding remain the primary controls.

Public names imported by other modules are kept stable.
"""

from __future__ import annotations

import re
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

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

# Status sets per media type. Mirrors frontend/src/lib/mediaConfig.js; a parity
# test in tests/test_schemas.py keeps the two in step.
MEDIA_STATUSES_BY_TYPE: dict[str, tuple[str, ...]] = {
    "book": ("To Read", "Reading", "Finished"),
    "movie": ("To Watch", "Watching", "Finished"),
    "anime": ("To Watch", "Watching", "Finished"),
    "job": ("Applied", "Rejected", "Got the Job"),
}
DEFAULT_STATUS_BY_TYPE: dict[str, str] = {
    "book": "To Read",
    "movie": "To Watch",
    "anime": "To Watch",
    "job": "Applied",
}

# Engineering bound for bearer-style recovery tokens. Supabase JWTs are far
# shorter than this; the limit exists so oversized input is rejected early.
MAX_RECOVERY_TOKEN_LENGTH = 4096

# Bounds applied to model-generated suggestion fields before they are returned.
SUGGESTION_LIMITS: dict[str, int] = {
    "title": 200,
    "creator": 100,
    "genre": 80,
    "pitch": 400,
    "year": 16,
}

CONTROL_CHARS_PATTERN = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]")
# Unicode bidi overrides (U+202A-U+202E) and isolates (U+2066-U+2069). ZWNJ,
# ZWJ and the LRM/RLM marks are deliberately left alone: Persian uses them.
BIDI_CONTROL_PATTERN = re.compile(r"[\u202a-\u202e\u2066-\u2069]")
XSS_PATTERN = re.compile(
    r"(<\s*script|javascript:|data:text/html|<[a-z/!][^>]*\bon[a-z]+\s*=|<\s*img)",
    re.IGNORECASE,
)
INJECTION_PATTERN = re.compile(
    r"(\bunion\s+select\b|\bdrop\s+table\b|'\s*or\s+'?\d+'?\s*=\s*'?\d+'?)",
    re.IGNORECASE,
)
ANGLE_BRACKET_PATTERN = re.compile(r"[<>]")
_HORIZONTAL_RUN_PATTERN = re.compile(r"[ \t]+")
_BLANK_LINE_RUN_PATTERN = re.compile(r"\n{3,}")

_IDENTITY_PATTERN = r"^[^<>]*$"

MediaTitle = Annotated[
    str, Field(min_length=1, max_length=200, pattern=_IDENTITY_PATTERN)
]
MediaCreator = Annotated[
    str, Field(min_length=1, max_length=100, pattern=_IDENTITY_PATTERN)
]
MediaGenre = Annotated[str, Field(max_length=80, pattern=_IDENTITY_PATTERN)]
MediaSubInfo = Annotated[str, Field(max_length=100, pattern=_IDENTITY_PATTERN)]
MediaTakeaway = Annotated[str, Field(max_length=2000)]
MediaRating = Annotated[int, Field(ge=1, le=5)]


def media_status_allowed(media_type: str, status: str) -> bool:
    """Return True when ``status`` is valid for ``media_type``.

    Unknown media types return False. Callers that only have a stored row can
    use this to validate a status change without re-deriving the rule.
    """

    return status in MEDIA_STATUSES_BY_TYPE.get(media_type, ())


def _require_str(value: object) -> str:
    """Reject non-string input with a ValueError, which pydantic reports as a
    ValidationError."""

    if not isinstance(value, str):
        raise ValueError("Input should be a valid string")
    return value


def _check_control_chars(value: str) -> None:
    """Reject control characters that cannot be stored or rendered safely."""

    if CONTROL_CHARS_PATTERN.search(value):
        raise ValueError("Control characters are not allowed")


def _strip_bidi(value: str) -> str:
    """Remove Unicode bidi override and isolate characters."""

    return BIDI_CONTROL_PATTERN.sub("", value)


def _normalize_text(value: object) -> str:
    """Collapse whitespace and reject control characters for single-line fields."""

    text = _strip_bidi(_require_str(value))
    _check_control_chars(text)
    return " ".join(text.split())


def _normalize_takeaway(value: object) -> str:
    """Normalise multi-line notes.

    Line endings become ``\\n``, runs of spaces and tabs inside a line collapse
    to one space, and runs of blank lines collapse to a single blank line. The
    whole value is then stripped.
    """

    text = _strip_bidi(_require_str(value))
    _check_control_chars(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [
        _HORIZONTAL_RUN_PATTERN.sub(" ", line).strip() for line in text.split("\n")
    ]
    joined = _BLANK_LINE_RUN_PATTERN.sub("\n\n", "\n".join(lines))
    return joined.strip()


class LoginRequest(BaseModel):
    """Login request submitted by the frontend.

    Password length is NOT validated here. This is a credential check against
    whatever the user previously set. Minimum-length policy only applies when
    creating or resetting a password (RegisterRequest / ResetPasswordRequest).
    Enforcing a new minimum on login would lock out users whose existing valid
    passwords pre-date the current policy.
    """

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SessionUser(BaseModel):
    """Minimal user identity returned to the frontend."""

    id: str
    # Plain str: the value is a verified JWT claim, and a malformed claim must
    # not raise a ValidationError outside the /session error handling.
    email: str | None = None


class AuthSessionResponse(BaseModel):
    """Frontend-safe session snapshot."""

    user: SessionUser
    expires_at: int | None = None
    access_token: str | None = None


def _reject_blank_password(value: str) -> str:
    """Reject passwords that are empty or only whitespace.

    The stored value is returned unchanged. Internal spaces are allowed, and
    the minimum length is enforced by ``min_length`` on the field.
    """

    if not value.strip():
        raise ValueError("Password must not be blank")
    return value


class RegisterRequest(BaseModel):
    """Registration request submitted by the frontend."""

    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    _check_password = field_validator("password", mode="after")(_reject_blank_password)


class ForgotPasswordRequest(BaseModel):
    """Forgot password request, email only."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Password reset request with the recovery tokens.

    Tokens should be sent in the ``X-Recovery-Access-Token`` and
    ``X-Recovery-Refresh-Token`` request headers so they are not captured by
    request-body logging. Body fields are accepted as a fallback and are
    bounded by ``MAX_RECOVERY_TOKEN_LENGTH``.
    """

    access_token: str = Field(default="", max_length=MAX_RECOVERY_TOKEN_LENGTH)
    refresh_token: str = Field(default="", max_length=MAX_RECOVERY_TOKEN_LENGTH)
    new_password: str = Field(min_length=12, max_length=128)

    _check_password = field_validator("new_password", mode="after")(
        _reject_blank_password
    )


def _validate_text_field(value: object) -> object:
    """Shared validator for single-line identity and title fields.

    ``None`` passes through so optional fields keep their default. Anything
    that is not a string is rejected by ``_normalize_text``.
    """

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


def _validate_takeaway_field(value: object) -> object:
    """Shared validator for multi-line takeaway notes.

    Angle brackets are allowed here (plain text, rendered by React). Script and
    event-handler payloads are still rejected, and line breaks are kept.
    """

    if value is None:
        return value
    normalized = _normalize_takeaway(value)
    if XSS_PATTERN.search(normalized):
        raise ValueError("HTML or script payloads are not allowed")
    return normalized


class _MediaValidators(BaseModel):
    """Validators shared by MediaCreate and MediaUpdate.

    Fields are declared on each subclass so the constraints and the create or
    update optionality stay explicit. This class holds only the behaviour.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator(
        "title", "creator", "genre", "sub_info", mode="before", check_fields=False
    )
    @classmethod
    def validate_identity_fields(cls, value: object) -> object:
        """Reject payloads that resemble injection or XSS probes."""
        return _validate_text_field(value)

    @field_validator("takeaway", mode="before", check_fields=False)
    @classmethod
    def validate_takeaway(cls, value: object) -> object:
        """Reject unsafe markup and normalise user-authored notes."""
        return _validate_takeaway_field(value)


class MediaCreate(_MediaValidators):
    """Incoming payload for a user-created media entry.

    When ``status`` is omitted it defaults to the type's default status. When it
    is supplied it must belong to the type's status set.
    """

    type: MediaType = "book"
    title: MediaTitle
    creator: MediaCreator
    genre: MediaGenre | None = None
    status: MediaStatus = "To Read"
    rating: MediaRating | None = None
    takeaway: MediaTakeaway | None = None
    sub_info: MediaSubInfo | None = None

    @model_validator(mode="after")
    def check_status_matches_type(self) -> Self:
        """Enforce that the status belongs to the media type."""

        if "status" not in self.model_fields_set:
            self.status = DEFAULT_STATUS_BY_TYPE[self.type]
        elif not media_status_allowed(self.type, self.status):
            raise ValueError(
                f"Status {self.status!r} is not valid for type {self.type!r}"
            )
        return self


class MediaUpdate(_MediaValidators):
    """Incoming payload for updating an existing media entry.

    Every field is optional. ``MediaUpdate`` carries no ``type``, so the
    status-to-type rule is enforced by the controller against the stored row.
    """

    title: MediaTitle | None = None
    creator: MediaCreator | None = None
    genre: MediaGenre | None = None
    status: MediaStatus | None = None
    rating: MediaRating | None = None
    takeaway: MediaTakeaway | None = None
    sub_info: MediaSubInfo | None = None


ChatCategory = Literal["books", "movies", "anime", "jobs", "general"]


class ChatSessionCreate(BaseModel):
    """Create a new chat session."""

    title: str = Field(min_length=1, max_length=200)
    category: ChatCategory = "general"

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: object) -> object:
        """Reject payloads that resemble injection or XSS probes."""
        return _validate_text_field(value)


class ChatSessionResponse(BaseModel):
    """Chat session returned from the API."""

    id: str
    title: str
    category: ChatCategory
    created_at: str


def _validate_chat_content(value: object) -> str:
    """Normalise a chat message without collapsing its line breaks.

    Control characters are rejected, bidi controls are stripped, and surrounding
    whitespace is removed. A whitespace-only message becomes empty, so
    ``min_length`` rejects it.
    """

    text = _strip_bidi(_require_str(value))
    _check_control_chars(text)
    return text.strip()


class ChatMessageRequest(BaseModel):
    """User message sent to the AI chat."""

    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content", mode="before")
    @classmethod
    def validate_content(cls, value: object) -> str:
        """Reject NUL and other control characters and whitespace-only text."""
        return _validate_chat_content(value)


class ChatMessageResponse(BaseModel):
    """AI response returned from the chat endpoint."""

    role: str
    content: str


def _clip_llm_text(value: object, limit: int) -> str:
    """Coerce model output into a bounded single-line string.

    ``None`` and non-scalar values become an empty string. Numbers are converted
    to text, because a model may return a year as an integer. Control characters
    are replaced with spaces, bidi controls are stripped, whitespace is collapsed,
    and the result is cut to ``limit``.
    """

    if value is None or isinstance(value, bool):
        return ""
    if not isinstance(value, (str, int, float)):
        return ""
    text = _strip_bidi(CONTROL_CHARS_PATTERN.sub(" ", str(value)))
    return " ".join(text.split())[:limit].rstrip()


class SuggestionItem(BaseModel):
    """A single media recommendation.

    The values come from model output, so they are cleaned and clipped before
    validation. The ``max_length`` bounds are a backstop, and the clipping
    means an oversized value never fails the whole response.
    """

    title: str = Field(max_length=SUGGESTION_LIMITS["title"])
    creator: str = Field(default="", max_length=SUGGESTION_LIMITS["creator"])
    genre: str = Field(default="", max_length=SUGGESTION_LIMITS["genre"])
    pitch: str = Field(default="", max_length=SUGGESTION_LIMITS["pitch"])
    year: str = Field(default="", max_length=SUGGESTION_LIMITS["year"])

    @field_validator("title", "creator", "genre", "pitch", "year", mode="before")
    @classmethod
    def clip_model_text(cls, value: object, info: ValidationInfo) -> str:
        """Clean and clip each model-generated field to its configured bound."""

        limit = SUGGESTION_LIMITS.get(info.field_name or "", 0)
        return _clip_llm_text(value, limit)


class SuggestionResponse(BaseModel):
    """Recommendation response returned from the suggestion endpoint."""

    suggestions: list[SuggestionItem]
    source: Literal["gemini", "local"]
