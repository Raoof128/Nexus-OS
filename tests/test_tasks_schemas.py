"""Validation tests for tasks_schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.tasks_schemas import (
    CreateTaskRequest,
    MoveTaskRequest,
    TaskListCreateRequest,
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


def test_move_request_requires_known_fields():
    req = MoveTaskRequest(position=2.5)
    assert req.position == 2.5
    assert req.parent_id is None
