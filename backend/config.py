"""Typed backend configuration loaded from environment variables.

``get_settings()`` reads the environment once, validates it, and caches the
result. Invalid or unsafe configuration raises ``ImproperlyConfiguredException``.
``backend/app.py`` calls ``get_settings()`` at import time, so every error in
this module surfaces at boot rather than on a live request.

Environment resolution:

* ``APP_ENV`` is normalised with ``strip().lower()`` and must be one of
  ``development``, ``test``, ``staging`` or ``production``. Unset or blank
  means ``development`` (relaxed checks) and logs a warning.
* Only ``development`` relaxes the strict checks. Every other environment runs
  the production validation block.
"""

from __future__ import annotations

import ipaddress
import logging
import math
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from litestar.exceptions import ImproperlyConfiguredException

logger = logging.getLogger(__name__)

# ``ImproperlyConfiguredException`` is a Litestar HTTPException subclass, so its
# message is prefixed with a status code when printed. That is acceptable here
# because every raise in this module happens at startup, before any request.

BACKEND_DIR = Path(__file__).resolve().parent

load_dotenv()
_LOCAL_ENV_FILE = ".env.local"

DEVELOPMENT = "development"
KNOWN_ENVIRONMENTS = frozenset({DEVELOPMENT, "test", "staging", "production"})

DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
MIN_AUDIT_LOG_SALT_LENGTH = 32
DEFAULT_REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7


@dataclass(frozen=True)
class BackendSettings:
    """Validated backend configuration, built once by :func:`get_settings`.

    Fields that hold credentials use ``field(repr=False)`` so ``repr()`` never
    prints them. That covers logs, tracebacks, and Sentry frame locals that
    capture a ``settings`` variable.
    """

    supabase_url: str
    supabase_auth_key: str = field(repr=False)
    supabase_jwt_secret: str = field(repr=False)
    audit_log_salt: str = field(repr=False)
    gemini_api_key: str | None = field(default=None, repr=False)
    environment: str = DEVELOPMENT
    gemini_model: str = DEFAULT_GEMINI_MODEL
    gemini_context_token_budget: int = 900
    gemini_circuit_breaker_failures: int = 3
    gemini_circuit_breaker_reset_seconds: int = 120
    backend_sentry_dsn: str | None = field(default=None, repr=False)
    backend_sentry_traces_sample_rate: float = 0.0
    takeaway_encryption_key: str | None = field(default=None, repr=False)
    access_cookie_name: str = "nexus-access-token"
    refresh_cookie_name: str = "nexus-refresh-token"
    access_cookie_max_age: int = 900
    refresh_cookie_max_age: int = DEFAULT_REFRESH_COOKIE_MAX_AGE
    cookie_domain: str | None = None
    cookie_secure: bool = False
    ai_rate_limit_requests: int = 10
    ai_rate_limit_window_seconds: int = 60
    auth_rate_limit_requests: int = 10
    auth_rate_limit_window_seconds: int = 60
    tasks_rate_limit_requests: int = 120
    tasks_rate_limit_window_seconds: int = 60
    password_reset_redirect_url: str | None = None
    # Often embeds a password (redis://:secret@host), so it is redacted too.
    redis_url: str | None = field(default=None, repr=False)
    trusted_proxy_ips: tuple[str, ...] = ()
    allowed_origins: tuple[str, ...] = ()
    allowed_hosts: tuple[str, ...] = ()
    # Conditionally required: needed when Google or Microsoft OAuth is enabled.
    # The email poller writes with it, which bypasses RLS.
    supabase_service_role_key: str = field(default="", repr=False)
    # Email OAuth is optional. The feature is disabled when the client IDs are empty.
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = field(default="", repr=False)
    microsoft_oauth_client_id: str = ""
    microsoft_oauth_client_secret: str = field(default="", repr=False)
    email_poll_interval_seconds: int = 60


# ── Raw environment helpers ───────────────────────────────────────────────────


def _get_env(name: str, default: str | None = None) -> str | None:
    """Return an environment variable with surrounding whitespace removed.

    Empty or whitespace-only values are treated as unset.
    """

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
    """Parse a boolean-like environment variable (1/true/yes/on)."""

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


def _range_text(minimum: float, maximum: float | None) -> str:
    if maximum is None:
        return f">= {minimum:g}"
    return f"between {minimum:g} and {maximum:g} (inclusive)"


def _check_range(
    name: str,
    value: float,
    minimum: float,
    maximum: float | None,
) -> None:
    too_low = value < minimum
    too_high = maximum is not None and value > maximum
    if too_low or too_high:
        raise ImproperlyConfiguredException(
            f"{name} must be {_range_text(minimum, maximum)}; got {value:g}."
        )


def _parse_int_env(
    name: str,
    default: int,
    *,
    minimum: int = 1,
    maximum: int | None = None,
) -> int:
    """Parse an integer env var, naming the variable on any error."""

    raw = _get_env(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ImproperlyConfiguredException(
            f"{name} must be an integer; got {raw!r}."
        ) from exc
    _check_range(name, value, minimum, maximum)
    return value


def _parse_float_env(
    name: str,
    default: float,
    *,
    minimum: float = 0.0,
    maximum: float | None = None,
) -> float:
    """Parse a finite float env var. NaN and infinity are rejected explicitly."""

    raw = _get_env(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ImproperlyConfiguredException(
            f"{name} must be a number; got {raw!r}."
        ) from exc
    if not math.isfinite(value):
        raise ImproperlyConfiguredException(
            f"{name} must be a finite number; got {raw!r}."
        )
    _check_range(name, value, minimum, maximum)
    return value


def _parse_trusted_proxy_env() -> tuple[str, ...]:
    """Parse TRUSTED_PROXY_IPS, failing at boot on any malformed entry.

    The runtime parser in ``auth_controller`` still drops bad entries with a
    warning as a defensive fallback, but a typo should stop the boot instead.
    """

    entries = _parse_csv_env("TRUSTED_PROXY_IPS", ())
    for entry in entries:
        try:
            ipaddress.ip_network(entry, strict=False)
        except ValueError as exc:
            raise ImproperlyConfiguredException(
                "TRUSTED_PROXY_IPS contains an invalid IP address or CIDR network: "
                f"{entry!r}."
            ) from exc
    return entries


# ── Origin and host helpers ───────────────────────────────────────────────────


def _validate_origin_syntax(origin: str) -> None:
    """Require each ALLOWED_ORIGINS entry to be a bare scheme://host[:port]."""

    def reject(reason: str) -> None:
        raise ImproperlyConfiguredException(
            f"ALLOWED_ORIGINS entry {origin!r} is invalid: {reason}. Use "
            "scheme://host[:port] with no path, query, fragment, userinfo or wildcard."
        )

    if "*" in origin:
        reject("wildcards are not supported; list each origin explicitly")
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"}:
        reject("scheme must be http or https")
    if not parsed.hostname:
        reject("the host is missing")
    try:
        parsed.port  # noqa: B018 - raises ValueError for out-of-range ports
    except ValueError:
        reject("the port is not a valid number")
    if parsed.username is not None or parsed.password is not None:
        reject("userinfo is not allowed")
    if parsed.path:
        reject("a path, including a trailing slash, is not allowed")
    if parsed.params or parsed.query or parsed.fragment:
        reject("params, query and fragment are not allowed")


def _is_loopback_host(hostname: str) -> bool:
    """Return True for localhost names and loopback or unspecified IP addresses."""

    host = hostname.lower()
    if host == "localhost" or host.endswith(".localhost"):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_unspecified


def _derive_allowed_hosts(
    origins: tuple[str, ...],
    *,
    include_loopback: bool = False,
) -> tuple[str, ...]:
    """Build the Host-header allowlist from configured origins.

    Loopback names are added only when ``include_loopback`` is True, which
    ``get_settings`` does only in development. A production instance must not
    accept ``Host: localhost``.
    """

    hosts: set[str] = {"localhost", "127.0.0.1"} if include_loopback else set()
    for origin in origins:
        hostname = urlparse(origin).hostname
        if hostname:
            hosts.add(hostname)
    return tuple(sorted(hosts))


# ── Environment resolution and validation ─────────────────────────────────────


def _resolve_environment() -> str:
    """Return the normalised APP_ENV value, or raise for an unknown name."""

    raw = _get_env("APP_ENV")
    if raw is None:
        logger.warning(
            "APP_ENV is not set; defaulting to 'development' with relaxed checks. "
            "Set APP_ENV explicitly in every deployed environment."
        )
        return DEVELOPMENT
    environment = raw.lower()
    if environment not in KNOWN_ENVIRONMENTS:
        raise ImproperlyConfiguredException(
            f"APP_ENV must be one of {', '.join(sorted(KNOWN_ENVIRONMENTS))}; "
            f"got {raw!r}."
        )
    return environment


def _validate_password_reset_url(url: str, strict: bool) -> None:
    """Check PASSWORD_RESET_REDIRECT_URL, the target of the reset link."""

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ImproperlyConfiguredException(
            "PASSWORD_RESET_REDIRECT_URL must be an absolute http(s) URL with a host."
        )
    if parsed.username is not None or parsed.password is not None:
        raise ImproperlyConfiguredException(
            "PASSWORD_RESET_REDIRECT_URL must not contain userinfo."
        )
    if strict:
        if parsed.scheme != "https":
            raise ImproperlyConfiguredException(
                "PASSWORD_RESET_REDIRECT_URL must use https in non-development "
                "environments."
            )
        if _is_loopback_host(parsed.hostname):
            raise ImproperlyConfiguredException(
                "PASSWORD_RESET_REDIRECT_URL must not point at a loopback host "
                "in non-development environments."
            )


def _validate_production(settings: BackendSettings) -> None:
    """Run the fail-closed checks that apply outside development."""

    if not settings.cookie_secure:
        raise ImproperlyConfiguredException(
            "COOKIE_SECURE must be True in non-development environments. "
            "Set COOKIE_SECURE=true (or APP_ENV=production) in your environment."
        )

    supabase = urlparse(settings.supabase_url)
    if supabase.scheme != "https" or not supabase.hostname:
        raise ImproperlyConfiguredException(
            "SUPABASE_URL must be an https URL with a host in non-development "
            "environments; it carries the JWKS fetch and service-role traffic."
        )

    if len(settings.audit_log_salt) < MIN_AUDIT_LOG_SALT_LENGTH:
        raise ImproperlyConfiguredException(
            "AUDIT_LOG_SALT must be at least "
            f"{MIN_AUDIT_LOG_SALT_LENGTH} characters in non-development environments."
        )

    if not settings.takeaway_encryption_key:
        raise ImproperlyConfiguredException(
            "TAKEAWAY_ENCRYPTION_KEY must be set in production — refusing to "
            "boot with plaintext field-level storage."
        )
    _validate_fernet_keys(settings.takeaway_encryption_key)

    _validate_production_origins(settings.allowed_origins)

    oauth_enabled = bool(
        settings.google_oauth_client_id or settings.microsoft_oauth_client_id
    )
    if oauth_enabled and not settings.supabase_service_role_key:
        raise ImproperlyConfiguredException(
            "SUPABASE_SERVICE_ROLE_KEY is required when Google or Microsoft OAuth "
            "is enabled; the email poller cannot write without it."
        )


def _validate_fernet_keys(raw: str) -> None:
    """Boot-time check that every TAKEAWAY_ENCRYPTION_KEY entry is a Fernet key.

    The value may hold several comma-separated keys, newest first, for rotation.
    This mirrors ``data_protection._parse_takeaway_keys`` (config cannot import
    data_protection without a cycle), so both sides split the value the same way.
    """

    keys = [part.strip() for part in raw.split(",") if part.strip()]
    if not keys:
        raise ImproperlyConfiguredException(
            "TAKEAWAY_ENCRYPTION_KEY must contain at least one Fernet key."
        )
    for key in keys:
        try:
            Fernet(key.encode("utf-8"))
        except (ValueError, TypeError) as exc:
            raise ImproperlyConfiguredException(
                "TAKEAWAY_ENCRYPTION_KEY must be a base64-encoded Fernet key, or "
                "several comma-separated keys (newest first). Generate one with: "
                "python -c 'from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())'"
            ) from exc


def _validate_production_origins(origins: tuple[str, ...]) -> None:
    """Reject empty, loopback, or non-https origin lists outside development."""

    if not origins:
        raise ImproperlyConfiguredException(
            "ALLOWED_ORIGINS must list the production origins in non-development "
            "environments."
        )
    for origin in origins:
        hostname = urlparse(origin).hostname or ""
        if _is_loopback_host(hostname):
            raise ImproperlyConfiguredException(
                "ALLOWED_ORIGINS must be set to production domains in "
                "non-development environments. "
                f"{origin!r} is a loopback origin, and credentialed CORS would "
                "accept it on the production API."
            )
        if urlparse(origin).scheme != "https":
            raise ImproperlyConfiguredException(
                f"ALLOWED_ORIGINS entry {origin!r} must use https in "
                "non-development environments."
            )


def _warn_development(settings: BackendSettings) -> None:
    """Log the development-only warnings that point at unsafe defaults."""

    if not settings.cookie_secure:
        logger.warning(
            "cookie_secure is False (development mode). "
            "Cookies will not be marked Secure."
        )
    if set(settings.allowed_origins) == set(DEFAULT_ALLOWED_ORIGINS):
        logger.warning(
            "ALLOWED_ORIGINS uses development defaults (localhost). "
            "Set ALLOWED_ORIGINS before deploying to production."
        )
    if not settings.supabase_service_role_key and (
        settings.google_oauth_client_id or settings.microsoft_oauth_client_id
    ):
        logger.warning(
            "OAuth client IDs are set but SUPABASE_SERVICE_ROLE_KEY is empty. "
            "The email poller will fail until the key is configured."
        )


def _validate_settings(settings: BackendSettings) -> None:
    """Apply environment-specific checks to fully built settings."""

    if settings.password_reset_redirect_url:
        _validate_password_reset_url(
            settings.password_reset_redirect_url,
            strict=settings.environment != DEVELOPMENT,
        )
        reset_host = urlparse(settings.password_reset_redirect_url).hostname or ""
        if reset_host not in settings.allowed_hosts:
            raise ImproperlyConfiguredException(
                f"PASSWORD_RESET_REDIRECT_URL host {reset_host!r} must be one of "
                "the hosts derived from ALLOWED_ORIGINS."
            )
    if settings.environment != DEVELOPMENT:
        _validate_production(settings)
    else:
        _warn_development(settings)


# ── Local .env overlay ────────────────────────────────────────────────────────


def _load_local_overrides(directory: Path) -> None:
    """Overlay ``<directory>/.env.local`` for local Supabase development only.

    The file is loaded with ``override=True`` so local Supabase values replace
    the ones in ``.env``. That override is limited to development. In any other
    environment the platform-injected values in ``os.environ`` must win, so the
    file is skipped. APP_ENV is read from the environment after ``.env`` has
    loaded, and unset means development, matching ``_resolve_environment``.
    """

    raw = (os.environ.get("APP_ENV") or "").strip().lower()
    if raw not in {"", DEVELOPMENT}:
        return
    local_file = directory / _LOCAL_ENV_FILE
    if local_file.is_file():
        load_dotenv(local_file, override=True)


_load_local_overrides(BACKEND_DIR)


# ── Public entry point ────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_settings() -> BackendSettings:
    """Load, validate and cache backend settings."""

    environment = _resolve_environment()
    allowed_origins = _parse_csv_env("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
    for origin in allowed_origins:
        _validate_origin_syntax(origin)

    cookie_default_secure = environment != DEVELOPMENT
    settings = BackendSettings(
        supabase_url=_require_env("SUPABASE_URL"),
        supabase_auth_key=_require_env("SUPABASE_AUTH_KEY"),
        supabase_jwt_secret=_require_env("SUPABASE_JWT_SECRET"),
        audit_log_salt=_require_env("AUDIT_LOG_SALT"),
        gemini_api_key=_get_env("GEMINI_API_KEY"),
        environment=environment,
        gemini_model=_get_env("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
        or DEFAULT_GEMINI_MODEL,
        gemini_context_token_budget=_parse_int_env("GEMINI_CONTEXT_TOKEN_BUDGET", 900),
        gemini_circuit_breaker_failures=_parse_int_env(
            "GEMINI_CIRCUIT_BREAKER_FAILURES", 3
        ),
        gemini_circuit_breaker_reset_seconds=_parse_int_env(
            "GEMINI_CIRCUIT_BREAKER_RESET_SECONDS", 120
        ),
        backend_sentry_dsn=_get_env("BACKEND_SENTRY_DSN"),
        backend_sentry_traces_sample_rate=_parse_float_env(
            "BACKEND_SENTRY_TRACES_SAMPLE_RATE",
            0.0,
            minimum=0.0,
            maximum=1.0,
        ),
        takeaway_encryption_key=_get_env("TAKEAWAY_ENCRYPTION_KEY"),
        access_cookie_name=_get_env("ACCESS_COOKIE_NAME", "nexus-access-token")
        or "nexus-access-token",
        refresh_cookie_name=_get_env("REFRESH_COOKIE_NAME", "nexus-refresh-token")
        or "nexus-refresh-token",
        access_cookie_max_age=_parse_int_env("ACCESS_COOKIE_MAX_AGE", 900),
        refresh_cookie_max_age=_parse_int_env(
            "REFRESH_COOKIE_MAX_AGE", DEFAULT_REFRESH_COOKIE_MAX_AGE
        ),
        cookie_domain=_get_env("COOKIE_DOMAIN"),
        cookie_secure=_parse_bool_env("COOKIE_SECURE", cookie_default_secure),
        ai_rate_limit_requests=_parse_int_env("AI_RATE_LIMIT_REQUESTS", 10),
        ai_rate_limit_window_seconds=_parse_int_env("AI_RATE_LIMIT_WINDOW_SECONDS", 60),
        auth_rate_limit_requests=_parse_int_env("AUTH_RATE_LIMIT_REQUESTS", 10),
        auth_rate_limit_window_seconds=_parse_int_env(
            "AUTH_RATE_LIMIT_WINDOW_SECONDS", 60
        ),
        tasks_rate_limit_requests=_parse_int_env("TASKS_RATE_LIMIT_REQUESTS", 120),
        tasks_rate_limit_window_seconds=_parse_int_env(
            "TASKS_RATE_LIMIT_WINDOW_SECONDS", 60
        ),
        password_reset_redirect_url=_get_env("PASSWORD_RESET_REDIRECT_URL"),
        redis_url=_get_env("REDIS_URL"),
        trusted_proxy_ips=_parse_trusted_proxy_env(),
        allowed_origins=allowed_origins,
        allowed_hosts=_derive_allowed_hosts(
            allowed_origins,
            include_loopback=environment == DEVELOPMENT,
        ),
        supabase_service_role_key=_get_env("SUPABASE_SERVICE_ROLE_KEY", "") or "",
        google_oauth_client_id=_get_env("GOOGLE_OAUTH_CLIENT_ID", "") or "",
        google_oauth_client_secret=_get_env("GOOGLE_OAUTH_CLIENT_SECRET", "") or "",
        microsoft_oauth_client_id=_get_env("MICROSOFT_OAUTH_CLIENT_ID", "") or "",
        microsoft_oauth_client_secret=_get_env("MICROSOFT_OAUTH_CLIENT_SECRET", "")
        or "",
        email_poll_interval_seconds=_parse_int_env(
            "EMAIL_POLL_INTERVAL_SECONDS", 60, minimum=10
        ),
    )

    _validate_settings(settings)
    return settings
