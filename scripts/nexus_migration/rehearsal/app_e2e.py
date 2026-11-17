"""Exercise Nexus's real HTTP app on a disposable standalone database."""

import argparse
import os
import secrets
import subprocess
import sys
import tempfile
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

import httpx
import psycopg
from cryptography.fernet import Fernet
from psycopg.conninfo import make_conninfo

from .__main__ import (
    HERE,
    Cluster,
    bootstrap,
    call,
    expect,
    loopback_url,
    request_config,
    serve,
    start_cluster,
)

OWNER_EMAIL = "nexus-owner@example.com"
OTHER_EMAIL = "nexus-other@example.com"
FRONTEND = HERE.parents[2] / "frontend"


@contextmanager
def application(cluster: Cluster, auth: str, api: str, env: dict[str, str]) -> Iterator:
    port = api.rsplit(":", 1)[1]
    auth_cmd = ["node", str(HERE / "auth.mjs")]
    api_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.app:app",
        "--host",
        "127.0.0.1",
        "--port",
        port,
        "--no-access-log",
    ]
    with (
        serve(auth_cmd, env, f"{auth}/api/auth/get-session", cluster.root / "auth.log"),
        serve(api_cmd, env, f"{api}/healthz", cluster.root / "app.log"),
    ):
        yield


def config(cluster: Cluster, auth: str, api: str, origin: str) -> dict[str, str]:
    def dsn(role: str) -> str:
        return make_conninfo(
            host=cluster.env["PGHOST"],
            dbname=cluster.env["PGDATABASE"],
            port=cluster.env["PGPORT"],
            user=role,
        )

    return {
        "APP_ENV": "development",
        "ALLOWED_ORIGINS": f"{origin},{api}",
        "NEXUS_AUTH_URL": auth,
        "NEXUS_DATABASE_URL": dsn("nexus_rehearsal_api"),
        "NEXUS_MAIL_DATABASE_URL": dsn("nexus_rehearsal_mail"),
        "NEXUS_REHEARSAL_PUBLIC_ORIGIN": origin,
        "AUDIT_LOG_SALT": secrets.token_urlsafe(48),
        "TAKEAWAY_ENCRYPTION_KEY": Fernet.generate_key().decode(),
        # Prevent dotenv from loading developer settings into the fixture processes.
        "PYTHON_DOTENV_DISABLED": "1",
    }


def user_login(client: httpx.Client, email: str, password: str) -> str:
    credentials = {"email": email, "password": password}
    call(client, "POST", "/auth/register", 200, 201, json=credentials)
    result = call(client, "POST", "/auth/login", 200, 201, json=credentials)
    expect(
        "HttpOnly" in result.headers.get("set-cookie", ""), "Missing HttpOnly session"
    )
    expect("token" not in result.json(), "Auth response exposed an upstream token")
    return result.json()["user"]["id"]


def exercise_data(owner: httpx.Client, other: httpx.Client) -> None:
    media_data = {
        "type": "movie",
        "title": "A very long rehearsal title " * 4,
        "creator": "Example director",
        "genre": "Long genre / Documentary",
        "takeaway": "Private media note",
    }
    movie = call(owner, "POST", "/media", 201, json=media_data).json()
    media_path = f"/media/{movie['id']}"
    expect(movie["takeaway"] == media_data["takeaway"], "Media decryption failed")
    expect(call(other, "GET", "/media", 200).json() == [], "Media RLS leaked a row")
    call(other, "PUT", media_path, 404, json={"rating": 4})
    result = call(
        owner, "PUT", media_path, 200, json={"status": "Finished", "rating": 5}
    )
    expect(result.json()["rating"] == 5, "Media update did not persist")
    call(owner, "DELETE", media_path, 204)

    note = call(
        owner,
        "POST",
        "/notes",
        201,
        json={
            "title": "Rehearsal notebook",
            "content": "Private note",
            "labels": ["Fixture"],
        },
    ).json()
    note_path = f"/notes/{note['id']}"
    expect(
        note["content_encrypted"] == "Private note" and note["labels"],
        "Note hydration failed",
    )
    call(other, "PATCH", note_path, 404, json={"title": "Unowned"})
    call(owner, "PATCH", note_path, 200, json={"type": "list"})
    call(owner, "POST", f"{note_path}/items", 201, json={"text": "Check the fixture"})
    call(owner, "DELETE", note_path, 204)
    call(owner, "POST", f"{note_path}/restore", 200)

    session = call(owner, "POST", "/chat/sessions", 201, json={"title": "Fixture chat"})
    session_path = f"/chat/sessions/{session.json()['id']}"
    expect(
        call(other, "GET", "/chat/sessions", 200).json() == [], "Chat RLS leaked a row"
    )
    call(owner, "GET", f"{session_path}/messages", 200)
    call(owner, "DELETE", session_path, 204)


def exercise_tasks(owner: httpx.Client, other: httpx.Client) -> None:
    lists = "/api/tasks/lists"
    task_list = call(owner, "POST", lists, 201, json={"name": "Rehearsal"}).json()
    items = f"{lists}/{task_list['id']}/items"
    due = "2026-11-17T23:15:00+11:00"
    task = call(
        owner,
        "POST",
        items,
        201,
        json={
            "title": "Rehearsal recurring meeting",
            "notes": "Private task note",
            "due": "2026-11-17",
            "due_at": due,
            "due_timezone": "Australia/Sydney",
            "all_day": False,
            "recurrence": "FREQ=DAILY",
        },
    ).json()
    expect(
        datetime.fromisoformat(task["due_at"]) == datetime.fromisoformat(due),
        "Task reminder did not preserve its scheduled instant",
    )
    expect(call(other, "GET", lists, 200).json() == [], "Tasks RLS leaked a list")
    path = f"/api/tasks/items/{task['id']}"
    call(other, "PATCH", path, 404, json={"status": "completed"})
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(
            executor.map(
                lambda _: call(owner, "PATCH", path, 200, json={"status": "completed"}),
                range(4),
            )
        )
    expect(all(r.json()["status"] == "completed" for r in results), "Completion raced")
    rows = call(owner, "GET", items, 200, params={"showCompleted": "true"}).json()
    successors = [row for row in rows if row["id"] != task["id"]]
    expect(len(successors) == 1, "Completing four times must produce one successor")
    expect(
        successors[0]["due"] == "2026-11-18"
        and successors[0]["due_timezone"] == "Australia/Sydney",
        "Incorrect recurrence",
    )


def seed_mail(owner_id: str, env: dict[str, str]) -> str:
    with psycopg.connect(env["NEXUS_DATABASE_URL"]) as conn:
        conn.execute("SELECT set_config('nexus.user_id', %s, true)", (owner_id,))
        account_id = str(
            conn.execute(
                """
            INSERT INTO public.email_accounts
                (user_id, provider, email_address, access_token_enc, refresh_token_enc,
                 token_expires_at, status)
            VALUES (%s, 'google', 'fixture@example.com', 'fixture', 'fixture', now(),
                    'active')
            RETURNING id
            """,
                (owner_id,),
            ).fetchone()[0]
        )
    with psycopg.connect(env["NEXUS_MAIL_DATABASE_URL"]) as conn:
        for provider_id, subject in (
            ("fixture-1", "Rehearsal one"),
            ("fixture-2", "Rehearsal 100%"),
        ):
            conn.execute(
                """
                INSERT INTO public.nexus_emails
                    (user_id, account_id, provider_id, subject,
                     from_address, provider_date)
                VALUES (%s, %s, %s, %s, 'fixture@example.com', '2026-11-17T00:00Z')
                """,
                (owner_id, account_id, provider_id, subject),
            )
    return account_id


def exercise_mail(
    owner: httpx.Client, other: httpx.Client, owner_id: str, env: dict[str, str]
) -> None:
    account_id = seed_mail(owner_id, env)
    accounts = "/api/email/accounts"
    messages = "/api/email/messages"
    account = call(owner, "GET", accounts, 200).json()[0]
    expect(
        account["id"] == account_id and "access_token_enc" not in account,
        "Safe account view returned unexpected columns",
    )
    expect(call(other, "GET", accounts, 200).json() == [], "Account RLS leaked a row")
    expect(
        call(other, "GET", messages, 200).json()["items"] == [], "Mail RLS leaked a row"
    )
    first = call(owner, "GET", messages, 200, params={"limit": 1}).json()
    second = call(
        owner,
        "GET",
        messages,
        200,
        params={
            "limit": 1,
            "cursor_id": first["next_cursor"]["id"],
            "cursor_date": first["next_cursor"]["provider_date"],
        },
    ).json()
    expect(
        len(second["items"]) == 1 and second["next_cursor"] is None,
        "Mail pagination failed for equal timestamps",
    )
    search = call(owner, "GET", messages, 200, params={"search": "%"}).json()["items"]
    expect(
        len(search) == 1 and search[0]["subject"] == "Rehearsal 100%",
        "Mail search did not treat user wildcards literally",
    )
    call(
        owner,
        "POST",
        "/api/email/draft",
        201,
        json={
            "account_id": account_id,
            "subject": "Fixture draft",
            "to": ["draft@example.com"],
            "body_html": "<p>Fixture draft</p>",
        },
    )


def exercise(cluster: Cluster, api: str, origin: str, env: dict[str, str]) -> str:
    default = {
        "base_url": api,
        "trust_env": False,
        "timeout": 10,
        "headers": {
            "Origin": origin,
            "X-Requested-With": "XMLHttpRequest",
        },
    }
    password, replacement = secrets.token_urlsafe(25), secrets.token_urlsafe(25)
    with httpx.Client(**default) as owner, httpx.Client(**default) as other:
        call(owner, "GET", "/media", 401)
        owner_id = user_login(owner, OWNER_EMAIL, password)
        other_id = user_login(other, OTHER_EMAIL, password)
        session = call(owner, "GET", "/auth/session", 200).json()
        expect(
            session["user"]["id"] == owner_id and session["expires_at"],
            "Session mismatch",
        )
        call(owner, "POST", "/auth/refresh", 200, 201)
        call(
            owner, "POST", "/media", 403, headers={"X-Requested-With": "wrong"}, json={}
        )
        exercise_data(owner, other)
        exercise_tasks(owner, other)
        exercise_mail(owner, other, owner_id, env)
        call(
            owner,
            "POST",
            "/auth/forgot-password",
            200,
            201,
            json={"email": OWNER_EMAIL},
        )
        token = (cluster.root / "reset-token").read_text()
        reset = {
            "headers": {"x-recovery-access-token": token},
            "json": {"new_password": replacement},
        }
        call(owner, "POST", "/auth/reset-password", 200, 201, **reset)
        call(owner, "POST", "/auth/reset-password", 400, **reset)
        call(owner, "GET", "/media", 401)
        call(
            owner,
            "POST",
            "/auth/login",
            401,
            json={"email": OWNER_EMAIL, "password": password},
        )
        call(
            owner,
            "POST",
            "/auth/login",
            200,
            201,
            json={"email": OWNER_EMAIL, "password": replacement},
        )
        call(owner, "POST", "/auth/logout", 200, 201)
        call(owner, "GET", "/media", 401)
    return other_id


def browser_check(cluster: Cluster, env: dict[str, str], api: str, origin: str) -> None:
    outbox = cluster.root / "reset-token"
    outbox.unlink()
    with httpx.Client(
        base_url=api, trust_env=False, headers={"Origin": origin}
    ) as http:
        call(
            http, "POST", "/auth/forgot-password", 200, 201, json={"email": OTHER_EMAIL}
        )
    reset_query = urlencode({"type": "recovery", "token": outbox.read_text()})
    vite = FRONTEND / "node_modules" / "vite" / "bin" / "vite.js"
    command = [
        "node",
        str(vite),
        str(FRONTEND),
        "--host",
        "127.0.0.1",
        "--port",
        origin.rsplit(":", 1)[1],
        "--strictPort",
        "--config",
        str(FRONTEND / "vite.config.js"),
    ]
    frontend_env = env | {"VITE_API_URL": api, "VITE_NEXUS_AUTH": "standalone"}
    with serve(command, frontend_env, origin, cluster.root / "vite.log"):
        subprocess.run(
            ["node", str(FRONTEND / "e2e" / "standalone-browser.js")],
            env=env
            | {
                "NEXUS_E2E_ORIGIN": origin,
                "NEXUS_E2E_API": api,
                "NEXUS_E2E_EMAIL": OTHER_EMAIL,
                "NEXUS_E2E_PASSWORD": secrets.token_urlsafe(25),
                "NEXUS_E2E_RESET_URL": f"{origin}/?{reset_query}",
            },
            check=True,
            timeout=90,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path, required=True)
    parser.add_argument("--browser", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="nexus-app-e2e-", dir="/tmp") as tmp:
        with start_cluster(Path(tmp) / "local", args.pg_bin) as cluster:
            env, auth, api = request_config(cluster)
            origin = loopback_url()
            env |= config(cluster, auth, api, origin)
            bootstrap(cluster, env)
            try:
                with application(cluster, auth, api, env):
                    browser_user = exercise(cluster, api, origin, env)
                    print("Standalone API checks passed.", flush=True)
                    if args.browser:
                        seed_mail(browser_user, env)
                        browser_check(cluster, env, api, origin)
            except Exception:
                if os.environ.get("NEXUS_E2E_DEBUG") == "1":
                    for name in ("app", "postgres", "vite"):
                        log = cluster.root / f"{name}.log"
                        if log.is_file():
                            print(log.read_text().splitlines()[-25:], file=sys.stderr)
                raise


if __name__ == "__main__":
    main()
