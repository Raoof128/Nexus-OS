"""Validation tests for tasks_schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.tasks_schemas import (
    CreateTaskRequest,
    MoveTaskRequest,
    TaskListCreateRequest,
    UpdateTaskRequest,
)


def test_task_list_create_strips_whitespace():
    req = TaskListCreateRequest(name="  Groceries  ")
    assert req.name == "Groceries"


def test_task_list_create_rejects_empty():
    with pytest.raises(ValidationError):
        TaskListCreateRequest(name="")


def test_create_task_minimal():
    req = CreateTaskRequest(title="Pay rent")
    assert req.title == "Pay rent"
    assert req.status == "needsAction"
    assert req.all_day is True


def test_create_task_rejects_bad_status():
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="x", status="done")


def test_create_task_accepts_offset_due_at():
    req = CreateTaskRequest(
        title="Call",
        due_at="2026-06-16T17:30:00+10:00",
        due_timezone="Australia/Sydney",
    )
    assert req.due_at.utcoffset() is not None
    assert req.due_timezone == "Australia/Sydney"


def test_create_task_rejects_naive_due_at():
    with pytest.raises(ValidationError, match="timezone offset"):
        CreateTaskRequest(title="Call", due_at="2026-06-16T17:30:00")


def test_update_task_rejects_naive_due_at():
    with pytest.raises(ValidationError, match="timezone offset"):
        UpdateTaskRequest(due_at="2026-06-16T17:30:00")


def test_create_task_rejects_invalid_due_timezone():
    with pytest.raises(ValidationError, match="valid IANA timezone"):
        CreateTaskRequest(title="Call", due_timezone="Sydney")


def test_move_request_requires_known_fields():
    req = MoveTaskRequest(position=2.5)
    assert req.position == 2.5
    assert req.parent_id is None
