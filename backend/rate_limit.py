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
        # threading.Lock is intentional: hold time is sub-microsecond (deque ops
        # only).  asyncio.Lock would add coroutine scheduling overhead that
        # exceeds the critical section.
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


# Lua script for atomic check-then-add so rejected requests never consume a
# rate-limit slot.  Runs inside Redis as a single transaction.
_LUA_SLIDING_WINDOW = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local window_seconds = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
local current = redis.call('ZCARD', key)
if current >= max_requests then
    return 1
end
redis.call('ZADD', key, now, tostring(now))
redis.call('EXPIRE', key, window_seconds)
return 0
"""


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
        """Atomically check and record a request, rejecting over-limit traffic."""

        now = time()
        window_start = now - self.window_seconds
        redis_key = f"rate-limit:{key}"
        blocked = self.redis_client.eval(
            _LUA_SLIDING_WINDOW,
            1,
            redis_key,
            now,
            window_start,
            self.max_requests,
            self.window_seconds,
        )
        if blocked:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Try again later.",
            )


RateLimiter = SlidingWindowRateLimiter | RedisSlidingWindowRateLimiter

_ai_rate_limiter: RateLimiter | None = None
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


def enforce_ai_rate_limit(user_id: str, _feature: str) -> None:
    """Apply a shared AI usage limit across Gemini-backed features."""

    global _ai_rate_limiter
    settings = get_settings()
    if _ai_rate_limiter is None:
        _ai_rate_limiter = _create_rate_limiter(
            max_requests=settings.ai_rate_limit_requests,
            window_seconds=settings.ai_rate_limit_window_seconds,
        )
    # A single per-user quota prevents a caller from bypassing limits by
    # alternating between AI-backed endpoints.
    _ai_rate_limiter.enforce(f"ai:{user_id}")


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


def reset_rate_limiters() -> None:
    """Reset cached rate limiter instances for isolated tests."""

    global _ai_rate_limiter, _suggest_rate_limiter, _auth_rate_limiter
    _ai_rate_limiter = None
    _suggest_rate_limiter = None
    _auth_rate_limiter = None
