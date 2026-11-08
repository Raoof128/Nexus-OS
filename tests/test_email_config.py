"""Tests for the email OAuth settings and their environment defaults."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
from litestar.exceptions import ImproperlyConfiguredException

from backend.config import get_settings


@pytest.fixture(autouse=True)
def _isolated_email_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Clear env that would change which config rules apply to these tests.

    A developer's shell with APP_ENV=production used to fail these tests. The
    names are cleared per test, and monkeypatch restores conftest's values.
    """

    for name in (
        "APP_ENV",
        "COOKIE_SECURE",
        "TAKEAWAY_ENCRYPTION_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "GOOGLE_OAUTH_CLIENT_ID",
        "MICROSOFT_OAUTH_CLIENT_ID",
    ):
        monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_settings_include_email_oauth_fields(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "test-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "test-salt")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "google-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("MICROSOFT_OAUTH_CLIENT_ID", "ms-id")
    monkeypatch.setenv("MICROSOFT_OAUTH_CLIENT_SECRET", "ms-secret")

    get_settings.cache_clear()
    settings = get_settings()

    assert settings.google_oauth_client_id == "google-id"
    assert settings.google_oauth_client_secret == "google-secret"
    assert settings.microsoft_oauth_client_id == "ms-id"
    assert settings.microsoft_oauth_client_secret == "ms-secret"
    assert settings.email_poll_interval_seconds == 60
    get_settings.cache_clear()


def test_settings_email_fields_optional_in_dev(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "test-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "test-salt")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("MICROSOFT_OAUTH_CLIENT_ID", raising=False)

    get_settings.cache_clear()
    settings = get_settings()
    assert settings.google_oauth_client_id == ""
    assert settings.microsoft_oauth_client_id == ""
    get_settings.cache_clear()


def test_oauth_in_production_without_service_role_key_fails(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("AUDIT_LOG_SALT", "x" * 40)
    monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://home-notes-app.uk")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "google-id")

    get_settings.cache_clear()
    with pytest.raises(
        ImproperlyConfiguredException, match="SUPABASE_SERVICE_ROLE_KEY"
    ):
        get_settings()
    get_settings.cache_clear()
