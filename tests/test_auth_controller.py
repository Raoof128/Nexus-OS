"""Tests for authentication controller helpers."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.auth_controller import AuthController, _client_ip
from backend.config import get_settings


def test_client_ip_ignores_forwarded_header_from_untrusted_peer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Client-supplied proxy headers must not bypass auth throttles."""

    get_settings.cache_clear()
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "")

    request = SimpleNamespace(
        headers={"x-forwarded-for": "203.0.113.99"},
        client=SimpleNamespace(host="198.51.100.10"),
    )

    assert _client_ip(request) == "198.51.100.10"


def test_client_ip_uses_forwarded_header_from_trusted_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Trusted reverse proxies may forward the original client address."""

    get_settings.cache_clear()
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.5")

    request = SimpleNamespace(
        headers={"x-forwarded-for": "203.0.113.99, 10.0.0.5"},
        client=SimpleNamespace(host="10.0.0.5"),
    )

    assert _client_ip(request) == "203.0.113.99"


@pytest.mark.anyio
async def test_logout_revokes_refresh_only_session() -> None:
    """An expired access cookie must not prevent refresh-token revocation."""

    auth = MagicMock()
    client = MagicMock(auth=auth)
    request = SimpleNamespace(cookies={"nexus-refresh-token": "refresh-token"})

    with patch(
        "backend.auth_controller.create_supabase_auth_client", return_value=client
    ):
        response = await AuthController.logout.fn(None, request)

    auth.refresh_session.assert_called_once_with("refresh-token")
    auth.set_session.assert_not_called()
    auth.sign_out.assert_called_once_with()
    assert response.content == {"ok": True}


@pytest.mark.anyio
async def test_logout_preserves_existing_access_and_refresh_revoke_flow() -> None:
    auth = MagicMock()
    client = MagicMock(auth=auth)
    request = SimpleNamespace(
        cookies={
            "nexus-access-token": "access-token",
            "nexus-refresh-token": "refresh-token",
        }
    )

    with patch(
        "backend.auth_controller.create_supabase_auth_client", return_value=client
    ):
        await AuthController.logout.fn(None, request)

    auth.set_session.assert_called_once_with("access-token", "refresh-token")
    auth.refresh_session.assert_not_called()
    auth.sign_out.assert_called_once_with()
