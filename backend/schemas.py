"""Pydantic schemas for request and response validation."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BookStatus = Literal["To Read", "Reading", "Finished"]

class BookCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=255)
    author: str = Field(min_length=1, max_length=255)
    genre: str | None = Field(default=None, max_length=100)
    status: BookStatus = "To Read"
    rating: int | None = Field(default=None, ge=1, le=5)
    takeaway: str | None = Field(default=None, max_length=2000)

class BookResponse(BookCreate):
    id: str
    user_id: str
    created_at: str

class SuggestionResponse(BaseModel):
    suggestion: str
    reasoning: str
