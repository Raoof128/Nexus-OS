import os
import pytest

# Set dummy environment variables at module level before litestar/settings are imported
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_AUTH_KEY", "anon-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "jwt-secret")
os.environ.setdefault("AUDIT_LOG_SALT", "audit-salt")
os.environ.setdefault("COOKIE_DOMAIN", "localhost")
os.environ.setdefault("VITE_API_URL", "http://localhost:8000")

from backend.config import get_settings


@pytest.fixture(autouse=True)
def backend_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Seed required backend settings for tests that touch cached config."""

    get_settings.cache_clear()
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "audit-salt")
    yield
    get_settings.cache_clear()
