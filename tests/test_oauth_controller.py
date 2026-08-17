"""Integration tests for OAuth controller endpoints."""

from __future__ import annotations

import json
import time
import urllib.parse
from unittest.mock import AsyncMock, MagicMock, patch

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
        oauth_callback_url=("https://api.nexus.example/api/email/accounts/callback"),
        frontend_app_url="https://nexus.example/app",
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
        query = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)
        assert query["redirect_uri"] == [
            "https://api.nexus.example/api/email/accounts/callback"
        ]

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
            oauth_callback_url=(
                "https://api.nexus.example/api/email/accounts/callback"
            ),
            frontend_app_url="https://nexus.example",
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

    def test_callback_redirects_to_configured_frontend(self, client):
        cookie_payload = json.dumps(
            {
                "state": "expected-state",
                "verifier": "verifier",
                "provider": "google",
                "ts": int(time.time()),
            }
        )
        client.cookies.set(_OAUTH_COOKIE, cookie_payload)
        client.cookies.set("nexus-access-token", "app-access-token")

        token_response = MagicMock()
        token_response.raise_for_status.return_value = None
        token_response.json.return_value = {
            "access_token": "provider-access",
            "refresh_token": "provider-refresh",
            "expires_in": 3600,
        }
        http_client = MagicMock()
        http_client.__aenter__ = AsyncMock(return_value=http_client)
        http_client.__aexit__ = AsyncMock(return_value=None)
        http_client.post = AsyncMock(return_value=token_response)

        db = MagicMock()
        db.from_.return_value.upsert.return_value.execute.return_value = MagicMock()

        with (
            patch(
                "backend.oauth_controller.httpx.AsyncClient",
                return_value=http_client,
            ),
            patch(
                "backend.oauth_controller._fetch_email_address",
                new=AsyncMock(return_value="user@example.com"),
            ),
            patch(
                "backend.oauth_controller.encrypt_oauth_token",
                side_effect=lambda value: f"encrypted:{value}",
            ),
            patch(
                "backend.oauth_controller.create_supabase_user_client",
                return_value=db,
            ),
        ):
            response = client.get(
                "/api/email/accounts/callback?state=expected-state&code=provider-code",
                follow_redirects=False,
            )

        assert response.status_code == 302
        assert response.headers["location"] == (
            "https://nexus.example/app?email_connected=1"
        )
        exchange_data = http_client.post.await_args.kwargs["data"]
        assert exchange_data["redirect_uri"] == (
            "https://api.nexus.example/api/email/accounts/callback"
        )
        assert db.from_.return_value.upsert.call_args.kwargs["on_conflict"] == (
            "user_id,provider,email_address"
        )
