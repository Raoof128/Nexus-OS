"""Integration tests for email controller endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest
from litestar.status_codes import (
    HTTP_200_OK,
    HTTP_400_BAD_REQUEST,
    HTTP_404_NOT_FOUND,
)
from litestar.testing import TestClient

from backend.app import app


@dataclass
class FakeSupabaseResponse:
    """Minimal Supabase response stub."""

    data: list[dict] | None = None


def _fake_jwt_payload(user_id: str = "user-123") -> dict:
    return {
        "sub": user_id,
        "email": "test@nexus.net",
        "exp": 9999999999,
        "iat": 1000000000,
        "aud": "authenticated",
    }


@pytest.fixture()
def client():
    with TestClient(app=app, base_url="http://testserver.local") as tc:
        yield tc


@pytest.fixture()
def _inject_auth(monkeypatch):
    from backend import auth as auth_mod
    from backend.config import BackendSettings

    # Create a fake settings instance
    fake_settings = BackendSettings(
        supabase_url="https://fake.supabase.co",
        supabase_auth_key="fake-key",
        supabase_jwt_secret="fake-secret",
        audit_log_salt="fake-salt",
        google_oauth_client_id="fake-id",
        google_oauth_client_secret="fake-secret",
        allowed_hosts=["localhost", "127.0.0.1"],
    )

    # Patch get_settings globally for relevant modules
    monkeypatch.setattr("backend.config.get_settings", lambda: fake_settings)
    monkeypatch.setattr("backend.email_controller.get_settings", lambda: fake_settings)

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            scope.setdefault("state", {})["user_id"] = "user-123"
            scope["state"]["auth_payload"] = _fake_jwt_payload()
            scope["state"]["access_token"] = "fake-token"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)
    return fake_settings


@pytest.mark.usefixtures("_inject_auth")
class TestEmailController:
    """Tests for unified inbox features and AI drafting."""

    @patch("backend.email_controller.create_supabase_user_client")
    def test_list_messages_applies_filters_and_returns_composite_cursor(
        self, mock_client_fn, client, _inject_auth
    ):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        account_id = "11111111-1111-4111-8111-111111111111"
        query = MagicMock()
        for method in ("select", "eq", "order", "limit"):
            getattr(query, method).return_value = query
        query.execute.return_value = FakeSupabaseResponse(
            data=[
                {
                    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    "provider_date": "2026-08-17T03:00:00+00:00",
                },
                {
                    "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    "provider_date": "2026-08-17T02:00:00+00:00",
                },
                {
                    "id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    "provider_date": "2026-08-17T01:00:00+00:00",
                },
            ]
        )
        database = MagicMock()
        database.from_.return_value = query
        mock_client_fn.return_value = database

        response = client.get(
            "/api/email/messages",
            params={"folder": "inbox", "account_id": account_id, "limit": 2},
        )

        assert response.status_code == HTTP_200_OK
        assert [item["id"] for item in response.json()["items"]] == [
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        ]
        assert response.json()["next_cursor"] == {
            "provider_date": "2026-08-17T02:00:00+00:00",
            "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }
        assert query.eq.call_args_list == [
            call("user_id", "user-123"),
            call("folder", "inbox"),
            call("account_id", account_id),
        ]
        assert query.order.call_args_list == [
            call("provider_date", desc=True),
            call("id", desc=True),
        ]
        query.limit.assert_called_once_with(3)

    @patch("backend.email_controller.create_supabase_user_client")
    def test_list_messages_applies_starred_search_and_stable_cursor(
        self, mock_client_fn, client, _inject_auth
    ):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        cursor_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        query = MagicMock()
        for method in ("select", "eq", "text_search", "or_", "order", "limit"):
            getattr(query, method).return_value = query
        query.execute.return_value = FakeSupabaseResponse(data=[])
        database = MagicMock()
        database.from_.return_value = query
        mock_client_fn.return_value = database

        response = client.get(
            "/api/email/messages",
            params={
                "folder": "starred",
                "search": "quarterly report",
                "cursor_date": "2026-08-17T02:00:00Z",
                "cursor_id": cursor_id,
            },
        )

        assert response.status_code == HTTP_200_OK
        query.eq.assert_any_call("is_starred", True)
        query.text_search.assert_called_once_with(
            "body_text",
            "quarterly report",
            options={"type": "websearch"},
        )
        query.or_.assert_called_once_with(
            "provider_date.lt.2026-08-17T02:00:00+00:00,"
            "and(provider_date.eq.2026-08-17T02:00:00+00:00,"
            f"id.lt.{cursor_id})"
        )
        assert response.json() == {"items": [], "next_cursor": None}

    @pytest.mark.parametrize(
        "params",
        [
            {"cursor_date": "2026-08-17T02:00:00Z"},
            {"cursor_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},
            {"folder": "unknown"},
            {"account_id": "not-a-uuid"},
        ],
    )
    def test_list_messages_rejects_invalid_filters(self, client, _inject_auth, params):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")

        response = client.get("/api/email/messages", params=params)

        assert response.status_code == HTTP_400_BAD_REQUEST

    @patch("backend.email_controller.create_supabase_user_client")
    def test_list_accounts_returns_data(self, mock_client_fn, client, _inject_auth):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.execute.return_value = FakeSupabaseResponse(
            data=[{"id": "a1", "email_address": "test@gmail.com"}]
        )

        mock_supabase = MagicMock()
        mock_supabase.from_.return_value = mock_query
        mock_client_fn.return_value = mock_supabase

        response = client.get("/api/email/accounts")
        assert response.status_code == HTTP_200_OK
        assert response.json()[0]["email_address"] == "test@gmail.com"

    @patch("backend.email_controller.get_genai_client")
    @patch("backend.email_controller.create_supabase_user_client")
    def test_ai_draft_success(self, mock_db_fn, mock_ai_fn, client, _inject_auth):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        # Mock DB response for email lookup
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.maybe_single.return_value = mock_query
        mock_query.execute.return_value = FakeSupabaseResponse(
            data={"id": "e1", "body_text": "Content", "user_id": "user-123"}
        )

        mock_db = MagicMock()
        mock_db.from_.return_value = mock_query
        mock_db_fn.return_value = mock_db

        # Mock AI response
        mock_ai_resp = MagicMock()
        mock_ai_resp.text = "Draft reply"
        mock_ai = MagicMock()
        mock_ai.models.generate_content.return_value = mock_ai_resp
        mock_ai_fn.return_value = mock_ai

        response = client.post(
            "/api/email/ai/draft", json={"email_id": "e1", "instruction": "Be nice"}
        )
        assert response.status_code == 201
        assert response.json()["draft"] == "Draft reply"

    @patch("backend.email_controller.create_supabase_user_client")
    def test_ai_draft_forbidden_for_other_user(self, mock_db_fn, client, _inject_auth):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        # Mock email not found (due to ownership check in query)
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.maybe_single.return_value = mock_query
        mock_query.execute.return_value = FakeSupabaseResponse(data=None)

        mock_db = MagicMock()
        mock_db.from_.return_value = mock_query
        mock_db_fn.return_value = mock_db

        response = client.post("/api/email/ai/draft", json={"email_id": "e1"})
        assert response.status_code == HTTP_404_NOT_FOUND

    @patch("backend.email_controller.enforce_ai_rate_limit")
    @patch("backend.email_controller.get_genai_client")
    @patch("backend.email_controller.create_supabase_user_client")
    def test_ai_summarize_checks_rate_limit(
        self, mock_db_fn, mock_ai_fn, mock_rate_fn, client, _inject_auth
    ):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        # Mock DB response for multiple emails
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.execute.return_value = FakeSupabaseResponse(data=[{"subject": "S1"}])

        mock_db = MagicMock()
        mock_db.from_.return_value = mock_query
        mock_db_fn.return_value = mock_db

        # Mock AI
        mock_ai_resp = MagicMock()
        mock_ai_resp.text = "Summary"
        mock_ai = MagicMock()
        mock_ai.models.generate_content.return_value = mock_ai_resp
        mock_ai_fn.return_value = mock_ai

        response = client.post("/api/email/ai/summarize", json={"email_ids": ["e1"]})
        assert response.status_code == 201

        # Verify rate limit was called
        mock_rate_fn.assert_called_once_with("user-123", "email_summarize")

    @patch("backend.email_controller.get_provider")
    @patch("backend.email_controller.create_supabase_user_client")
    def test_send_email_reuses_success_for_same_idempotency_key(
        self, mock_db_fn, mock_provider_fn, client, _inject_auth
    ):
        """Retrying one send with the same key must not send a second message."""

        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.maybe_single.return_value = query
        query.execute.return_value = FakeSupabaseResponse(
            data={
                "id": "account-1",
                "user_id": "user-123",
                "provider": "google",
                "access_token_enc": "provider-token",
            }
        )
        db = MagicMock()
        db.from_.return_value = query
        mock_db_fn.return_value = db
        provider = MagicMock()
        provider.send_message = AsyncMock(return_value={"id": "sent-1"})
        mock_provider_fn.return_value = provider
        payload = {
            "account_id": "account-1",
            "to": ["recipient@example.com"],
            "subject": "Idempotent",
            "body_html": "<p>Hello</p>",
        }
        headers = {"Idempotency-Key": "send-attempt-123"}

        first = client.post("/api/email/send", json=payload, headers=headers)
        second = client.post("/api/email/send", json=payload, headers=headers)

        assert first.status_code == 201
        assert second.status_code == 201
        assert first.json() == second.json() == {"id": "sent-1"}
        assert provider.send_message.await_count == 1

    @patch("backend.email_controller.decrypt_oauth_token", return_value="token")
    @patch("backend.email_controller.get_provider")
    @patch("backend.email_controller.create_supabase_user_client")
    def test_graph_move_persists_returned_immutable_provider_id(
        self,
        mock_db_fn,
        mock_provider_fn,
        _mock_decrypt,
        client,
        _inject_auth,
    ):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        email_query = MagicMock()
        account_query = MagicMock()
        update_query = MagicMock()
        for query in (email_query, account_query, update_query):
            query.select.return_value = query
            query.update.return_value = query
            query.eq.return_value = query
            query.maybe_single.return_value = query
        email_query.execute.return_value = FakeSupabaseResponse(
            data={
                "id": "email-1",
                "user_id": "user-123",
                "account_id": "account-1",
                "provider_id": "mutable-id",
            }
        )
        account_query.execute.return_value = FakeSupabaseResponse(
            data={
                "id": "account-1",
                "user_id": "user-123",
                "provider": "microsoft",
                "access_token_enc": "encrypted",
            }
        )
        update_query.execute.return_value = FakeSupabaseResponse(data=[])
        db = MagicMock()
        db.from_.side_effect = [email_query, account_query, update_query]
        mock_db_fn.return_value = db
        provider = MagicMock()
        provider.move_message = AsyncMock(return_value="immutable-id")
        mock_provider_fn.return_value = provider

        response = client.patch(
            "/api/email/email-1/move",
            json={"folder": "archive"},
        )

        assert response.status_code == 200
        update_query.update.assert_called_once_with(
            {"folder": "archive", "provider_id": "immutable-id"}
        )

    @patch("backend.email_controller.decrypt_oauth_token", return_value="token")
    @patch("backend.email_controller.get_provider")
    @patch("backend.email_controller.create_supabase_user_client")
    def test_move_fails_when_provider_succeeds_but_local_sync_fails(
        self,
        mock_db_fn,
        mock_provider_fn,
        _mock_decrypt,
        client,
        _inject_auth,
    ):
        client.cookies.set(_inject_auth.access_cookie_name, "fake-token")
        email_query = MagicMock()
        account_query = MagicMock()
        update_query = MagicMock()
        for query in (email_query, account_query, update_query):
            query.select.return_value = query
            query.update.return_value = query
            query.eq.return_value = query
            query.maybe_single.return_value = query
        email_query.execute.return_value = FakeSupabaseResponse(
            data={
                "id": "email-1",
                "user_id": "user-123",
                "account_id": "account-1",
                "provider_id": "provider-id",
            }
        )
        account_query.execute.return_value = FakeSupabaseResponse(
            data={
                "id": "account-1",
                "user_id": "user-123",
                "provider": "google",
                "access_token_enc": "encrypted",
            }
        )
        update_query.execute.side_effect = RuntimeError("database unavailable")
        db = MagicMock()
        db.from_.side_effect = [email_query, account_query, update_query]
        mock_db_fn.return_value = db
        provider = MagicMock()
        provider.move_message = AsyncMock(return_value=None)
        mock_provider_fn.return_value = provider

        response = client.patch(
            "/api/email/email-1/move",
            json={"folder": "archive"},
        )

        assert response.status_code == 502
        assert response.json()["detail"] == (
            "Move completed at provider but local sync failed"
        )


def test_ai_email_context_is_bounded_and_well_formed():
    """Large stored emails must not produce unbounded Gemini request context."""

    from backend.email_controller import _serialize_bounded_email_context

    emails = [
        {
            "from_address": "sender@example.com",
            "provider_date": "2026-08-17T00:00:00Z",
            "subject": "Large",
            "body_text": "x" * 100_000,
        }
        for _ in range(20)
    ]

    context = _serialize_bounded_email_context(emails)

    assert len(context) <= 48_000
    assert context.startswith("\n<untrusted_email_thread_context>")
    assert context.endswith("\n</untrusted_email_thread_context>\n")


@pytest.mark.anyio
async def test_attachment_reader_rejects_response_over_byte_limit():
    """Attachment buffering must stop as soon as the configured cap is exceeded."""

    from backend.email_controller import _read_limited_response

    class FakeResponse:
        headers = {}

        async def aiter_bytes(self):
            yield b"1234"
            yield b"5678"

    with pytest.raises(Exception) as exc_info:
        await _read_limited_response(FakeResponse(), max_bytes=6)

    assert getattr(exc_info.value, "status_code", None) == 413


@pytest.mark.anyio
async def test_concurrent_idempotent_sends_share_one_operation(monkeypatch):
    """Concurrent retries with one key must await the same provider operation."""

    import asyncio

    import backend.email_controller as controller

    controller._idempotency_entries.clear()
    monkeypatch.setattr(
        controller,
        "enforce_email_send_rate_limit",
        lambda _user_id, _account_id: None,
    )
    request = SimpleNamespace(headers={"idempotency-key": "concurrent-send-1"})
    call_count = 0

    async def operation():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.01)
        return {"id": "sent-1"}

    kwargs = {
        "request": request,
        "user_id": "user-1",
        "account_id": "account-1",
        "operation_name": "send",
        "payload": {"subject": "Hello"},
        "operation": operation,
    }
    first, second = await asyncio.gather(
        controller._execute_outbound_email(**kwargs),
        controller._execute_outbound_email(**kwargs),
    )

    assert first == second == {"id": "sent-1"}
    assert call_count == 1
    controller._idempotency_entries.clear()


@pytest.mark.anyio
async def test_outbound_email_requires_idempotency_key():
    import backend.email_controller as controller

    async def operation():
        return {"id": "must-not-send"}

    with pytest.raises(Exception) as exc_info:
        await controller._execute_outbound_email(
            request=SimpleNamespace(headers={}),
            user_id="user-1",
            account_id="account-1",
            operation_name="send",
            payload={"subject": "Hello"},
            operation=operation,
        )

    assert getattr(exc_info.value, "status_code", None) == 400


@pytest.mark.anyio
async def test_send_rate_limit_does_not_block_event_loop(monkeypatch):
    import asyncio
    import time

    import backend.email_controller as controller

    controller._idempotency_entries.clear()

    def slow_limit(_user_id, _account_id):
        time.sleep(0.1)

    monkeypatch.setattr(controller, "enforce_email_send_rate_limit", slow_limit)

    async def operation():
        return {"id": "sent-1"}

    send_task = asyncio.create_task(
        controller._execute_outbound_email(
            request=SimpleNamespace(headers={"idempotency-key": "slow-limit-1"}),
            user_id="user-1",
            account_id="account-1",
            operation_name="send",
            payload={"subject": "Hello"},
            operation=operation,
        )
    )
    started = time.monotonic()
    await asyncio.sleep(0.02)
    heartbeat_elapsed = time.monotonic() - started
    result = await send_task

    assert heartbeat_elapsed < 0.08
    assert result == {"id": "sent-1"}
    controller._idempotency_entries.clear()
