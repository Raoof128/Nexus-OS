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
