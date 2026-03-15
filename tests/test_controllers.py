"""Integration tests for media controller endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from litestar.status_codes import (
    HTTP_200_OK,
    HTTP_401_UNAUTHORIZED,
    HTTP_502_BAD_GATEWAY,
)
from litestar.testing import TestClient

from backend.app import app


@dataclass
class FakeSupabaseResponse:
    """Minimal Supabase response stub for controller tests."""

    data: list[dict] | None = None


def _fake_jwt_payload(user_id: str = "user-123") -> dict:
    """Return a plausible JWT payload for test scope injection."""

    return {
        "sub": user_id,
        "email": "test@nexus.net",
        "exp": 9999999999,
        "iat": 1000000000,
        "aud": "authenticated",
    }


@pytest.fixture()
def client():
    """LiteStar test client with a hostname that passes allowed_hosts."""

    with TestClient(app=app, base_url="http://localhost:8000") as tc:
        yield tc


@pytest.fixture()
def _inject_auth(monkeypatch):
    """Patch the auth middleware to inject a valid user without a real JWT."""

    from backend import auth as auth_mod

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if not path.startswith(("/healthz", "/schema", "/auth")):
                scope.setdefault("state", {})["user_id"] = "user-123"
                scope["state"]["auth_payload"] = _fake_jwt_payload()
                scope["state"]["access_token"] = "fake-access-token"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)


class TestHealthz:
    """Health probe does not require authentication."""

    def test_healthz_returns_ok(self, client):
        response = client.get("/healthz")
        assert response.status_code == HTTP_200_OK
        assert response.json() == {"status": "ok"}


class TestMediaControllerAuth:
    """Controller endpoints reject unauthenticated callers."""

    def test_get_media_requires_auth(self, client):
        response = client.get("/media")
        assert response.status_code == HTTP_401_UNAUTHORIZED

    def test_create_media_requires_auth(self, client):
        response = client.post(
            "/media",
            json={
                "title": "Test",
                "creator": "Author",
            },
        )
        assert response.status_code == HTTP_401_UNAUTHORIZED


@pytest.mark.usefixtures("_inject_auth")
class TestMediaControllerCRUD:
    """Controller endpoints with mocked Supabase."""

    @patch("backend.controllers.create_supabase_user_client")
    def test_get_media_returns_list(self, mock_client_fn, client):
        mock_query = MagicMock()
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.range.return_value = mock_query
        mock_query.execute.return_value = FakeSupabaseResponse(
            data=[
                {
                    "id": "b1",
                    "user_id": "user-123",
                    "type": "book",
                    "title": "Neuromancer",
                    "creator": "Gibson",
                    "status": "Finished",
                    "genre": "Cyberpunk",
                    "rating": 5,
                    "takeaway": None,
                    "sub_info": None,
                }
            ]
        )
        mock_supabase = MagicMock()
        mock_supabase.from_.return_value = mock_query
        mock_client_fn.return_value = mock_supabase

        response = client.get("/media?type=book")
        assert response.status_code == HTTP_200_OK
        items = response.json()
        assert len(items) == 1
        assert items[0]["title"] == "Neuromancer"

    @patch("backend.controllers.create_supabase_user_client")
    def test_get_media_handles_failure(self, mock_client_fn, client):
        mock_client_fn.side_effect = RuntimeError("Connection refused")

        response = client.get("/media")
        assert response.status_code == HTTP_502_BAD_GATEWAY
