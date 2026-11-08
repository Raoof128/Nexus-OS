"""Static safety contract for the forward-only integrity migration.

The local Supabase stack requires Docker, which is not always available in CI or
developer environments. These checks do not replace applying the migration to a
real Postgres instance; they prevent the specific tenant and transaction guards
from silently disappearing from the migration artifact.
"""

from __future__ import annotations

import re
from pathlib import Path

MIGRATION = (
    Path(__file__).parents[1]
    / "supabase"
    / "migrations"
    / "20260817000001_backend_integrity_hardening.sql"
)


def _normalized_sql() -> str:
    return re.sub(r"\s+", " ", MIGRATION.read_text(encoding="utf-8")).lower()


def test_migration_fails_instead_of_waiting_indefinitely_for_locks() -> None:
    sql = _normalized_sql()
    assert "set local lock_timeout = '10s'" in sql
    assert "set local statement_timeout = '15min'" in sql


def test_note_label_links_require_one_owner_for_both_parents() -> None:
    """Removing either composite FK would reopen cross-tenant label linking."""

    sql = _normalized_sql()
    assert "nexus_note_label_links" in sql
    assert "foreign key (user_id, note_id)" in sql
    assert "references public.nexus_notes (user_id, id)" in sql
    assert "foreign key (user_id, label_id)" in sql
    assert "references public.nexus_note_labels (user_id, id)" in sql
    assert "with check (user_id = auth.uid())" in sql


def test_parent_constraints_include_their_container_identity() -> None:
    """Dropping list_id/note_id from parent FKs would restore TOCTOU corruption."""

    sql = _normalized_sql()
    assert "foreign key (user_id, list_id, parent_id)" in sql
    assert "references public.nexus_tasks (user_id, list_id, id)" in sql
    assert "foreign key (user_id, note_id, parent_id)" in sql
    assert "references public.nexus_note_items (user_id, note_id, id)" in sql


def test_email_schema_matches_runtime_writes_and_limits_cache_updates() -> None:
    """OAuth and cache writes must match runtime names without broad user UPDATE."""

    sql = _normalized_sql()
    assert "rename column encrypted_access_token to access_token_enc" in sql
    assert "rename column encrypted_refresh_token to refresh_token_enc" in sql
    assert "email_accounts_user_email_key" not in sql
    assert "email_accounts_user_id_id_key unique (user_id, id)" in sql
    assert "create table public.email_drafts" in sql
    assert "for update to authenticated" in sql
    assert "grant update (folder, labels, is_read, is_starred)" in sql


def test_recurring_completion_is_row_locked_and_idempotent() -> None:
    """Removing the lock or source uniqueness would allow duplicate successors."""

    sql = _normalized_sql()
    assert "generated_from_task_id" in sql
    assert "unique (user_id, generated_from_task_id)" in sql
    assert "create or replace function public.complete_recurring_task" in sql
    assert "for update" in sql
    assert "on conflict (user_id, generated_from_task_id)" in sql
