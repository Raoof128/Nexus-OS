"""Configuration helpers for backend services."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv
from litestar.exceptions import ImproperlyConfiguredException

load_dotenv()


@dataclass(frozen=True)
class BackendSettings:
    """Required environment configuration for the backend."""

    supabase_url: str
    supabase_key: str
    supabase_jwt_secret: str
    gemini_api_key: str | None = None


def _require_env(name: str) -> str:
    """Return a required environment variable or raise a clear config error."""

    value = os.getenv(name)
    if not value:
        raise ImproperlyConfiguredException(
            f"Missing required environment variable: {name}"
        )
    return value


@lru_cache(maxsize=1)
def get_settings() -> BackendSettings:
    """Load and cache backend settings."""

    return BackendSettings(
        supabase_url=_require_env("SUPABASE_URL"),
        supabase_key=_require_env("SUPABASE_KEY"),
        supabase_jwt_secret=_require_env("SUPABASE_JWT_SECRET"),
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
    )
