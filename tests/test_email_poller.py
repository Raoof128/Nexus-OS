"""Tests for the email poller module."""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import threading
from types import SimpleNamespace

import httpx
import pytest
from cryptography.fernet import Fernet

from backend.email_poller import detect_ghost_emails

# ---------------------------------------------------------------------------
# detect_ghost_emails
# ---------------------------------------------------------------------------


class TestDetectGhostEmails:
    """Unit tests for detect_ghost_emails()."""

    def test_no_ghosts_when_sets_match(self):
        """When DB and remote IDs are identical there should be no ghosts."""
        ids = {"a", "b", "c"}
        assert detect_ghost_emails(ids, ids.copy()) == set()

    def test_all_ghosts_when_remote_empty(self):
        """Everything in DB is a ghost when remote returns nothing."""
        db_ids = {"x", "y", "z"}
        assert detect_ghost_emails(db_ids, set()) == {"x", "y", "z"}

    def test_no_ghosts_when_db_empty(self):
        """No ghosts when DB is empty (fresh account)."""
        assert detect_ghost_emails(set(), {"a", "b"}) == set()

    def test_partial_ghosts(self):
        """Only IDs missing from remote are ghosts."""
        db_ids = {"kept1", "kept2", "ghost1", "ghost2"}
        remote_ids = {"kept1", "kept2", "new_msg"}
        result = detect_ghost_emails(db_ids, remote_ids)
        assert result == {"ghost1", "ghost2"}

    def test_remote_superset_no_ghosts(self):
        """Remote having extra IDs (new messages not yet in DB) is not ghosting."""
        db_ids = {"a"}
        remote_ids = {"a", "b", "c"}
        assert detect_ghost_emails(db_ids, remote_ids) == set()

    def test_both_empty(self):
        """Both empty sets yield an empty ghost set."""
        assert detect_ghost_emails(set(), set()) == set()

    def test_single_ghost(self):
        """A single ghost is detected correctly."""
        db_ids = {"msg-001", "msg-002"}
        remote_ids = {"msg-001"}
        assert detect_ghost_emails(db_ids, remote_ids) == {"msg-002"}

    def test_returns_new_set_not_mutation(self):
        """The function must not mutate the input sets."""
        db_ids = {"a", "b"}
        remote_ids = {"a"}
        original_db = db_ids.copy()
        original_remote = remote_ids.copy()
        detect_ghost_emails(db_ids, remote_ids)
        assert db_ids == original_db
        assert remote_ids == original_remote

    def test_large_sets(self):
        """Ghost detection scales to large ID sets."""
        db_ids = set(str(i) for i in range(1000))
        remote_ids = set(str(i) for i in range(500))
        ghosts = detect_ghost_emails(db_ids, remote_ids)
        assert len(ghosts) == 500
        assert ghosts == set(str(i) for i in range(500, 1000))


# ---------------------------------------------------------------------------
# Smoke: controller imports
# ---------------------------------------------------------------------------


def test_oauth_controller_importable():
    """OAuthController can be imported without error."""
    from backend.oauth_controller import OAuthController  # noqa: F401


def test_email_controller_importable():
    """EmailController can be imported without error."""
    from backend.email_controller import EmailController  # noqa: F401


def test_email_poller_importable():
    """Email poller module public symbols are importable."""
    from backend.email_poller import (  # noqa: F401
        detect_ghost_emails,
        poll_all_accounts,
        refresh_token_if_needed,
        start_email_poller,
        sync_account,
    )


# ---------------------------------------------------------------------------
# Fakes for the Supabase / PostgREST client
# ---------------------------------------------------------------------------

_FAKE_MAX_ROWS = 1000  # mirrors the local PostgREST max_rows


class _FakeExecute:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    """Records each operation and returns canned select data.

    Selects honour ``range(start, end)`` and cap at ``_FAKE_MAX_ROWS``, like
    PostgREST. Updates listed in ``fail_updates`` (0-based index among update
    calls) raise, so per-chunk failure handling can be tested.
    """

    def __init__(self, table, log, select_data, fail_updates):
        self.table = table
        self._log = log
        self._select_data = select_data
        self._fail_updates = fail_updates
        self.op = None
        self.payload = None
        self.options: dict = {}
        self.filters: dict = {}
        self._in = None
        self._range: tuple[int, int] | None = None

    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def upsert(self, rows, **kwargs):
        self.op = "upsert"
        self.payload = rows
        self.options = kwargs
        return self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def in_(self, col, vals):
        self._in = (col, list(vals))
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        entry = {
            "table": self.table,
            "op": self.op,
            "payload": self.payload,
            "options": dict(self.options),
            "filters": dict(self.filters),
            "in": self._in,
            "range": self._range,
            "thread": threading.get_ident(),
        }
        if self.op == "update":
            index = sum(1 for e in self._log if e["op"] == "update")
            self._log.append(entry)
            if index in self._fail_updates:
                raise RuntimeError("injected update failure")
            return _FakeExecute([])
        self._log.append(entry)
        if self.op == "select":
            start, end = self._range or (0, 10**9)
            return _FakeExecute(self._select_data[start : end + 1][:_FAKE_MAX_ROWS])
        return _FakeExecute([])


class _FakePostgrest:
    def __init__(self, log, select_data, fail_updates):
        self._log = log
        self._select_data = select_data
        self._fail_updates = fail_updates

    def from_(self, table):
        return _FakeQuery(table, self._log, self._select_data, self._fail_updates)


class _FakeDB:
    def __init__(self, log, select_data, fail_updates=()):
        self.postgrest = _FakePostgrest(log, select_data, set(fail_updates))


class _FakeProvider:
    def __init__(self, recent_page, full_ids, raise_on_ids=False):
        self._recent = recent_page
        self._full_ids = full_ids
        self._raise_on_ids = raise_on_ids
        self.fetch_message_ids_called = False

    async def fetch_messages(self, _token, *, since=None):
        return self._recent

    async def fetch_message_ids(self, _token):
        self.fetch_message_ids_called = True
        if self._raise_on_ids:
            raise RuntimeError("provider id list unavailable")
        return self._full_ids


def _gmail_message(provider_id: str, *, folder_label: str = "INBOX") -> dict:
    """Minimal Gmail message resource that EmailMessage.from_gmail accepts."""
    return {
        "id": provider_id,
        "threadId": f"thread-{provider_id}",
        "labelIds": [folder_label],
        "snippet": "hello",
        "payload": {
            "headers": [
                {"name": "From", "value": "Sender <sender@example.com>"},
                {"name": "To", "value": "me@example.com"},
                {"name": "Subject", "value": f"subject {provider_id}"},
                {"name": "Date", "value": "Mon, 1 Jun 2026 10:00:00 +0000"},
            ],
            "mimeType": "text/plain",
            "body": {"data": ""},
        },
    }


def _drive(
    monkeypatch,
    provider,
    *,
    select_data,
    recent=None,
    fail_updates=(),
    cycles=1,
    account=None,
):
    """Run sync_account ``cycles`` times with fakes; return the recorded log."""
    import backend.email_poller as poller
    from backend.config import get_settings

    log: list[dict] = []

    async def _fake_refresh(_account, _settings):
        return "access-token"

    monkeypatch.setattr(poller, "refresh_token_if_needed", _fake_refresh)
    monkeypatch.setattr(poller, "get_provider", lambda _name: provider)
    monkeypatch.setattr(
        poller,
        "create_supabase_service_client",
        lambda: _FakeDB(log, select_data, fail_updates),
    )
    if recent is not None:
        provider._recent = recent

    acc = account or {"id": "acc-1", "user_id": "user-1", "provider": "google"}
    settings = get_settings()
    for _ in range(cycles):
        asyncio.run(poller.sync_account(acc, settings))
    return log


def _run_sync_account(monkeypatch, provider, db_inbox_ids):
    """Drive sync_account once with mocked provider + DB; return the call log."""
    select_data = [{"provider_id": pid} for pid in db_inbox_ids]
    return _drive(monkeypatch, provider, select_data=select_data)


@pytest.fixture(autouse=True)
def _reset_poller_state(monkeypatch):
    """Clear per-process poller state so tests do not leak into each other."""
    import backend.email_poller as poller

    monkeypatch.setattr(poller, "_pending_ghosts", {})
    monkeypatch.setattr(poller, "_row_fingerprints", {})
    monkeypatch.setattr(poller, "_warned_unconfigured", set())


# ---------------------------------------------------------------------------
# sync_account ghost detection wiring
# ---------------------------------------------------------------------------


def test_ghost_detection_uses_full_id_list_not_recent_page(monkeypatch):
    """Older inbox mail absent from the recent page but present remotely is kept.

    Regression: ghost detection previously compared against the small
    ``fetch_messages`` page, which marked the entire older inbox as deleted on
    every poll. It must now compare against ``fetch_message_ids`` (full list).
    """

    # Recent page is empty, yet two of three DB rows still exist remotely.
    provider = _FakeProvider(recent_page=[], full_ids=["recent-1", "old-1"])
    log = _run_sync_account(
        monkeypatch, provider, db_inbox_ids=["recent-1", "old-1", "ghost-1"]
    )

    assert provider.fetch_message_ids_called is True

    updates = [c for c in log if c["op"] == "update"]
    assert len(updates) == 1
    update = updates[0]
    assert update["payload"] == {"folder": "deleted"}
    # Only the genuinely-removed message is ghosted; "old-1" is NOT deleted.
    assert update["in"][0] == "provider_id"
    assert set(update["in"][1]) == {"ghost-1"}
    # Both the read and the delete are scoped to the inbox folder.
    assert update["filters"].get("folder") == "inbox"
    assert update["filters"].get("account_id") == "acc-1"
    selects = [c for c in log if c["op"] == "select" and c["table"] == "nexus_emails"]
    assert selects and selects[0]["filters"].get("folder") == "inbox"


def test_ghost_detection_skipped_when_full_fetch_fails(monkeypatch):
    """If the full id fetch fails, no rows are marked deleted that cycle."""

    provider = _FakeProvider(recent_page=[], full_ids=[], raise_on_ids=True)
    log = _run_sync_account(monkeypatch, provider, db_inbox_ids=["a", "b", "c"])

    assert provider.fetch_message_ids_called is True
    assert [c for c in log if c["op"] == "update"] == []


def test_small_inbox_emptied_is_ghosted_immediately(monkeypatch):
    """Below the sample threshold a legitimately empty inbox is applied at once."""

    provider = _FakeProvider(recent_page=[], full_ids=[])
    log = _run_sync_account(monkeypatch, provider, db_inbox_ids=["a", "b", "c"])

    updates = [c for c in log if c["op"] == "update"]
    assert len(updates) == 1
    assert set(updates[0]["in"][1]) == {"a", "b", "c"}


def test_empty_remote_on_large_inbox_needs_two_consecutive_cycles(monkeypatch):
    """A bulk ghost set is held back on the first cycle and applied on the second."""

    db_ids = [f"id-{i}" for i in range(25)]
    provider = _FakeProvider(recent_page=[], full_ids=[])
    select_data = [{"provider_id": pid} for pid in db_ids]

    first = _drive(monkeypatch, provider, select_data=select_data, cycles=1)
    assert [c for c in first if c["op"] == "update"] == []

    second = _drive(monkeypatch, provider, select_data=select_data, cycles=1)
    updates = [c for c in second if c["op"] == "update"]
    assert len(updates) == 1
    assert set(updates[0]["in"][1]) == set(db_ids)


def test_ratio_anomaly_is_held_then_applied(monkeypatch):
    """A ghost set above half the inbox is not applied on the first cycle."""

    db_ids = [f"id-{i}" for i in range(30)]
    remote = [f"id-{i}" for i in range(10)]  # 20 of 30 missing
    provider = _FakeProvider(recent_page=[], full_ids=remote)
    select_data = [{"provider_id": pid} for pid in db_ids]

    first = _drive(monkeypatch, provider, select_data=select_data, cycles=1)
    assert [c for c in first if c["op"] == "update"] == []

    second = _drive(monkeypatch, provider, select_data=select_data, cycles=1)
    assert len([c for c in second if c["op"] == "update"]) >= 1


def test_truncated_remote_id_list_skips_ghost_detection(monkeypatch):
    """A remote list at the page cap is incomplete, so nothing is ghosted."""

    import backend.email_poller as poller

    full_ids = [f"r-{i}" for i in range(poller._ID_LIST_CAP)]
    provider = _FakeProvider(recent_page=[], full_ids=full_ids)
    db_ids = [{"provider_id": "stale-row"}] + [{"provider_id": x} for x in full_ids]
    log = _drive(monkeypatch, provider, select_data=db_ids)

    assert [c for c in log if c["op"] == "update"] == []


def test_ghost_updates_are_chunked_by_count(monkeypatch):
    """250 ghosts are sent as 100 + 100 + 50 ids, and the union is the ghost set."""

    db_ids = [f"id-{i}" for i in range(1000)]
    remote = db_ids[:750]
    ghost_ids = set(db_ids[750:])
    provider = _FakeProvider(recent_page=[], full_ids=remote)
    select_data = [{"provider_id": pid} for pid in db_ids]

    log = _drive(monkeypatch, provider, select_data=select_data)

    updates = [c for c in log if c["op"] == "update"]
    assert [len(u["in"][1]) for u in updates] == [100, 100, 50]
    assert set().union(*(set(u["in"][1]) for u in updates)) == ghost_ids


def test_ghost_chunks_respect_character_budget(monkeypatch):
    """Long (Graph-style) ids are batched by encoded size, not by count alone."""

    import backend.email_poller as poller

    db_ids = [f"g{i:04d}" + "x" * 150 for i in range(1000)]
    provider = _FakeProvider(recent_page=[], full_ids=db_ids[:750])
    select_data = [{"provider_id": pid} for pid in db_ids]

    log = _drive(monkeypatch, provider, select_data=select_data)

    updates = [c for c in log if c["op"] == "update"]
    assert len(updates) > 3
    for update in updates:
        chunk = update["in"][1]
        assert len(chunk) <= poller._GHOST_BATCH_MAX_IDS
        assert sum(len(pid) + 3 for pid in chunk) <= poller._GHOST_BATCH_MAX_CHARS
    assert set().union(*(set(u["in"][1]) for u in updates)) == set(db_ids[750:])


def test_failed_ghost_chunk_does_not_stop_later_chunks(monkeypatch):
    """A failing first chunk is logged and the remaining chunks still run."""

    db_ids = [f"id-{i}" for i in range(1000)]
    provider = _FakeProvider(recent_page=[], full_ids=db_ids[:750])
    select_data = [{"provider_id": pid} for pid in db_ids]

    log = _drive(monkeypatch, provider, select_data=select_data, fail_updates={0})

    updates = [c for c in log if c["op"] == "update"]
    assert len(updates) == 3


def test_inbox_read_pages_past_the_max_rows_cap(monkeypatch):
    """1500 inbox rows exceed one 1000-row page; every id is still considered."""

    db_ids = [f"id-{i}" for i in range(1500)]
    remote = db_ids[:-1]  # only the last row is a ghost
    provider = _FakeProvider(recent_page=[], full_ids=remote)
    select_data = [{"provider_id": pid} for pid in db_ids]

    log = _drive(monkeypatch, provider, select_data=select_data)

    inbox_selects = [
        c for c in log if c["op"] == "select" and c["filters"].get("folder") == "inbox"
    ]
    assert [c["range"] for c in inbox_selects[:2]] == [(0, 999), (1000, 1999)]
    updates = [c for c in log if c["op"] == "update"]
    assert len(updates) == 1
    assert updates[0]["in"][1] == ["id-1499"]


# ---------------------------------------------------------------------------
# sync_account upsert behaviour
# ---------------------------------------------------------------------------


def test_one_bad_raw_message_does_not_drop_the_others(monkeypatch):
    """A message that fails to parse is skipped; the good rows are still upserted."""

    raw_good = _gmail_message("good-1")
    provider = _FakeProvider(recent_page=[raw_good, None], full_ids=["good-1"])
    log = _run_sync_account(monkeypatch, provider, db_inbox_ids=["good-1"])

    upserts = [c for c in log if c["op"] == "upsert"]
    provider_ids = {row["provider_id"] for c in upserts for row in c["payload"]}
    assert provider_ids == {"good-1"}


def test_new_rows_insert_with_full_payload_and_ignore_duplicates(monkeypatch):
    """A message not yet in the DB is inserted with its folder and read state."""

    provider = _FakeProvider(recent_page=[_gmail_message("new-1")], full_ids=["new-1"])
    log = _drive(monkeypatch, provider, select_data=[])

    upserts = [c for c in log if c["op"] == "upsert"]
    assert len(upserts) == 1
    assert upserts[0]["options"]["ignore_duplicates"] is True
    assert upserts[0]["options"]["on_conflict"] == "account_id,provider_id"
    row = upserts[0]["payload"][0]
    assert row["provider_id"] == "new-1"
    assert {"folder", "is_read", "is_starred"} <= set(row)


def test_existing_rows_never_send_user_state_columns(monkeypatch):
    """An existing row is refreshed without folder, is_read or is_starred."""

    provider = _FakeProvider(recent_page=[_gmail_message("old-1")], full_ids=["old-1"])
    log = _drive(monkeypatch, provider, select_data=[{"provider_id": "old-1"}])

    upserts = [c for c in log if c["op"] == "upsert"]
    assert len(upserts) == 1
    assert upserts[0]["options"]["ignore_duplicates"] is False
    row = upserts[0]["payload"][0]
    assert row["provider_id"] == "old-1"
    assert "subject" in row and "body_text" in row
    assert not ({"folder", "is_read", "is_starred"} & set(row))


def test_unchanged_existing_rows_are_not_rewritten(monkeypatch):
    """A second identical cycle does not write the unchanged existing row again."""

    provider = _FakeProvider(recent_page=[_gmail_message("old-1")], full_ids=["old-1"])
    select_data = [{"provider_id": "old-1"}]

    first = _drive(monkeypatch, provider, select_data=select_data, cycles=1)
    second = _drive(monkeypatch, provider, select_data=select_data, cycles=1)

    assert len([c for c in first if c["op"] == "upsert"]) == 1
    assert [c for c in second if c["op"] == "upsert"] == []


def test_database_calls_run_off_the_event_loop_thread(monkeypatch):
    """Blocking PostgREST calls go through run_blocking, not the loop thread."""

    provider = _FakeProvider(recent_page=[_gmail_message("n-1")], full_ids=["n-1"])
    log = _drive(monkeypatch, provider, select_data=[{"provider_id": "x"}])

    assert log
    assert all(entry["thread"] != threading.get_ident() for entry in log)


# ---------------------------------------------------------------------------
# refresh_token_if_needed
# ---------------------------------------------------------------------------


@pytest.fixture
def refresh_env(monkeypatch):
    """Real encryption key, real settings, and a recording HTTP + DB pair."""
    import backend.email_poller as poller
    from backend.config import get_settings

    monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "google-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("MICROSOFT_OAUTH_CLIENT_ID", "ms-id")
    monkeypatch.setenv("MICROSOFT_OAUTH_CLIENT_SECRET", "ms-secret")
    monkeypatch.setattr(poller, "_PERSIST_RETRY_DELAY_SECONDS", 0)
    get_settings.cache_clear()

    state = SimpleNamespace(
        http_calls=[], db_log=[], fail_updates=set(), response=None, error=None
    )

    real_client = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        state.http_calls.append(request)
        if state.error is not None:
            raise state.error
        return state.response

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)
    monkeypatch.setattr(
        poller,
        "create_supabase_service_client",
        lambda: _FakeDB(state.db_log, [], state.fail_updates),
    )
    yield state
    get_settings.cache_clear()


def _account(provider="google", *, remaining=200, naive=False, refresh=True, **extra):
    from backend.email_service import encrypt_oauth_token

    expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=remaining)
    if naive:
        expires = expires.replace(tzinfo=None)
    account = {
        "id": "acc-1",
        "user_id": "user-1",
        "provider": provider,
        "access_token_enc": encrypt_oauth_token("old-access"),
        "token_expires_at": expires.isoformat(),
    }
    if refresh:
        account["refresh_token_enc"] = encrypt_oauth_token("old-refresh")
    account.update(extra)
    return account


def _json_response(status: int, body: dict) -> httpx.Response:
    return httpx.Response(status, json=body)


def _run_refresh(account, settings=None):
    import backend.email_poller as poller
    from backend.config import get_settings

    return asyncio.run(
        poller.refresh_token_if_needed(account, settings or get_settings())
    )


@pytest.mark.parametrize("provider", ["google", "microsoft"])
@pytest.mark.parametrize("naive", [False, True])
def test_expiring_token_is_refreshed_and_stored_encrypted(refresh_env, provider, naive):
    """Within the window the token is refreshed and written back encrypted."""
    from backend.email_service import decrypt_oauth_token

    refresh_env.response = _json_response(
        200,
        {
            "access_token": "new-access",
            "expires_in": 3600,
            "refresh_token": "new-refresh",
        },
    )

    token = _run_refresh(_account(provider, naive=naive))

    assert token == "new-access"
    assert len(refresh_env.http_calls) == 1
    update = next(c for c in refresh_env.db_log if c["op"] == "update")
    payload = update["payload"]
    assert decrypt_oauth_token(payload["access_token_enc"]) == "new-access"
    assert decrypt_oauth_token(payload["refresh_token_enc"]) == "new-refresh"
    for value in payload.values():
        assert "new-access" not in str(value)
        assert "new-refresh" not in str(value)


def test_fresh_token_makes_no_http_call(refresh_env):
    """A token with plenty of life left is returned without contacting the provider."""
    from backend.email_service import decrypt_oauth_token

    account = _account(remaining=400)
    token = _run_refresh(account)

    assert token == decrypt_oauth_token(account["access_token_enc"])
    assert refresh_env.http_calls == []


def test_missing_refresh_token_skips_refresh(refresh_env):
    """Without a stored refresh token the current access token is returned as-is."""
    token = _run_refresh(_account(refresh=False))

    assert token == "old-access"
    assert refresh_env.http_calls == []


def test_unknown_provider_skips_refresh(refresh_env):
    """An unknown provider never triggers a token request."""
    token = _run_refresh(_account("yahoo"))

    assert token == "old-access"
    assert refresh_env.http_calls == []


def test_missing_client_secret_skips_refresh(refresh_env, monkeypatch):
    """Without a client secret no refresh is attempted, not an empty-secret POST."""
    from backend.config import get_settings

    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
    get_settings.cache_clear()

    token = _run_refresh(_account("google"))

    assert token == "old-access"
    assert refresh_env.http_calls == []
    assert refresh_env.db_log == []


def test_server_error_keeps_current_token_without_writing(refresh_env):
    """A 5xx from the token endpoint is transient: keep the token, write nothing."""
    refresh_env.response = httpx.Response(503, text="unavailable")

    token = _run_refresh(_account())

    assert token == "old-access"
    assert refresh_env.db_log == []


def test_transport_timeout_keeps_current_token(refresh_env):
    """A timeout reaching the token endpoint keeps the current token."""
    refresh_env.error = httpx.ReadTimeout("slow")

    token = _run_refresh(_account())

    assert token == "old-access"
    assert refresh_env.db_log == []


def test_invalid_grant_marks_account_disconnected_and_raises(refresh_env):
    """A revoked grant disconnects the account and stops the poller using it."""
    import backend.email_poller as poller

    refresh_env.response = _json_response(400, {"error": "invalid_grant"})

    with pytest.raises(poller.EmailAccountNeedsReauth):
        _run_refresh(_account())

    updates = [c for c in refresh_env.db_log if c["op"] == "update"]
    assert len(updates) == 1
    assert updates[0]["payload"] == {"status": "disconnected"}
    assert updates[0]["filters"] == {"id": "acc-1"}


def test_other_client_error_keeps_token_and_logs_only_the_code(refresh_env, caplog):
    """A non-grant 4xx is logged with its error code only, never the body."""
    refresh_env.response = _json_response(
        400, {"error": "invalid_request", "error_description": "secret-body-text"}
    )

    with caplog.at_level(logging.WARNING, logger="backend.email_poller"):
        token = _run_refresh(_account())

    assert token == "old-access"
    assert refresh_env.db_log == []
    assert "invalid_request" in caplog.text
    assert "secret-body-text" not in caplog.text


def test_response_without_access_token_is_an_error_and_writes_nothing(refresh_env):
    """A 200 with no access_token must not store the stale token with a new expiry."""
    import backend.email_poller as poller

    refresh_env.response = _json_response(200, {"expires_in": 3600})

    with pytest.raises(poller.TokenRefreshError):
        _run_refresh(_account())

    assert refresh_env.db_log == []


def test_malformed_expires_in_still_persists_rotated_refresh_token(refresh_env):
    """A garbled expires_in falls back to the default, so the rotated token is kept."""
    from backend.email_service import decrypt_oauth_token

    refresh_env.response = _json_response(
        200,
        {"access_token": "new-access", "expires_in": "soon", "refresh_token": "rot"},
    )

    token = _run_refresh(_account())

    assert token == "new-access"
    update = next(c for c in refresh_env.db_log if c["op"] == "update")
    assert decrypt_oauth_token(update["payload"]["refresh_token_enc"]) == "rot"


def test_refresh_without_rotation_keeps_stored_refresh_token(refresh_env):
    """When the provider does not rotate, refresh_token_enc is not overwritten."""
    refresh_env.response = _json_response(
        200, {"access_token": "new-access", "expires_in": 3600}
    )

    _run_refresh(_account())

    update = next(c for c in refresh_env.db_log if c["op"] == "update")
    assert "refresh_token_enc" not in update["payload"]


def test_persist_failure_returns_new_token_after_retries(refresh_env):
    """If the DB write keeps failing, the valid new token is still returned."""
    refresh_env.response = _json_response(
        200, {"access_token": "new-access", "expires_in": 3600}
    )
    refresh_env.fail_updates = {0, 1, 2}

    token = _run_refresh(_account())

    assert token == "new-access"
    assert len([c for c in refresh_env.db_log if c["op"] == "update"]) == 3


# ---------------------------------------------------------------------------
# Poll loop isolation, cancellation and start/stop hooks
# ---------------------------------------------------------------------------


async def test_one_failing_account_does_not_stop_the_others(monkeypatch):
    """poll_all_accounts keeps going when one account's sync raises."""
    import backend.email_poller as poller

    accounts = [{"id": "acc-1"}, {"id": "acc-2"}]
    log: list[dict] = []
    monkeypatch.setattr(
        poller, "create_supabase_service_client", lambda: _FakeDB(log, accounts)
    )
    seen: list[str] = []

    async def fake_sync(account, _settings, *, db=None):
        seen.append(account["id"])
        if account["id"] == "acc-1":
            raise RuntimeError("boom")

    monkeypatch.setattr(poller, "sync_account", fake_sync)

    await poller.poll_all_accounts()

    assert sorted(seen) == ["acc-1", "acc-2"]


async def test_poller_loop_logs_failed_cycle_and_keeps_going(monkeypatch):
    """A raising cycle is logged and the next cycle still runs."""
    import backend.email_poller as poller

    calls = 0
    second_cycle = asyncio.Event()

    async def flaky_poll():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("cycle failed")
        second_cycle.set()

    monkeypatch.setattr(poller, "poll_all_accounts", flaky_poll)

    task = asyncio.create_task(poller._poller_loop(0))
    await asyncio.wait_for(second_cycle.wait(), timeout=5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert calls >= 2


def _app():
    return SimpleNamespace(state=SimpleNamespace())


def _settings(**overrides):
    base = {
        "google_oauth_client_id": "",
        "google_oauth_client_secret": "",
        "microsoft_oauth_client_id": "",
        "microsoft_oauth_client_secret": "",
        "email_poll_interval_seconds": 60,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


async def test_start_without_client_ids_schedules_nothing(monkeypatch):
    import backend.email_poller as poller

    monkeypatch.setattr(poller, "get_settings", lambda: _settings())
    app = _app()

    await poller.start_email_poller(app)

    assert getattr(app.state, "email_poller_task", None) is None


async def test_start_then_stop_is_idempotent(monkeypatch):
    import backend.email_poller as poller

    async def idle_poll():
        return None

    monkeypatch.setattr(
        poller,
        "get_settings",
        lambda: _settings(google_oauth_client_id="g", google_oauth_client_secret="s"),
    )
    monkeypatch.setattr(poller, "poll_all_accounts", idle_poll)
    app = _app()

    await poller.start_email_poller(app)
    task = app.state.email_poller_task
    assert isinstance(task, asyncio.Task)

    await poller.stop_email_poller(app)
    assert task.cancelled()
    await poller.stop_email_poller(app)  # second call is a no-op


async def test_stop_warns_when_poller_ignores_cancellation(monkeypatch, caplog):
    import backend.email_poller as poller

    monkeypatch.setattr(poller, "_SHUTDOWN_TIMEOUT_SECONDS", 0.05)

    async def stubborn():
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            await asyncio.sleep(10)

    app = _app()
    stubborn_task = asyncio.create_task(stubborn())
    app.state.email_poller_task = stubborn_task
    await asyncio.sleep(0)  # let the task start so it is inside its try block

    with caplog.at_level(logging.WARNING, logger="backend.email_poller"):
        await poller.stop_email_poller(app)

    assert "did not stop" in caplog.text
    stubborn_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await stubborn_task


async def test_cancelling_the_shutdown_hook_propagates(monkeypatch):
    """A cancel aimed at the shutdown hook itself is not swallowed."""
    import backend.email_poller as poller

    app = _app()
    poll_task = asyncio.create_task(asyncio.sleep(10))
    app.state.email_poller_task = poll_task

    hook = asyncio.create_task(poller.stop_email_poller(app))
    await asyncio.sleep(0)
    hook.cancel()

    with pytest.raises(asyncio.CancelledError):
        await hook
    poll_task.cancel()


def test_poller_selects_schema_status_and_legacy_active():
    """'connected' is the schema value; legacy 'active' rows keep polling."""

    from backend.email_poller import _select_active_accounts

    log: list = []
    db = _FakeDB(log, [{"id": "acc-1", "status": "connected"}])
    rows = _select_active_accounts(db)

    assert rows == [{"id": "acc-1", "status": "connected"}]
    assert log[-1]["in"] == ("status", ["connected", "active"])
