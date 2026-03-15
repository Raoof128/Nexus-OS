"""Shared pytest fixtures for stable backend configuration."""

from __future__ import annotations

import pytest

from backend.config import get_settings


@pytest.fixture(autouse=True)
def backend_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Seed required backend settings for tests that touch cached config."""

    get_settings.cache_clear()
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "service-key")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "audit-salt")
    yield
    get_settings.cache_clear()
