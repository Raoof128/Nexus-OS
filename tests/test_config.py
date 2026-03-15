"""Tests for backend configuration handling."""

import pytest
from litestar.exceptions import ImproperlyConfiguredException

from backend.config import get_settings


def test_get_settings_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing required variables should fail fast."""

    get_settings.cache_clear()
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_AUTH_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)

    with pytest.raises(ImproperlyConfiguredException):
        get_settings()


def test_get_settings_reads_expected_values(monkeypatch: pytest.MonkeyPatch) -> None:
    """Configured env values should load into cached settings."""

    get_settings.cache_clear()
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "service-key")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "audit-salt")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://nexus.app,https://preview.nexus.app")
    monkeypatch.setenv("COOKIE_SECURE", "true")

    settings = get_settings()

    assert settings.supabase_url == "https://example.supabase.co"
    assert settings.supabase_key == "service-key"
    assert settings.supabase_auth_key == "anon-key"
    assert settings.supabase_jwt_secret == "jwt-secret"
    assert settings.audit_log_salt == "audit-salt"
    assert settings.gemini_api_key == "gemini-key"
    assert settings.cookie_secure is True
    assert settings.allowed_origins == (
        "https://nexus.app",
        "https://preview.nexus.app",
    )
    assert "nexus.app" in settings.allowed_hosts
