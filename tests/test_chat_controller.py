"""Integration tests for chat controller endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from litestar.status_codes import HTTP_200_OK, HTTP_404_NOT_FOUND
from litestar.testing import TestClient

from backend.app import app


@dataclass
class FakeSupabaseResponse:
    data: list[dict] | None = None


def _fake_jwt_payload(user_id: str = "user-123") -> dict:
    return {
        "sub": user_id,
        "email": "test@nexus.net",
        "aud": "authenticated",
    }


@pytest.fixture()
def client():
    with TestClient(app=app, base_url="http://localhost:8000") as tc:
        yield tc


@pytest.fixture()
def _inject_auth(monkeypatch):
    from backend import auth as auth_mod

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            scope.setdefault("state", {})["user_id"] = "user-123"
            scope["state"]["auth_payload"] = _fake_jwt_payload()
            scope["state"]["access_token"] = "fake-token"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)


@pytest.mark.usefixtures("_inject_auth")
class TestChatController:
    """Tests for persistent AI chat sessions and messages."""

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_list_sessions(self, mock_db_fn, client):
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.execute.return_value = FakeSupabaseResponse(
            data=[{"id": "s1", "title": "Chat"}]
        )

        mock_db = MagicMock()
        mock_db.from_.return_value = mock_query
        mock_db_fn.return_value = mock_db

        response = client.get("/chat/sessions")
        assert response.status_code == HTTP_200_OK
        assert response.json()[0]["title"] == "Chat"

    @patch("backend.chat_controller.get_genai_client")
    @patch("backend.chat_controller.get_gemini_circuit_breaker")
    @patch("backend.chat_controller.create_supabase_user_client")
    def test_send_message_success(
        self, mock_db_fn, mock_breaker_fn, mock_ai_fn, client
    ):
        # Mock session lookup
        mock_session_query = MagicMock()
        mock_session_query.select.return_value = mock_session_query
        mock_session_query.eq.return_value = mock_session_query
        mock_session_query.execute.return_value = FakeSupabaseResponse(
            data=[{"id": "s1", "category": "general"}]
        )

        # Mock history lookup
        mock_history_query = MagicMock()
        mock_history_query.select.return_value = mock_history_query
        mock_history_query.eq.return_value = mock_history_query
        mock_history_query.order.return_value = mock_history_query
        mock_history_query.execute.return_value = FakeSupabaseResponse(data=[])

        mock_db = MagicMock()

        # Route from_() calls
        def from_selector(table):
            if table == "chat_sessions":
                return mock_session_query
            if table == "chat_messages":
                return mock_history_query
            return MagicMock()

        mock_db.from_.side_effect = from_selector
        mock_db_fn.return_value = mock_db

        # Mock Breaker
        mock_breaker = MagicMock()
        mock_breaker.allows_requests.return_value = True
        mock_breaker_fn.return_value = mock_breaker

        # Mock AI
        mock_ai_resp = MagicMock()
        mock_ai_resp.text = "AI reply"
        mock_ai = MagicMock()
        mock_ai.models.generate_content.return_value = mock_ai_resp
        mock_ai_fn.return_value = mock_ai

        response = client.post("/chat/sessions/s1/messages", json={"content": "Hi"})
        assert response.status_code == 201
        assert response.json()["content"] == "AI reply"

        # Verify success was recorded
        mock_breaker.record_success.assert_called_once()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_send_message_session_not_found(self, mock_db_fn, client):
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.execute.return_value = FakeSupabaseResponse(data=[])

        mock_db = MagicMock()
        mock_db.from_.return_value = mock_query
        mock_db_fn.return_value = mock_db

        response = client.post("/chat/sessions/s1/messages", json={"content": "Hi"})
        assert response.status_code == HTTP_404_NOT_FOUND
