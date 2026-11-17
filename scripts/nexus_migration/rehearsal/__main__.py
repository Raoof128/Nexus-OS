"""Run the PostgreSQL/Better Auth proof on disposable, loopback-only services."""

import argparse
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import Barrier
from uuid import UUID, uuid4

import httpx
import psycopg

from ..scope import nexus_data_dump_filters
from .schema import catalog_snapshot, seed_related_rows

HERE = Path(__file__).resolve().parent
MIGRATIONS = HERE.parents[2] / "supabase" / "migrations"
DATABASE = "nexus_rehearsal"
OWNER = "nexus_rehearsal_owner"


class RehearsalError(RuntimeError):
    """A failed rehearsal check."""


@dataclass(frozen=True)
class Cluster:
    root: Path
    bin_dir: Path

    @property
    def data(self) -> Path:
        return self.root / "pgdata"

    @property
    def env(self) -> dict[str, str]:
        # Reconstruct the environment so no PG service, production credentials,
        # SMTP configuration, or outbound proxy can enter the rehearsal.
        return {
            "PATH": os.environ.get("PATH", os.defpath),
            "LC_ALL": "C",
            "PGHOST": str(self.root / "socket"),
            "PGPORT": "5432",
            "PGDATABASE": DATABASE,
            "PGUSER": OWNER,
            "NEXUS_REHEARSAL_ROOT": str(self.root),
        }

    def pg(self, command: str, *arguments: str) -> None:
        run([str(self.bin_dir / command), *arguments], env=self.env)

    def connect(self) -> psycopg.Connection:
        return psycopg.connect(
            host=self.env["PGHOST"],
            port=5432,
            dbname=DATABASE,
            user=OWNER,
            connect_timeout=3,
        )


def run(command: list[str], *, env: dict[str, str]) -> None:
    try:
        subprocess.run(command, env=env, capture_output=True, check=True, timeout=45)
    except (OSError, subprocess.SubprocessError) as exc:
        name = Path(command[0]).name
        raise RehearsalError(
            f"Local command failed: {name} ({type(exc).__name__})."
        ) from None


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise RehearsalError(message)


@contextmanager
def start_cluster(root: Path, bin_dir: Path) -> Generator[Cluster]:
    root.mkdir(mode=0o700)
    (root / "socket").mkdir(mode=0o700)
    cluster = Cluster(root, bin_dir)
    cluster.pg(
        "initdb",
        "-D",
        str(cluster.data),
        "-U",
        OWNER,
        "-A",
        "trust",
        "-E",
        "UTF8",
        "--no-locale",
    )
    with (cluster.data / "postgresql.conf").open("a", encoding="utf-8") as settings:
        # A private Unix socket is the only DB transport accepting these fixture roles.
        settings.write(
            f"\nlisten_addresses = ''\nunix_socket_directories = '{root / 'socket'}'\n"
            "shared_buffers = '48MB'\nmax_connections = 24\n"
        )
    try:
        cluster.pg(
            "pg_ctl",
            "-D",
            str(cluster.data),
            "-l",
            str(root / "postgres.log"),
            "-w",
            "-t",
            "10",
            "start",
        )
        with psycopg.connect(
            host=cluster.env["PGHOST"],
            port=5432,
            dbname="postgres",
            user=OWNER,
            autocommit=True,
            connect_timeout=3,
        ) as conn:
            expect(
                conn.execute("SHOW listen_addresses").fetchone() == ("",),
                "The rehearsal database must use its private socket.",
            )
            conn.execute("CREATE ROLE nexus_rehearsal_auth LOGIN")
            conn.execute("CREATE ROLE nexus_rehearsal_api LOGIN")
            conn.execute("CREATE ROLE nexus_rehearsal_mail LOGIN")
            conn.execute("CREATE ROLE anon NOLOGIN")
            conn.execute("CREATE ROLE authenticated NOLOGIN")
            conn.execute("GRANT authenticated TO nexus_rehearsal_api")
            conn.execute("CREATE DATABASE nexus_rehearsal")
        yield cluster
    finally:
        if (cluster.data / "postmaster.pid").is_file():
            cluster.pg(
                "pg_ctl",
                "-D",
                str(cluster.data),
                "-w",
                "-t",
                "10",
                "-m",
                "fast",
                "stop",
            )


def loopback_url() -> str:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return f"http://127.0.0.1:{listener.getsockname()[1]}"


def bootstrap(cluster: Cluster, env: dict[str, str]) -> None:
    cluster.pg(
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "CREATE SCHEMA auth AUTHORIZATION nexus_rehearsal_auth",
    )
    run(["node", str(HERE / "auth.mjs"), "--migrate"], env=env)
    cluster.pg(
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        """
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
            SELECT nullif(current_setting('nexus.user_id', true), '')::uuid
        $$;
        CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
            SELECT CASE WHEN current_user = 'nexus_rehearsal_mail'
                THEN 'service_role' ELSE current_user::text END
        $$;
        GRANT USAGE ON SCHEMA auth TO nexus_rehearsal_api, nexus_rehearsal_mail;
        CREATE PUBLICATION supabase_realtime;
        """,
    )
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        cluster.pg("psql", "-X", "-v", "ON_ERROR_STOP=1", "-f", str(migration))
    cluster.pg(
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        """
        -- Historical migrations refer to this publication during replay.
        DROP PUBLICATION supabase_realtime;
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            public.media, public.chat_sessions, public.chat_messages,
            public.nexus_task_lists, public.nexus_tasks,
            public.nexus_notes, public.nexus_note_items, public.nexus_note_labels,
            public.nexus_note_label_links, public.email_accounts TO authenticated;
        GRANT SELECT ON public.email_accounts_safe, public.nexus_emails
            TO authenticated;
        GRANT SELECT, UPDATE ON public.email_accounts TO nexus_rehearsal_mail;
        GRANT SELECT, INSERT, UPDATE ON public.nexus_emails TO nexus_rehearsal_mail;
        CREATE POLICY "Mail poller reads accounts" ON public.email_accounts
            FOR SELECT TO nexus_rehearsal_mail USING (true);
        CREATE POLICY "Mail poller updates accounts" ON public.email_accounts
            FOR UPDATE TO nexus_rehearsal_mail USING (true) WITH CHECK (true);
        """,
    )


@contextmanager
def serve(
    command: list[str], env: dict[str, str], url: str, log: Path
) -> Generator[subprocess.Popen]:
    with log.open("wb") as output:
        process = subprocess.Popen(
            command, env=env, stdout=output, stderr=subprocess.STDOUT
        )
        try:
            with httpx.Client(timeout=0.5, trust_env=False) as client:
                deadline = time.monotonic() + 12
                status = "no response"
                while time.monotonic() < deadline and process.poll() is None:
                    try:
                        response = client.get(url)
                        status = str(response.status_code)
                        if response.is_success:
                            break
                    except httpx.RequestError as exc:
                        status = type(exc).__name__
                    time.sleep(0.15)
                else:
                    name = Path(command[0]).name
                    raise RehearsalError(
                        f"Local service did not start: {name} ({status})"
                    )
            yield process
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)


def call(
    client: httpx.Client, method: str, url: str, *expected: int, **kwargs
) -> httpx.Response:
    try:
        response = client.request(method, url, **kwargs)
    except httpx.RequestError:
        raise RehearsalError(f"Synthetic request failed: {method} {url}") from None
    expect(
        response.status_code in expected,
        f"{method} {url}: expected {expected}, got {response.status_code}",
    )
    return response


def request_config(cluster: Cluster) -> tuple[dict[str, str], str, str]:
    auth_url, api_url = loopback_url(), loopback_url()
    while auth_url == api_url:
        api_url = loopback_url()
    env = cluster.env | {
        "NEXUS_REHEARSAL_AUTH_URL": auth_url,
        "NEXUS_REHEARSAL_API_URL": api_url,
        "BETTER_AUTH_SECRET": secrets.token_urlsafe(48),
    }
    return env, auth_url, api_url


@contextmanager
def start_services(
    cluster: Cluster,
    env: dict[str, str],
    auth_url: str,
    api_url: str,
) -> Generator[tuple[int, int]]:
    auth_cmd = ["node", str(HERE / "auth.mjs")]
    api_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "scripts.nexus_migration.rehearsal.api:create_app",
        "--factory",
        "--host",
        "127.0.0.1",
        "--port",
        api_url.rsplit(":", 1)[1],
        "--no-access-log",
    ]
    with (
        serve(
            auth_cmd, env, f"{auth_url}/api/auth/get-session", cluster.root / "auth.log"
        ) as auth,
        serve(api_cmd, env, f"{api_url}/healthz", cluster.root / "api.log") as api,
    ):
        yield auth.pid, api.pid


def reset_password(
    client: httpx.Client, cluster: Cluster, auth_url: str, email: str, password: str
) -> None:
    call(
        client,
        "POST",
        f"{auth_url}/api/auth/request-password-reset",
        200,
        json={"email": email, "redirectTo": f"{auth_url}/reset-password"},
    )
    outbox = cluster.root / "reset-token"
    reset = {"newPassword": password, "token": outbox.read_text(encoding="utf-8")}
    outbox.unlink()
    call(client, "POST", f"{auth_url}/api/auth/reset-password", 200, json=reset)
    call(client, "POST", f"{auth_url}/api/auth/reset-password", 400, 401, json=reset)


def check_imported_user(cluster: Cluster, auth_url: str, api_url: str) -> None:
    identifier = uuid4()
    email = "imported@example.test"
    title = "Imported rehearsal movie"
    with cluster.connect() as conn:
        # Model an imported verified identity with its existing UUID and
        # dependent row. Recovery provisions a new password on the target.
        conn.execute(
            """
            INSERT INTO auth.users
                (id, name, email, "emailVerified", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, true, now(), now())
            """,
            (identifier, "Imported fixture", email),
        )
        conn.execute(
            """
            INSERT INTO public.media (user_id, title, type, status)
            VALUES (%s, %s, 'movie', 'To Watch')
            """,
            (identifier, title),
        )
    with httpx.Client(
        timeout=8, trust_env=False, headers={"Origin": auth_url}
    ) as imported:
        password = secrets.token_urlsafe(24)
        reset_password(imported, cluster, auth_url, email, password)
        call(
            imported,
            "POST",
            f"{auth_url}/api/auth/sign-in/email",
            200,
            json={"email": email, "password": password},
        )
        rows = call(imported, "GET", f"{api_url}/media", 200).json()
        expect(
            [(row["title"], row["user_id"]) for row in rows]
            == [(title, str(identifier))],
            "Migrated identity lost its original media ownership.",
        )
    print("Passed password setup for an imported account with its original UUID.")


def source_flow(
    cluster: Cluster, auth_url: str, api_url: str
) -> tuple[dict, str, str, str]:
    original_password = secrets.token_urlsafe(24)
    new_password = secrets.token_urlsafe(24)
    write_headers = {"Origin": api_url, "X-Requested-With": "XMLHttpRequest"}
    email = "owner@example.test"
    client_options = {"timeout": 8, "trust_env": False, "headers": {"Origin": auth_url}}
    with (
        httpx.Client(**client_options) as owner,
        httpx.Client(**client_options) as second,
        httpx.Client(**client_options) as anonymous,
    ):
        for client, address in ((owner, email), (second, "other@example.test")):
            call(
                client,
                "POST",
                f"{auth_url}/api/auth/sign-up/email",
                200,
                json={
                    "name": "Synthetic user",
                    "email": address,
                    "password": original_password,
                },
            )
        owner.cookies.clear()
        call(
            owner,
            "POST",
            f"{auth_url}/api/auth/sign-in/email",
            200,
            json={"email": email, "password": original_password},
        )
        media_url = f"{api_url}/media"
        call(anonymous, "GET", media_url, 401)
        movie = {
            "type": "movie",
            "title": "Nexus rehearsal movie",
            "creator": "Fixture",
        }
        call(owner, "POST", media_url, 403, json=movie)
        created = call(
            owner, "POST", media_url, 201, json=movie, headers=write_headers
        ).json()
        edit_url = f"{media_url}/{created['id']}"
        expect(
            call(second, "GET", media_url, 200).json() == [],
            "Foreign media was visible.",
        )
        call(
            second,
            "PUT",
            edit_url,
            404,
            json={"rating": 1},
            headers=write_headers | {"X-User-ID": created["user_id"]},
        )
        edited = call(
            owner,
            "PUT",
            edit_url,
            200,
            json={"status": "Finished", "rating": 4},
            headers=write_headers,
        ).json()
        expect(
            edited["status"] == "Finished" and edited["rating"] == 4,
            "Owner changes were not saved.",
        )
        expect(
            call(owner, "GET", media_url, 200).json() == [edited], "Owner read failed."
        )
        expect(
            call(second, "GET", media_url, 200).json() == [],
            "Pooled connection retained the previous user's identity.",
        )
        reset_password(anonymous, cluster, auth_url, email, new_password)
        call(owner, "GET", media_url, 401)
        call(
            owner,
            "POST",
            f"{auth_url}/api/auth/sign-in/email",
            400,
            401,
            json={"email": email, "password": original_password},
        )
        call(
            owner,
            "POST",
            f"{auth_url}/api/auth/sign-in/email",
            200,
            json={"email": email, "password": new_password},
        )
        resumed = call(owner, "GET", media_url, 200)
        expect(resumed.json() == [edited], "Password reset changed media ownership.")
        print(
            "Passed sign-in, reset, session revocation, Media Vault, and two-user RLS."
        )
        return edited, email, new_password, resumed.request.headers["cookie"]


def memory_snapshot(cluster: Cluster, auth_pid: int, api_pid: int) -> None:
    postmaster = int((cluster.data / "postmaster.pid").read_text().splitlines()[0])
    try:
        output = subprocess.check_output(
            ["ps", "-axo", "pid=,ppid=,rss="], text=True, timeout=3
        )
        processes = {
            pid: (parent, rss)
            for pid, parent, rss in (
                map(int, line.split()) for line in output.splitlines() if line.strip()
            )
        }
        pg_rss = sum(
            rss
            for pid, (parent, rss) in processes.items()
            if pid == postmaster or parent == postmaster
        )
        auth_rss = processes[auth_pid][1]
        api_rss = processes[api_pid][1]
    except (OSError, subprocess.SubprocessError, KeyError, ValueError):
        print("Local RSS sample unavailable.")
        return
    print(
        f"Local RSS (MiB): Auth {auth_rss / 1024:.1f}, Litestar {api_rss / 1024:.1f}, "
        f"PostgreSQL process sum {pg_rss / 1024:.1f} (includes shared pages)."
    )


def backup_with_signins(
    cluster: Cluster, archive: str, auth_url: str, email: str, password: str
) -> None:
    start = Barrier(5, timeout=10)

    def login() -> None:
        with httpx.Client(timeout=15, trust_env=False) as client:
            start.wait()
            call(
                client,
                "POST",
                f"{auth_url}/api/auth/sign-in/email",
                200,
                json={"email": email, "password": password},
            )

    with ThreadPoolExecutor(max_workers=4) as executor:
        logins = [executor.submit(login) for _ in range(4)]
        start.wait()
        cluster.pg("pg_dump", "--format=custom", "--file", archive)
        for result in logins:
            result.result()
    print("Completed a fixture backup alongside four concurrent sign-ins.")


def report_cgroup() -> None:
    root = Path("/sys/fs/cgroup")
    if not (root / "memory.peak").is_file():
        return
    peak = int((root / "memory.peak").read_text())
    limit = (root / "memory.max").read_text().strip()
    events = dict(
        line.split() for line in (root / "memory.events").read_text().splitlines()
    )
    expect(events.get("oom_kill") == "0", "Rehearsal cgroup recorded an OOM kill.")
    limit_label = "unlimited" if limit == "max" else f"{int(limit) / 2**20:.0f} MiB"
    print(f"Linux cgroup memory peak: {peak / 2**20:.1f} MiB (limit {limit_label}).")


def prepare_scoped_transfer(source: Cluster, archive: str) -> list[tuple]:
    with source.connect() as conn:
        identities = conn.execute(
            """
            SELECT id, name, email, "emailVerified", "createdAt", "updatedAt"
            FROM auth.users
            WHERE email IN ('owner@example.test', 'imported@example.test')
            """
        ).fetchall()
        expect(len(identities) == 2, "Missing fixture accounts for scoped transfer.")
        conn.execute("CREATE TABLE public.fixture_unrelated (value text NOT NULL)")
        conn.execute("INSERT INTO public.fixture_unrelated VALUES ('Separate fixture')")
    source.pg(
        "pg_dump",
        "--format=custom",
        "--data-only",
        "--strict-names",
        "--file",
        archive,
        *nexus_data_dump_filters(),
    )
    return identities


def verify_scoped_transfer(
    target: Cluster, archive: str, identities: list[tuple], original: tuple
) -> None:
    env, _, _ = request_config(target)
    bootstrap(target, env)
    with target.connect() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO auth.users
                    (id, name, email, "emailVerified", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                identities,
            )
    target.pg(
        "pg_restore",
        "--exit-on-error",
        "--single-transaction",
        "--dbname",
        DATABASE,
        archive,
    )
    with target.connect() as conn:
        expect(
            catalog_snapshot(conn) == original,
            "Scoped transfer changed Nexus rows or admitted an unrelated table.",
        )
        expect(
            conn.execute("SELECT count(*) FROM auth.users").fetchone() == (2,),
            "Scoped transfer admitted an unrelated identity.",
        )
    print("Passed Nexus-only transfer while excluding an unrelated table and identity.")


def rehearse(bin_dir: Path) -> None:
    expect(shutil.which("node") is not None, "Install Node.js before rehearsing.")
    with tempfile.TemporaryDirectory(prefix="nxs-pg-", dir="/tmp") as temp:
        root = Path(temp)
        archive = str(root / "synthetic.dump")
        scoped_archive = str(root / "scoped-data.dump")
        with start_cluster(root / "source", bin_dir) as source:
            env, auth_url, api_url = request_config(source)
            bootstrap(source, env)
            with start_services(source, env, auth_url, api_url) as (auth_pid, api_pid):
                edited, email, password, old_cookie = source_flow(
                    source, auth_url, api_url
                )
                check_imported_user(source, auth_url, api_url)
                with source.connect() as conn:
                    seed_related_rows(conn, UUID(edited["user_id"]))
                    original_catalog = catalog_snapshot(conn)
                    version = conn.info.server_version
                print(
                    f"PostgreSQL {version}; "
                    f"{len(original_catalog[0])} tables with fixtures."
                )
                memory_snapshot(source, auth_pid, api_pid)
                backup_with_signins(source, archive, auth_url, email, password)
            scoped_identities = prepare_scoped_transfer(source, scoped_archive)
        with start_cluster(root / "restore", bin_dir) as target:
            target.pg(
                "pg_restore",
                "--exit-on-error",
                "--single-transaction",
                "--dbname",
                DATABASE,
                archive,
            )
            with target.connect() as conn:
                expect(
                    catalog_snapshot(conn) == original_catalog,
                    "The scoped records or table layout changed during restore.",
                )
            env, auth_url, api_url = request_config(target)
            with start_services(target, env, auth_url, api_url):
                with httpx.Client(timeout=8, trust_env=False) as client:
                    call(
                        client,
                        "GET",
                        f"{api_url}/media",
                        401,
                        headers={"Cookie": old_cookie},
                    )
                    call(
                        client,
                        "POST",
                        f"{auth_url}/api/auth/sign-in/email",
                        200,
                        json={"email": email, "password": password},
                    )
                    expect(
                        call(client, "GET", f"{api_url}/media", 200).json() == [edited],
                        "The restored account or media row diverged from the source.",
                    )
        print("Passed backup restore into a second isolated PostgreSQL cluster.")
        with start_cluster(root / "scoped", bin_dir) as scoped:
            verify_scoped_transfer(
                scoped, scoped_archive, scoped_identities, original_catalog
            )
        report_cgroup()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    args = parser.parse_args()
    try:
        rehearse(args.pg_bin.resolve(strict=True))
    except (RehearsalError, psycopg.Error, OSError, ValueError) as exc:
        message = str(exc) if isinstance(exc, RehearsalError) else type(exc).__name__
        parser.exit(1, f"Rehearsal failed: {message}\n")


if __name__ == "__main__":
    main()
