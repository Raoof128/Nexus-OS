"""Unit tests for tasks_service recurrence + position helpers."""

from __future__ import annotations

import threading
from datetime import date, datetime, timezone

import pytest

from backend.tasks_service import next_occurrence, next_position, validate_recurrence

ANCHOR = date(2026, 6, 15)
GUARD_SECONDS = 5.0


def _run_with_deadline(func, *args):
    """Run ``func`` in a daemon thread and fail instead of hanging the suite.

    dateutil cannot be interrupted, so a regression would leave the thread
    running. It is a daemon thread and does not block interpreter exit.
    """

    result: dict[str, object] = {}

    def target() -> None:
        result["value"] = func(*args)

    worker = threading.Thread(target=target, daemon=True)
    worker.start()
    worker.join(GUARD_SECONDS)
    assert not worker.is_alive(), "recurrence evaluation did not finish in time"
    return result["value"]


# ---- Fast path (FREQ + INTERVAL only) -----------------------------------


def test_daily_steps_one_day():
    assert next_occurrence("FREQ=DAILY", ANCHOR) == date(2026, 6, 16)


def test_weekly_interval_two():
    assert next_occurrence("FREQ=WEEKLY;INTERVAL=2", ANCHOR) == date(2026, 6, 29)


def test_monthly_month_end_clamps():
    # Jan 31 monthly -> Feb 28 (2026 is not a leap year)
    assert next_occurrence("FREQ=MONTHLY", date(2026, 1, 31)) == date(2026, 2, 28)


def test_yearly_leap_day():
    assert next_occurrence("FREQ=YEARLY", date(2024, 2, 29)) == date(2025, 2, 28)


def test_next_occurrence_is_anchored_on_due_date_not_completion():
    # The result depends only on the scheduled date passed in.
    assert next_occurrence("FREQ=DAILY", date(2026, 6, 10)) == date(2026, 6, 11)


def test_datetime_anchor_preserves_time():
    anchor = datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc)
    assert next_occurrence("FREQ=DAILY", anchor) == datetime(
        2026, 6, 16, 9, 0, tzinfo=timezone.utc
    )


# ---- General path (BY* parts) -------------------------------------------


def test_weekly_byday_next_weekday():
    # From Mon 2026-06-15, FREQ=WEEKLY;BYDAY=MO,WE,FR -> Wed 2026-06-17
    assert next_occurrence("FREQ=WEEKLY;BYDAY=MO,WE,FR", ANCHOR) == date(2026, 6, 17)


def test_yearly_bymonthday_skips_to_next_leap_day():
    assert next_occurrence("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", ANCHOR) == date(
        2028, 2, 29
    )


def test_datetime_anchor_with_byday_preserves_time():
    anchor = datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc)
    assert next_occurrence("FREQ=WEEKLY;BYDAY=MO,WE,FR", anchor) == datetime(
        2026, 6, 17, 9, 0, tzinfo=timezone.utc
    )


# ---- Unsupported or malformed rules return None -------------------------


def test_no_anchor_returns_none():
    assert next_occurrence("FREQ=DAILY", None) is None


def test_invalid_rrule_returns_none():
    assert next_occurrence("not-a-rule", ANCHOR) is None


@pytest.mark.parametrize("interval", ["0", "-1", "+1", "abc", "1.5"])
def test_invalid_interval_returns_none(interval):
    assert (
        _run_with_deadline(next_occurrence, f"FREQ=DAILY;INTERVAL={interval}", ANCHOR)
        is None
    )


def test_interval_zero_does_not_hang_general_path():
    # Previously INTERVAL=0 looped forever inside dateutil for every FREQ.
    for rule in (
        "FREQ=DAILY;INTERVAL=0",
        "FREQ=WEEKLY;INTERVAL=0",
        "FREQ=MONTHLY;INTERVAL=0",
        "FREQ=YEARLY;INTERVAL=0",
        "FREQ=DAILY;INTERVAL=0;BYDAY=MO",
    ):
        assert _run_with_deadline(next_occurrence, rule, ANCHOR) is None


@pytest.mark.parametrize(
    "rule",
    [
        "FREQ=DAILY;INTERVAL=99999999999",
        "FREQ=YEARLY;INTERVAL=100000",
        "FREQ=MONTHLY;INTERVAL=100000000",
        "FREQ=WEEKLY;INTERVAL=99999999999",
    ],
)
def test_overflowing_interval_returns_none_without_raising(rule):
    assert _run_with_deadline(next_occurrence, rule, ANCHOR) is None


def test_date_overflow_near_max_year_returns_none():
    assert next_occurrence("FREQ=DAILY", date(9999, 12, 31)) is None
    assert next_occurrence("FREQ=WEEKLY", date(9999, 12, 31)) is None


@pytest.mark.parametrize("freq", ["HOURLY", "SECONDLY", "FOO"])
def test_unsupported_freq_returns_none(freq):
    assert next_occurrence(f"FREQ={freq}", datetime(2026, 6, 15, 9, 0)) is None


def test_count_is_not_honoured_and_returns_none():
    # A series regenerated from each date would never run out under COUNT.
    assert next_occurrence("FREQ=DAILY;COUNT=1", ANCHOR) is None
    assert next_occurrence("FREQ=DAILY;COUNT=5", ANCHOR) is None
    assert next_occurrence("FREQ=DAILY;COUNT=0", ANCHOR) is None


def test_dtstart_inside_rule_returns_none():
    assert next_occurrence("FREQ=DAILY;DTSTART=20200101", ANCHOR) is None


def test_impossible_monthday_pair_returns_none_quickly():
    # BYMONTH=2;BYMONTHDAY=30 never matches; dateutil used to search to MAXYEAR.
    assert (
        _run_with_deadline(
            next_occurrence, "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30", ANCHOR
        )
        is None
    )
    assert _run_with_deadline(next_occurrence, "FREQ=DAILY;BYMONTH=13", ANCHOR) is None


# ---- UNTIL ---------------------------------------------------------------


def test_until_in_the_past_returns_none():
    assert next_occurrence("FREQ=DAILY;UNTIL=20200101", ANCHOR) is None


def test_until_in_the_future_keeps_recurring():
    assert next_occurrence("FREQ=DAILY;UNTIL=20270101", ANCHOR) == date(2026, 6, 16)


def test_until_is_inclusive_for_date_anchor():
    assert next_occurrence("FREQ=DAILY;UNTIL=20260616", ANCHOR) == date(2026, 6, 16)


def test_until_before_next_occurrence_returns_none():
    assert next_occurrence("FREQ=DAILY;UNTIL=20260615", ANCHOR) is None


def test_until_with_aware_anchor_and_utc_bound():
    anchor = datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc)
    assert next_occurrence("FREQ=DAILY;UNTIL=20270101T000000Z", anchor) == datetime(
        2026, 6, 16, 9, 0, tzinfo=timezone.utc
    )


def test_naive_until_with_aware_anchor_does_not_raise():
    anchor = datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc)
    assert next_occurrence("FREQ=DAILY;UNTIL=20270101T000000", anchor) == datetime(
        2026, 6, 16, 9, 0, tzinfo=timezone.utc
    )


def test_malformed_until_returns_none():
    assert next_occurrence("FREQ=DAILY;UNTIL=garbage", ANCHOR) is None


# ---- validate_recurrence (write-time) ------------------------------------


@pytest.mark.parametrize(
    "rule",
    [
        "FREQ=DAILY",
        "FREQ=WEEKLY;BYDAY=MO,WE,FR",
        "RRULE:FREQ=MONTHLY;INTERVAL=3",
        "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29",
        "FREQ=MONTHLY;BYDAY=1MO",
        "FREQ=DAILY;UNTIL=20300101T120000Z",
    ],
)
def test_validate_recurrence_accepts_supported_rules(rule):
    assert validate_recurrence(rule) == rule


@pytest.mark.parametrize(
    "rule",
    [
        "FREQ=DAILY;INTERVAL=0",
        "FREQ=DAILY;INTERVAL=-1",
        "FREQ=DAILY;INTERVAL=99999999999",
        "FREQ=DAILY;COUNT=1",
        "FREQ=DAILY;COUNT=1;UNTIL=20300101",
        "FREQ=HOURLY",
        "FREQ=FOO",
        "hello world",
        "FREQ=",
        "FREQ=DAILY;UNTIL=garbage",
        "FREQ=DAILY;BYMONTH=13",
        "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30",
        "FREQ=DAILY;BYMONTHDAY=0",
        "FREQ=DAILY;DTSTART=20260101",
        "FREQ=DAILY;BYDAY=1MO",
        "FREQ=DAILY;FREQ=WEEKLY",
        "FREQ=DAILY;" + "X" * 300,
        "BYDAY=MO",
    ],
)
def test_validate_recurrence_rejects_unsupported_rules(rule):
    with pytest.raises(ValueError):
        validate_recurrence(rule)


@pytest.mark.parametrize(
    "rule",
    [
        # dateutil raised IndexError on these; they must be rejected at write time.
        "FREQ=YEARLY;BYDAY=99MO",
        "FREQ=MONTHLY;BYDAY=54FR",
        # Ordinal zero is outside the RFC 5545 ABNF range.
        "FREQ=MONTHLY;BYDAY=0MO",
        # Regex-shaped but not a real calendar date or time.
        "FREQ=DAILY;UNTIL=20261340",
        "FREQ=DAILY;UNTIL=20270230",
        "FREQ=DAILY;UNTIL=20261231T250000Z",
    ],
)
def test_validate_recurrence_rejects_values_that_would_fail_evaluation(rule):
    with pytest.raises(ValueError):
        validate_recurrence(rule)


def test_validate_recurrence_normalises_case_per_rfc_5545():
    # RFC 5545 section 2: enumerated values are case-insensitive.
    assert validate_recurrence("freq=weekly;byday=mo,we") == "FREQ=WEEKLY;BYDAY=MO,WE"


def test_next_occurrence_never_raises_for_index_error_rule():
    # Defence in depth: a rule that reached storage must still evaluate to None.
    assert next_occurrence("FREQ=YEARLY;BYDAY=99MO", ANCHOR) is None


def test_validate_recurrence_blank_becomes_none():
    assert validate_recurrence("   ") is None
    assert validate_recurrence(None) is None


def test_next_position_appends_after_max():
    assert next_position([0.0, 1.0, 2.0]) == 3.0


def test_next_position_empty_is_one():
    assert next_position([]) == 1.0
