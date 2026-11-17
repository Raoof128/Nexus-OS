"""Populate and verify the scoped Nexus tables on fixture databases."""

import hashlib
from uuid import UUID

import psycopg
from cryptography.fernet import Fernet
from psycopg import sql

from ..scope import NEXUS_TABLES, NEXUS_VIEWS

RELATED_ROWS = """
WITH chat AS (
    INSERT INTO public.chat_sessions (user_id, title)
    VALUES (%(owner)s, 'Fixture conversation') RETURNING id
), message AS (
    INSERT INTO public.chat_messages (session_id, role, content)
    SELECT id, 'user', 'Fixture message' FROM chat
), task_list AS (
    INSERT INTO public.nexus_task_lists (user_id, name)
    VALUES (%(owner)s, 'Fixture list') RETURNING id
), task AS (
    INSERT INTO public.nexus_tasks (user_id, list_id, title, due, due_timezone)
    SELECT %(owner)s, id, 'Fixture task', '2026-11-17', 'Australia/Sydney'
    FROM task_list
), note AS (
    INSERT INTO public.nexus_notes (user_id, title_encrypted, content_encrypted)
    VALUES (%(owner)s, %(ciphertext)s, %(ciphertext)s) RETURNING id
), note_item AS (
    INSERT INTO public.nexus_note_items (user_id, note_id, text_encrypted)
    SELECT %(owner)s, id, %(ciphertext)s FROM note
), label AS (
    INSERT INTO public.nexus_note_labels (user_id, name)
    VALUES (%(owner)s, 'Fixture label') RETURNING id
), label_link AS (
    INSERT INTO public.nexus_note_label_links (user_id, note_id, label_id)
    SELECT %(owner)s, note.id, label.id FROM note CROSS JOIN label
), account AS (
    INSERT INTO public.email_accounts
        (user_id, provider, email_address, access_token_enc, refresh_token_enc,
         token_expires_at)
    VALUES (%(owner)s, 'google', 'fixture@example.test', %(ciphertext)s,
            %(ciphertext)s, '2026-11-17T01:00:00Z') RETURNING id
), mail AS (
    INSERT INTO public.nexus_emails
        (user_id, account_id, provider_id, from_address, subject, provider_date)
    SELECT %(owner)s, id, 'fixture-provider-id', 'sender@example.test',
           'Fixture mail', '2026-11-17T00:00:00Z' FROM account
)
INSERT INTO public.email_drafts (user_id, account_id, subject)
SELECT %(owner)s, id, 'Fixture draft' FROM account
"""


def seed_related_rows(conn: psycopg.Connection, owner: UUID) -> None:
    ciphertext = Fernet(Fernet.generate_key()).encrypt(b"Fixture private data").decode()
    conn.execute(RELATED_ROWS, {"owner": owner, "ciphertext": ciphertext})


def catalog_snapshot(conn: psycopg.Connection) -> tuple[dict[str, int], str]:
    relations = conn.execute(
        """
        SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
            (SELECT count(*) FROM pg_attribute a
             WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
        ORDER BY c.relname
        """
    ).fetchall()
    tables = {
        name: size
        for name, kind, rls, forced, size in relations
        if kind == "r" and rls and forced
    }
    views = {name for name, kind, _, _, _ in relations if kind == "v"}
    if (
        tables.keys() != NEXUS_TABLES
        or views != NEXUS_VIEWS
        or len(relations) != len(NEXUS_TABLES) + len(NEXUS_VIEWS)
    ):
        raise ValueError("Rehearsal catalog differs from the Nexus table allowlist")

    # Fixtures are deliberately tiny. JSON ordering makes the comparison
    # independent of a table's scan order after restore.
    digest = hashlib.sha256()
    for table in sorted(NEXUS_TABLES):
        rows = conn.execute(
            sql.SQL(
                "SELECT to_jsonb(data)::text FROM public.{} AS data ORDER BY 1"
            ).format(sql.Identifier(table))
        ).fetchall()
        if not rows:
            raise ValueError(f"Missing fixture data for {table}")
        for (row,) in rows:
            digest.update(table.encode())
            digest.update(b"\0")
            digest.update(row.encode())
            digest.update(b"\0")
    return tables, digest.hexdigest()
