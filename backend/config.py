"""Configuration helpers for backend services."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlparse

from dotenv import load_dotenv
from litestar.exceptions import ImproperlyConfiguredException

load_dotenv()

DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


@dataclass(frozen=True)
class BackendSettings:
    """Required environment configuration for the backend."""

    supabase_url: str
    supabase_key: str
    supabase_auth_key: str
    supabase_jwt_secret: str
    gemini_api_key: str | None = None
    environment: str = "development"
    gemini_model: str = "gemini-2.5-flash"
    gemini_context_token_budget: int = 900
    gemini_circuit_breaker_failures: int = 3
    gemini_circuit_breaker_reset_seconds: int = 120
    backend_sentry_dsn: str | None = None
    backend_sentry_traces_sample_rate: float = 0.0
    audit_log_salt: str = "nexus-audit-salt"
    takeaway_encryption_key: str | None = None
    access_cookie_name: str = "nexus-access-token"
    refresh_cookie_name: str = "nexus-refresh-token"
    access_cookie_max_age: int = 900
    refresh_cookie_max_age: int = 60 * 60 * 24 * 7
    cookie_domain: str | None = None
    cookie_secure: bool = False
    suggest_rate_limit_requests: int = 5
    suggest_rate_limit_window_seconds: int = 60
    auth_rate_limit_requests: int = 10
    auth_rate_limit_window_seconds: int = 60
    redis_url: str | None = None
    allowed_origins: tuple[str, ...] = ()
    allowed_hosts: tuple[str, ...] = ()


def _get_env(name: str, default: str | None = None) -> str | None:
    """Return an environment variable with surrounding whitespace removed."""

    value = os.getenv(name, default)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _require_env(name: str) -> str:
    """Return a required environment variable or raise a clear config error."""

    value = _get_env(name)
    if not value:
        raise ImproperlyConfiguredException(
            f"Missing required environment variable: {name}"
        )
    return value


def _parse_bool_env(name: str, default: bool) -> bool:
    """Parse a boolean-like environment variable."""

    value = _get_env(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _parse_csv_env(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    """Parse a comma-separated environment variable into a tuple of values."""

    raw_value = _get_env(name)
    if not raw_value:
        return default
    return tuple(item.strip() for item in raw_value.split(",") if item.strip())


def _derive_allowed_hosts(origins: tuple[str, ...]) -> tuple[str, ...]:
    """Build a stable allowed-hosts list from configured origins."""

    hosts = {"localhost", "127.0.0.1"}
    for origin in origins:
        hostname = urlparse(origin).hostname
        if hostname:
            hosts.add(hostname)
    return tuple(sorted(hosts))


@lru_cache(maxsize=1)
def get_settings() -> BackendSettings:
    """Load and cache backend settings."""

    allowed_origins = _parse_csv_env("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
    return BackendSettings(
        supabase_url=_require_env("SUPABASE_URL"),
        supabase_key=_require_env("SUPABASE_KEY"),
        supabase_auth_key=_require_env("SUPABASE_AUTH_KEY"),
        supabase_jwt_secret=_require_env("SUPABASE_JWT_SECRET"),
        gemini_api_key=_get_env("GEMINI_API_KEY"),
        environment=_get_env("APP_ENV", "development") or "development",
        gemini_model=_get_env("GEMINI_MODEL", "gemini-2.5-flash") or "gemini-2.5-flash",
        gemini_context_token_budget=int(
            _get_env("GEMINI_CONTEXT_TOKEN_BUDGET", "900") or "900"
        ),
        gemini_circuit_breaker_failures=int(
            _get_env("GEMINI_CIRCUIT_BREAKER_FAILURES", "3") or "3"
        ),
        gemini_circuit_breaker_reset_seconds=int(
            _get_env("GEMINI_CIRCUIT_BREAKER_RESET_SECONDS", "120") or "120"
        ),
        backend_sentry_dsn=_get_env("BACKEND_SENTRY_DSN"),
        backend_sentry_traces_sample_rate=float(
            _get_env("BACKEND_SENTRY_TRACES_SAMPLE_RATE", "0.0") or "0.0"
        ),
        audit_log_salt=_require_env("AUDIT_LOG_SALT"),
        takeaway_encryption_key=_get_env("TAKEAWAY_ENCRYPTION_KEY"),
        access_cookie_name=_get_env("ACCESS_COOKIE_NAME", "nexus-access-token")
        or "nexus-access-token",
        refresh_cookie_name=_get_env("REFRESH_COOKIE_NAME", "nexus-refresh-token")
        or "nexus-refresh-token",
        access_cookie_max_age=int(_get_env("ACCESS_COOKIE_MAX_AGE", "900") or "900"),
        refresh_cookie_max_age=int(
            _get_env("REFRESH_COOKIE_MAX_AGE", str(60 * 60 * 24 * 7))
            or str(60 * 60 * 24 * 7)
        ),
        cookie_domain=_get_env("COOKIE_DOMAIN"),
        cookie_secure=_parse_bool_env(
            "COOKIE_SECURE",
            (_get_env("APP_ENV", "development") or "development") != "development",
        ),
        suggest_rate_limit_requests=int(
            _get_env("SUGGEST_RATE_LIMIT_REQUESTS", "5") or "5"
        ),
        suggest_rate_limit_window_seconds=int(
            _get_env("SUGGEST_RATE_LIMIT_WINDOW_SECONDS", "60") or "60"
        ),
        auth_rate_limit_requests=int(
            _get_env("AUTH_RATE_LIMIT_REQUESTS", "10") or "10"
        ),
        auth_rate_limit_window_seconds=int(
            _get_env("AUTH_RATE_LIMIT_WINDOW_SECONDS", "60") or "60"
        ),
        redis_url=_get_env("REDIS_URL"),
        allowed_origins=allowed_origins,
        allowed_hosts=_derive_allowed_hosts(allowed_origins),
    )
