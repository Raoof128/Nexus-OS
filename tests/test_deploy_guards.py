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

    assert "--no-access-log" in dockerfile


def test_seed_guard_checks_server_address_not_database_name() -> None:
    """A database name is not an environment signal (hosted default is 'postgres')."""

    seed = (ROOT / "supabase" / "seed.sql").read_text(encoding="utf-8")

    assert "ILIKE '%postgres%'" not in seed
    assert "inet_server_addr()" in seed
    assert "auth.users" in seed
