"""Create and restore an encrypted snapshot of Nexus's production rows and owner."""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from .scope import NEXUS_TABLES

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


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def encode(data: dict) -> bytes:
    return json.dumps(data, sort_keys=True, separators=(",", ":")).encode()


def validate(payload: dict) -> tuple[dict, dict]:
    tables = payload["tables"]
    owners = payload["owners"]
    require(
        set(tables) == NEXUS_TABLES == set(RESTORE_ORDER), "Nexus table set differs"
    )
    ids = {
        UUID(row["user_id"])
        for rows in tables.values()
        for row in rows
        if "user_id" in row
    }
    require(len(owners) == len(ids) == 1, "Expected one verified Nexus data owner")
    owner = owners[0]
    require({UUID(owner["id"])} == ids, "Identity scope differs from owned records")
    require(
        owner["identity_count"] == owner["email_identity_count"] == 1,
        "Nexus identity has an unsupported linked provider",
    )
    require(not owner["has_mfa"], "Nexus identity has MFA requiring separate migration")
    require(
        bool(re.fullmatch(r"\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}", owner["password"])),
        "Unsupported credential hash",
    )
    return tables, owner


def snapshot(profile: Path, identity: Path, output: Path) -> None:
    require(not output.exists(), "Snapshot destination already exists")
    ref = json.loads(profile.read_text())["ref"]
    require(
        bool(re.fullmatch(r"[a-z0-9]{20}", ref)), "Invalid linked project reference"
    )
    rows = ", ".join(
        f"'{table}', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.{table} t), "
        "'[]'::jsonb)"
        for table in RESTORE_ORDER
    )
    owners = " UNION ".join(
        f"SELECT user_id FROM public.{table}"
        for table in RESTORE_ORDER
        if table != "chat_messages"
    )
    query = f"""
    WITH owners AS ({owners})
    SELECT jsonb_build_object({rows}) AS tables,
        (SELECT jsonb_agg(jsonb_build_object(
            'id', u.id, 'email', lower(u.email), 'password', u.encrypted_password,
            'created_at', u.created_at, 'updated_at', u.updated_at,
            'identity_count', (SELECT count(*) FROM auth.identities
                WHERE user_id = u.id),
            'email_identity_count', (SELECT count(*) FROM auth.identities
                WHERE user_id = u.id AND provider = 'email'),
            'has_mfa', EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id = u.id)
        )) FROM auth.users u JOIN owners o ON o.user_id = u.id
            WHERE u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
              AND (u.banned_until IS NULL OR u.banned_until < now())
              AND NOT u.is_anonymous AND NOT u.is_sso_user) AS owners
    """
    result = subprocess.run(  # nosec B603
        [
            "supabase",
            "db",
            "query",
            f"--remote={ref}",
            "--read-only",
            "--output",
            "json",
            query,
        ],
        capture_output=True,
        check=True,
        timeout=40,
    )
    payload = json.loads(result.stdout)["rows"][0]
    tables, _ = validate(payload)
    raw = encode(payload)
    recipient = subprocess.check_output(
        ["age-keygen", "-y", str(identity)], timeout=10
    ).strip()  # nosec B603
    subprocess.run(  # nosec B603
        ["age", "-r", recipient.decode(), "-o", str(output)],
        input=raw,
        capture_output=True,
        check=True,
        timeout=15,
    )
    decrypted = subprocess.check_output(
        ["age", "-d", "-i", str(identity), str(output)], timeout=15
    )  # nosec B603
    require(decrypted == raw, "Encrypted snapshot verification failed")
    total = sum(map(len, tables.values()))
    print(f"Verified encrypted snapshot of {total} records and one owner.")


def restore(payload: dict, canary_id: UUID | None) -> None:
    tables, owner = validate(payload)
    require(os.environ.get("POSTGRES_DB") == "nexus", "Unexpected target database")
    with psycopg.connect(
        host="nexus-standalone-db",
        dbname="nexus",
        user="postgres",
        password=os.environ["POSTGRES_PASSWORD"],
        connect_timeout=5,
    ) as conn:
        conn.execute("SET LOCAL TIME ZONE 'UTC'")
        existing = {row[0] for row in conn.execute("SELECT id FROM auth.users")}
        allowed = {canary_id} if canary_id is not None else set()
        require(existing == allowed, "Destination contains unexpected accounts")
        conn.execute(
            """INSERT INTO auth.users
                (id, email, name, "emailVerified", "createdAt", "updatedAt")
                VALUES (%s, %s, 'Nexus', true, %s, %s)""",
            (owner["id"], owner["email"], owner["created_at"], owner["updated_at"]),
        )
        conn.execute(
            """INSERT INTO auth.account
                (id, "userId", "accountId", "providerId", password,
                 "createdAt", "updatedAt")
                VALUES (%s, %s, %s, 'credential', %s, %s, %s)""",
            (
                uuid4(),
                owner["id"],
                owner["id"],
                owner["password"],
                owner["created_at"],
                owner["updated_at"],
            ),
        )
        for name in RESTORE_ORDER:
            relation = sql.Identifier("public", name)
            conn.execute(
                sql.SQL(
                    "INSERT INTO {} SELECT * FROM jsonb_populate_recordset("
                    "NULL::{}, %s)"
                ).format(relation, relation),
                (Jsonb(tables[name]),),
            )
            copied = conn.execute(
                sql.SQL("SELECT to_jsonb(t) FROM {} t").format(relation)
            ).fetchall()
            require(
                Counter(map(encode, tables[name]))
                == Counter(encode(row) for (row,) in copied),
                f"Restore verification failed for {name}",
            )
    print(f"Verified restored records in {len(tables)} Nexus tables and one owner.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_subparsers(dest="mode", required=True)
    backup = mode.add_parser("snapshot")
    backup.add_argument("--profile", type=Path, required=True)
    backup.add_argument("--identity", type=Path, required=True)
    backup.add_argument("--output", type=Path, required=True)
    restore_parser = mode.add_parser("restore")
    restore_parser.add_argument("--canary-id", type=UUID)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.mode == "snapshot":
            snapshot(args.profile, args.identity, args.output)
        else:
            restore(json.load(sys.stdin), args.canary_id)
    except (
        KeyError,
        TypeError,
        ValueError,
        OSError,
        subprocess.SubprocessError,
        psycopg.Error,
    ) as exc:
        # Database errors may include row contents or credentials in their detail.
        sys.exit(f"Nexus transfer failed safely ({type(exc).__name__}).")


if __name__ == "__main__":
    main()
