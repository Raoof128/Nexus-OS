"""Validation tests for tasks_schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.tasks_schemas import (
    CreateTaskRequest,
    MoveTaskRequest,
    TaskListCreateRequest,
    TaskListUpdateRequest,
    UpdateTaskRequest,
)

# Payloads the in-repo frontend actually sends (TaskEditor.jsx, TaskListView.jsx,
# useTasks.js). These must keep validating after any schema change.
FRONTEND_CREATE_PAYLOAD = {
    "title": "Pay rent",
    "notes": None,
    "due": "2026-06-15",
    "due_at": "2026-06-15T09:00:00",
    "all_day": False,
    "recurrence": "FREQ=WEEKLY;BYDAY=MO",
}


# ---- Accept paths ---------------------------------------------------------


def test_task_list_create_strips_whitespace():
    req = TaskListCreateRequest(name="  Groceries  ")
    assert req.name == "Groceries"


def test_create_task_minimal():
    req = CreateTaskRequest(title="Pay rent")
    assert req.title == "Pay rent"
    assert req.status == "needsAction"
    assert req.all_day is True


def test_create_task_accepts_frontend_payload():
    req = CreateTaskRequest(**FRONTEND_CREATE_PAYLOAD)
    assert req.recurrence == "FREQ=WEEKLY;BYDAY=MO"


def test_update_task_accepts_known_fields_only():
    req = UpdateTaskRequest(status="completed", starred=True)
    assert req.status == "completed"


def test_move_request_accepts_fractional_position():
    req = MoveTaskRequest(position=2.5)
    assert req.position == 2.5
    assert req.parent_id is None
    assert req.list_id is None


def test_move_request_parent_id_null_is_allowed_for_outdent():
    req = MoveTaskRequest(parent_id=None)
    assert req.parent_id is None


def test_empty_recurrence_string_becomes_none():
    assert UpdateTaskRequest(recurrence="   ").recurrence is None


# ---- Required and length bounds ------------------------------------------


def test_task_list_create_rejects_empty():
    with pytest.raises(ValidationError):
        TaskListCreateRequest(name="")


def test_task_list_update_rejects_empty_name():
    with pytest.raises(ValidationError):
        TaskListUpdateRequest(name="")


def test_create_task_rejects_bad_status():
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="x", status="done")


def test_update_task_rejects_bad_status():
    with pytest.raises(ValidationError):
        UpdateTaskRequest(status="done")


@pytest.mark.parametrize("title", ["", "   "])
def test_create_task_rejects_empty_or_blank_title(title):
    with pytest.raises(ValidationError):
        CreateTaskRequest(title=title)


def test_create_task_rejects_overlong_title():
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="x" * 501)


def test_update_task_rejects_overlong_title():
    with pytest.raises(ValidationError):
        UpdateTaskRequest(title="x" * 501)


def test_notes_over_limit_rejected():
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="x", notes="n" * 20001)


def test_recurrence_over_300_chars_rejected():
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="x", recurrence="FREQ=DAILY;" + "X" * 300)


# ---- Recurrence validation (create and update) ---------------------------


@pytest.mark.parametrize(
    "rule",
    [
        "FREQ=DAILY;INTERVAL=0",
        "FREQ=DAILY;COUNT=1",
        "FREQ=HOURLY",
        "not a rule",
        "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30",
    ],
)
def test_invalid_recurrence_rejected_on_create_and_update(rule):
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="x", recurrence=rule)
    with pytest.raises(ValidationError):
        UpdateTaskRequest(recurrence=rule)


# ---- Naming and invisible text -------------------------------------------


@pytest.mark.parametrize("title", ["a\x00b", "esc\x1bseq", "tab\tin title"])
def test_control_characters_in_title_rejected(title):
    with pytest.raises(ValidationError):
        CreateTaskRequest(title=title)


def test_zero_width_only_title_rejected():
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="​")
    with pytest.raises(ValidationError):
        UpdateTaskRequest(title="​‌")


def test_zero_width_joiner_inside_persian_text_accepted():
    text = "می‌خواهم"
    assert CreateTaskRequest(title=text).title == text


def test_list_name_with_nul_rejected():
    with pytest.raises(ValidationError):
        TaskListCreateRequest(name="a\x00b")
    with pytest.raises(ValidationError):
        TaskListUpdateRequest(name="​")


def test_notes_allow_crlf_and_tabs():
    assert CreateTaskRequest(title="x", notes="line1\r\nline2\tend").notes == (
        "line1\r\nline2\tend"
    )


def test_notes_reject_nul():
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="x", notes="bad\x00byte")


# ---- Unknown keys --------------------------------------------------------


def test_camel_case_key_is_rejected_not_dropped():
    with pytest.raises(ValidationError):
        CreateTaskRequest(title="x", dueAt="2026-06-15T09:00:00")


def test_unknown_key_rejected_on_every_request_model():
    with pytest.raises(ValidationError):
        TaskListCreateRequest(name="x", extra=1)
    with pytest.raises(ValidationError):
        TaskListUpdateRequest(name="x", extra=1)
    with pytest.raises(ValidationError):
        UpdateTaskRequest(title="x", extra=1)
    with pytest.raises(ValidationError):
        MoveTaskRequest(position=1.0, extra=1)


# ---- Floats and identifiers ----------------------------------------------


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_position_rejected_on_move(value):
    with pytest.raises(ValidationError):
        MoveTaskRequest(position=value)


@pytest.mark.parametrize("value", [float("nan"), float("inf")])
def test_non_finite_position_rejected_on_list_update(value):
    with pytest.raises(ValidationError):
        TaskListUpdateRequest(position=value)


def test_string_position_is_not_coerced_to_non_finite():
    with pytest.raises(ValidationError):
        MoveTaskRequest(position="NaN")


def test_identifier_length_bounded_on_move():
    with pytest.raises(ValidationError):
        MoveTaskRequest(parent_id="x" * 5000)
    with pytest.raises(ValidationError):
        MoveTaskRequest(list_id="x" * 5000)


# ---- Explicit null on non-nullable move fields ---------------------------


def test_move_rejects_explicit_null_position():
    with pytest.raises(ValidationError):
        MoveTaskRequest(position=None)


def test_move_rejects_explicit_null_list_id():
    with pytest.raises(ValidationError):
        MoveTaskRequest(list_id=None)


def test_move_unset_fields_are_not_validated():
    req = MoveTaskRequest()
    assert req.model_dump(exclude_unset=True) == {}
