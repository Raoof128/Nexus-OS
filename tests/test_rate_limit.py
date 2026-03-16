"""Tests for security-sensitive rate limiting."""

import pytest
from litestar.exceptions import HTTPException

from backend.config import get_settings
from backend.rate_limit import (
    SlidingWindowRateLimiter,
    enforce_ai_rate_limit,
    reset_rate_limiters,
)


def test_rate_limiter_blocks_requests_after_limit() -> None:
    """The limiter should reject traffic once the request budget is exhausted."""

    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)

    limiter.enforce("user-1")
    limiter.enforce("user-1")

    with pytest.raises(HTTPException):
        limiter.enforce("user-1")


def test_ai_rate_limit_blocks_after_shared_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """AI-backed routes should share a single user quota."""

    get_settings.cache_clear()
    reset_rate_limiters()
    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "2")
    monkeypatch.setenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60")

    enforce_ai_rate_limit("user-1", "chat")
    enforce_ai_rate_limit("user-1", "suggest")

    with pytest.raises(HTTPException):
        enforce_ai_rate_limit("user-1", "chat")

    reset_rate_limiters()
    get_settings.cache_clear()
