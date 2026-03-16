"""Tests for authentication controller helpers."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.auth_controller import _client_ip
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
