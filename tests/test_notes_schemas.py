"""Validation tests for Notes request schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.notes_schemas import (
    CreateNoteRequest,
    LabelCreateRequest,
    UpdateNoteRequest,
)


def test_create_note_defaults():
    req = CreateNoteRequest(title="Hello")
    assert req.type == "text"
    assert req.color == "default"
    assert req.labels == []


def test_create_note_rejects_bad_type():
    with pytest.raises(ValidationError):
        CreateNoteRequest(title="x", type="audio")


def test_update_note_all_optional():
    req = UpdateNoteRequest()
    assert req.model_dump(exclude_unset=True) == {}


def test_label_name_required():
    with pytest.raises(ValidationError):
        LabelCreateRequest(name="")
