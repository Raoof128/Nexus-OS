"""Pydantic v2 schemas for the Tasks app."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


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
    all_day: bool = True
    starred: bool = False
    recurrence: str | None = Field(default=None, max_length=300)
    parent_id: str | None = None


class UpdateTaskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    notes: str | None = Field(default=None, max_length=20000)
    status: str | None = Field(default=None, pattern="^(needsAction|completed)$")
    due: date | None = None
    due_at: datetime | None = None
    all_day: bool | None = None
    starred: bool | None = None
    recurrence: str | None = Field(default=None, max_length=300)


class MoveTaskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    position: float | None = None
    parent_id: str | None = None
    list_id: str | None = None
