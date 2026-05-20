"""Integration tests for email controller endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from litestar.status_codes import (
    HTTP_200_OK,
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
    with TestClient(app=app, base_url="http://localhost:8000") as tc:
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
