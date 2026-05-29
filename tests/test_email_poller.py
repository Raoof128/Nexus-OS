"""Tests for the email poller module."""

from __future__ import annotations

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
# sync_account ghost detection wiring
# ---------------------------------------------------------------------------


class _FakeExecute:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    """Records the operation it represents and returns canned select data."""

    def __init__(self, table, log, select_data):
        self.table = table
        self._log = log
        self._select_data = select_data
        self.op = None
        self.payload = None
        self.filters = {}
        self._in = None

    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def upsert(self, rows, **_k):
        self.op = "upsert"
        self.payload = rows
        return self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def in_(self, col, vals):
        self._in = (col, list(vals))
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        self._log.append(
            {
                "table": self.table,
                "op": self.op,
                "payload": self.payload,
                "filters": dict(self.filters),
                "in": self._in,
            }
        )
        return _FakeExecute(self._select_data if self.op == "select" else [])


class _FakePostgrest:
    def __init__(self, log, select_data):
        self._log = log
        self._select_data = select_data

    def from_(self, table):
        return _FakeQuery(table, self._log, self._select_data)


class _FakeDB:
    def __init__(self, log, select_data):
        self.postgrest = _FakePostgrest(log, select_data)


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


def _run_sync_account(monkeypatch, provider, db_inbox_ids):
    """Drive sync_account with mocked provider + DB; return the recorded call log."""

    import asyncio

    import backend.email_poller as poller
    from backend.config import get_settings

    log: list[dict] = []
    select_data = [{"provider_id": pid} for pid in db_inbox_ids]

    async def _fake_refresh(_account, _settings):
        return "access-token"

    monkeypatch.setattr(poller, "refresh_token_if_needed", _fake_refresh)
    monkeypatch.setattr(poller, "get_provider", lambda _name: provider)
    monkeypatch.setattr(
        poller,
        "create_supabase_service_client",
        lambda: _FakeDB(log, select_data),
    )

    account = {"id": "acc-1", "user_id": "user-1", "provider": "google"}
    asyncio.run(poller.sync_account(account, get_settings()))
    return log


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
