"""Unit tests for the Notes service helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.notes_service import (
    BACKGROUNDS,
    COLORS,
    is_valid_background,
    is_valid_color,
    next_position,
    purge_cutoff,
)


def test_next_position_empty():
    assert next_position([]) == 1.0


def test_next_position_appends_after_max():
    assert next_position([1.0, 5.0, 3.0]) == 6.0


def test_purge_cutoff_is_seven_days_before():
    now = datetime(2026, 6, 16, 12, 0, tzinfo=timezone.utc)
    assert purge_cutoff(now) == (now - timedelta(days=7)).isoformat()


def test_color_validation():
    assert is_valid_color("default") is True
    assert "Coral" in COLORS
    assert is_valid_color("Coral") is True
    assert is_valid_color("not-a-color") is False


def test_background_validation():
    assert is_valid_background(None) is True  # background is optional
    assert "Travel" in BACKGROUNDS
    assert is_valid_background("Travel") is True
    assert is_valid_background("nope") is False
