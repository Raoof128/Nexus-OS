"""Tests for security-sensitive rate limiting.

Most tests run on the in-memory path. REDIS_URL is cleared for each test so a
developer's local environment cannot switch the backend. The Redis path is
covered with a fake client that records the script call, plus one integration
test that runs only when TEST_REDIS_URL points at a real server.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time as time_module
from collections import deque
from collections.abc import Iterator
from typing import Any

import pytest
from litestar.exceptions import HTTPException
from redis.exceptions import ConnectionError as RedisConnectionError

import backend.rate_limit as rate_limit
from backend.config import get_settings
from backend.rate_limit import (
    RedisSlidingWindowRateLimiter,
    SlidingWindowRateLimiter,
    enforce_ai_rate_limit,
    enforce_ai_rate_limit_async,
    enforce_auth_rate_limit,
    enforce_tasks_rate_limit,
    reset_rate_limiters,
)

TEST_REDIS_URL = os.getenv("TEST_REDIS_URL", "")


@pytest.fixture(autouse=True)
def _isolated_limiters(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Pin the in-memory backend and clear limiter globals around each test."""

    monkeypatch.setenv("REDIS_URL", "")
    get_settings.cache_clear()
    reset_rate_limiters()
    yield
    reset_rate_limiters()
    get_settings.cache_clear()


class _FakeScript:
    """Stands in for redis-py's Script. Each call pops one scripted outcome."""

    def __init__(self, outcomes: list[Any]) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []
        self.delay_seconds = 0.0

    def __call__(self, keys: list[str], args: list[Any]) -> int:
        self.calls.append({"keys": list(keys), "args": list(args)})
        if self.delay_seconds:
            time_module.sleep(self.delay_seconds)
        outcome = self.outcomes.pop(0) if self.outcomes else 0
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class _FakeRedis:
    """Minimal client exposing ``register_script`` as redis-py does."""

    def __init__(self, script: _FakeScript) -> None:
        self.script = script
        self.registered: list[str] = []

    def register_script(self, source: str) -> _FakeScript:
        self.registered.append(source)
        return self.script


def _redis_limiter(
    outcomes: list[Any],
    max_requests: int = 2,
    window_seconds: int = 60,
) -> tuple[RedisSlidingWindowRateLimiter, _FakeScript]:
    script = _FakeScript(outcomes)
    limiter = RedisSlidingWindowRateLimiter(
        redis_client=_FakeRedis(script),  # type: ignore[arg-type]
        max_requests=max_requests,
        window_seconds=window_seconds,
    )
    return limiter, script


def test_rate_limiter_blocks_requests_after_limit() -> None:
    """The limiter should reject traffic once the request budget is exhausted."""

    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)

    limiter.enforce("user-1")
    limiter.enforce("user-1")

    with pytest.raises(HTTPException) as exc_info:
        limiter.enforce("user-1")
    assert exc_info.value.status_code == 429


def test_rejected_request_sets_retry_after_to_oldest_expiry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Retry-After is the wait until the oldest request leaves the window."""

    clock = {"now": 100.0}
    monkeypatch.setattr(rate_limit, "monotonic", lambda: clock["now"])
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)

    limiter.enforce("user-1")
    clock["now"] = 100.5
    limiter.enforce("user-1")
    clock["now"] = 101.0

    with pytest.raises(HTTPException) as exc_info:
        limiter.enforce("user-1")

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers == {"Retry-After": "59"}


def test_window_expiry_readmits_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Once requests age out of the window the key is allowed again."""

    clock = {"now": 0.0}
    monkeypatch.setattr(rate_limit, "monotonic", lambda: clock["now"])
    limiter = SlidingWindowRateLimiter(max_requests=1, window_seconds=60)

    limiter.enforce("user-1")
    with pytest.raises(HTTPException):
        limiter.enforce("user-1")

    clock["now"] = 60.5
    limiter.enforce("user-1")


def test_limits_are_tracked_per_key() -> None:
    """Exhausting one key must not affect another."""

    limiter = SlidingWindowRateLimiter(max_requests=1, window_seconds=60)

    limiter.enforce("user-1")
    limiter.enforce("user-2")

    with pytest.raises(HTTPException):
        limiter.enforce("user-1")


def test_stale_keys_are_swept_at_most_once_per_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Stale keys are evicted on the first call after a window, not every call."""

    clock = {"now": 0.0}
    monkeypatch.setattr(rate_limit, "monotonic", lambda: clock["now"])
    limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=60)

    # The first call sweeps immediately and starts the window clock at t=0.
    limiter.enforce("live")
    limiter._entries["stale-a"] = deque([0.0])

    clock["now"] = 30.0
    limiter.enforce("live")
    assert "stale-a" in limiter._entries  # inside the same window: no sweep

    clock["now"] = 60.5
    limiter.enforce("live")
    assert "stale-a" not in limiter._entries  # window elapsed: swept

    limiter._entries["stale-b"] = deque([60.5])
    clock["now"] = 120.0
    limiter.enforce("live")
    assert "stale-b" in limiter._entries  # 59.5s since last sweep: no sweep

    clock["now"] = 121.0
    limiter.enforce("live")
    assert "stale-b" not in limiter._entries  # next window: swept


def test_ai_rate_limit_blocks_after_shared_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """AI-backed routes should share a single user quota."""

    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "2")
    monkeypatch.setenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60")

    enforce_ai_rate_limit("user-1", "chat")
    enforce_ai_rate_limit("user-1", "suggest")

    with pytest.raises(HTTPException) as exc_info:
        enforce_ai_rate_limit("user-1", "chat")
    assert exc_info.value.status_code == 429


def test_ai_rate_limit_rejection_is_audited_without_raw_user_id(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A rejection emits one audit record with a hashed user id only."""

    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "1")
    monkeypatch.setenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60")
    enforce_ai_rate_limit("user-secret-42", "email_draft")

    with caplog.at_level(logging.INFO, logger="nexus.audit"):
        with pytest.raises(HTTPException):
            enforce_ai_rate_limit("user-secret-42", "email_draft")

    records = [
        r
        for r in caplog.records
        if r.name == "nexus.audit" and r.levelno == logging.INFO
    ]
    assert len(records) == 1
    assert "ai.rate_limited" in records[0].getMessage()
    message = records[0].getMessage()
    assert "user_hash" in message
    assert "user-secret-42" not in message


def test_auth_and_tasks_limiters_are_independent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exhausting the auth budget must not block task mutations."""

    monkeypatch.setenv("AUTH_RATE_LIMIT_REQUESTS", "1")
    monkeypatch.setenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "60")
    monkeypatch.setenv("TASKS_RATE_LIMIT_REQUESTS", "1")
    monkeypatch.setenv("TASKS_RATE_LIMIT_WINDOW_SECONDS", "60")

    enforce_auth_rate_limit("login:203.0.113.5")
    with pytest.raises(HTTPException):
        enforce_auth_rate_limit("login:203.0.113.5")

    enforce_tasks_rate_limit("user-1")
    with pytest.raises(HTTPException):
        enforce_tasks_rate_limit("user-1")


def test_reset_rate_limiters_clears_blocked_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """After a reset the previously blocked key is allowed again."""

    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "1")
    monkeypatch.setenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60")
    enforce_ai_rate_limit("user-1", "chat")
    with pytest.raises(HTTPException):
        enforce_ai_rate_limit("user-1", "chat")

    reset_rate_limiters()

    enforce_ai_rate_limit("user-1", "chat")


def test_redis_limiter_registers_script_once_and_passes_unique_members() -> None:
    """The script is registered at construction and each accept has its own member."""

    limiter, script = _redis_limiter([0, 0])

    assert len(limiter.redis_client.registered) == 1  # type: ignore[attr-defined]
    limiter.enforce("ai:user-1")
    limiter.enforce("ai:user-1")

    first, second = script.calls
    assert first["keys"] == ["rate-limit:ai:user-1"]
    assert first["args"][4] != second["args"][4]


def test_redis_limiter_reports_retry_after_from_script() -> None:
    """A script rejection becomes a 429 carrying the script's retry value."""

    limiter, _ = _redis_limiter([0, 37])
    limiter.enforce("auth:key")

    with pytest.raises(HTTPException) as exc_info:
        limiter.enforce("auth:key")

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers == {"Retry-After": "37"}


def test_redis_error_falls_back_to_in_memory_limit() -> None:
    """A Redis outage still enforces the limit through the in-memory fallback."""

    limiter, _ = _redis_limiter(
        [RedisConnectionError("down")] * 3,
        max_requests=2,
    )

    limiter.enforce("ai:user-1")
    limiter.enforce("ai:user-1")
    with pytest.raises(HTTPException) as exc_info:
        limiter.enforce("ai:user-1")

    assert exc_info.value.status_code == 429


def test_redis_outage_logs_once_then_recovery_logs_once(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """One warning per outage, debug for repeats, one info on recovery."""

    failures = [RedisConnectionError("down")] * 3
    limiter, _ = _redis_limiter(failures + [0], max_requests=10)

    with caplog.at_level(logging.DEBUG, logger=rate_limit.logger.name):
        for _ in range(3):
            limiter.enforce("ai:user-1")
        limiter.enforce("ai:user-1")

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    recovered = [r for r in caplog.records if "recovered" in r.getMessage()]
    assert len(warnings) == 1
    assert warnings[0].exc_info is not None
    assert len(recovered) == 1
    assert recovered[0].levelno == logging.INFO


def test_redis_client_is_built_with_short_timeouts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A stalled Redis must fail within about a second, not five."""

    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    get_settings.cache_clear()

    limiter = rate_limit._create_rate_limiter(max_requests=3, window_seconds=60)

    assert isinstance(limiter, RedisSlidingWindowRateLimiter)
    kwargs = limiter.redis_client.connection_pool.connection_kwargs  # type: ignore[attr-defined]
    assert kwargs["socket_timeout"] == rate_limit.REDIS_SOCKET_TIMEOUT_SECONDS
    assert kwargs["socket_connect_timeout"] == rate_limit.REDIS_CONNECT_TIMEOUT_SECONDS
    assert kwargs["retry"].get_retries() == rate_limit.REDIS_RETRIES


def test_async_redis_enforce_does_not_block_event_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A slow Redis round trip runs in a worker thread, so the loop keeps ticking."""

    limiter, script = _redis_limiter([0], max_requests=10)
    script.delay_seconds = 0.3
    monkeypatch.setattr(rate_limit, "_ai_rate_limiter", limiter)

    async def _scenario() -> int:
        ticks = 0

        async def _ticker() -> None:
            nonlocal ticks
            while True:
                ticks += 1
                await asyncio.sleep(0.01)

        ticker = asyncio.create_task(_ticker())
        try:
            await enforce_ai_rate_limit_async("user-1", "chat")
        finally:
            ticker.cancel()
        return ticks

    ticks = asyncio.run(_scenario())

    assert ticks >= 3
    assert len(script.calls) == 1


def test_async_in_memory_enforce_still_rejects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The async wrapper keeps the same 429 behaviour on the in-memory path."""

    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "1")
    monkeypatch.setenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60")
    get_settings.cache_clear()

    async def _scenario() -> None:
        await enforce_ai_rate_limit_async("user-1", "chat")
        with pytest.raises(HTTPException) as exc_info:
            await enforce_ai_rate_limit_async("user-1", "chat")
        assert exc_info.value.status_code == 429

    asyncio.run(_scenario())


@pytest.mark.skipif(not TEST_REDIS_URL, reason="TEST_REDIS_URL not set")
def test_real_redis_counts_same_timestamp_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two accepts with an identical clock both count against the real Lua script."""

    from redis import Redis
    from redis.backoff import NoBackoff
    from redis.retry import Retry

    client = Redis.from_url(
        TEST_REDIS_URL,
        decode_responses=True,
        retry=Retry(NoBackoff(), retries=0),
    )
    key = "test-same-timestamp"
    client.delete(f"rate-limit:{key}")
    limiter = RedisSlidingWindowRateLimiter(client, max_requests=2, window_seconds=60)
    monkeypatch.setattr(rate_limit, "time", lambda: 1_731_000_000.123456)

    limiter.enforce(key)
    limiter.enforce(key)
    with pytest.raises(HTTPException) as exc_info:
        limiter.enforce(key)

    assert exc_info.value.status_code == 429
    assert client.zcard(f"rate-limit:{key}") == 2
    client.delete(f"rate-limit:{key}")


# ── Non-recording check and recording record ──────────────────────────────


def test_in_memory_check_never_records_but_rejects_a_full_window() -> None:
    """Checks alone do not use up budget; the window fills only via record."""

    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)
    for _ in range(10):
        limiter.check("auth-account:digest")

    limiter.record("auth-account:digest")
    limiter.record("auth-account:digest")

    with pytest.raises(HTTPException) as exc_info:
        limiter.check("auth-account:digest")
    assert exc_info.value.status_code == 429
    assert int(exc_info.value.headers["Retry-After"]) >= 1


def test_in_memory_record_counts_toward_enforce() -> None:
    """A recorded hit uses the same window as an enforced one."""

    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)
    limiter.record("auth-account:digest")
    limiter.record("auth-account:digest")

    with pytest.raises(HTTPException) as exc_info:
        limiter.enforce("auth-account:digest")
    assert exc_info.value.status_code == 429


def test_in_memory_check_does_not_consume_a_slot_for_enforce() -> None:
    """Checks before an enforce leave the full budget for enforce."""

    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)
    limiter.check("k")
    limiter.check("k")
    limiter.enforce("k")
    limiter.enforce("k")

    with pytest.raises(HTTPException):
        limiter.enforce("k")


def test_redis_check_sends_check_mode_and_reports_full_window() -> None:
    """check runs the script in check mode and raises with its Retry-After."""

    limiter, script = _redis_limiter([0, 37])
    limiter.check("auth-account:digest")

    with pytest.raises(HTTPException) as exc_info:
        limiter.check("auth-account:digest")

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers == {"Retry-After": "37"}
    assert [call["args"][5] for call in script.calls] == ["check", "check"]
    assert script.calls[0]["keys"] == ["rate-limit:auth-account:digest"]


def test_redis_record_sends_record_mode_and_never_raises() -> None:
    """record adds a hit under the same key prefix, even over a full window."""

    limiter, script = _redis_limiter([37])
    limiter.record("auth-account:digest")

    assert script.calls[0]["keys"] == ["rate-limit:auth-account:digest"]
    assert script.calls[0]["args"][5] == "record"


def test_redis_enforce_still_uses_enforce_mode() -> None:
    """Other callers keep the atomic check-and-record behaviour."""

    limiter, script = _redis_limiter([0])
    limiter.enforce("ai:user-1")

    assert script.calls[0]["args"][5] == "enforce"


def test_redis_record_and_check_fall_back_to_in_memory_when_redis_is_down() -> None:
    """During an outage, recorded hits still count in the in-memory fallback."""

    limiter, _ = _redis_limiter([RedisConnectionError("down")] * 3, max_requests=2)
    limiter.record("auth-account:digest")
    limiter.record("auth-account:digest")

    with pytest.raises(HTTPException) as exc_info:
        limiter.check("auth-account:digest")
    assert exc_info.value.status_code == 429


@pytest.mark.skipif(not TEST_REDIS_URL, reason="TEST_REDIS_URL not set")
def test_real_redis_check_and_record_match_in_memory_semantics() -> None:
    """Against the real Lua script, check never counts and record always does."""

    from redis import Redis
    from redis.backoff import NoBackoff
    from redis.retry import Retry

    client = Redis.from_url(
        TEST_REDIS_URL,
        decode_responses=True,
        retry=Retry(NoBackoff(), retries=0),
    )
    key = "test-check-record"
    client.delete(f"rate-limit:{key}")
    limiter = RedisSlidingWindowRateLimiter(client, max_requests=2, window_seconds=60)

    for _ in range(5):
        limiter.check(key)
    assert client.zcard(f"rate-limit:{key}") == 0

    limiter.record(key)
    limiter.record(key)
    with pytest.raises(HTTPException) as exc_info:
        limiter.check(key)

    assert exc_info.value.status_code == 429
    assert client.zcard(f"rate-limit:{key}") == 2
    client.delete(f"rate-limit:{key}")
