"""Unit tests for the Idempotency-Key store used by email send, reply and forward.

The in-memory store is exercised directly with an injected clock. The Redis
store is exercised against an in-process fake that honours the redis-py calls
it makes (``set`` with NX/PX, ``get``, ``delete``) and expires keys on the same
injected clock.
"""

from __future__ import annotations

import pytest
from litestar.exceptions import HTTPException
from redis.exceptions import ConnectionError as RedisConnectionError

from backend import idempotency
from backend.config import get_settings
from backend.idempotency import (
    IDEMPOTENCY_TTL_SECONDS,
    IN_FLIGHT_TTL_SECONDS,
    IdempotencyGuard,
    InMemoryIdempotencyStore,
    RedisIdempotencyStore,
    Replay,
    Reservation,
    get_idempotency_guard,
    parse_idempotency_key,
    request_fingerprint,
    reset_idempotency_store,
)

KEY = "0f8fad5b-d9cb-469f-a165-70867728950e"
BODY = {"to": ["alice@example.com"], "subject": "Hello", "body_html": "<p>Hi</p>"}
FP = request_fingerprint("POST", "/api/email/send", BODY)


class FakeClock:
    def __init__(self, now: float = 1_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class FakeRedis:
    """In-process stand-in for the redis-py calls the store makes."""

    def __init__(self, clock: FakeClock) -> None:
        self.clock = clock
        self.data: dict[str, tuple[str, float | None]] = {}
        self.fail_with: Exception | None = None

    def _check(self) -> None:
        if self.fail_with is not None:
            raise self.fail_with

    def _live(self, name: str) -> tuple[str, float | None] | None:
        item = self.data.get(name)
        if item is None:
            return None
        _, expires_at = item
        if expires_at is not None and expires_at <= self.clock():
            del self.data[name]
            return None
        return item

    def set(
        self,
        name,
        value,
        ex=None,
        px=None,
        nx=False,
        xx=False,
        keepttl=False,
    ):
        self._check()
        if nx and self._live(name) is not None:
            return None
        if xx and self._live(name) is None:
            return None
        ttl = px / 1000 if px else ex
        expires_at = self.clock() + ttl if ttl else None
        self.data[name] = (value, expires_at)
        return True

    def get(self, name):
        self._check()
        item = self._live(name)
        return item[0] if item else None

    def delete(self, *names):
        self._check()
        removed = 0
        for name in names:
            if self._live(name) is not None:
                del self.data[name]
                removed += 1
        return removed

    def everything_stored(self) -> str:
        return "\n".join(f"{name} {value}" for name, (value, _) in self.data.items())


# ---------------------------------------------------------------------------
# Header parsing and fingerprints
# ---------------------------------------------------------------------------


def test_missing_header_means_no_key():
    assert parse_idempotency_key(None) is None


@pytest.mark.parametrize("value", [KEY, "abcdefgh", "a" * 128, "A_b-9" * 5])
def test_well_formed_key_is_accepted(value):
    assert parse_idempotency_key(value) == value


@pytest.mark.parametrize(
    "value",
    ["", "   ", "short", "a" * 129, "has space here", "bad$key!!", "emoji-🙂-key"],
)
def test_malformed_key_is_400(value):
    with pytest.raises(HTTPException) as excinfo:
        parse_idempotency_key(value)
    assert excinfo.value.status_code == 400


def test_fingerprint_ignores_key_order_and_is_stable():
    reordered = {
        "body_html": "<p>Hi</p>",
        "subject": "Hello",
        "to": ["alice@example.com"],
    }
    assert request_fingerprint("POST", "/api/email/send", reordered) == FP
    assert len(FP) == 64


def test_fingerprint_changes_with_body_or_path():
    assert (
        request_fingerprint("POST", "/api/email/send", {**BODY, "subject": "X"}) != FP
    )
    assert request_fingerprint("POST", "/api/email/e1/reply", BODY) != FP


def test_fingerprint_does_not_contain_the_message():
    digest = request_fingerprint("POST", "/api/email/send", BODY)
    assert "alice@example.com" not in digest
    assert "Hello" not in digest


# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------


def _memory(clock: FakeClock | None = None, **kwargs) -> InMemoryIdempotencyStore:
    return InMemoryIdempotencyStore(clock=clock or FakeClock(), **kwargs)


def test_first_begin_reserves_and_second_in_flight_is_409():
    store = _memory()
    reservation = store.begin("user-1", KEY, FP)
    assert isinstance(reservation, Reservation)

    with pytest.raises(HTTPException) as excinfo:
        store.begin("user-1", KEY, FP)
    assert excinfo.value.status_code == 409
    assert int(excinfo.value.headers["Retry-After"]) >= 1


def test_completed_request_replays_stored_status_and_body():
    store = _memory()
    reservation = store.begin("user-1", KEY, FP)
    store.complete(reservation, 201, '{"id":"sent-1"}')

    replay = store.begin("user-1", KEY, FP)

    assert replay == Replay(status_code=201, body='{"id":"sent-1"}')


def test_same_key_with_different_fingerprint_is_422_while_in_flight_and_after():
    store = _memory()
    reservation = store.begin("user-1", KEY, FP)
    other = request_fingerprint("POST", "/api/email/send", {**BODY, "subject": "X"})

    with pytest.raises(HTTPException) as in_flight:
        store.begin("user-1", KEY, other)
    assert in_flight.value.status_code == 422

    store.complete(reservation, 201, "{}")
    with pytest.raises(HTTPException) as done:
        store.begin("user-1", KEY, other)
    assert done.value.status_code == 422


def test_release_frees_the_key_for_a_new_attempt():
    store = _memory()
    reservation = store.begin("user-1", KEY, FP)
    store.release(reservation)

    assert isinstance(store.begin("user-1", KEY, FP), Reservation)


def test_keys_are_scoped_per_user():
    store = _memory()
    assert isinstance(store.begin("user-1", KEY, FP), Reservation)
    assert isinstance(store.begin("user-2", KEY, FP), Reservation)


def test_completed_entry_expires_after_24_hours_and_key_can_be_reused():
    clock = FakeClock()
    store = _memory(clock)
    store.complete(store.begin("user-1", KEY, FP), 201, "{}")

    clock.advance(IDEMPOTENCY_TTL_SECONDS - 1)
    assert isinstance(store.begin("user-1", KEY, FP), Replay)

    clock.advance(2)
    assert isinstance(store.begin("user-1", KEY, FP), Reservation)


def test_abandoned_reservation_expires_so_the_key_is_not_stuck():
    clock = FakeClock()
    store = _memory(clock)
    store.begin("user-1", KEY, FP)

    clock.advance(IN_FLIGHT_TTL_SECONDS + 1)

    assert isinstance(store.begin("user-1", KEY, FP), Reservation)


def test_store_is_bounded_and_evicts_the_oldest_completed_entry():
    store = _memory(max_entries=3)
    for index in range(3):
        key = f"key-{index:04d}-aaaa"
        store.complete(store.begin("user-1", key, FP), 201, "{}")

    store.complete(store.begin("user-1", "key-9999-bbbb", FP), 201, "{}")

    assert len(store) == 3
    assert isinstance(store.begin("user-1", "key-0000-aaaa", FP), Reservation)


def test_complete_with_a_stale_token_does_not_overwrite_a_newer_owner():
    clock = FakeClock()
    store = _memory(clock)
    stale = store.begin("user-1", KEY, FP)
    clock.advance(IN_FLIGHT_TTL_SECONDS + 1)
    current = store.begin("user-1", KEY, FP)

    store.complete(stale, 500, "{}")

    with pytest.raises(HTTPException) as excinfo:
        store.begin("user-1", KEY, FP)
    assert excinfo.value.status_code == 409
    store.release(current)


# ---------------------------------------------------------------------------
# Redis store (fake client)
# ---------------------------------------------------------------------------


def _redis_store(clock: FakeClock) -> tuple[RedisIdempotencyStore, FakeRedis]:
    fake = FakeRedis(clock)
    return RedisIdempotencyStore(client=fake), fake


def test_redis_store_keeps_user_and_key_out_of_plaintext():
    store, fake = _redis_store(FakeClock())
    store.complete(store.begin("user-123", KEY, FP), 201, '{"id":"sent-1"}')

    stored = fake.everything_stored()
    assert "user-123" not in stored
    assert KEY not in stored
    assert "alice@example.com" not in stored
    assert "sent-1" in stored


def test_redis_store_replays_completed_request():
    store, _ = _redis_store(FakeClock())
    store.complete(store.begin("user-1", KEY, FP), 201, '{"ok":true}')

    assert store.begin("user-1", KEY, FP) == Replay(201, '{"ok":true}')


def test_redis_store_in_flight_409_and_mismatch_422():
    store, _ = _redis_store(FakeClock())
    reservation = store.begin("user-1", KEY, FP)
    other = request_fingerprint("POST", "/api/email/send", {**BODY, "subject": "X"})

    with pytest.raises(HTTPException) as in_flight:
        store.begin("user-1", KEY, FP)
    assert in_flight.value.status_code == 409
    with pytest.raises(HTTPException) as mismatch:
        store.begin("user-1", KEY, other)
    assert mismatch.value.status_code == 422

    store.release(reservation)
    assert isinstance(store.begin("user-1", KEY, FP), Reservation)


def test_redis_completed_record_expires_after_24_hours():
    clock = FakeClock()
    store, _ = _redis_store(clock)
    store.complete(store.begin("user-1", KEY, FP), 201, "{}")

    clock.advance(IDEMPOTENCY_TTL_SECONDS + 1)

    assert isinstance(store.begin("user-1", KEY, FP), Reservation)


def test_redis_release_and_complete_only_affect_the_owning_reservation():
    clock = FakeClock()
    store, _ = _redis_store(clock)
    stale = store.begin("user-1", KEY, FP)
    clock.advance(IN_FLIGHT_TTL_SECONDS + 1)
    current = store.begin("user-1", KEY, FP)

    store.release(stale)
    store.complete(stale, 500, "{}")

    with pytest.raises(HTTPException) as excinfo:
        store.begin("user-1", KEY, FP)
    assert excinfo.value.status_code == 409
    store.release(current)


# ---------------------------------------------------------------------------
# Guard: Redis primary with in-memory fallback
# ---------------------------------------------------------------------------


async def test_guard_uses_redis_when_available():
    clock = FakeClock()
    fake = FakeRedis(clock)
    guard = IdempotencyGuard(
        primary=RedisIdempotencyStore(client=fake),
        fallback=_memory(clock),
    )

    reservation = await guard.begin("user-1", KEY, FP)
    await guard.complete(reservation, 201, '{"ok":true}')

    assert "user-1" not in fake.everything_stored()
    assert await guard.begin("user-1", KEY, FP) == Replay(201, '{"ok":true}')


async def test_guard_falls_back_to_memory_when_redis_is_down():
    clock = FakeClock()
    fake = FakeRedis(clock)
    fake.fail_with = RedisConnectionError("down")
    guard = IdempotencyGuard(
        primary=RedisIdempotencyStore(client=fake),
        fallback=_memory(clock),
    )

    reservation = await guard.begin("user-1", KEY, FP)
    with pytest.raises(HTTPException) as excinfo:
        await guard.begin("user-1", KEY, FP)
    assert excinfo.value.status_code == 409

    await guard.complete(reservation, 201, "{}")
    assert await guard.begin("user-1", KEY, FP) == Replay(201, "{}")


def test_guard_is_memory_only_without_redis_url(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "")
    get_settings.cache_clear()
    reset_idempotency_store()
    try:
        guard = get_idempotency_guard()
        assert guard.primary is None
        assert get_idempotency_guard() is guard
    finally:
        reset_idempotency_store()
        get_settings.cache_clear()


def test_guard_builds_redis_client_with_short_timeouts_when_configured(monkeypatch):
    from backend import rate_limit

    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    get_settings.cache_clear()
    reset_idempotency_store()
    try:
        guard = get_idempotency_guard()
        assert isinstance(guard.primary, RedisIdempotencyStore)
        kwargs = guard.primary.client.connection_pool.connection_kwargs
        assert kwargs["socket_timeout"] == rate_limit.REDIS_SOCKET_TIMEOUT_SECONDS
        assert (
            kwargs["socket_connect_timeout"] == rate_limit.REDIS_CONNECT_TIMEOUT_SECONDS
        )
        assert kwargs["retry"].get_retries() == rate_limit.REDIS_RETRIES
    finally:
        reset_idempotency_store()
        get_settings.cache_clear()


def test_module_exposes_the_contract_constants():
    assert idempotency.IDEMPOTENCY_TTL_SECONDS == 24 * 60 * 60
    assert idempotency.IN_FLIGHT_TTL_SECONDS > 30
