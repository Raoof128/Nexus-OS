"""Pure logic for the Tasks app: recurrence math and position helpers.

Kept free of I/O so it is unit-testable without a database. The controller
wires these into PostgREST calls.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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


def _parse_until(value: str, is_date_only: bool) -> date | datetime | None:
    try:
        if is_date_only:
            return date.fromisoformat(value[:8] if len(value) == 8 else value)
        normalized = value.replace("Z", "+00:00")
        if "T" not in normalized and len(normalized) == 8:
            normalized = (
                f"{normalized[:4]}-{normalized[4:6]}-{normalized[6:8]}T23:59:59"
            )
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def recurrence_for_next_instance(recurrence: str | None) -> str | None:
    """Return the recurrence rule to attach to the spawned next instance.

    RRULE COUNT is total remaining occurrences including the current instance.
    After completing one occurrence, the next generated task must carry one fewer
    remaining count so finite recurring series eventually stop.
    """

    if not recurrence:
        return recurrence

    has_prefix = recurrence.upper().startswith("RRULE:")
    prefix = recurrence[:6] if has_prefix else ""
    body = recurrence[6:] if has_prefix else recurrence
    chunks = body.split(";")
    next_chunks = []
    for chunk in chunks:
        key, sep, value = chunk.partition("=")
        if sep and key.strip().upper() == "COUNT":
            try:
                count = int(value)
            except ValueError:
                return recurrence
            next_chunks.append(f"{key}={max(count - 1, 1)}")
        else:
            next_chunks.append(chunk)
    return f"{prefix}{';'.join(next_chunks)}"


def next_occurrence(
    recurrence: str | None,
    anchor: date | datetime | None,
    timezone_name: str | None = None,
) -> date | datetime | None:
    """Return the next occurrence strictly after ``anchor`` for an RRULE.

    Schedule-based: the next instance is computed from the scheduled due date
    (``anchor``), never from a completion timestamp. Returns ``None`` when there
    is no anchor or the rule cannot be parsed, so callers skip regeneration.
    """

    if anchor is None or not recurrence:
        return None

    is_date_only = isinstance(anchor, date) and not isinstance(anchor, datetime)
    if timezone_name and isinstance(anchor, datetime):
        try:
            anchor = anchor.astimezone(ZoneInfo(timezone_name))
        except ZoneInfoNotFoundError:
            return None

    parts = _parse_rrule(recurrence)
    freq = parts.get("FREQ", "")
    try:
        interval = int(parts.get("INTERVAL", "1"))
    except ValueError:
        return None
    if interval < 1:
        return None
    has_count = "COUNT" in parts
    try:
        count = int(parts.get("COUNT", "0"))
    except ValueError:
        return None
    if has_count and count <= 1:
        return None
    has_by_parts = any(key.startswith("BY") for key in parts)
    until = None
    if "UNTIL" in parts:
        until = _parse_until(parts["UNTIL"], is_date_only)
        if until is None:
            return None
        if (
            isinstance(anchor, datetime)
            and isinstance(until, datetime)
            and anchor.tzinfo is not None
            and anchor.tzinfo.utcoffset(anchor) is not None
            and until.tzinfo is None
        ):
            until = until.replace(tzinfo=anchor.tzinfo)

    # Fast path: a plain frequency with no BY* parts -> clamp with relativedelta.
    if freq in _SIMPLE_STEP and not has_by_parts:
        nxt = anchor + _SIMPLE_STEP[freq](interval)
        if until is not None:
            try:
                if nxt > until:
                    return None
            except TypeError:
                return None
        return nxt

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
