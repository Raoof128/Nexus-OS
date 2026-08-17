"""Integration tests for the Tasks controller."""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from litestar.status_codes import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
    HTTP_404_NOT_FOUND,
    HTTP_409_CONFLICT,
)
from litestar.testing import TestClient

from backend.app import app


@dataclass
class FakeResp:
    data: list[dict] | None = None


@pytest.fixture()
def client():
    with TestClient(app=app, base_url="http://testserver.local") as tc:
        tc.cookies.set("nexus-access-token", "fake-token")
        yield tc


@pytest.fixture(autouse=True)
def _inject_auth(monkeypatch):
    from backend import auth as auth_mod
    from backend.rate_limit import reset_rate_limiters

    reset_rate_limiters()

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            scope.setdefault("state", {})["user_id"] = "user-123"
            scope["state"]["access_token"] = "fake-token"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)
    yield
    reset_rate_limiters()


def _chain(result):
    """Return a MagicMock PostgREST builder whose .execute() returns result."""
    builder = MagicMock()
    builder.execute.return_value = result
    for method in (
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "order",
        "maybe_single",
    ):
        getattr(builder, method).return_value = builder
    return builder


def test_list_task_lists(client):
    builder = _chain(FakeResp(data=[{"id": "l1", "name": "Inbox", "position": 1.0}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.get("/api/tasks/lists")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["name"] == "Inbox"


def test_create_task_list(client):
    builder = _chain(FakeResp(data=[{"id": "l2", "name": "Work", "position": 1.0}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/tasks/lists", json={"name": "Work"})
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["name"] == "Work"


def test_list_items_filters_completed(client):
    builder = _chain(
        FakeResp(data=[{"id": "t1", "title": "A", "notes_encrypted": None}])
    )
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.get("/api/tasks/lists/l1/items?showCompleted=false")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["title"] == "A"


def test_create_item_decrypts_notes_in_response(client):
    created = {
        "id": "t2",
        "list_id": "l1",
        "title": "Pay rent",
        "notes_encrypted": None,
    }
    positions = _chain(FakeResp(data=[{"position": 1.0}]))
    insert = _chain(FakeResp(data=[created]))
    db = MagicMock()
    # create_item flow: positions select (list) -> insert
    db.from_.side_effect = [positions, insert]
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post(
            "/api/tasks/lists/l1/items", json={"title": "Pay rent", "notes": "soon"}
        )
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["title"] == "Pay rent"


def test_create_subtask_rejects_parent_from_another_list(client):
    parent = _chain(FakeResp(data={"id": "p1", "parent_id": None, "list_id": "l2"}))
    db = MagicMock()
    db.from_.return_value = parent
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post(
            "/api/tasks/lists/l1/items",
            json={"title": "Child", "parent_id": "p1"},
        )
    assert res.status_code == HTTP_409_CONFLICT


def test_empty_task_update_rejected(client):
    existing = {"id": "t1", "user_id": "user-123", "status": "needsAction"}
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=existing))
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.patch("/api/tasks/items/t1", json={})
    assert res.status_code == HTTP_400_BAD_REQUEST


def test_completing_recurring_task_spawns_next(client):
    existing = {
        "id": "t9",
        "user_id": "user-123",
        "list_id": "l1",
        "parent_id": None,
        "title": "Standup",
        "notes_encrypted": None,
        "status": "needsAction",
        "due": "2026-06-15",
        "due_at": None,
        "due_timezone": None,
        "all_day": True,
        "starred": False,
        "recurrence": "FREQ=DAILY;COUNT=3",
        "position": 1.0,
    }
    # maybe_single returns a single object (dict); list selects return lists.
    fetch = _chain(FakeResp(data=existing))
    completed = {**existing, "status": "completed"}
    rpc = _chain(FakeResp(data=[completed]))

    db = MagicMock()
    db.from_.return_value = fetch
    db.rpc.return_value = rpc
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.patch("/api/tasks/items/t9", json={"status": "completed"})
    assert res.status_code == HTTP_200_OK
    assert res.json()["status"] == "completed"
    db.rpc.assert_called_once()
    function_name, params = db.rpc.call_args.args
    assert function_name == "complete_recurring_task"
    assert params["p_task_id"] == "t9"
    assert params["p_next_due"] == "2026-06-16"
    assert params["p_next_due_at"] is None
    assert params["p_next_due_timezone"] is None
    assert params["p_next_recurrence"] == "FREQ=DAILY;COUNT=2"
    assert params["p_expected_due"] == "2026-06-15"
    assert params["p_expected_due_at"] is None
    assert params["p_expected_due_timezone"] is None
    assert params["p_expected_recurrence"] == "FREQ=DAILY;COUNT=3"


def test_completing_timed_recurring_task_uses_due_timezone(client):
    existing = {
        "id": "t9",
        "user_id": "user-123",
        "list_id": "l1",
        "parent_id": None,
        "title": "Morning review",
        "notes_encrypted": None,
        "status": "needsAction",
        "due": "2026-03-07",
        "due_at": "2026-03-07T14:00:00+00:00",
        "due_timezone": "America/New_York",
        "all_day": False,
        "starred": False,
        "recurrence": "FREQ=DAILY",
        "position": 1.0,
    }
    fetch = _chain(FakeResp(data=existing))
    rpc = _chain(FakeResp(data=[{**existing, "status": "completed"}]))

    db = MagicMock()
    db.from_.return_value = fetch
    db.rpc.return_value = rpc
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.patch("/api/tasks/items/t9", json={"status": "completed"})

    assert res.status_code == HTTP_200_OK
    _, params = db.rpc.call_args.args
    assert params["p_next_due"] == "2026-03-08"
    assert params["p_next_due_at"] == "2026-03-08T09:00:00-04:00"
    assert params["p_next_due_timezone"] == "America/New_York"


def test_completing_and_clearing_recurrence_does_not_spawn_successor(client):
    existing = {
        "id": "t9",
        "user_id": "user-123",
        "list_id": "l1",
        "status": "needsAction",
        "due": "2026-06-15",
        "due_at": None,
        "due_timezone": None,
        "recurrence": "FREQ=DAILY",
    }
    fetch = _chain(FakeResp(data=existing))
    update = _chain(
        FakeResp(data=[{**existing, "status": "completed", "recurrence": None}])
    )
    db = MagicMock()
    db.from_.side_effect = [fetch, update]

    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        response = client.patch(
            "/api/tasks/items/t9",
            json={"status": "completed", "recurrence": None},
        )

    assert response.status_code == HTTP_200_OK
    db.rpc.assert_not_called()
    update.update.assert_called_once()
    assert update.update.call_args.args[0]["recurrence"] is None


def test_completing_with_new_due_anchors_successor_on_patched_schedule(client):
    existing = {
        "id": "t9",
        "user_id": "user-123",
        "list_id": "l1",
        "parent_id": None,
        "title": "Standup",
        "status": "needsAction",
        "due": "2026-06-15",
        "due_at": None,
        "due_timezone": None,
        "recurrence": "FREQ=DAILY",
    }
    fetch = _chain(FakeResp(data=existing))
    rpc = _chain(FakeResp(data=[{**existing, "status": "completed"}]))
    db = MagicMock()
    db.from_.return_value = fetch
    db.rpc.return_value = rpc

    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        response = client.patch(
            "/api/tasks/items/t9",
            json={"status": "completed", "due": "2026-07-01"},
        )

    assert response.status_code == HTTP_200_OK
    _, params = db.rpc.call_args.args
    assert params["p_next_due"] == "2026-07-02"
    assert params["p_expected_due"] == "2026-06-15"


def test_task_update_rejects_stale_updated_at(client):
    existing = {
        "id": "t1",
        "user_id": "user-123",
        "status": "needsAction",
        "updated_at": "2026-08-17T00:00:00+00:00",
    }
    fetch = _chain(FakeResp(data=existing))
    conflicting_update = _chain(FakeResp(data=[]))
    db = MagicMock()
    db.from_.side_effect = [fetch, conflicting_update]

    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        response = client.patch("/api/tasks/items/t1", json={"title": "Fresh"})

    assert response.status_code == HTTP_409_CONFLICT
    assert response.json()["detail"] == (
        "Task changed during update; retry with fresh data"
    )
    conflicting_update.eq.assert_any_call(
        "updated_at",
        "2026-08-17T00:00:00+00:00",
    )


def test_recompleting_completed_recurring_task_does_not_spawn_duplicate(client):
    existing = {
        "id": "t9",
        "user_id": "user-123",
        "list_id": "l1",
        "parent_id": None,
        "title": "Standup",
        "notes_encrypted": None,
        "status": "completed",
        "due": "2026-06-15",
        "due_at": None,
        "all_day": True,
        "starred": False,
        "recurrence": "FREQ=DAILY",
        "position": 1.0,
    }
    fetch = _chain(FakeResp(data=existing))
    update = _chain(FakeResp(data=[existing]))

    db = MagicMock()
    db.from_.side_effect = [fetch, update]
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.patch("/api/tasks/items/t9", json={"status": "completed"})
    assert res.status_code == HTTP_200_OK
    assert db.from_.call_count == 2


def test_move_recurring_to_another_list_rejected(client):
    existing = {
        "id": "t1",
        "recurrence": "FREQ=DAILY",
        "list_id": "l1",
        "parent_id": None,
    }
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=existing))  # maybe_single -> dict
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"list_id": "l2"})
    assert res.status_code == HTTP_409_CONFLICT


def test_move_rejects_self_parent(client):
    existing = {
        "id": "t1",
        "recurrence": None,
        "list_id": "l1",
        "parent_id": None,
    }
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=existing))
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"parent_id": "t1"})
    assert res.status_code == HTTP_409_CONFLICT


def test_move_rejects_missing_parent(client):
    existing = {
        "id": "t1",
        "recurrence": None,
        "list_id": "l1",
        "parent_id": None,
    }
    fetch = _chain(FakeResp(data=existing))
    parent = _chain(FakeResp(data=None))
    db = MagicMock()
    db.from_.side_effect = [fetch, parent]
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"parent_id": "missing"})
    assert res.status_code == HTTP_404_NOT_FOUND


def test_move_rejects_parent_from_another_list(client):
    existing = {
        "id": "t1",
        "recurrence": None,
        "list_id": "l1",
        "parent_id": None,
    }
    fetch = _chain(FakeResp(data=existing))
    parent = _chain(FakeResp(data={"id": "p1", "parent_id": None, "list_id": "l2"}))
    db = MagicMock()
    db.from_.side_effect = [fetch, parent]
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"parent_id": "p1"})
    assert res.status_code == HTTP_409_CONFLICT


def test_move_subtask_to_another_list_requires_reparenting(client):
    existing = {
        "id": "t1",
        "recurrence": None,
        "list_id": "l1",
        "parent_id": "p1",
    }
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=existing))
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"list_id": "l2"})
    assert res.status_code == HTTP_409_CONFLICT


def test_move_parent_with_children_to_another_list_rejected(client):
    existing = {
        "id": "t1",
        "recurrence": None,
        "list_id": "l1",
        "parent_id": None,
    }
    fetch = _chain(FakeResp(data=existing))
    children = _chain(FakeResp(data=[{"id": "c1"}]))
    db = MagicMock()
    db.from_.side_effect = [fetch, children]
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"list_id": "l2"})
    assert res.status_code == HTTP_409_CONFLICT


def test_delete_item(client):
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=[]))
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.delete("/api/tasks/items/t1")
    assert res.status_code == HTTP_204_NO_CONTENT
