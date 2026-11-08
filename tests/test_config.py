"""Tests for backend configuration handling and boot-time validation."""

from __future__ import annotations

from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from litestar.exceptions import ImproperlyConfiguredException

from backend import config as config_module
from backend.config import get_settings

LONG_SALT = "x" * 40
VALID_PROD_ORIGINS = "https://home-notes-app.uk,https://www.home-notes-app.uk"

# Every env name this module's tests touch, so the developer's shell or .env
# cannot leak into the results. monkeypatch restores conftest's values after
# each test.
_CONFIG_ENV_NAMES = (
    "APP_ENV",
    "COOKIE_SECURE",
    "TAKEAWAY_ENCRYPTION_KEY",
    "ALLOWED_ORIGINS",
    "AUDIT_LOG_SALT",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "MICROSOFT_OAUTH_CLIENT_ID",
    "MICROSOFT_OAUTH_CLIENT_SECRET",
    "PASSWORD_RESET_REDIRECT_URL",
    "TRUSTED_PROXY_IPS",
    "GEMINI_MODEL",
    "GEMINI_CONTEXT_TOKEN_BUDGET",
    "GEMINI_CIRCUIT_BREAKER_FAILURES",
    "GEMINI_CIRCUIT_BREAKER_RESET_SECONDS",
    "BACKEND_SENTRY_TRACES_SAMPLE_RATE",
    "ACCESS_COOKIE_MAX_AGE",
    "REFRESH_COOKIE_MAX_AGE",
    "AI_RATE_LIMIT_REQUESTS",
    "AI_RATE_LIMIT_WINDOW_SECONDS",
    "AUTH_RATE_LIMIT_REQUESTS",
    "AUTH_RATE_LIMIT_WINDOW_SECONDS",
    "TASKS_RATE_LIMIT_REQUESTS",
    "TASKS_RATE_LIMIT_WINDOW_SECONDS",
    "EMAIL_POLL_INTERVAL_SECONDS",
    "REDIS_URL",
)


@pytest.fixture(autouse=True)
def _isolated_config_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Start each test from a known config environment with a fresh cache."""

    for name in _CONFIG_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "audit-salt")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _set_production_env(monkeypatch: pytest.MonkeyPatch, **overrides: str) -> None:
    """Set a valid production environment, then apply ``overrides``."""

    values = {
        "APP_ENV": "production",
        "COOKIE_SECURE": "true",
        "SUPABASE_URL": "https://example.supabase.co",
        "AUDIT_LOG_SALT": LONG_SALT,
        "TAKEAWAY_ENCRYPTION_KEY": Fernet.generate_key().decode(),
        "ALLOWED_ORIGINS": VALID_PROD_ORIGINS,
    }
    values.update(overrides)
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def test_get_settings_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing required variables should fail fast."""

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_AUTH_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)

    with pytest.raises(ImproperlyConfiguredException):
        get_settings()


def test_get_settings_reads_expected_values(monkeypatch: pytest.MonkeyPatch) -> None:
    """Configured env values should load into cached settings."""

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret")
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


def test_production_requires_encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_production_env(monkeypatch)
    monkeypatch.delenv("TAKEAWAY_ENCRYPTION_KEY", raising=False)

    with pytest.raises(ImproperlyConfiguredException, match="TAKEAWAY_ENCRYPTION_KEY"):
        get_settings()


def test_production_rejects_malformed_encryption_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(monkeypatch, TAKEAWAY_ENCRYPTION_KEY="not-a-fernet-key")

    with pytest.raises(ImproperlyConfiguredException, match="TAKEAWAY_ENCRYPTION_KEY"):
        get_settings()


def test_production_accepts_valid_encryption_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(monkeypatch)

    settings = get_settings()

    assert settings.environment == "production"
    assert settings.cookie_secure is True


def test_development_tolerates_placeholder_encryption_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """backend/.env.example ships a non-Fernet placeholder; dev must still boot."""

    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", "replace-me-with-a-fernet-key")

    assert get_settings().environment == "development"


# ── APP_ENV resolution ───────────────────────────────────────────────────────


def test_unset_app_env_defaults_to_development(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()

    assert settings.environment == "development"
    assert settings.cookie_secure is False


@pytest.mark.parametrize("raw", ["Development", "  DEVELOPMENT  "])
def test_app_env_is_normalised(monkeypatch: pytest.MonkeyPatch, raw: str) -> None:
    monkeypatch.setenv("APP_ENV", raw)

    assert get_settings().environment == "development"


@pytest.mark.parametrize("raw", ["prod", "live", "developement"])
def test_unknown_app_env_is_rejected(monkeypatch: pytest.MonkeyPatch, raw: str) -> None:
    monkeypatch.setenv("APP_ENV", raw)

    with pytest.raises(ImproperlyConfiguredException, match="APP_ENV"):
        get_settings()


def test_production_casing_still_runs_strict_checks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(monkeypatch, APP_ENV=" Production ", COOKIE_SECURE="false")

    with pytest.raises(ImproperlyConfiguredException, match="COOKIE_SECURE"):
        get_settings()


# ── Production origins ───────────────────────────────────────────────────────


def test_production_rejects_mixed_localhost_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(
        monkeypatch,
        ALLOWED_ORIGINS="https://home-notes-app.uk,http://localhost:5173",
    )

    with pytest.raises(ImproperlyConfiguredException, match="localhost:5173"):
        get_settings()


def test_production_rejects_default_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_production_env(monkeypatch)
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)

    with pytest.raises(ImproperlyConfiguredException, match="ALLOWED_ORIGINS"):
        get_settings()


def test_production_rejects_http_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_production_env(monkeypatch, ALLOWED_ORIGINS="http://home-notes-app.uk")

    with pytest.raises(ImproperlyConfiguredException, match="https"):
        get_settings()


def test_production_accepts_https_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_production_env(monkeypatch)

    settings = get_settings()

    assert settings.allowed_origins == (
        "https://home-notes-app.uk",
        "https://www.home-notes-app.uk",
    )


def test_production_allowed_hosts_exclude_loopback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(monkeypatch)

    settings = get_settings()

    assert "localhost" not in settings.allowed_hosts
    assert "127.0.0.1" not in settings.allowed_hosts
    assert "home-notes-app.uk" in settings.allowed_hosts


def test_development_allowed_hosts_include_loopback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://nexus.app")

    settings = get_settings()

    assert "localhost" in settings.allowed_hosts
    assert "127.0.0.1" in settings.allowed_hosts


@pytest.mark.parametrize(
    "origin",
    [
        "nexus.app",
        "*",
        "https://*.nexus.app",
        "https://nexus.app/",
        "https://nexus.app/path",
        "https://nexus.app?x=1",
        "https://nexus.app#frag",
        "https://user@nexus.app",
        "https://nexus.app:99999",
        "ftp://nexus.app",
    ],
)
def test_malformed_allowed_origin_is_rejected(
    monkeypatch: pytest.MonkeyPatch, origin: str
) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", f"https://nexus.app,{origin}")

    with pytest.raises(ImproperlyConfiguredException, match="ALLOWED_ORIGINS"):
        get_settings()


def test_production_rejects_empty_origin_list(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_production_env(monkeypatch, ALLOWED_ORIGINS=",")

    with pytest.raises(ImproperlyConfiguredException, match="ALLOWED_ORIGINS"):
        get_settings()


# ── Production URL and secret invariants ─────────────────────────────────────


def test_production_requires_https_supabase_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(monkeypatch, SUPABASE_URL="http://example.supabase.co")

    with pytest.raises(ImproperlyConfiguredException, match="SUPABASE_URL"):
        get_settings()


def test_production_requires_long_audit_salt(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_production_env(monkeypatch, AUDIT_LOG_SALT="audit-salt")

    with pytest.raises(ImproperlyConfiguredException, match="AUDIT_LOG_SALT"):
        get_settings()


def test_development_accepts_short_audit_salt(monkeypatch: pytest.MonkeyPatch) -> None:
    assert get_settings().audit_log_salt == "audit-salt"


def test_oauth_requires_service_role_key_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(monkeypatch, GOOGLE_OAUTH_CLIENT_ID="google-id")

    with pytest.raises(
        ImproperlyConfiguredException, match="SUPABASE_SERVICE_ROLE_KEY"
    ):
        get_settings()


def test_oauth_with_service_role_key_boots_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(
        monkeypatch,
        GOOGLE_OAUTH_CLIENT_ID="google-id",
        SUPABASE_SERVICE_ROLE_KEY="service-role-key",
    )

    assert get_settings().supabase_service_role_key == "service-role-key"


def test_oauth_without_service_role_key_only_warns_in_development(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "google-id")

    with caplog.at_level("WARNING", logger="backend.config"):
        settings = get_settings()

    assert settings.supabase_service_role_key == ""
    assert "SUPABASE_SERVICE_ROLE_KEY is empty" in caplog.text


def test_repr_omits_secret_values(monkeypatch: pytest.MonkeyPatch) -> None:
    secrets = {
        "SUPABASE_AUTH_KEY": "sekret-anon-9f3a",
        "SUPABASE_JWT_SECRET": "sekret-jwt-7c21",  # gitleaks:allow (fake test value)
        "AUDIT_LOG_SALT": "sekret-salt-b08e",
        "GEMINI_API_KEY": "sekret-gemini-41d2",
        "SUPABASE_SERVICE_ROLE_KEY": "sekret-service-e5a0",
        "GOOGLE_OAUTH_CLIENT_SECRET": "sekret-google-0c7d",
        "MICROSOFT_OAUTH_CLIENT_SECRET": "sekret-ms-88fb",
        "REDIS_URL": "redis://:sekret-redis-3e91@cache:6379/0",
        "BACKEND_SENTRY_DSN": "https://sekret-dsn-6a2f@sentry.example/1",
        "TAKEAWAY_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    }
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", secrets["SUPABASE_AUTH_KEY"])
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secrets["SUPABASE_JWT_SECRET"])
    for name in (
        "AUDIT_LOG_SALT",
        "GEMINI_API_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "MICROSOFT_OAUTH_CLIENT_SECRET",
        "REDIS_URL",
        "BACKEND_SENTRY_DSN",
        "TAKEAWAY_ENCRYPTION_KEY",
    ):
        monkeypatch.setenv(name, secrets[name])

    rendered = repr(get_settings())

    for name, value in secrets.items():
        assert value not in rendered, f"{name} leaked into repr()"
    assert "supabase_url='https://example.supabase.co'" in rendered


# ── Numeric parsing ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "name",
    [
        "AI_RATE_LIMIT_REQUESTS",
        "AUTH_RATE_LIMIT_REQUESTS",
        "TASKS_RATE_LIMIT_REQUESTS",
        "GEMINI_CONTEXT_TOKEN_BUDGET",
        "GEMINI_CIRCUIT_BREAKER_FAILURES",
        "ACCESS_COOKIE_MAX_AGE",
        "REFRESH_COOKIE_MAX_AGE",
        "EMAIL_POLL_INTERVAL_SECONDS",
    ],
)
def test_non_integer_numeric_env_names_the_variable(
    monkeypatch: pytest.MonkeyPatch, name: str
) -> None:
    monkeypatch.setenv(name, "ten")

    with pytest.raises(ImproperlyConfiguredException, match=name):
        get_settings()


@pytest.mark.parametrize(
    "name",
    [
        "AI_RATE_LIMIT_WINDOW_SECONDS",
        "AUTH_RATE_LIMIT_WINDOW_SECONDS",
        "TASKS_RATE_LIMIT_WINDOW_SECONDS",
        "GEMINI_CIRCUIT_BREAKER_RESET_SECONDS",
        "EMAIL_POLL_INTERVAL_SECONDS",
        "AI_RATE_LIMIT_REQUESTS",
        "ACCESS_COOKIE_MAX_AGE",
    ],
)
@pytest.mark.parametrize("value", ["0", "-5"])
def test_zero_or_negative_numeric_env_is_rejected(
    monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    monkeypatch.setenv(name, value)

    with pytest.raises(ImproperlyConfiguredException, match=name):
        get_settings()


@pytest.mark.parametrize("value", ["2.0", "-0.1", "nan", "inf", "fast"])
def test_sentry_sample_rate_must_be_finite_unit_interval(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("BACKEND_SENTRY_TRACES_SAMPLE_RATE", value)

    with pytest.raises(
        ImproperlyConfiguredException, match="BACKEND_SENTRY_TRACES_SAMPLE_RATE"
    ):
        get_settings()


def test_sentry_sample_rate_accepts_bounds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BACKEND_SENTRY_TRACES_SAMPLE_RATE", "1")

    assert get_settings().backend_sentry_traces_sample_rate == 1.0


def test_blank_numeric_env_uses_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "   ")

    assert get_settings().ai_rate_limit_requests == 10


# ── Trusted proxies ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("entry", ["10.0.0.256", "10.0.0.0/33", "not-an-ip"])
def test_malformed_trusted_proxy_is_rejected(
    monkeypatch: pytest.MonkeyPatch, entry: str
) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_IPS", f"10.0.0.1,{entry}")

    with pytest.raises(ImproperlyConfiguredException, match="TRUSTED_PROXY_IPS"):
        get_settings()


def test_trusted_proxy_accepts_cidr_and_addresses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.0/8, 2001:db8::1")

    assert get_settings().trusted_proxy_ips == ("10.0.0.0/8", "2001:db8::1")


# ── Password reset redirect ──────────────────────────────────────────────────


def test_password_reset_url_unset_boots(monkeypatch: pytest.MonkeyPatch) -> None:
    assert get_settings().password_reset_redirect_url is None


def test_password_reset_http_localhost_allowed_in_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "PASSWORD_RESET_REDIRECT_URL", "http://localhost:5173/reset-password"
    )

    assert get_settings().password_reset_redirect_url.endswith("/reset-password")


@pytest.mark.parametrize(
    "url",
    [
        "http://home-notes-app.uk/reset-password",
        "https://localhost/reset-password",
    ],
)
def test_password_reset_url_rejected_in_production(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    _set_production_env(monkeypatch, PASSWORD_RESET_REDIRECT_URL=url)

    with pytest.raises(
        ImproperlyConfiguredException, match="PASSWORD_RESET_REDIRECT_URL"
    ):
        get_settings()


@pytest.mark.parametrize("url", ["not a url", "/reset-password", "ftp://host/x"])
def test_malformed_password_reset_url_rejected(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_REDIRECT_URL", url)

    with pytest.raises(
        ImproperlyConfiguredException, match="PASSWORD_RESET_REDIRECT_URL"
    ):
        get_settings()


def test_password_reset_https_accepted_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(
        monkeypatch,
        PASSWORD_RESET_REDIRECT_URL="https://home-notes-app.uk/reset-password",
    )

    assert get_settings().password_reset_redirect_url.endswith("/reset-password")


# ── Defaults ─────────────────────────────────────────────────────────────────


def test_default_gemini_model_is_current_supported_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert get_settings().gemini_model == "gemini-3.5-flash-lite"


def test_gemini_model_env_overrides_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "gemini-custom-test")

    assert get_settings().gemini_model == "gemini-custom-test"


# ── Local .env.local overlay ─────────────────────────────────────────────────


def test_env_local_not_loaded_in_production(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / ".env.local").write_text("NEXUS_TEST_OVERLAY=from-file\n")
    monkeypatch.setenv("NEXUS_TEST_OVERLAY", "from-platform")
    monkeypatch.setenv("APP_ENV", "production")

    config_module._load_local_overrides(tmp_path)

    assert config_module.os.environ["NEXUS_TEST_OVERLAY"] == "from-platform"


def test_env_local_overrides_in_development(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / ".env.local").write_text("NEXUS_TEST_OVERLAY=from-file\n")
    monkeypatch.setenv("NEXUS_TEST_OVERLAY", "from-dotenv")
    monkeypatch.setenv("APP_ENV", "development")

    config_module._load_local_overrides(tmp_path)

    assert config_module.os.environ["NEXUS_TEST_OVERLAY"] == "from-file"


def test_env_local_skipped_for_unrecognised_app_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / ".env.local").write_text("NEXUS_TEST_OVERLAY=from-file\n")
    monkeypatch.setenv("NEXUS_TEST_OVERLAY", "from-platform")
    monkeypatch.setenv("APP_ENV", "prod")

    config_module._load_local_overrides(tmp_path)

    assert config_module.os.environ["NEXUS_TEST_OVERLAY"] == "from-platform"


# ── Takeaway encryption key rotation ─────────────────────────────────────────


def test_production_accepts_comma_separated_key_rotation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """data_protection accepts newest-first key lists; boot must accept them too."""

    keys = f"{Fernet.generate_key().decode()}, {Fernet.generate_key().decode()}"
    _set_production_env(monkeypatch, TAKEAWAY_ENCRYPTION_KEY=keys)

    assert get_settings().takeaway_encryption_key == keys


def test_production_rejects_malformed_key_inside_rotation_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    keys = f"{Fernet.generate_key().decode()},not-a-fernet-key"
    _set_production_env(monkeypatch, TAKEAWAY_ENCRYPTION_KEY=keys)

    with pytest.raises(ImproperlyConfiguredException, match="TAKEAWAY_ENCRYPTION_KEY"):
        get_settings()


def test_production_rejects_separator_only_encryption_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(monkeypatch, TAKEAWAY_ENCRYPTION_KEY=" , ,")

    with pytest.raises(ImproperlyConfiguredException, match="at least one"):
        get_settings()


# ── Password reset host ──────────────────────────────────────────────────────


def test_production_rejects_reset_url_on_foreign_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_production_env(
        monkeypatch,
        PASSWORD_RESET_REDIRECT_URL="https://evil.example/reset-password",
    )

    with pytest.raises(
        ImproperlyConfiguredException, match="PASSWORD_RESET_REDIRECT_URL host"
    ):
        get_settings()


def test_development_rejects_reset_url_on_foreign_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_REDIRECT_URL", "http://evil.example/reset")

    with pytest.raises(
        ImproperlyConfiguredException, match="PASSWORD_RESET_REDIRECT_URL host"
    ):
        get_settings()


# ── Email poller interval floor ──────────────────────────────────────────────


def test_email_poll_interval_below_floor_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EMAIL_POLL_INTERVAL_SECONDS", "5")

    with pytest.raises(
        ImproperlyConfiguredException, match="EMAIL_POLL_INTERVAL_SECONDS"
    ):
        get_settings()


def test_email_poll_interval_at_floor_is_accepted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EMAIL_POLL_INTERVAL_SECONDS", "10")

    assert get_settings().email_poll_interval_seconds == 10
