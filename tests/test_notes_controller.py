"""Integration tests for the Notes controller."""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from litestar.status_codes import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
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
        "lt",
        "is_",
        "not_",
        "order",
        "maybe_single",
    ):
        getattr(builder, method).return_value = builder
    return builder


def test_list_notes_runs_purge_then_selects(client):
    purge = _chain(FakeResp(data=[]))
    select = _chain(FakeResp(data=[{"id": "n1", "title_encrypted": "Hi"}]))
    db = MagicMock()
    db.from_.side_effect = [purge, select]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.get("/api/notes")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["id"] == "n1"
    # purge issued a delete filtered by deleted_at < cutoff
    purge.delete.assert_called()
    purge.lt.assert_any_call("deleted_at", purge.lt.call_args_list[0].args[1])


def test_create_note(client):
    positions = _chain(FakeResp(data=[{"position": 2.0}]))
    insert = _chain(
        FakeResp(data=[{"id": "n2", "title_encrypted": "T", "type": "text"}])
    )
    db = MagicMock()
    db.from_.side_effect = [positions, insert]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes", json={"title": "T", "content": "body"})
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["id"] == "n2"


def test_soft_delete_sets_deleted_at(client):
    builder = _chain(FakeResp(data=[{"id": "n1"}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.delete("/api/notes/n1")
    assert res.status_code == HTTP_204_NO_CONTENT
    # the update set deleted_at (soft delete), not a hard delete
    builder.update.assert_called()


def test_restore_clears_deleted_at(client):
    builder = _chain(FakeResp(data=[{"id": "n1", "deleted_at": None}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/restore")
    assert res.status_code == HTTP_200_OK


def test_pin_note(client):
    builder = _chain(FakeResp(data=[{"id": "n1", "pinned": True}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/pin", json={"pinned": True})
    assert res.status_code == HTTP_200_OK
    assert res.json()["pinned"] is True


def test_archive_note(client):
    builder = _chain(FakeResp(data=[{"id": "n1", "archived": True}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/archive", json={"archived": True})
    assert res.status_code == HTTP_200_OK
    assert res.json()["archived"] is True


def test_move_note_persists_position(client):
    builder = _chain(FakeResp(data=[{"id": "n1", "position": 1.5}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/move", json={"position": 1.5})
    assert res.status_code == HTTP_200_OK
    builder.update.assert_called()


def test_copy_note_duplicates_source(client):
    source = {
        "id": "n1",
        "user_id": "user-123",
        "title_encrypted": "T",
        "content_encrypted": "B",
        "type": "text",
        "color": "Coral",
        "background": None,
        "reminder_at": None,
    }
    fetch = _chain(FakeResp(data=source))  # maybe_single -> dict
    positions = _chain(FakeResp(data=[{"position": 3.0}]))
    insert = _chain(FakeResp(data=[{**source, "id": "n2"}]))
    db = MagicMock()
    db.from_.side_effect = [fetch, positions, insert]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/copy")
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["id"] == "n2"
    insert.insert.assert_called()


def test_list_labels(client):
    builder = _chain(FakeResp(data=[{"id": "l1", "name": "work"}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.get("/api/notes/labels")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["name"] == "work"


def test_create_label(client):
    count = _chain(FakeResp(data=[{"id": "l1"}]))  # 1 existing, under cap
    insert = _chain(FakeResp(data=[{"id": "l2", "name": "home"}]))
    db = MagicMock()
    db.from_.side_effect = [count, insert]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/labels", json={"name": "home"})
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["name"] == "home"


def test_create_label_rejected_at_cap(client):
    count = _chain(FakeResp(data=[{"id": f"l{i}"} for i in range(50)]))
    db = MagicMock()
    db.from_.return_value = count
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/labels", json={"name": "over"})
    assert res.status_code == HTTP_409_CONFLICT


def test_delete_label(client):
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=[]))
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.delete("/api/notes/labels/l1")
    assert res.status_code == HTTP_204_NO_CONTENT


def test_list_items(client):
    builder = _chain(
        FakeResp(data=[{"id": "i1", "text_encrypted": "milk", "checked": False}])
    )
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.get("/api/notes/n1/items")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["text_encrypted"] == "milk"


def test_add_item(client):
    positions = _chain(FakeResp(data=[{"position": 1.0}]))
    insert = _chain(
        FakeResp(data=[{"id": "i2", "text_encrypted": "eggs", "checked": False}])
    )
    db = MagicMock()
    db.from_.side_effect = [positions, insert]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/items", json={"text": "eggs"})
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["text_encrypted"] == "eggs"


def test_update_item_check(client):
    builder = _chain(FakeResp(data=[{"id": "i1", "checked": True}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.patch("/api/notes/items/i1", json={"checked": True})
    assert res.status_code == HTTP_200_OK
    assert res.json()["checked"] is True


def test_move_item(client):
    builder = _chain(FakeResp(data=[{"id": "i1", "position": 2.5}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/items/i1/move", json={"position": 2.5})
    assert res.status_code == HTTP_200_OK
    builder.update.assert_called()


def test_delete_item(client):
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=[]))
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.delete("/api/notes/items/i1")
    assert res.status_code == HTTP_204_NO_CONTENT
