"""Unit tests for tasks_service recurrence + position helpers."""

from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from backend.tasks_service import (
    next_occurrence,
    next_position,
    recurrence_for_next_instance,
)


def test_daily_steps_one_day():
    assert next_occurrence("FREQ=DAILY", date(2026, 6, 15)) == date(2026, 6, 16)


def test_weekly_interval_two():
    assert next_occurrence("FREQ=WEEKLY;INTERVAL=2", date(2026, 6, 15)) == date(
        2026, 6, 29
    )


def test_monthly_month_end_clamps():
    # Jan 31 monthly -> Feb 28 (2026 is not a leap year)
    assert next_occurrence("FREQ=MONTHLY", date(2026, 1, 31)) == date(2026, 2, 28)


def test_yearly_leap_day():
    assert next_occurrence("FREQ=YEARLY", date(2024, 2, 29)) == date(2025, 2, 28)


def test_schedule_based_not_completion_based():
    # Anchored on the scheduled due date, regardless of when completed.
    assert next_occurrence("FREQ=DAILY", date(2026, 6, 10)) == date(2026, 6, 11)


def test_weekly_byday_next_weekday():
    # From Mon 2026-06-15, FREQ=WEEKLY;BYDAY=MO,WE,FR -> Wed 2026-06-17
    assert next_occurrence("FREQ=WEEKLY;BYDAY=MO,WE,FR", date(2026, 6, 15)) == date(
        2026, 6, 17
    )


def test_no_anchor_returns_none():
    assert next_occurrence("FREQ=DAILY", None) is None


def test_invalid_rrule_returns_none():
    assert next_occurrence("not-a-rule", date(2026, 6, 15)) is None


def test_next_position_appends_after_max():
    assert next_position([0.0, 1.0, 2.0]) == 3.0


def test_next_position_empty_is_one():
    assert next_position([]) == 1.0


def test_next_occurrence_datetime_preserves_time():
    anchor = datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc)
    result = next_occurrence("FREQ=DAILY", anchor)
    assert result == datetime(2026, 6, 16, 9, 0, tzinfo=timezone.utc)


def test_next_occurrence_preserves_wall_clock_across_dst_with_iana_zone():
    anchor = datetime(2026, 3, 7, 14, 0, tzinfo=timezone.utc)
    result = next_occurrence("FREQ=DAILY", anchor, "America/New_York")
    expected = datetime(2026, 3, 8, 9, 0, tzinfo=ZoneInfo("America/New_York"))
    assert result == expected
    assert result.utcoffset().total_seconds() == -4 * 3600


def test_next_occurrence_rejects_invalid_iana_zone():
    anchor = datetime(2026, 3, 7, 14, 0, tzinfo=timezone.utc)
    assert next_occurrence("FREQ=DAILY", anchor, "Invalid/Zone") is None


def test_count_one_has_no_next_occurrence():
    assert next_occurrence("FREQ=DAILY;COUNT=1", date(2026, 6, 15)) is None


def test_count_zero_has_no_next_occurrence():
    assert next_occurrence("FREQ=DAILY;COUNT=0", date(2026, 6, 15)) is None


def test_until_blocks_next_occurrence_after_end():
    assert next_occurrence("FREQ=DAILY;UNTIL=20260615", date(2026, 6, 15)) is None


def test_until_allows_next_occurrence_before_end():
    assert next_occurrence("FREQ=DAILY;UNTIL=20260616", date(2026, 6, 15)) == date(
        2026, 6, 16
    )


def test_invalid_until_has_no_next_occurrence():
    assert next_occurrence("FREQ=DAILY;UNTIL=bad", date(2026, 6, 15)) is None


def test_datetime_until_inherits_anchor_timezone_when_offset_missing():
    anchor = datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc)
    assert next_occurrence("FREQ=DAILY;UNTIL=20260616T235959", anchor) == datetime(
        2026, 6, 16, 9, 0, tzinfo=timezone.utc
    )


def test_recurrence_for_next_instance_decrements_count():
    assert recurrence_for_next_instance("FREQ=DAILY;COUNT=3") == "FREQ=DAILY;COUNT=2"


def test_recurrence_for_next_instance_preserves_prefix():
    assert (
        recurrence_for_next_instance("RRULE:FREQ=WEEKLY;COUNT=2")
        == "RRULE:FREQ=WEEKLY;COUNT=1"
    )
