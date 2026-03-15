"""Tests for security-sensitive rate limiting."""

import pytest
from litestar.exceptions import HTTPException

from backend.rate_limit import SlidingWindowRateLimiter


def test_rate_limiter_blocks_requests_after_limit() -> None:
    """The limiter should reject traffic once the request budget is exhausted."""

    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)

    limiter.enforce("user-1")
    limiter.enforce("user-1")

    with pytest.raises(HTTPException):
        limiter.enforce("user-1")
