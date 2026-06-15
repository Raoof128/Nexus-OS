"""Pure logic for the Tasks app: recurrence math and position helpers.

Kept free of I/O so it is unit-testable without a database. The controller
wires these into PostgREST calls.
"""

from __future__ import annotations

from datetime import date, datetime

from dateutil.relativedelta import relativedelta
from dateutil.rrule import rrulestr

# Simple frequencies map to a relativedelta step, which clamps month-end the way
# Google Tasks does (Jan 31 monthly -> Feb 28; Feb 29 yearly -> Feb 28). dateutil's
# rrule instead *skips* non-matching months, so we only use it for rules that carry
# BY* parts (e.g. BYDAY) where relativedelta cannot express the recurrence.
_SIMPLE_STEP = {
    "DAILY": lambda n: relativedelta(days=n),
    "WEEKLY": lambda n: relativedelta(weeks=n),
    "MONTHLY": lambda n: relativedelta(months=n),
    "YEARLY": lambda n: relativedelta(years=n),
}


def _parse_rrule(recurrence: str) -> dict[str, str]:
    """Parse an ``RRULE`` string into an uppercased key/value dict."""

    parts: dict[str, str] = {}
    for chunk in recurrence.replace("RRULE:", "").split(";"):
        if "=" in chunk:
            key, _, value = chunk.partition("=")
            parts[key.strip().upper()] = value.strip()
    return parts


def next_occurrence(
    recurrence: str | None,
    anchor: date | datetime | None,
) -> date | datetime | None:
    """Return the next occurrence strictly after ``anchor`` for an RRULE.

    Schedule-based: the next instance is computed from the scheduled due date
    (``anchor``), never from a completion timestamp. Returns ``None`` when there
    is no anchor or the rule cannot be parsed, so callers skip regeneration.
    """

    if anchor is None or not recurrence:
        return None

    is_date_only = isinstance(anchor, date) and not isinstance(anchor, datetime)

    parts = _parse_rrule(recurrence)
    freq = parts.get("FREQ", "")
    try:
        interval = int(parts.get("INTERVAL", "1"))
    except ValueError:
        return None
    has_by_parts = any(key.startswith("BY") for key in parts)

    # Fast path: a plain frequency with no BY* parts -> clamp with relativedelta.
    if freq in _SIMPLE_STEP and not has_by_parts and interval >= 1:
        return anchor + _SIMPLE_STEP[freq](interval)

    # General path: defer to dateutil for BY*-bearing rules (e.g. BYDAY).
    dtstart = (
        datetime(anchor.year, anchor.month, anchor.day) if is_date_only else anchor
    )
    try:
        rule = rrulestr(recurrence, dtstart=dtstart)
        nxt = rule.after(dtstart, inc=False)
    except (ValueError, TypeError):
        return None

    if nxt is None:
        return None
    return nxt.date() if is_date_only else nxt


def next_position(positions: list[float]) -> float:
    """Return a position that appends after the current maximum."""

    return (max(positions) + 1.0) if positions else 1.0
