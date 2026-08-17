"""Configuration helpers for backend services."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlparse

from dotenv import load_dotenv
from litestar.exceptions import ImproperlyConfiguredException

load_dotenv()
# .env.local overrides .env for local Supabase dev (gitignored, never commit)
load_dotenv(".env.local", override=True)

DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
DEFAULT_OAUTH_CALLBACK_URL = "http://127.0.0.1:8000/api/email/accounts/callback"
DEFAULT_FRONTEND_APP_URL = "http://localhost:5173"
MAX_SUPABASE_REQUEST_TIMEOUT_SECONDS = 300
MAX_GEMINI_REQUEST_TIMEOUT_MS = 300_000


@dataclass(frozen=True)
class BackendSettings:
    """Required environment configuration for the backend."""

    supabase_url: str
    supabase_auth_key: str
    supabase_jwt_secret: str
    audit_log_salt: str
    gemini_api_key: str | None = None
    environment: str = "development"
    gemini_model: str = "gemini-2.5-flash"
    gemini_context_token_budget: int = 900
    gemini_circuit_breaker_failures: int = 3
    gemini_circuit_breaker_reset_seconds: int = 120
    backend_sentry_dsn: str | None = None
    backend_sentry_traces_sample_rate: float = 0.0
    takeaway_encryption_key: str | None = None
    access_cookie_name: str = "nexus-access-token"
    refresh_cookie_name: str = "nexus-refresh-token"
    access_cookie_max_age: int = 900
    refresh_cookie_max_age: int = 60 * 60 * 24 * 7
    cookie_domain: str | None = None
    cookie_secure: bool = False
    ai_rate_limit_requests: int = 10
    ai_rate_limit_window_seconds: int = 60
    auth_rate_limit_requests: int = 10
    auth_rate_limit_window_seconds: int = 60
    tasks_rate_limit_requests: int = 120
    tasks_rate_limit_window_seconds: int = 60
    notes_rate_limit_requests: int = 120
    notes_rate_limit_window_seconds: int = 60
    password_reset_redirect_url: str | None = None
    redis_url: str | None = None
    trusted_proxy_ips: tuple[str, ...] = ()
    allowed_origins: tuple[str, ...] = ()
    allowed_hosts: tuple[str, ...] = ()
    # Supabase service role key (required for email poller writes — bypasses RLS)
    supabase_service_role_key: str = ""
    # Email OAuth (optional — feature disabled when empty)
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    microsoft_oauth_client_id: str = ""
    microsoft_oauth_client_secret: str = ""
    email_poll_interval_seconds: int = 60
    oauth_callback_url: str = DEFAULT_OAUTH_CALLBACK_URL
    frontend_app_url: str = DEFAULT_FRONTEND_APP_URL
    supabase_request_timeout_seconds: int = 10
    gemini_request_timeout_ms: int = 30_000


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


def _parse_bounded_int_env(
    name: str, default: int, *, minimum: int, maximum: int
) -> int:
    """Parse an integer setting and reject unsafe timeout extremes."""

    raw_value = _get_env(name, str(default)) or str(default)
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ImproperlyConfiguredException(
            f"{name} must be an integer between {minimum} and {maximum}."
        ) from exc
    if not minimum <= value <= maximum:
        raise ImproperlyConfiguredException(
            f"{name} must be between {minimum} and {maximum}."
        )
    return value


def _validate_http_url(name: str, value: str, *, require_https: bool) -> None:
    """Require an absolute credential-free HTTP(S) URL with no fragment."""

    parsed = urlparse(value)
    allowed_schemes = {"https"} if require_https else {"http", "https"}
    if (
        parsed.scheme not in allowed_schemes
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        scheme_hint = "HTTPS" if require_https else "HTTP(S)"
        raise ImproperlyConfiguredException(
            f"{name} must be an absolute {scheme_hint} URL without credentials "
            "or a fragment."
        )


def _url_origin(value: str) -> str:
    parsed = urlparse(value)
    return f"{parsed.scheme}://{parsed.netloc}"


def _derive_allowed_hosts(urls: tuple[str, ...]) -> tuple[str, ...]:
    """Build a stable allowed-hosts list from configured origins."""

    hosts = {"localhost", "127.0.0.1"}
    for url in urls:
        hostname = urlparse(url).hostname
        if hostname:
            hosts.add(hostname)
    return tuple(sorted(hosts))


@lru_cache(maxsize=1)
def get_settings() -> BackendSettings:
    """Load and cache backend settings."""

    environment = _get_env("APP_ENV", "development") or "development"
    allowed_origins = _parse_csv_env("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
    oauth_callback_url = (
        _get_env(
            "OAUTH_CALLBACK_URL",
            DEFAULT_OAUTH_CALLBACK_URL if environment == "development" else None,
        )
        or ""
    )
    frontend_app_url = (
        _get_env(
            "FRONTEND_APP_URL",
            DEFAULT_FRONTEND_APP_URL if environment == "development" else None,
        )
        or ""
    )
    derived_allowed_hosts = _derive_allowed_hosts(
        (*allowed_origins, oauth_callback_url, frontend_app_url)
    )
    allowed_hosts = _parse_csv_env("ALLOWED_HOSTS", derived_allowed_hosts)
    settings = BackendSettings(
        supabase_url=_require_env("SUPABASE_URL"),
        supabase_auth_key=_require_env("SUPABASE_AUTH_KEY"),
        supabase_jwt_secret=_require_env("SUPABASE_JWT_SECRET"),
        audit_log_salt=_require_env("AUDIT_LOG_SALT"),
        gemini_api_key=_get_env("GEMINI_API_KEY"),
        environment=environment,
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
        ai_rate_limit_requests=int(_get_env("AI_RATE_LIMIT_REQUESTS", "10") or "10"),
        ai_rate_limit_window_seconds=int(
            _get_env("AI_RATE_LIMIT_WINDOW_SECONDS", "60") or "60"
        ),
        auth_rate_limit_requests=int(
            _get_env("AUTH_RATE_LIMIT_REQUESTS", "10") or "10"
        ),
        auth_rate_limit_window_seconds=int(
            _get_env("AUTH_RATE_LIMIT_WINDOW_SECONDS", "60") or "60"
        ),
        tasks_rate_limit_requests=int(
            _get_env("TASKS_RATE_LIMIT_REQUESTS", "120") or "120"
        ),
        tasks_rate_limit_window_seconds=int(
            _get_env("TASKS_RATE_LIMIT_WINDOW_SECONDS", "60") or "60"
        ),
        password_reset_redirect_url=_get_env("PASSWORD_RESET_REDIRECT_URL"),
        redis_url=_get_env("REDIS_URL"),
        trusted_proxy_ips=_parse_csv_env("TRUSTED_PROXY_IPS", ()),
        allowed_origins=allowed_origins,
        allowed_hosts=allowed_hosts,
        supabase_service_role_key=_get_env("SUPABASE_SERVICE_ROLE_KEY", "") or "",
        google_oauth_client_id=_get_env("GOOGLE_OAUTH_CLIENT_ID", "") or "",
        google_oauth_client_secret=_get_env("GOOGLE_OAUTH_CLIENT_SECRET", "") or "",
        microsoft_oauth_client_id=_get_env("MICROSOFT_OAUTH_CLIENT_ID", "") or "",
        microsoft_oauth_client_secret=_get_env("MICROSOFT_OAUTH_CLIENT_SECRET", "")
        or "",
        email_poll_interval_seconds=int(
            _get_env("EMAIL_POLL_INTERVAL_SECONDS", "60") or "60"
        ),
        oauth_callback_url=oauth_callback_url,
        frontend_app_url=frontend_app_url,
        supabase_request_timeout_seconds=_parse_bounded_int_env(
            "SUPABASE_REQUEST_TIMEOUT_SECONDS",
            10,
            minimum=1,
            maximum=MAX_SUPABASE_REQUEST_TIMEOUT_SECONDS,
        ),
        gemini_request_timeout_ms=_parse_bounded_int_env(
            "GEMINI_REQUEST_TIMEOUT_MS",
            30_000,
            minimum=1,
            maximum=MAX_GEMINI_REQUEST_TIMEOUT_MS,
        ),
    )

    _log = logging.getLogger(__name__)

    # ── Production safety checks ──────────────────────────────────────────────
    email_oauth_enabled = bool(
        settings.google_oauth_client_id or settings.microsoft_oauth_client_id
    )
    if email_oauth_enabled:
        if not settings.oauth_callback_url:
            raise ImproperlyConfiguredException(
                "OAUTH_CALLBACK_URL must be configured when email OAuth is enabled."
            )
        if not settings.frontend_app_url:
            raise ImproperlyConfiguredException(
                "FRONTEND_APP_URL must be configured when email OAuth is enabled."
            )

    # Development owns safe local defaults. Outside development, OAuth URLs
    # become part of the security boundary only when a provider is enabled.
    if settings.environment == "development" or email_oauth_enabled:
        require_https = settings.environment != "development"
        _validate_http_url(
            "OAUTH_CALLBACK_URL",
            settings.oauth_callback_url,
            require_https=require_https,
        )
        _validate_http_url(
            "FRONTEND_APP_URL",
            settings.frontend_app_url,
            require_https=require_https,
        )
        if urlparse(settings.oauth_callback_url).query:
            raise ImproperlyConfiguredException(
                "OAUTH_CALLBACK_URL must not include a query string."
            )
        if not urlparse(settings.oauth_callback_url).path.endswith(
            "/api/email/accounts/callback"
        ):
            raise ImproperlyConfiguredException(
                "OAUTH_CALLBACK_URL must target /api/email/accounts/callback."
            )

    if settings.environment != "development":
        if "*" in settings.allowed_hosts:
            raise ImproperlyConfiguredException(
                "ALLOWED_HOSTS must list exact trusted hosts in non-development "
                "environments."
            )

        if not settings.cookie_secure:
            raise ImproperlyConfiguredException(
                "COOKIE_SECURE must be True in non-development environments. "
                "Set COOKIE_SECURE=true (or APP_ENV=production) in your environment."
            )

        if not settings.takeaway_encryption_key:
            raise ImproperlyConfiguredException(
                "TAKEAWAY_ENCRYPTION_KEY must be set in production — refusing to "
                "boot with plaintext field-level storage."
            )

        if set(settings.allowed_origins) == set(DEFAULT_ALLOWED_ORIGINS):
            raise ImproperlyConfiguredException(
                "ALLOWED_ORIGINS must be set to production domains in non-development "
                "environments. The default includes localhost origins which allow "
                "cross-origin requests from developer machines to the production API."
            )

        if email_oauth_enabled:
            allowed_origin_set = {
                _url_origin(origin).rstrip("/") for origin in settings.allowed_origins
            }
            if (
                _url_origin(settings.frontend_app_url).rstrip("/")
                not in allowed_origin_set
            ):
                raise ImproperlyConfiguredException(
                    "FRONTEND_APP_URL must use an origin listed in ALLOWED_ORIGINS."
                )

    # ── Development convenience warnings ─────────────────────────────────────
    if settings.environment == "development":
        if not settings.cookie_secure:
            _log.warning(
                "cookie_secure is False (development mode). "
                "Cookies will not be marked Secure."
            )
        if set(settings.allowed_origins) == set(DEFAULT_ALLOWED_ORIGINS):
            _log.warning(
                "ALLOWED_ORIGINS uses development defaults (localhost). "
                "Set ALLOWED_ORIGINS before deploying to production."
            )

    return settings
