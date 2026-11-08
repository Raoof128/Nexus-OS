"""Server-side idempotency for outbound email (send, reply and forward).

The browser sends an ``Idempotency-Key`` and reuses it when a request fails
ambiguously. This module makes a retry with the same key return the stored
response instead of sending the message again.

* Scope is ``(user_id, Idempotency-Key)``. Only the SHA-256 digest of that pair
  is used as a storage key, so neither the user id nor the client key is stored
  in clear.
* A first request reserves the key as in-flight. When it finishes, the final
  status code and JSON body are stored for ``IDEMPOTENCY_TTL_SECONDS``. Only
  the response the endpoint returns is kept: provider ids and status, never
  the message.
* The request fingerprint is an HMAC of method, path and the validated body,
  keyed with ``AUDIT_LOG_SALT``. Recipients and bodies are not kept in clear,
  and a guessed recipient list cannot be checked against a stored value without
  the salt.
* Backends: Redis when ``REDIS_URL`` is set, else an in-process bounded map.
  If Redis fails, that one call falls back to the in-process map. The map is
  per process, so during a Redis outage a retry that lands on another instance
  is not deduplicated. The in-process map is also what single-instance
  deployments without Redis rely on.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass, field
from threading import Lock
from typing import Any, Final
from uuid import uuid4

from anyio import to_thread
from litestar.exceptions import HTTPException
from redis import Redis
from redis.backoff import NoBackoff
from redis.exceptions import RedisError
from redis.retry import Retry

if __package__:
    from .config import get_settings
    from .rate_limit import (
        REDIS_CONNECT_TIMEOUT_SECONDS,
        REDIS_RETRIES,
        REDIS_SOCKET_TIMEOUT_SECONDS,
    )
else:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from rate_limit import (
        REDIS_CONNECT_TIMEOUT_SECONDS,
        REDIS_RETRIES,
        REDIS_SOCKET_TIMEOUT_SECONDS,
    )

logger = logging.getLogger(__name__)

IDEMPOTENCY_HEADER: Final[str] = "Idempotency-Key"
REPLAYED_HEADER: Final[str] = "Idempotent-Replayed"

# A completed response is replayed for one day.
IDEMPOTENCY_TTL_SECONDS: Final[int] = 24 * 60 * 60
# An in-flight reservation outlives a slow provider call (the httpx timeout is
# 30 seconds). If the process dies mid-send, the key frees itself after this.
IN_FLIGHT_TTL_SECONDS: Final[int] = 300
IN_FLIGHT_RETRY_AFTER_SECONDS: Final[int] = 5
# Bound on the in-process map. Entries are small (a status code and an id body).
MAX_MEMORY_ENTRIES: Final[int] = 10_000

REDIS_KEY_PREFIX: Final[str] = "idempotency:"

_KEY_PATTERN: Final[re.Pattern[str]] = re.compile(r"[A-Za-z0-9_-]{8,128}")

_IN_FLIGHT: Final[str] = "in_flight"
_DONE: Final[str] = "done"

_IN_FLIGHT_DETAIL: Final[str] = (
    "A request with this Idempotency-Key is already in progress. Retry shortly."
)
_MISMATCH_DETAIL: Final[str] = (
    "Idempotency-Key was already used for a different request"
)


def parse_idempotency_key(value: str | None) -> str | None:
    """Return the key, ``None`` when the header is absent, or raise 400.

    A header that is present but empty or malformed is rejected rather than
    ignored. Ignoring it would silently disable deduplication.
    """

    if value is None:
        return None
    if not _KEY_PATTERN.fullmatch(value):
        raise HTTPException(status_code=400, detail="Invalid Idempotency-Key header")
    return value


def request_fingerprint(method: str, path: str, body: dict[str, Any]) -> str:
    """Return an HMAC over the method, path and validated body.

    The body is the validated model dump, so header and JSON formatting differences
    do not change the fingerprint, and key order does not either.
    """

    canonical = json.dumps(
        {"method": method, "path": path, "body": body},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )
    secret = get_settings().audit_log_salt.encode("utf-8")
    return hmac.new(secret, canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def _scope_digest(user_id: str, key: str) -> str:
    return hashlib.sha256(f"{user_id}\x1f{key}".encode()).hexdigest()


@dataclass(frozen=True)
class Replay:
    """A stored response to return instead of performing the send again."""

    status_code: int
    body: str


@dataclass(frozen=True)
class Reservation:
    """Proof that this request owns the in-flight key.

    ``token`` is unique per reservation. Complete and release only act when the
    stored token still matches, so a request whose reservation expired cannot
    overwrite a newer one.
    """

    name: str
    token: str
    backend: Any = field(repr=False, compare=False)


@dataclass(frozen=True)
class _Record:
    fingerprint: str
    token: str
    state: str
    status_code: int = 0
    body: str = ""

    def to_json(self) -> str:
        return json.dumps(
            {
                "fp": self.fingerprint,
                "tok": self.token,
                "state": self.state,
                "status": self.status_code,
                "body": self.body,
            },
            separators=(",", ":"),
        )

    @classmethod
    def from_json(cls, raw: str) -> _Record:
        data = json.loads(raw)
        return cls(
            fingerprint=data["fp"],
            token=data["tok"],
            state=data["state"],
            status_code=int(data["status"]),
            body=data["body"],
        )


def _decide(record: _Record, fingerprint: str) -> Replay:
    """Answer a repeated key: 422 on mismatch, 409 while in flight, else replay."""

    if record.fingerprint != fingerprint:
        raise HTTPException(status_code=422, detail=_MISMATCH_DETAIL)
    if record.state == _IN_FLIGHT:
        raise HTTPException(
            status_code=409,
            detail=_IN_FLIGHT_DETAIL,
            headers={"Retry-After": str(IN_FLIGHT_RETRY_AFTER_SECONDS)},
        )
    return Replay(status_code=record.status_code, body=record.body)


class InMemoryIdempotencyStore:
    """Process-local, bounded store with TTLs measured on an injectable clock."""

    def __init__(
        self,
        *,
        clock: Callable[[], float] = time.monotonic,
        ttl_seconds: int = IDEMPOTENCY_TTL_SECONDS,
        in_flight_ttl_seconds: int = IN_FLIGHT_TTL_SECONDS,
        max_entries: int = MAX_MEMORY_ENTRIES,
    ) -> None:
        self._clock = clock
        self._ttl = ttl_seconds
        self._in_flight_ttl = in_flight_ttl_seconds
        self._max_entries = max_entries
        # name -> (record, expires_at). Insertion order approximates age.
        self._entries: OrderedDict[str, tuple[_Record, float]] = OrderedDict()
        self._lock = Lock()

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)

    def begin(self, user_id: str, key: str, fingerprint: str) -> Replay | Reservation:
        name = _scope_digest(user_id, key)
        now = self._clock()
        with self._lock:
            item = self._entries.get(name)
            if item is not None and item[1] <= now:
                del self._entries[name]
                item = None
            if item is not None:
                return _decide(item[0], fingerprint)

            self._make_room(now)
            token = uuid4().hex
            self._entries[name] = (
                _Record(fingerprint, token, _IN_FLIGHT),
                now + self._in_flight_ttl,
            )
            return Reservation(name=name, token=token, backend=self)

    def complete(self, reservation: Reservation, status_code: int, body: str) -> None:
        now = self._clock()
        with self._lock:
            item = self._entries.get(reservation.name)
            if item is None or item[0].token != reservation.token:
                logger.warning("Idempotency reservation lost before completion")
                return
            self._entries[reservation.name] = (
                _Record(
                    item[0].fingerprint, reservation.token, _DONE, status_code, body
                ),
                now + self._ttl,
            )

    def release(self, reservation: Reservation) -> None:
        with self._lock:
            item = self._entries.get(reservation.name)
            if (
                item is not None
                and item[0].token == reservation.token
                and item[0].state == _IN_FLIGHT
            ):
                del self._entries[reservation.name]

    def _make_room(self, now: float) -> None:
        """Keep the map under ``max_entries``: expired first, then oldest completed."""

        if len(self._entries) < self._max_entries:
            return
        expired = [name for name, (_, exp) in self._entries.items() if exp <= now]
        for name in expired:
            del self._entries[name]
        while len(self._entries) >= self._max_entries:
            victim = next(
                (
                    name
                    for name, (rec, _) in self._entries.items()
                    if rec.state == _DONE
                ),
                None,
            )
            if victim is None:
                # Every entry is in flight. Evicting one can allow a duplicate.
                victim = next(iter(self._entries))
                logger.warning("Idempotency store full of in-flight reservations")
            del self._entries[victim]


class RedisIdempotencyStore:
    """Redis-backed store shared by all app instances.

    Each reservation is one key written with ``SET NX PX``. Redis expires keys,
    so there is no sweep. The check-and-reserve step is atomic. Complete and
    release check the owning token first. That check is a separate read, so the
    window is small. It is covered by the in-flight TTL, which is much longer
    than a provider call.
    """

    def __init__(
        self,
        client: Redis,
        *,
        ttl_seconds: int = IDEMPOTENCY_TTL_SECONDS,
        in_flight_ttl_seconds: int = IN_FLIGHT_TTL_SECONDS,
    ) -> None:
        self.client = client
        self._ttl_ms = int(ttl_seconds * 1000)
        self._in_flight_ms = int(in_flight_ttl_seconds * 1000)

    def begin(self, user_id: str, key: str, fingerprint: str) -> Replay | Reservation:
        digest = _scope_digest(user_id, key)
        name = REDIS_KEY_PREFIX + digest
        for _ in range(2):
            token = uuid4().hex
            record = _Record(fingerprint, token, _IN_FLIGHT)
            if self.client.set(name, record.to_json(), nx=True, px=self._in_flight_ms):
                return Reservation(name=digest, token=token, backend=self)
            raw = self.client.get(name)
            if raw is not None:
                return _decide(_Record.from_json(raw), fingerprint)
            # The key expired between SET NX and GET. One more attempt is enough.
        raise HTTPException(
            status_code=409,
            detail=_IN_FLIGHT_DETAIL,
            headers={"Retry-After": str(IN_FLIGHT_RETRY_AFTER_SECONDS)},
        )

    def complete(self, reservation: Reservation, status_code: int, body: str) -> None:
        name = REDIS_KEY_PREFIX + reservation.name
        raw = self.client.get(name)
        if raw is None:
            logger.warning("Idempotency reservation expired before completion")
            return
        current = _Record.from_json(raw)
        if current.token != reservation.token:
            logger.warning("Idempotency reservation was taken over before completion")
            return
        done = _Record(current.fingerprint, reservation.token, _DONE, status_code, body)
        self.client.set(name, done.to_json(), px=self._ttl_ms)

    def release(self, reservation: Reservation) -> None:
        name = REDIS_KEY_PREFIX + reservation.name
        raw = self.client.get(name)
        if raw is None:
            return
        current = _Record.from_json(raw)
        if current.token == reservation.token and current.state == _IN_FLIGHT:
            self.client.delete(name)


class IdempotencyGuard:
    """Redis when available, with a per-call fallback to the in-process map."""

    def __init__(
        self,
        *,
        primary: RedisIdempotencyStore | None,
        fallback: InMemoryIdempotencyStore,
    ) -> None:
        self.primary = primary
        self.fallback = fallback
        # Only gates log output. The decision never reads this flag.
        self._degraded = False

    async def begin(
        self, user_id: str, key: str, fingerprint: str
    ) -> Replay | Reservation:
        if self.primary is not None:
            try:
                return await to_thread.run_sync(
                    self.primary.begin, user_id, key, fingerprint
                )
            except RedisError as exc:
                self._log_degraded(exc)
        return self.fallback.begin(user_id, key, fingerprint)

    async def complete(
        self, reservation: Reservation, status_code: int, body: str
    ) -> None:
        store = reservation.backend
        if isinstance(store, RedisIdempotencyStore):
            try:
                await to_thread.run_sync(store.complete, reservation, status_code, body)
            except RedisError as exc:
                self._log_degraded(exc)
            return
        store.complete(reservation, status_code, body)

    async def release(self, reservation: Reservation) -> None:
        store = reservation.backend
        if isinstance(store, RedisIdempotencyStore):
            try:
                await to_thread.run_sync(store.release, reservation)
            except RedisError as exc:
                self._log_degraded(exc)
            return
        store.release(reservation)

    def _log_degraded(self, exc: RedisError) -> None:
        if not self._degraded:
            self._degraded = True
            logger.warning(
                "Redis idempotency backend unavailable; using in-process fallback",
                exc_info=True,
            )
            return
        logger.debug(
            "Redis idempotency backend still unavailable (%s)", type(exc).__name__
        )


def _build_guard() -> IdempotencyGuard:
    fallback = InMemoryIdempotencyStore()
    redis_url = get_settings().redis_url
    if not redis_url:
        logger.info("Idempotency store is process-local. Set REDIS_URL to share it.")
        return IdempotencyGuard(primary=None, fallback=fallback)
    try:
        client = Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
            socket_connect_timeout=REDIS_CONNECT_TIMEOUT_SECONDS,
            retry=Retry(NoBackoff(), retries=REDIS_RETRIES),
        )
    except RedisError:  # pragma: no cover - external dependency failure
        logger.warning("Could not create Redis idempotency client; using fallback")
        return IdempotencyGuard(primary=None, fallback=fallback)
    return IdempotencyGuard(
        primary=RedisIdempotencyStore(client),
        fallback=fallback,
    )


_guard_lock: Final[Lock] = Lock()
_guard: IdempotencyGuard | None = None


def get_idempotency_guard() -> IdempotencyGuard:
    """Return the shared guard, building it on first use."""

    global _guard
    if _guard is None:
        with _guard_lock:
            if _guard is None:
                _guard = _build_guard()
    return _guard


def reset_idempotency_store() -> None:
    """Drop the cached guard so the next call rebuilds it (used by tests)."""

    global _guard
    with _guard_lock:
        _guard = None


__all__ = [
    "IDEMPOTENCY_HEADER",
    "IDEMPOTENCY_TTL_SECONDS",
    "IN_FLIGHT_TTL_SECONDS",
    "REPLAYED_HEADER",
    "IdempotencyGuard",
    "InMemoryIdempotencyStore",
    "RedisIdempotencyStore",
    "Replay",
    "Reservation",
    "get_idempotency_guard",
    "parse_idempotency_key",
    "request_fingerprint",
    "reset_idempotency_store",
]
