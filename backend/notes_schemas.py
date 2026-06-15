"""Pydantic v2 schemas for the Notes app."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_TYPE_PATTERN = "^(text|list)$"


class CreateNoteRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, max_length=500)
    content: str | None = Field(default=None, max_length=20000)
    type: str = Field(default="text", pattern=_TYPE_PATTERN)
    color: str = Field(default="default", max_length=40)
    background: str | None = Field(default=None, max_length=40)
    labels: list[str] = Field(default_factory=list)
    reminder_at: datetime | None = None


class UpdateNoteRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, max_length=500)
    content: str | None = Field(default=None, max_length=20000)
    type: str | None = Field(default=None, pattern=_TYPE_PATTERN)
    color: str | None = Field(default=None, max_length=40)
    background: str | None = Field(default=None, max_length=40)
    labels: list[str] | None = None
    reminder_at: datetime | None = None


class MoveNoteRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    position: float


class PinRequest(BaseModel):
    pinned: bool


class ArchiveRequest(BaseModel):
    archived: bool


class LabelCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=50)


class CreateNoteItemRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str | None = Field(default=None, max_length=20000)
    checked: bool = False
    parent_id: str | None = None


class UpdateNoteItemRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str | None = Field(default=None, max_length=20000)
    checked: bool | None = None


class MoveNoteItemRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    position: float | None = None
    parent_id: str | None = None
