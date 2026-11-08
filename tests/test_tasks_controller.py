"""Tests for the Tasks controller: auth, task invariants and database error mapping.

Most tests patch the PostgREST client with a MagicMock chain and assert the
sequence of queries. Database-level guarantees (FK cascade, RLS) are not
exercised here and need a real Postgres integration test.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from litestar.exceptions import HTTPException
from litestar.status_codes import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_404_NOT_FOUND,
    HTTP_409_CONFLICT,
    HTTP_429_TOO_MANY_REQUESTS,
    HTTP_500_INTERNAL_SERVER_ERROR,
)
from litestar.testing import TestClient
from postgrest import SyncPostgrestClient
from postgrest.exceptions import APIError

from backend.app import app

CREATE_CLIENT = "backend.tasks_controller.create_supabase_user_client"


@dataclass
class FakeResp:
    data: list[dict] | dict | None = None


@pytest.fixture()
def client():
    with TestClient(app=app, base_url="http://testserver.local") as tc:
        tc.cookies.set("nexus-access-token", "fake-token")
        yield tc


@pytest.fixture(autouse=True)
def _inject_auth(monkeypatch):
    """Skip JWT validation so controller tests run as user-123.

    Auth-path tests call ``monkeypatch.undo()`` to restore the real middleware.
    """

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
        "neq",
        "in_",
        "order",
        "limit",
        "maybe_single",
    ):
        getattr(builder, method).return_value = builder
    return builder


def _db(*chains):
    """A client whose successive from_() calls return ``chains`` in order."""
    db = MagicMock(spec=SyncPostgrestClient)
    db.from_.side_effect = list(chains)
    return db


def _task(**overrides) -> dict:
    base = {
        "id": "t9",
        "user_id": "user-123",
        "list_id": "l1",
        "parent_id": None,
        "title": "Standup",
        "notes_encrypted": None,
        "status": "needsAction",
        "due": "2026-06-15",
        "due_at": None,
        "all_day": True,
        "starred": False,
        "recurrence": "FREQ=DAILY",
        "position": 1.0,
    }
    return {**base, **overrides}


# ---- Lists ---------------------------------------------------------------


def test_list_task_lists(client):
    builder = _chain(FakeResp(data=[{"id": "l1", "name": "Inbox", "position": 1.0}]))
    with patch(CREATE_CLIENT, return_value=_db(builder)):
        res = client.get("/api/tasks/lists")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["name"] == "Inbox"


def test_create_task_list_appends_after_max_position(client):
    positions = _chain(FakeResp(data=[{"id": "l1", "position": 3.0}]))
    insert = _chain(FakeResp(data=[{"id": "l2", "name": "Work", "position": 4.0}]))
    with patch(CREATE_CLIENT, return_value=_db(positions, insert)):
        res = client.post("/api/tasks/lists", json={"name": "Work"})
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["name"] == "Work"
    # The next position comes from a single descending, limited lookup.
    positions.order.assert_any_call("position", desc=True)
    positions.limit.assert_any_call(1)
    assert insert.insert.call_args.args[0]["position"] == 4.0


# ---- Items: read + create --------------------------------------------------


def test_list_items_filters_completed(client):
    builder = _chain(
        FakeResp(data=[{"id": "t1", "title": "A", "notes_encrypted": None}])
    )
    with patch(CREATE_CLIENT, return_value=_db(builder)):
        res = client.get("/api/tasks/lists/l1/items?showCompleted=false")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["title"] == "A"
    builder.eq.assert_any_call("status", "needsAction")


def test_create_item_round_trips_notes(client):
    created = {
        "id": "t2",
        "list_id": "l1",
        "title": "Pay rent",
        "notes_encrypted": "soon",
    }
    positions = _chain(FakeResp(data=[{"position": 1.0}]))
    insert = _chain(FakeResp(data=[created]))
    with patch(CREATE_CLIENT, return_value=_db(positions, insert)):
        res = client.post(
            "/api/tasks/lists/l1/items", json={"title": "Pay rent", "notes": "soon"}
        )
    assert res.status_code == HTTP_201_CREATED
    assert insert.insert.call_args.args[0]["notes_encrypted"] == "soon"
    assert res.json()["notes_encrypted"] == "soon"


def test_create_subtask_rejects_parent_in_another_list(client):
    parent = _chain(FakeResp(data={"id": "p1", "parent_id": None, "list_id": "l2"}))
    db = _db(parent)
    with patch(CREATE_CLIENT, return_value=db):
        res = client.post(
            "/api/tasks/lists/l1/items", json={"title": "Child", "parent_id": "p1"}
        )
    assert res.status_code == HTTP_409_CONFLICT
    assert db.from_.call_count == 1


def test_create_subtask_with_missing_parent_returns_404(client):
    parent = _chain(FakeResp(data=None))
    with patch(CREATE_CLIENT, return_value=_db(parent)):
        res = client.post(
            "/api/tasks/lists/l1/items", json={"title": "Child", "parent_id": "gone"}
        )
    assert res.status_code == HTTP_404_NOT_FOUND


# ---- Items: completion and recurrence -------------------------------------


def test_completing_recurring_task_spawns_next_occurrence(client):
    fetch = _chain(FakeResp(data=_task()))
    transition = _chain(FakeResp(data=[_task(status="completed")]))
    positions = _chain(FakeResp(data=[{"position": 1.0}]))
    insert = _chain(FakeResp(data=[_task(id="t10", due="2026-06-16")]))
    with patch(CREATE_CLIENT, return_value=_db(fetch, transition, positions, insert)):
        res = client.patch("/api/tasks/items/t9", json={"status": "completed"})
    assert res.status_code == HTTP_200_OK
    inserted = insert.insert.call_args.args[0]
    # Anchored on the scheduled due date (2026-06-15), not on today.
    assert inserted["due"] == "2026-06-16"
    assert inserted["status"] == "needsAction"
    assert inserted["position"] == 2.0


@pytest.mark.parametrize("pre_status", ["completed", "needsAction"])
def test_completion_that_does_not_transition_spawns_nothing(client, pre_status):
    """A repeat PATCH, or a completion that lost a race, gets no rows back."""
    fetch = _chain(FakeResp(data=_task(status=pre_status)))
    transition = _chain(FakeResp(data=[]))
    reload = _chain(FakeResp(data=_task(status="completed")))
    insert = _chain(FakeResp(data=[]))
    db = _db(fetch, transition, reload)
    with patch(CREATE_CLIENT, return_value=db):
        res = client.patch("/api/tasks/items/t9", json={"status": "completed"})
    assert res.status_code == HTTP_200_OK
    assert db.from_.call_count == 3
    assert not insert.insert.called


def test_completion_with_title_change_applies_both(client):
    fetch = _chain(FakeResp(data=_task(recurrence=None)))
    rest = _chain(FakeResp(data=[_task(title="Renamed", status="needsAction")]))
    transition = _chain(
        FakeResp(data=[_task(title="Renamed", status="completed", recurrence=None)])
    )
    with patch(CREATE_CLIENT, return_value=_db(fetch, rest, transition)):
        res = client.patch(
            "/api/tasks/items/t9", json={"title": "Renamed", "status": "completed"}
        )
    assert res.status_code == HTTP_200_OK
    assert rest.update.call_args.args[0] == {"title": "Renamed"}
    assert set(transition.update.call_args.args[0]) == {"status", "completed_at"}
    assert res.json()["title"] == "Renamed"
    assert res.json()["status"] == "completed"


def test_failed_field_write_leaves_completion_untouched(client):
    """A field write that fails first must not leave a completion without its spawn."""
    fetch = _chain(FakeResp(data=_task()))
    rest = _chain(FakeResp(data=[]))
    rest.execute.side_effect = APIError({"code": "23514", "message": "boom"})
    transition = _chain(FakeResp(data=[_task(status="completed")]))
    insert = _chain(FakeResp(data=[]))
    db = _db(fetch, rest, transition, insert)
    with patch(CREATE_CLIENT, return_value=db):
        res = client.patch(
            "/api/tasks/items/t9", json={"title": "Renamed", "status": "completed"}
        )
    assert res.status_code == HTTP_500_INTERNAL_SERVER_ERROR
    assert not transition.update.called
    assert not insert.insert.called


def test_uncompleting_task_writes_needs_action(client):
    fetch = _chain(FakeResp(data=_task(status="completed")))
    update = _chain(FakeResp(data=[_task(status="needsAction", completed_at=None)]))
    insert = _chain(FakeResp(data=[]))
    db = _db(fetch, update, insert)
    with patch(CREATE_CLIENT, return_value=db):
        res = client.patch("/api/tasks/items/t9", json={"status": "needsAction"})
    assert res.status_code == HTTP_200_OK
    assert update.update.call_args.args[0] == {
        "status": "needsAction",
        "completed_at": None,
    }
    assert res.json()["status"] == "needsAction"
    assert not insert.insert.called


def test_update_with_zero_rows_returns_404_and_spawns_nothing(client):
    fetch = _chain(FakeResp(data=_task(recurrence=None)))
    update = _chain(FakeResp(data=[]))
    with patch(CREATE_CLIENT, return_value=_db(fetch, update)):
        res = client.patch("/api/tasks/items/t9", json={"title": "Gone"})
    assert res.status_code == HTTP_404_NOT_FOUND


def test_unparseable_anchor_logs_and_skips_spawn(client, caplog):
    fetch = _chain(FakeResp(data=_task(due="not-a-date")))
    transition = _chain(FakeResp(data=[_task(status="completed", due="not-a-date")]))
    insert = _chain(FakeResp(data=[]))
    with patch(CREATE_CLIENT, return_value=_db(fetch, transition)):
        with caplog.at_level(logging.WARNING):
            res = client.patch("/api/tasks/items/t9", json={"status": "completed"})
    assert res.status_code == HTTP_200_OK
    assert not insert.insert.called
    assert "Recurrence anchor unparseable for task t9" in caplog.text
    # The log names the task id only, never the title or notes.
    assert "Standup" not in caplog.text


def test_failed_spawn_restores_completion_and_surfaces_error(client):
    fetch = _chain(FakeResp(data=_task()))
    transition = _chain(FakeResp(data=[_task(status="completed")]))
    positions = _chain(FakeResp(data=[{"position": 1.0}]))
    insert = _chain(FakeResp(data=[]))
    insert.execute.side_effect = APIError({"code": "23514", "message": "boom"})
    restore = _chain(FakeResp(data=[_task()]))
    db = _db(fetch, transition, positions, insert, restore)
    with patch(CREATE_CLIENT, return_value=db):
        res = client.patch("/api/tasks/items/t9", json={"status": "completed"})
    assert res.status_code == HTTP_500_INTERNAL_SERVER_ERROR
    assert restore.update.call_args.args[0] == {
        "status": "needsAction",
        "completed_at": None,
    }


# ---- Items: move ------------------------------------------------------------


def test_move_task_into_itself_as_parent_rejected(client):
    db = MagicMock(spec=SyncPostgrestClient)
    with patch(CREATE_CLIENT, return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"parent_id": "t1"})
    assert res.status_code == HTTP_409_CONFLICT
    assert not db.from_.called


def test_move_under_missing_parent_returns_404(client):
    fetch = _chain(FakeResp(data=_task(id="t1", recurrence=None)))
    parent = _chain(FakeResp(data=None))
    with patch(CREATE_CLIENT, return_value=_db(fetch, parent)):
        res = client.post("/api/tasks/items/t1/move", json={"parent_id": "gone"})
    assert res.status_code == HTTP_404_NOT_FOUND


def test_move_task_with_subtasks_under_parent_rejected(client):
    fetch = _chain(FakeResp(data=_task(id="t1", recurrence=None)))
    parent = _chain(FakeResp(data={"id": "p1", "parent_id": None, "list_id": "l1"}))
    children = _chain(FakeResp(data=[{"id": "c1"}]))
    update = _chain(FakeResp(data=[]))
    db = _db(fetch, parent, children, update)
    with patch(CREATE_CLIENT, return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"parent_id": "p1"})
    assert res.status_code == HTTP_409_CONFLICT
    assert not update.update.called


def test_move_subtask_to_another_list_rejected(client):
    fetch = _chain(FakeResp(data=_task(id="t1", parent_id="p1", recurrence=None)))
    parent = _chain(FakeResp(data={"id": "p1", "parent_id": None, "list_id": "l1"}))
    with patch(CREATE_CLIENT, return_value=_db(fetch, parent)):
        res = client.post("/api/tasks/items/t1/move", json={"list_id": "l2"})
    assert res.status_code == HTTP_409_CONFLICT


def test_move_task_with_subtasks_to_another_list_rejected(client):
    fetch = _chain(FakeResp(data=_task(id="t1", recurrence=None)))
    children = _chain(FakeResp(data=[{"id": "c1"}]))
    with patch(CREATE_CLIENT, return_value=_db(fetch, children)):
        res = client.post("/api/tasks/items/t1/move", json={"list_id": "l2"})
    assert res.status_code == HTTP_409_CONFLICT


def test_move_under_parent_in_same_list_succeeds(client):
    fetch = _chain(FakeResp(data=_task(id="t1", recurrence=None)))
    parent = _chain(FakeResp(data={"id": "p1", "parent_id": None, "list_id": "l1"}))
    children = _chain(FakeResp(data=[]))
    update = _chain(FakeResp(data=[_task(id="t1", parent_id="p1", recurrence=None)]))
    with patch(CREATE_CLIENT, return_value=_db(fetch, parent, children, update)):
        res = client.post("/api/tasks/items/t1/move", json={"parent_id": "p1"})
    assert res.status_code == HTTP_201_CREATED
    assert update.update.call_args.args[0] == {"parent_id": "p1"}


@pytest.mark.parametrize("body", [{"list_id": None}, {"position": None}])
def test_move_rejects_explicit_null_for_not_null_columns(client, body):
    db = MagicMock(spec=SyncPostgrestClient)
    with patch(CREATE_CLIENT, return_value=db):
        res = client.post("/api/tasks/items/t1/move", json=body)
    assert res.status_code == HTTP_400_BAD_REQUEST
    assert not db.from_.called


def test_move_with_zero_rows_returns_404(client):
    fetch = _chain(FakeResp(data=_task(id="t1", recurrence=None)))
    update = _chain(FakeResp(data=[]))
    with patch(CREATE_CLIENT, return_value=_db(fetch, update)):
        res = client.post("/api/tasks/items/t1/move", json={"position": 2.0})
    assert res.status_code == HTTP_404_NOT_FOUND


def test_move_recurring_to_another_list_rejected(client):
    existing = {
        "id": "t1",
        "recurrence": "FREQ=DAILY",
        "list_id": "l1",
        "parent_id": None,
    }
    db = MagicMock(spec=SyncPostgrestClient)
    db.from_.return_value = _chain(FakeResp(data=existing))
    with patch(CREATE_CLIENT, return_value=db):
        res = client.post("/api/tasks/items/t1/move", json={"list_id": "l2"})
    assert res.status_code == HTTP_409_CONFLICT


# ---- Delete and clear-completed ------------------------------------------------


def test_delete_item(client):
    with patch(CREATE_CLIENT, return_value=_db(_chain(FakeResp(data=[])))):
        res = client.delete("/api/tasks/items/t1")
    assert res.status_code == HTTP_204_NO_CONTENT


def test_clear_completed_deletes_only_completed(client):
    deleted = [{"id": "t1"}, {"id": "t2"}]
    builder = _chain(FakeResp(data=deleted))
    db = MagicMock(spec=SyncPostgrestClient)
    db.from_.return_value = builder
    with patch(CREATE_CLIENT, return_value=db):
        res = client.post("/api/tasks/lists/l1/clear-completed")
    assert res.status_code == HTTP_200_OK
    assert res.json()["deleted"] == 2
    builder.eq.assert_any_call("status", "completed")


def test_clear_completed_detaches_open_subtasks_before_delete(client):
    calls: list[str] = []
    select = _chain(FakeResp(data=[{"id": "p1"}]))
    update = _chain(FakeResp(data=[]))
    update.update.side_effect = lambda *a, **k: (calls.append("update"), update)[1]
    delete = _chain(FakeResp(data=[{"id": "p1"}]))
    delete.delete.side_effect = lambda *a, **k: (calls.append("delete"), delete)[1]
    with patch(CREATE_CLIENT, return_value=_db(select, update, delete)):
        res = client.post("/api/tasks/lists/l1/clear-completed")
    assert res.status_code == HTTP_200_OK
    assert calls == ["update", "delete"]
    assert update.update.call_args.args[0] == {"parent_id": None}
    update.eq.assert_any_call("status", "needsAction")
    update.in_.assert_called_once_with("parent_id", ["p1"])


def test_clear_completed_aborts_delete_when_detach_fails(client):
    select = _chain(FakeResp(data=[{"id": "p1"}]))
    update = _chain(FakeResp(data=[]))
    update.execute.side_effect = APIError({"code": "XX000", "message": "down"})
    delete = _chain(FakeResp(data=[]))
    with patch(CREATE_CLIENT, return_value=_db(select, update, delete)):
        res = client.post("/api/tasks/lists/l1/clear-completed")
    assert res.status_code == HTTP_500_INTERNAL_SERVER_ERROR
    assert not delete.delete.called


# ---- Database error mapping -------------------------------------------------


@pytest.mark.parametrize(
    ("code", "status"),
    [("23503", HTTP_404_NOT_FOUND), ("22P02", HTTP_400_BAD_REQUEST)],
)
def test_database_client_errors_map_without_leaking_message(client, code, status):
    positions = _chain(FakeResp(data=[]))
    insert = _chain(FakeResp(data=[]))
    insert.execute.side_effect = APIError({"code": code, "message": "secret detail"})
    with patch(CREATE_CLIENT, return_value=_db(positions, insert)):
        res = client.post("/api/tasks/lists/l1/items", json={"title": "x"})
    assert res.status_code == status
    assert "secret detail" not in res.text


def test_unmapped_database_error_propagates(client):
    positions = _chain(FakeResp(data=[]))
    insert = _chain(FakeResp(data=[]))
    insert.execute.side_effect = APIError({"code": "42501", "message": "denied"})
    with patch(CREATE_CLIENT, return_value=_db(positions, insert)):
        res = client.post("/api/tasks/lists/l1/items", json={"title": "x"})
    assert res.status_code == HTTP_500_INTERNAL_SERVER_ERROR


# ---- Rate limiting -----------------------------------------------------------


def test_rate_limit_rejection_returns_429(client):
    rejected = HTTPException(status_code=HTTP_429_TOO_MANY_REQUESTS, detail="Slow down")
    db = MagicMock(spec=SyncPostgrestClient)
    with (
        patch(CREATE_CLIENT, return_value=db),
        patch(
            "backend.tasks_controller.enforce_tasks_rate_limit",
            side_effect=rejected,
        ),
    ):
        res = client.post("/api/tasks/lists", json={"name": "Work"})
    assert res.status_code == HTTP_429_TOO_MANY_REQUESTS
    assert not db.from_.called


# ---- Authentication through the real middleware ---------------------------------


def _real_middleware_client():
    return TestClient(app=app, base_url="http://testserver.local")


def test_request_without_credentials_is_rejected(monkeypatch):
    monkeypatch.undo()  # restore the real SupabaseAuthMiddleware
    with _real_middleware_client() as tc:
        res = tc.get("/api/tasks/lists")
    assert res.status_code == HTTP_401_UNAUTHORIZED


def test_bearer_only_request_is_authenticated(monkeypatch):
    monkeypatch.undo()
    payload = {"sub": "user-123", "aud": "authenticated"}
    builder = _chain(FakeResp(data=[]))
    with (
        patch(
            "backend.auth.decode_supabase_token_async", AsyncMock(return_value=payload)
        ),
        patch(CREATE_CLIENT, return_value=_db(builder)) as create,
    ):
        with _real_middleware_client() as tc:
            res = tc.get(
                "/api/tasks/lists", headers={"Authorization": "Bearer bearer-token"}
            )
    assert res.status_code == HTTP_200_OK
    create.assert_called_with("bearer-token")


def test_bearer_takes_precedence_over_cookie(monkeypatch):
    monkeypatch.undo()
    payload = {"sub": "user-123", "aud": "authenticated"}
    builder = _chain(FakeResp(data=[]))
    with (
        patch(
            "backend.auth.decode_supabase_token_async", AsyncMock(return_value=payload)
        ),
        patch(CREATE_CLIENT, return_value=_db(builder)) as create,
    ):
        with _real_middleware_client() as tc:
            tc.cookies.set("nexus-access-token", "cookie-token")
            res = tc.get(
                "/api/tasks/lists", headers={"Authorization": "Bearer bearer-token"}
            )
    assert res.status_code == HTTP_200_OK
    create.assert_called_with("bearer-token")
