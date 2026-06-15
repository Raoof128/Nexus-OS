"""Tests for backend configuration handling."""

import pytest
from litestar.exceptions import ImproperlyConfiguredException

from backend.config import get_settings


def test_get_settings_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing required variables should fail fast."""

    get_settings.cache_clear()
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_AUTH_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)

    with pytest.raises(ImproperlyConfiguredException):
        get_settings()


def test_get_settings_reads_expected_values(monkeypatch: pytest.MonkeyPatch) -> None:
    """Configured env values should load into cached settings."""

    get_settings.cache_clear()
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "audit-salt")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://nexus.app,https://preview.nexus.app")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.1,10.0.0.2")
    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "7")
    monkeypatch.setenv("AI_RATE_LIMIT_WINDOW_SECONDS", "120")

    settings = get_settings()

    assert settings.supabase_url == "https://example.supabase.co"
    assert settings.supabase_auth_key == "anon-key"
    assert settings.supabase_jwt_secret == "jwt-secret"
    assert settings.audit_log_salt == "audit-salt"
    assert settings.gemini_api_key == "gemini-key"
    assert settings.cookie_secure is True
    assert settings.ai_rate_limit_requests == 7
    assert settings.ai_rate_limit_window_seconds == 120
    assert settings.trusted_proxy_ips == ("10.0.0.1", "10.0.0.2")
    assert settings.allowed_origins == (
        "https://nexus.app",
        "https://preview.nexus.app",
    )
    assert "nexus.app" in settings.allowed_hosts


def test_production_requires_encryption_key(monkeypatch):
    import pytest
    from litestar.exceptions import ImproperlyConfiguredException

    from backend.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv(
        "ALLOWED_ORIGINS", "https://home-notes-app.uk,https://www.home-notes-app.uk"
    )
    monkeypatch.delenv("TAKEAWAY_ENCRYPTION_KEY", raising=False)
    with pytest.raises(ImproperlyConfiguredException, match="TAKEAWAY_ENCRYPTION_KEY"):
        get_settings()
    get_settings.cache_clear()
