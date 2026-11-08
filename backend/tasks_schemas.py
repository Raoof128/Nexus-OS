"""Pydantic v2 request schemas for the Tasks app.

Every request model forbids unknown keys, so a misspelled field (for example a
camelCase ``dueAt``) is rejected instead of being silently dropped. Litestar maps
the resulting ``ValidationError`` to a 400 response.
"""

from __future__ import annotations

import unicodedata
from datetime import date, datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    AllowInfNan,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

try:
    from .tasks_service import validate_recurrence
except ImportError:  # pragma: no cover - supports backend cwd execution
    from tasks_service import validate_recurrence

# Finite floats only: NaN and infinity would break position ordering.
FiniteFloat = Annotated[float, AllowInfNan(False)]

_LINE_CONTROL_CATEGORY = "Cc"


def _reject_control_chars(value: str, *, allow_whitespace: bool) -> str:
    """Reject control characters, and reject values that are only invisible.

    ``allow_whitespace`` keeps tab, line feed and carriage return, which the
    notes field needs. NUL cannot be stored in PostgreSQL text columns, so it is
    always rejected.
    """

    allowed = {"\t", "\n", "\r"} if allow_whitespace else set()
    for char in value:
        if char in allowed:
            continue
        if unicodedata.category(char) == _LINE_CONTROL_CATEGORY or char == "\x00":
            raise ValueError("must not contain control characters")
    return value


def _check_visible_title(value: str) -> str:
    """Reject a single-line value that is empty once format characters are removed.

    Zero-width characters such as U+200B are format characters (category Cf).
    Only the emptiness check drops them; the stored value keeps them, so
    legitimate uses such as ZWNJ in Persian text survive.
    """

    _reject_control_chars(value, allow_whitespace=False)
    visible = "".join(c for c in value if unicodedata.category(c) != "Cf").strip()
    if not visible:
        raise ValueError("must contain visible characters")
    return value


SingleLineText = AfterValidator(_check_visible_title)
NotesText = AfterValidator(lambda v: _reject_control_chars(v, allow_whitespace=True))


class TaskListCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: Annotated[str, Field(min_length=1, max_length=120), SingleLineText]


class TaskListUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: Annotated[str, Field(min_length=1, max_length=120), SingleLineText] | None = (
        None
    )
    position: FiniteFloat | None = None


class CreateTaskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: Annotated[str, Field(min_length=1, max_length=500), SingleLineText]
    notes: Annotated[str, Field(max_length=20000), NotesText] | None = None
    status: str = Field(default="needsAction", pattern="^(needsAction|completed)$")
    due: date | None = None
    due_at: datetime | None = None
    all_day: bool = True
    starred: bool = False
    recurrence: str | None = Field(default=None, max_length=300)
    parent_id: str | None = Field(default=None, min_length=1, max_length=36)

    @field_validator("recurrence")
    @classmethod
    def _check_recurrence(cls, value: str | None) -> str | None:
        return validate_recurrence(value)


class UpdateTaskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: (
        Annotated[str, Field(min_length=1, max_length=500), SingleLineText] | None
    ) = None
    notes: Annotated[str, Field(max_length=20000), NotesText] | None = None
    status: str | None = Field(default=None, pattern="^(needsAction|completed)$")
    due: date | None = None
    due_at: datetime | None = None
    all_day: bool | None = None
    starred: bool | None = None
    recurrence: str | None = Field(default=None, max_length=300)

    @field_validator("recurrence")
    @classmethod
    def _check_recurrence(cls, value: str | None) -> str | None:
        return validate_recurrence(value)


class MoveTaskRequest(BaseModel):
    """Move a task. ``position`` and ``list_id`` are non-nullable columns, so an
    explicit null is rejected. ``parent_id`` is nullable because null outdents
    a subtask. Unset fields keep their defaults and are not validated.
    """

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    position: FiniteFloat | None = None
    parent_id: str | None = Field(default=None, min_length=1, max_length=36)
    list_id: str | None = Field(default=None, min_length=1, max_length=36)

    @field_validator("position", "list_id", mode="after")
    @classmethod
    def _reject_explicit_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("must not be null")
        return value
