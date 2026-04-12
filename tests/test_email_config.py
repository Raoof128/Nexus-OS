from backend.config import get_settings


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
