"""Static checks for deploy-time guards that cannot run inside pytest.

The seed guard needs a live Postgres and the Dockerfile needs a container
build, so these tests pin the properties the files must keep.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_dockerfile_disables_uvicorn_access_log() -> None:
    """The access log records every request line, including OAuth code/state."""

    dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")
    # Only the executable CMD counts; the flag is also named in a comment.
    cmd = [line for line in dockerfile.splitlines() if line.startswith("CMD ")]

    assert len(cmd) == 1
    assert "exec uvicorn" in cmd[0]
    assert "--no-access-log" in cmd[0]


def test_seed_guard_checks_server_address_not_database_name() -> None:
    """A database name is not an environment signal (hosted default is 'postgres')."""

    seed = (ROOT / "supabase" / "seed.sql").read_text(encoding="utf-8")
    # Ignore SQL comments: the guard must be code, not prose in the header.
    code = "\n".join(line.split("--", 1)[0] for line in seed.splitlines())

    assert "ILIKE '%postgres%'" not in code
    assert "inet_server_addr()" in code
    assert "FROM auth.users" in code
    assert "RAISE EXCEPTION" in code
