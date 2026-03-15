"""Simple in-memory rate limiting for sensitive endpoints."""

from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from litestar.exceptions import HTTPException

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings


class SlidingWindowRateLimiter:
    """Track requests in-memory over a sliding time window."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._entries: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def enforce(self, key: str) -> None:
        """Raise when a key exceeds the allowed request budget."""

        now = monotonic()
        window_start = now - self.window_seconds

        with self._lock:
            entries = self._entries[key]
            while entries and entries[0] < window_start:
                entries.popleft()

            if len(entries) >= self.max_requests:
                raise HTTPException(
                    status_code=429,
                    detail="Suggestion rate limit exceeded. Try again in a minute.",
                )

            entries.append(now)


_rate_limiter: SlidingWindowRateLimiter | None = None


def enforce_suggest_rate_limit(user_id: str) -> None:
    """Apply the configured rate limit to AI suggestion requests."""

    global _rate_limiter
    settings = get_settings()
    if _rate_limiter is None:
        _rate_limiter = SlidingWindowRateLimiter(
            max_requests=settings.suggest_rate_limit_requests,
            window_seconds=settings.suggest_rate_limit_window_seconds,
        )
    _rate_limiter.enforce(f"suggest:{user_id}")
