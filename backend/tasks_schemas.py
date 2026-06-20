"""Pydantic v2 schemas for the Tasks app."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _require_timezone(value: datetime | None) -> datetime | None:
    if value is not None and (
        value.tzinfo is None or value.tzinfo.utcoffset(value) is None
    ):
        raise ValueError("due_at must include a timezone offset")
    return value


def _validate_iana_timezone(value: str | None) -> str | None:
    if not value:
        return None
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("due_timezone must be a valid IANA timezone") from exc
    return value


class TaskListCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)


class TaskListUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    position: float | None = None


class CreateTaskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=500)
    notes: str | None = Field(default=None, max_length=20000)
    status: str = Field(default="needsAction", pattern="^(needsAction|completed)$")
    due: date | None = None
    due_at: datetime | None = None
    due_timezone: str | None = Field(default=None, max_length=100)
    all_day: bool = True
    starred: bool = False
    recurrence: str | None = Field(default=None, max_length=300)
    parent_id: str | None = None

    _validate_due_at_timezone = field_validator("due_at")(_require_timezone)
    _validate_due_timezone = field_validator("due_timezone")(_validate_iana_timezone)


class UpdateTaskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    notes: str | None = Field(default=None, max_length=20000)
    status: str | None = Field(default=None, pattern="^(needsAction|completed)$")
    due: date | None = None
    due_at: datetime | None = None
    due_timezone: str | None = Field(default=None, max_length=100)
    all_day: bool | None = None
    starred: bool | None = None
    recurrence: str | None = Field(default=None, max_length=300)

    _validate_due_at_timezone = field_validator("due_at")(_require_timezone)
    _validate_due_timezone = field_validator("due_timezone")(_validate_iana_timezone)


class MoveTaskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    position: float | None = None
    parent_id: str | None = None
    list_id: str | None = None
