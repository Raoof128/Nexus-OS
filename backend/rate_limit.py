"""Sliding-window rate limiting for sensitive endpoints.

Two backends share one interface:

* ``enforce(key)`` checks and records in one step. Every other caller uses it.
* ``check(key)`` raises 429 when the window is full and records nothing.
* ``record(key)`` adds a hit and never raises. Use it after a failure is known,
  so only that failure uses budget.

Two backends implement the interface:

* ``RedisSlidingWindowRateLimiter`` when ``REDIS_URL`` is set. The check and the
  record happen in one Lua script, so limits hold across app instances.
* ``SlidingWindowRateLimiter`` otherwise. It is per process. It is also the
  fallback the Redis limiter uses while Redis is unreachable.

Every rejection raises ``HTTPException(429)`` with a ``Retry-After`` header that
gives the number of whole seconds until the oldest request in the window
expires.

Sync ``enforce_*_rate_limit`` functions are kept for code that already runs in
a worker thread. Async handlers should use the ``*_async`` variants, which move
blocking Redis round trips off the event loop.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock
from time import monotonic, time
from typing import Any, Final, Protocol
from uuid import uuid4

from anyio import to_thread
from litestar.exceptions import HTTPException
from redis import Redis
from redis.backoff import NoBackoff
from redis.exceptions import RedisError
from redis.retry import Retry

try:
    from .audit_logger import log_audit_event
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from audit_logger import log_audit_event
    from config import get_settings

logger = logging.getLogger(__name__)

RATE_LIMIT_DETAIL: Final[str] = "Rate limit exceeded. Try again later."

# Short timeouts so a stalled Redis fails fast and the request falls back to the
# in-memory limiter. One retry covers a single dropped connection.
REDIS_SOCKET_TIMEOUT_SECONDS: Final[float] = 1.0
REDIS_CONNECT_TIMEOUT_SECONDS: Final[float] = 1.0
REDIS_RETRIES: Final[int] = 1

AI_RATE_LIMIT_EVENT: Final[str] = "ai.rate_limited"


def _rate_limited(retry_after_seconds: int | float) -> HTTPException:
    """Build the 429 response with a whole-second ``Retry-After`` value."""

    return HTTPException(
        status_code=429,
        detail=RATE_LIMIT_DETAIL,
        headers={"Retry-After": str(max(1, math.ceil(retry_after_seconds)))},
    )


class RateLimiter(Protocol):
    """Anything that can record a request for ``key`` or raise HTTP 429."""

    def enforce(self, key: str) -> None: ...

    def check(self, key: str) -> None: ...

    def record(self, key: str) -> None: ...


def _prune(entries: deque[float], window_start: float) -> None:
    while entries and entries[0] < window_start:
        entries.popleft()


class SlidingWindowRateLimiter:
    """Track requests in process memory over a sliding time window."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._entries: dict[str, deque[float]] = defaultdict(deque)
        self._last_sweep = float("-inf")
        # threading.Lock is intentional: hold time is sub-microsecond (deque ops
        # only). asyncio.Lock would add coroutine scheduling overhead that
        # exceeds the critical section.
        self._lock = Lock()

    def _sweep_stale_keys(self, now: float) -> None:
        """Drop keys whose recorded requests have all left the window.

        Runs at most once per window. Keys include caller-controlled input (for
        example the email in the auth key), so stale keys must be evicted or the
        map grows without bound. Sweeping once per window keeps the O(n) scan
        out of the per-request path.
        """

        if now - self._last_sweep < self.window_seconds:
            return
        self._last_sweep = now
        window_start = now - self.window_seconds
        stale = [
            key
            for key, entries in self._entries.items()
            if not entries or entries[-1] < window_start
        ]
        for key in stale:
            del self._entries[key]

    def _admit(self, key: str, *, record: bool) -> None:
        """Raise 429 when the window is full; append a hit only when ``record``."""

        now = monotonic()
        window_start = now - self.window_seconds

        with self._lock:
            self._sweep_stale_keys(now)
            entries = self._entries[key]
            _prune(entries, window_start)

            if len(entries) >= self.max_requests:
                oldest = entries[0] if entries else now
                raise _rate_limited(oldest + self.window_seconds - now)

            if record:
                entries.append(now)

    def enforce(self, key: str) -> None:
        """Raise HTTP 429 when ``key`` has used its budget for the window."""

        self._admit(key, record=True)

    def check(self, key: str) -> None:
        """Raise HTTP 429 when the window is full. Never records a hit."""

        self._admit(key, record=False)

    def record(self, key: str) -> None:
        """Add a hit for ``key`` without checking the budget."""

        now = monotonic()
        window_start = now - self.window_seconds
        with self._lock:
            self._sweep_stale_keys(now)
            entries = self._entries[key]
            _prune(entries, window_start)
            entries.append(now)


# One script serves all three modes so the check and the record for one key use
# the same window arithmetic and the same key layout as the in-memory limiter.
# ARGV[5] is a unique member per recorded hit. Using tostring(now) would
# collapse two requests whose timestamps round to the same value in Lua's
# number formatting, so the ZSET would undercount.
# ARGV[6] is the mode: "enforce" checks then records, "check" only checks,
# "record" only records and never rejects.
# Returns 0 when accepted or recorded. Returns the whole number of seconds
# until the oldest request in the window expires when a check is rejected.
_LUA_SLIDING_WINDOW = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local window_seconds = tonumber(ARGV[4])
local member = ARGV[5]
local mode = ARGV[6]

redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
if mode ~= 'record' then
    local current = redis.call('ZCARD', key)
    if current >= max_requests then
        local retry_after = window_seconds
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        if oldest[2] then
            retry_after = math.ceil(tonumber(oldest[2]) + window_seconds - now)
        end
        if retry_after < 1 then
            retry_after = 1
        end
        return retry_after
    end
end
if mode ~= 'check' then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, window_seconds)
end
return 0
"""

_MODE_ENFORCE: Final[str] = "enforce"
_MODE_CHECK: Final[str] = "check"
_MODE_RECORD: Final[str] = "record"


class RedisSlidingWindowRateLimiter:
    """Track requests in Redis so limits hold across multiple app instances."""

    def __init__(
        self,
        redis_client: Redis,
        max_requests: int,
        window_seconds: int,
    ) -> None:
        self.redis_client = redis_client
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # register_script caches the script by SHA and sends EVALSHA on each
        # call. Only the first call, or a call after a server restart, sends
        # the script body.
        self._script = redis_client.register_script(_LUA_SLIDING_WINDOW)
        # Per-instance fallback so one Redis outage doesn't pin the process
        # into either fail-open or fail-closed for the remainder of its life.
        self._fallback = SlidingWindowRateLimiter(max_requests, window_seconds)
        # Only gates log output. A benign race between threads at worst logs
        # one extra line, and the limit decision never reads this flag.
        self._degraded = False

    def _run(
        self,
        key: str,
        mode: str,
        fallback: Callable[[str], None],
    ) -> None:
        """Run the script in ``mode``, or the matching in-memory call on outage."""

        now = time()
        window_start = now - self.window_seconds
        redis_key = f"rate-limit:{key}"
        member = uuid4().hex
        try:
            retry_after = self._script(
                keys=[redis_key],
                args=[
                    now,
                    window_start,
                    self.max_requests,
                    self.window_seconds,
                    member,
                    mode,
                ],
            )
        except RedisError as exc:
            self._log_degraded(exc)
            fallback(key)
            return

        self._log_recovered()
        if retry_after and mode != _MODE_RECORD:
            raise _rate_limited(int(retry_after))

    def enforce(self, key: str) -> None:
        """Atomically check and record a request, rejecting over-limit traffic."""

        self._run(key, _MODE_ENFORCE, self._fallback.enforce)

    def check(self, key: str) -> None:
        """Raise 429 when the window is full. Never records a hit."""

        self._run(key, _MODE_CHECK, self._fallback.check)

    def record(self, key: str) -> None:
        """Add a hit for ``key``. Never raises for a full window."""

        self._run(key, _MODE_RECORD, self._fallback.record)

    def _log_degraded(self, exc: RedisError) -> None:
        """Log the first outage with a traceback, then only type and message."""

        if not self._degraded:
            self._degraded = True
            logger.warning(
                "Redis rate-limit backend unavailable; using in-memory fallback",
                exc_info=True,
            )
            return
        logger.debug(
            "Redis rate-limit backend still unavailable (%s)",
            type(exc).__name__,
        )

    def _log_recovered(self) -> None:
        if self._degraded:
            self._degraded = False
            logger.info("Redis rate-limit backend recovered")


_init_lock: Final[Lock] = Lock()
_ai_rate_limiter: RateLimiter | None = None
_auth_rate_limiter: RateLimiter | None = None
_tasks_rate_limiter: RateLimiter | None = None
_notes_rate_limiter: RateLimiter | None = None


def _create_rate_limiter(max_requests: int, window_seconds: int) -> RateLimiter:
    """Create a Redis-backed limiter when REDIS_URL is set, else in-memory."""

    redis_url = get_settings().redis_url
    if not redis_url:
        logger.warning(
            "In-memory rate limiter active — not shared across workers. "
            "Set REDIS_URL for production."
        )
        return SlidingWindowRateLimiter(
            max_requests=max_requests,
            window_seconds=window_seconds,
        )
    try:
        client = Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
            socket_connect_timeout=REDIS_CONNECT_TIMEOUT_SECONDS,
            retry=Retry(NoBackoff(), retries=REDIS_RETRIES),
        )
    except RedisError as exc:  # pragma: no cover - external dependency failure
        raise HTTPException(
            status_code=503,
            detail="Rate limiting backend unavailable",
        ) from exc
    return RedisSlidingWindowRateLimiter(
        redis_client=client,
        max_requests=max_requests,
        window_seconds=window_seconds,
    )


def _get_or_create(
    current: RateLimiter | None,
    factory: Callable[[], RateLimiter],
) -> RateLimiter:
    """Double-checked lazy construction shared by the three limiter slots."""

    if current is not None:
        return current
    with _init_lock:
        if current is None:
            current = factory()
    return current


def _ai_limiter() -> RateLimiter:
    global _ai_rate_limiter
    _ai_rate_limiter = _get_or_create(
        _ai_rate_limiter,
        lambda: _create_rate_limiter(
            max_requests=get_settings().ai_rate_limit_requests,
            window_seconds=get_settings().ai_rate_limit_window_seconds,
        ),
    )
    return _ai_rate_limiter


def _auth_limiter() -> RateLimiter:
    global _auth_rate_limiter
    _auth_rate_limiter = _get_or_create(
        _auth_rate_limiter,
        lambda: _create_rate_limiter(
            max_requests=get_settings().auth_rate_limit_requests,
            window_seconds=get_settings().auth_rate_limit_window_seconds,
        ),
    )
    return _auth_rate_limiter


def _tasks_limiter() -> RateLimiter:
    global _tasks_rate_limiter
    _tasks_rate_limiter = _get_or_create(
        _tasks_rate_limiter,
        lambda: _create_rate_limiter(
            max_requests=get_settings().tasks_rate_limit_requests,
            window_seconds=get_settings().tasks_rate_limit_window_seconds,
        ),
    )
    return _tasks_rate_limiter


def _notes_limiter() -> RateLimiter:
    global _notes_rate_limiter
    _notes_rate_limiter = _get_or_create(
        _notes_rate_limiter,
        lambda: _create_rate_limiter(
            max_requests=get_settings().notes_rate_limit_requests,
            window_seconds=get_settings().notes_rate_limit_window_seconds,
        ),
    )
    return _notes_rate_limiter


# Named budgets with their own settings pair. They are built on first use and
# cleared by reset_rate_limiters(), like the fixed slots above.
_budget_limiters: dict[str, RateLimiter] = {}


def _budget_limiter(name: str, budget: Callable[[Any], tuple[int, int]]) -> RateLimiter:
    """Return the limiter for a named budget, building it on first use.

    ``budget`` maps the settings object to ``(max_requests, window_seconds)``.
    """

    limiter = _budget_limiters.get(name)
    if limiter is not None:
        return limiter
    with _init_lock:
        limiter = _budget_limiters.get(name)
        if limiter is None:
            max_requests, window_seconds = budget(get_settings())
            limiter = _create_rate_limiter(max_requests, window_seconds)
            _budget_limiters[name] = limiter
    return limiter


def enforce_notes_rate_limit(user_id: str) -> None:
    """Apply the per-user limit to Notes API requests. Blocking."""

    _notes_limiter().enforce(f"notes:{user_id}")


def _enforce_ai(user_id: str, feature: str, limiter: RateLimiter) -> None:
    try:
        limiter.enforce(f"ai:{user_id}")
    except HTTPException:
        # Audit the rejection without the raw user id. The log module hashes
        # the id with the configured salt.
        log_audit_event(AI_RATE_LIMIT_EVENT, user_id, {"feature": feature})
        raise


def enforce_ai_rate_limit(user_id: str, feature: str) -> None:
    """Apply the shared per-user AI quota. Blocking, so call it from a thread."""

    # A single per-user quota prevents a caller from bypassing limits by
    # alternating between AI-backed endpoints. ``feature`` is for the audit
    # trail only and does not change the quota.
    _enforce_ai(user_id, feature, _ai_limiter())


def enforce_auth_rate_limit(key: str) -> None:
    """Apply the configured rate limit to authentication endpoints. Blocking."""

    _auth_limiter().enforce(f"auth:{key}")


def enforce_tasks_rate_limit(user_id: str) -> None:
    """Apply a generous per-user limit to task mutations. Blocking.

    Separate from the AI limiter: routine task editing is far more frequent than
    AI calls, so it gets its own, much higher ceiling.
    """

    _tasks_limiter().enforce(f"tasks:{user_id}")


async def _run_enforce(limiter: RateLimiter, call: Callable[[], Any]) -> None:
    """Run ``call`` without blocking the loop when the limiter does I/O.

    The in-memory path holds a lock for a few deque operations, so it runs
    inline. The Redis path makes a network round trip, so it runs in anyio's
    worker thread pool.
    """

    if isinstance(limiter, RedisSlidingWindowRateLimiter):
        await to_thread.run_sync(call)
    else:
        call()


async def enforce_ai_rate_limit_async(user_id: str, feature: str) -> None:
    """Async variant of ``enforce_ai_rate_limit`` for request handlers."""

    limiter = _ai_limiter()
    await _run_enforce(limiter, lambda: _enforce_ai(user_id, feature, limiter))


async def enforce_auth_rate_limit_async(key: str) -> None:
    """Async variant of ``enforce_auth_rate_limit`` for request handlers."""

    limiter = _auth_limiter()
    await _run_enforce(limiter, lambda: limiter.enforce(f"auth:{key}"))


async def enforce_tasks_rate_limit_async(user_id: str) -> None:
    """Async variant of ``enforce_tasks_rate_limit`` for request handlers."""

    limiter = _tasks_limiter()
    await _run_enforce(limiter, lambda: limiter.enforce(f"tasks:{user_id}"))


def _auth_account_limiter() -> RateLimiter:
    return _budget_limiter(
        "auth-account",
        lambda s: (
            s.auth_account_rate_limit_requests,
            s.auth_account_rate_limit_window_seconds,
        ),
    )


async def check_auth_account_rate_limit_async(account_digest: str) -> None:
    """Refuse a login for one account once its failure budget is spent.

    Runs before the upstream call and records nothing, so successful sign-ins
    (including lock-screen unlocks) never use the budget. The login handler
    calls ``record_auth_account_failure_async`` only after the credentials are
    rejected.

    Keyed by the account digest only, never the IP, so rotating addresses
    cannot multiply the guesses allowed against one account. Failures from any
    address count toward the same budget. The cost is that anyone who knows an
    address can send wrong passwords to lock the owner out for the window. The
    owner's correct password is refused too until the window clears. Concurrent
    failures can overshoot the budget by the number of in-flight requests,
    because the check and the record are separate calls.
    """

    limiter = _auth_account_limiter()
    await _run_enforce(limiter, lambda: limiter.check(f"auth-account:{account_digest}"))


async def record_auth_account_failure_async(account_digest: str) -> None:
    """Count one failed credential attempt against the account budget."""

    limiter = _auth_account_limiter()
    await _run_enforce(
        limiter, lambda: limiter.record(f"auth-account:{account_digest}")
    )


async def enforce_refresh_session_rate_limit_async(token_digest: str) -> None:
    """Budget ``/auth/refresh`` per refresh session, keyed by a token digest.

    The key is the digest of the refresh cookie, so NAT users each get their
    own budget. A successful refresh rotates the token, which moves the session
    to a new key. The per-IP ceiling (below) remains the backstop against
    cycling through junk cookie values.
    """

    limiter = _budget_limiter(
        "refresh-session",
        lambda s: (
            s.refresh_session_rate_limit_requests,
            s.refresh_session_rate_limit_window_seconds,
        ),
    )
    await _run_enforce(
        limiter, lambda: limiter.enforce(f"refresh-session:{token_digest}")
    )


async def enforce_refresh_ip_rate_limit_async(client_ip: str) -> None:
    """Ceiling on ``/auth/refresh`` per source IP, applied to every request."""

    limiter = _budget_limiter(
        "refresh-ip",
        lambda s: (
            s.refresh_ip_rate_limit_requests,
            s.refresh_ip_rate_limit_window_seconds,
        ),
    )
    await _run_enforce(limiter, lambda: limiter.enforce(f"refresh-ip:{client_ip}"))


async def enforce_email_send_rate_limit_async(user_id: str) -> None:
    """Cap outbound mail per user across send, reply and forward."""

    limiter = _budget_limiter(
        "email-send",
        lambda s: (
            s.email_send_rate_limit_requests,
            s.email_send_rate_limit_window_seconds,
        ),
    )
    await _run_enforce(limiter, lambda: limiter.enforce(f"email-send:{user_id}"))


def reset_rate_limiters() -> None:
    """Reset cached limiter instances so each test starts from empty state."""

    global _ai_rate_limiter, _auth_rate_limiter, _tasks_rate_limiter
    global _notes_rate_limiter
    with _init_lock:
        _ai_rate_limiter = None
        _auth_rate_limiter = None
        _tasks_rate_limiter = None
        _notes_rate_limiter = None
        _budget_limiters.clear()


__all__ = [
    "RATE_LIMIT_DETAIL",
    "RateLimiter",
    "RedisSlidingWindowRateLimiter",
    "SlidingWindowRateLimiter",
    "enforce_ai_rate_limit",
    "enforce_ai_rate_limit_async",
    "check_auth_account_rate_limit_async",
    "enforce_auth_rate_limit",
    "enforce_auth_rate_limit_async",
    "enforce_email_send_rate_limit_async",
    "enforce_notes_rate_limit",
    "enforce_refresh_ip_rate_limit_async",
    "enforce_refresh_session_rate_limit_async",
    "enforce_tasks_rate_limit",
    "enforce_tasks_rate_limit_async",
    "record_auth_account_failure_async",
    "reset_rate_limiters",
]
