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
    update = _chain(FakeResp(data=[{**existing, "status": "completed"}]))
    positions = _chain(FakeResp(data=[{"position": 1.0}]))
    insert = _chain(FakeResp(data=[{**existing, "id": "t10", "due": "2026-06-16"}]))

    db = MagicMock()
    # maybe_single fetch -> update -> position-select -> insert
    db.from_.side_effect = [fetch, update, positions, insert]
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.patch("/api/tasks/items/t9", json={"status": "completed"})
    assert res.status_code == HTTP_200_OK
    assert insert.insert.called
    spawned = insert.insert.call_args.args[0]
    assert spawned["due"] == "2026-06-16"
    assert spawned["recurrence"] == "FREQ=DAILY;COUNT=2"


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
    update = _chain(FakeResp(data=[{**existing, "status": "completed"}]))
    positions = _chain(FakeResp(data=[{"position": 1.0}]))
    insert = _chain(FakeResp(data=[{**existing, "id": "t10"}]))

    db = MagicMock()
    db.from_.side_effect = [fetch, update, positions, insert]
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.patch("/api/tasks/items/t9", json={"status": "completed"})

    assert res.status_code == HTTP_200_OK
    spawned = insert.insert.call_args.args[0]
    assert spawned["due"] == "2026-03-08"
    assert spawned["due_at"] == "2026-03-08T09:00:00-04:00"
    assert spawned["due_timezone"] == "America/New_York"


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
