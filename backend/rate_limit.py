"""Simple in-memory rate limiting for sensitive endpoints."""

from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic, time

from litestar.exceptions import HTTPException
from redis import Redis
from redis.exceptions import RedisError

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
                    detail="Rate limit exceeded. Try again later.",
                )

            entries.append(now)


class RedisSlidingWindowRateLimiter:
    """Track requests in Redis so rate limits survive multiple app instances."""

    def __init__(
        self,
        redis_client: Redis,
        max_requests: int,
        window_seconds: int,
    ) -> None:
        self.redis_client = redis_client
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    def enforce(self, key: str) -> None:
        now = time()
        window_start = now - self.window_seconds
        redis_key = f"rate-limit:{key}"
        pipeline = self.redis_client.pipeline()
        pipeline.zremrangebyscore(redis_key, 0, window_start)
        pipeline.zcard(redis_key)
        pipeline.zadd(redis_key, {f"{now:.6f}": now})
        pipeline.expire(redis_key, self.window_seconds)
        _, current_count, _, _ = pipeline.execute()
        if current_count >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Try again later.",
            )


RateLimiter = SlidingWindowRateLimiter | RedisSlidingWindowRateLimiter

_suggest_rate_limiter: RateLimiter | None = None
_auth_rate_limiter: RateLimiter | None = None


def _create_rate_limiter(max_requests: int, window_seconds: int) -> RateLimiter:
    """Create a distributed limiter when Redis is configured, else local memory."""

    redis_url = get_settings().redis_url
    if redis_url:
        try:
            return RedisSlidingWindowRateLimiter(
                redis_client=Redis.from_url(redis_url, decode_responses=True),
                max_requests=max_requests,
                window_seconds=window_seconds,
            )
        except RedisError as exc:  # pragma: no cover - external dependency failure
            raise HTTPException(
                status_code=503,
                detail="Rate limiting backend unavailable",
            ) from exc
    return SlidingWindowRateLimiter(
        max_requests=max_requests,
        window_seconds=window_seconds,
    )


def enforce_suggest_rate_limit(user_id: str) -> None:
    """Apply the configured rate limit to AI suggestion requests."""

    global _suggest_rate_limiter
    settings = get_settings()
    if _suggest_rate_limiter is None:
        _suggest_rate_limiter = _create_rate_limiter(
            max_requests=settings.suggest_rate_limit_requests,
            window_seconds=settings.suggest_rate_limit_window_seconds,
        )
    _suggest_rate_limiter.enforce(f"suggest:{user_id}")


def enforce_auth_rate_limit(key: str) -> None:
    """Apply the configured rate limit to authentication endpoints."""

    global _auth_rate_limiter
    settings = get_settings()
    if _auth_rate_limiter is None:
        _auth_rate_limiter = _create_rate_limiter(
            max_requests=settings.auth_rate_limit_requests,
            window_seconds=settings.auth_rate_limit_window_seconds,
        )
    _auth_rate_limiter.enforce(f"auth:{key}")
