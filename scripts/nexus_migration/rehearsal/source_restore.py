"""Verify a decrypted Nexus snapshot in a disposable database."""

import argparse
import json
import sys
import tempfile
from collections import Counter
from pathlib import Path
from uuid import UUID

from psycopg import sql
from psycopg.types.json import Jsonb

from ..scope import NEXUS_TABLES
from .__main__ import bootstrap, expect, request_config, start_cluster

RESTORE_ORDER = (
    "media",
    "chat_sessions",
    "chat_messages",
    "email_accounts",
    "email_drafts",
    "nexus_emails",
    "nexus_notes",
    "nexus_note_items",
    "nexus_note_labels",
    "nexus_note_label_links",
    "nexus_task_lists",
    "nexus_tasks",
)


def canonical(row: dict) -> str:
    return json.dumps(row, sort_keys=True, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path, required=True)
    args = parser.parse_args()
    rows = json.load(sys.stdin)["tables"]
    expect(set(rows) == NEXUS_TABLES == set(RESTORE_ORDER), "Nexus table scope differs")
    owners = {
        UUID(row["user_id"])
        for table in rows.values()
        for row in table
        if "user_id" in row
    }
    with tempfile.TemporaryDirectory(prefix="nexus-restore-", dir="/tmp") as temporary:
        with start_cluster(Path(temporary) / "local", args.pg_bin) as cluster:
            env, _, _ = request_config(cluster)
            bootstrap(cluster, env)
            with cluster.connect() as conn:
                conn.execute("SET LOCAL TIME ZONE 'UTC'")
                # No production email addresses or credential hashes are needed for
                # the data-only rehearsal. The existing UUIDs preserve ownership.
                for index, owner in enumerate(sorted(owners)):
                    conn.execute(
                        """INSERT INTO auth.users
                         (id, email, name, "emailVerified", "createdAt", "updatedAt")
                         VALUES (%s, %s, 'Restore fixture', true, now(), now())""",
                        (owner, f"restore-{index}@example.test"),
                    )
                for table in RESTORE_ORDER:
                    identifier = sql.Identifier("public", table)
                    conn.execute(
                        sql.SQL(
                            "INSERT INTO {} SELECT * FROM jsonb_populate_recordset("
                            "NULL::{}, %s)"
                        ).format(identifier, identifier),
                        (Jsonb(rows[table]),),
                    )
                    observed = conn.execute(
                        sql.SQL("SELECT to_jsonb(t) FROM {} t").format(identifier)
                    ).fetchall()
                    expect(
                        Counter(map(canonical, rows[table]))
                        == Counter(canonical(row) for (row,) in observed),
                        f"Restored rows differ for {table}",
                    )
    print(
        f"Exact scoped restore verified for {len(rows)} tables and "
        f"{sum(map(len, rows.values()))} records across {len(owners)} owner IDs."
    )


if __name__ == "__main__":
    main()
