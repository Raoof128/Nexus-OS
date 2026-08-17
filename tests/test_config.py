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
    monkeypatch.setenv("ALLOWED_HOSTS", "nexus.app,preview.nexus.app,api.nexus.app")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.1,10.0.0.2")
    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "7")
    monkeypatch.setenv("AI_RATE_LIMIT_WINDOW_SECONDS", "120")
    monkeypatch.setenv("SUPABASE_REQUEST_TIMEOUT_SECONDS", "12")
    monkeypatch.setenv("GEMINI_REQUEST_TIMEOUT_MS", "45000")
    monkeypatch.setenv(
        "OAUTH_CALLBACK_URL",
        "https://api.nexus.app/api/email/accounts/callback",
    )
    monkeypatch.setenv("FRONTEND_APP_URL", "https://nexus.app")

    settings = get_settings()

    assert settings.supabase_url == "https://example.supabase.co"
    assert settings.supabase_auth_key == "anon-key"
    assert settings.supabase_jwt_secret == "jwt-secret"
    assert settings.audit_log_salt == "audit-salt"
    assert settings.gemini_api_key == "gemini-key"
    assert settings.cookie_secure is True
    assert settings.ai_rate_limit_requests == 7
    assert settings.ai_rate_limit_window_seconds == 120
    assert settings.supabase_request_timeout_seconds == 12
    assert settings.gemini_request_timeout_ms == 45000
    assert (
        settings.oauth_callback_url
        == "https://api.nexus.app/api/email/accounts/callback"
    )
    assert settings.frontend_app_url == "https://nexus.app"
    assert settings.trusted_proxy_ips == ("10.0.0.1", "10.0.0.2")
    assert settings.allowed_origins == (
        "https://nexus.app",
        "https://preview.nexus.app",
    )
    assert "nexus.app" in settings.allowed_hosts
    assert "api.nexus.app" in settings.allowed_hosts


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
    monkeypatch.setenv(
        "OAUTH_CALLBACK_URL",
        "https://home-notes-app.uk/api/api/email/accounts/callback",
    )
    monkeypatch.setenv("FRONTEND_APP_URL", "https://home-notes-app.uk")
    monkeypatch.delenv("TAKEAWAY_ENCRYPTION_KEY", raising=False)
    with pytest.raises(ImproperlyConfiguredException, match="TAKEAWAY_ENCRYPTION_KEY"):
        get_settings()
    get_settings.cache_clear()


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("SUPABASE_REQUEST_TIMEOUT_SECONDS", "0"),
        ("SUPABASE_REQUEST_TIMEOUT_SECONDS", "301"),
        ("GEMINI_REQUEST_TIMEOUT_MS", "0"),
        ("GEMINI_REQUEST_TIMEOUT_MS", "300001"),
        ("GEMINI_REQUEST_TIMEOUT_MS", "not-a-number"),
    ],
)
def test_request_timeouts_must_be_positive_and_bounded(
    monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv(name, value)

    with pytest.raises(ImproperlyConfiguredException, match=name):
        get_settings()


def test_development_has_safe_local_oauth_url_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("OAUTH_CALLBACK_URL", raising=False)
    monkeypatch.delenv("FRONTEND_APP_URL", raising=False)

    settings = get_settings()

    assert (
        settings.oauth_callback_url
        == "http://127.0.0.1:8000/api/email/accounts/callback"
    )
    assert settings.frontend_app_url == "http://localhost:5173"


def test_production_requires_explicit_https_oauth_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", "configured-key")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "google-id")
    monkeypatch.setenv(
        "ALLOWED_ORIGINS", "https://home-notes-app.uk,https://www.home-notes-app.uk"
    )
    monkeypatch.delenv("OAUTH_CALLBACK_URL", raising=False)
    monkeypatch.delenv("FRONTEND_APP_URL", raising=False)

    with pytest.raises(ImproperlyConfiguredException, match="OAUTH_CALLBACK_URL"):
        get_settings()

    get_settings.cache_clear()
    monkeypatch.setenv(
        "OAUTH_CALLBACK_URL",
        "http://api.home-notes-app.uk/api/email/accounts/callback",
    )
    monkeypatch.setenv("FRONTEND_APP_URL", "https://home-notes-app.uk")
    with pytest.raises(ImproperlyConfiguredException, match="OAUTH_CALLBACK_URL"):
        get_settings()


def test_production_frontend_url_must_be_an_allowed_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", "configured-key")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "google-id")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://home-notes-app.uk")
    monkeypatch.setenv(
        "OAUTH_CALLBACK_URL",
        "https://api.home-notes-app.uk/api/email/accounts/callback",
    )
    monkeypatch.setenv("FRONTEND_APP_URL", "https://evil.example")

    with pytest.raises(ImproperlyConfiguredException, match="FRONTEND_APP_URL"):
        get_settings()


def test_production_without_email_oauth_does_not_require_oauth_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", "configured-key")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://home-notes-app.uk")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("MICROSOFT_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("OAUTH_CALLBACK_URL", raising=False)
    monkeypatch.delenv("FRONTEND_APP_URL", raising=False)

    settings = get_settings()

    assert settings.oauth_callback_url == ""
    assert settings.frontend_app_url == ""


def test_production_rejects_wildcard_allowed_hosts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", "configured-key")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://home-notes-app.uk")
    monkeypatch.setenv("ALLOWED_HOSTS", "*")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("MICROSOFT_OAUTH_CLIENT_ID", raising=False)

    with pytest.raises(ImproperlyConfiguredException, match="ALLOWED_HOSTS"):
        get_settings()
