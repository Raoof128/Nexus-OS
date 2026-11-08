"""Keeps backend/.env.example in step with the env names backend/config.py reads."""

import re
from pathlib import Path

from backend.config import MIN_AUDIT_LOG_SALT_LENGTH

ROOT = Path(__file__).resolve().parents[1]
CONFIG_SOURCE = (ROOT / "backend" / "config.py").read_text(encoding="utf-8")
EXAMPLE_SOURCE = (ROOT / "backend" / ".env.example").read_text(encoding="utf-8")

# Matches the first string argument of the env helpers used in config.py, for
# example _get_env("X"), _require_env("X") and _parse_int_env(\n "X", 60).
READ_CALL = re.compile(
    r'(?:_get_env|_require_env|_parse_\w+_env)\(\s*"([A-Z][A-Z0-9_]+)"'
)
EXAMPLE_KEY = re.compile(r"^([A-Z][A-Z0-9_]+)=", re.MULTILINE)


def _read_names() -> set[str]:
    return set(READ_CALL.findall(CONFIG_SOURCE))


def _example_names() -> set[str]:
    return set(EXAMPLE_KEY.findall(EXAMPLE_SOURCE))


def test_scan_finds_the_config_env_names() -> None:
    # Guards against the regex silently matching nothing.
    assert len(_read_names()) > 20


def test_every_env_name_config_reads_is_documented_in_example() -> None:
    missing = _read_names() - _example_names()

    assert missing == set(), f"add these to backend/.env.example: {sorted(missing)}"


def test_every_example_name_is_read_by_config() -> None:
    stale = _example_names() - _read_names()

    assert stale == set(), f"backend/.env.example lists unread names: {sorted(stale)}"


def test_example_audit_salt_placeholder_fails_the_production_length_check() -> None:
    match = re.search(r"^AUDIT_LOG_SALT=(.*)$", EXAMPLE_SOURCE, re.MULTILINE)

    assert match is not None
    assert len(match.group(1)) < MIN_AUDIT_LOG_SALT_LENGTH
