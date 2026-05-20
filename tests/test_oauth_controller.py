"""Integration tests for OAuth controller endpoints."""

from __future__ import annotations

import json

import pytest
from litestar.status_codes import HTTP_400_BAD_REQUEST
from litestar.testing import TestClient

from backend.app import app
from backend.oauth_controller import _OAUTH_COOKIE


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
        allowed_hosts=["localhost", "127.0.0.1", "testserver.local"],
    )

    # Patch get_settings globally for relevant modules
    monkeypatch.setattr("backend.config.get_settings", lambda: fake_settings)
    monkeypatch.setattr("backend.oauth_controller.get_settings", lambda: fake_settings)

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            scope.setdefault("state", {})["user_id"] = "user-123"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)
    return fake_settings


@pytest.mark.usefixtures("_inject_auth")
class TestOAuthController:
    """Tests for OAuth PKCE flow and secure redirects."""

    def test_connect_redirects_to_google(self, client):
        response = client.get(
            "/api/email/accounts/connect?provider=google", follow_redirects=False
        )
        assert response.status_code == 302

        location = response.headers["location"]
        assert "accounts.google.com" in location
        assert "response_type=code" in location
        assert "code_challenge=" in location

        assert _OAUTH_COOKIE in response.cookies

    def test_connect_validates_host_header(self, client, monkeypatch):
        from backend.config import BackendSettings

        # Create settings with restricted hosts
        restricted_settings = BackendSettings(
            supabase_url="https://fake.supabase.co",
            supabase_auth_key="fake-key",
            supabase_jwt_secret="fake-secret",
            audit_log_salt="fake-salt",
            google_oauth_client_id="fake-id",
            allowed_hosts=["nexus-os.com"],
        )
        monkeypatch.setattr(
            "backend.oauth_controller.get_settings", lambda: restricted_settings
        )

        # Request with mismatched host
        response = client.get(
            "/api/email/accounts/connect?provider=google",
            headers={"host": "evil.com"},
            follow_redirects=False,
        )
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "invalid host header" in response.text.lower()

    def test_callback_mismatched_state_fails(self, client):
        # Set a state in cookie
        cookie_payload = json.dumps(
            {
                "state": "real-state",
                "verifier": "v1",
                "provider": "google",
                "ts": 9999999999,
            }
        )
        client.cookies.set(_OAUTH_COOKIE, cookie_payload)

        # Callback with wrong state
        response = client.get("/api/email/accounts/callback?state=wrong-state&code=abc")
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "OAuth state mismatch" in response.text

    def test_callback_missing_params_fails(self, client):
        response = client.get("/api/email/accounts/callback")
        assert response.status_code == HTTP_400_BAD_REQUEST
