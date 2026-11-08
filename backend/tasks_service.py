"""Pure logic for the Tasks app: recurrence math and position helpers.

Kept free of I/O so it is unit-testable without a database. The controller
wires these into PostgREST calls.

Recurrence rules follow RFC 5545 section 3.3.10 (https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10),
restricted to the subset the app supports:

* ``FREQ`` must be DAILY, WEEKLY, MONTHLY or YEARLY (the UI presets). Sub-daily
  rules have no meaning for a due date.
* ``INTERVAL`` is a positive integer, capped at ``MAX_INTERVAL``.
* ``COUNT`` is not supported: a series is regenerated from each scheduled date,
  so a count could never run out. ``COUNT`` and ``UNTIL`` may not coexist.
* ``UNTIL`` is honoured as an inclusive end bound.
* ``DTSTART`` inside the rule is rejected; the anchor always comes from the task.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, time, timezone

from dateutil.relativedelta import relativedelta
from dateutil.rrule import rrulestr

logger = logging.getLogger(__name__)

SUPPORTED_FREQ = frozenset({"DAILY", "WEEKLY", "MONTHLY", "YEARLY"})
# RFC 5545 has no upper bound on INTERVAL; this is an application limit.
MAX_INTERVAL = 1000
# dateutil searches forward without bound for impossible rules, so every
# evaluation carries an UNTIL horizon. 400 years is one full Gregorian cycle.
RRULE_HORIZON_YEARS = 400

# Keys accepted when a rule is written. Stored rules outside this set are still
# evaluated (see next_occurrence) so that existing rows keep working.
_ALLOWED_KEYS = frozenset(
    {"FREQ", "INTERVAL", "BYDAY", "BYMONTH", "BYMONTHDAY", "WKST", "UNTIL"}
)
_BY_KEYS = frozenset({"BYDAY", "BYMONTH", "BYMONTHDAY"})
_UNTIL_RE = re.compile(r"^\d{8}(T\d{6}Z?)?$")
_INTERVAL_RE = re.compile(r"^\d+$")
_WEEKDAY_RE = re.compile(r"^(?P<ord>[+-]?\d{1,2})?(?P<day>MO|TU|WE|TH|FR|SA|SU)$")
_WEEKDAY_CODES = frozenset({"MO", "TU", "WE", "TH", "FR", "SA", "SU"})
# Anchor used only to check that an UNTIL value parses; the value is discarded.
_VALIDATION_ANCHOR = datetime(2000, 1, 1)

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

# Longest month length, used to check BYMONTH/BYMONTHDAY pairs (Feb 29 is valid).
_MAX_DAYS_IN_MONTH = {
    1: 31,
    2: 29,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
}


def _parse_rrule(recurrence: str) -> dict[str, str]:
    """Parse an ``RRULE`` string into an uppercased key/value dict.

    Lenient on purpose: malformed chunks are ignored here and rejected by
    :func:`validate_recurrence` at write time.
    """

    parts: dict[str, str] = {}
    for chunk in recurrence.replace("RRULE:", "").split(";"):
        if "=" in chunk:
            key, _, value = chunk.partition("=")
            parts[key.strip().upper()] = value.strip()
    return parts


def _monthday_pairs_exist(parts: dict[str, str]) -> bool:
    """Return False when BYMONTH and BYMONTHDAY can never select a date.

    Such rules (e.g. ``BYMONTH=2;BYMONTHDAY=30``) make dateutil search forward
    day by day until MAXYEAR, which takes seconds per call.
    """

    if "BYMONTHDAY" not in parts:
        return True
    try:
        days = [int(v) for v in parts["BYMONTHDAY"].split(",")]
    except ValueError:
        return False
    months = (
        [int(v) for v in parts["BYMONTH"].split(",")]
        if "BYMONTH" in parts
        else list(range(1, 13))
    )
    if any(m not in _MAX_DAYS_IN_MONTH for m in months):
        return False
    for day in days:
        if not (1 <= abs(day) <= 31):
            return False
        # A negative BYMONTHDAY counts from the end of the month.
        if not any(
            (1 <= day <= _MAX_DAYS_IN_MONTH[m]) or (-_MAX_DAYS_IN_MONTH[m] <= day <= -1)
            for m in months
        ):
            return False
    return True


def _parse_until(raw: str, anchor: datetime) -> date | datetime | None:
    """Parse an RRULE UNTIL value and align it with the anchor's awareness.

    Returns ``None`` when the value is malformed. A date-only UNTIL is inclusive
    of that whole day.
    """

    if not _UNTIL_RE.match(raw):
        return None
    try:
        if "T" not in raw:
            return datetime.strptime(raw, "%Y%m%d").date()
        fmt = "%Y%m%dT%H%M%SZ" if raw.endswith("Z") else "%Y%m%dT%H%M%S"
        parsed = datetime.strptime(raw, fmt)
    except ValueError:
        return None
    if raw.endswith("Z"):
        parsed = parsed.replace(tzinfo=timezone.utc)
    if anchor.tzinfo is None:
        return parsed.replace(tzinfo=None)
    if parsed.tzinfo is None:
        # Naive UNTIL with an aware anchor: read it in the anchor's own zone.
        return parsed.replace(tzinfo=anchor.tzinfo)
    return parsed


def _until_allows(candidate: datetime, until: date | datetime) -> bool:
    if isinstance(until, datetime):
        return candidate <= until
    return candidate.date() <= until


def _horizon_rule(parts: dict[str, str], dtstart: datetime) -> str:
    """Rebuild the rule for dateutil, dropping UNTIL and adding a search horizon."""

    horizon = dtstart + relativedelta(years=RRULE_HORIZON_YEARS)
    if horizon.tzinfo is not None:
        stamp = horizon.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    else:
        stamp = horizon.strftime("%Y%m%dT%H%M%S")
    chunks = [f"{k}={v}" for k, v in parts.items() if k != "UNTIL"]
    chunks.append(f"UNTIL={stamp}")
    return ";".join(chunks)


def _parse_interval(raw: str | None) -> int | None:
    """Return a validated INTERVAL, or ``None`` when it is out of range."""

    if raw is None:
        return 1
    if not _INTERVAL_RE.match(raw):
        return None
    value = int(raw)
    if not 1 <= value <= MAX_INTERVAL:
        return None
    return value


def _next_occurrence_internal(
    recurrence: str, anchor: date | datetime
) -> datetime | None:
    """Compute the next occurrence as a datetime (naive midnight for date anchors)."""

    parts = _parse_rrule(recurrence)
    freq = parts.get("FREQ", "")
    if freq not in SUPPORTED_FREQ:
        return None
    # COUNT cannot be honoured when the series is regenerated from each date.
    # DTSTART would override the task's own anchor.
    if "COUNT" in parts or "DTSTART" in parts:
        return None
    interval = _parse_interval(parts.get("INTERVAL"))
    if interval is None:
        return None
    if not _monthday_pairs_exist(parts):
        return None

    is_date_only = isinstance(anchor, date) and not isinstance(anchor, datetime)
    dtstart = datetime.combine(anchor, time.min) if is_date_only else anchor

    until: date | datetime | None = None
    if "UNTIL" in parts:
        until = _parse_until(parts["UNTIL"], dtstart)
        if until is None:
            return None

    if not any(key in _BY_KEYS for key in parts):
        # Fast path: a plain frequency clamps with relativedelta.
        nxt: datetime | None = dtstart + _SIMPLE_STEP[freq](interval)
    else:
        rule = rrulestr(_horizon_rule(parts, dtstart), dtstart=dtstart)
        nxt = rule.after(dtstart, inc=False)

    if nxt is None:
        return None
    if until is not None and not _until_allows(nxt, until):
        return None
    return nxt


def next_occurrence(
    recurrence: str | None,
    anchor: date | datetime | None,
) -> date | datetime | None:
    """Return the next occurrence strictly after ``anchor`` for an RRULE.

    Schedule-based: the next instance is computed from the scheduled due date
    (``anchor``), never from a completion timestamp. Returns ``None`` when there
    is no anchor, the rule is unsupported or malformed, the rule has run past its
    UNTIL, or the arithmetic leaves the representable date range. Callers skip
    regeneration in every one of those cases. This function never raises for
    user-supplied rules.
    """

    if anchor is None or not recurrence:
        return None

    try:
        nxt = _next_occurrence_internal(recurrence, anchor)
    except (OverflowError, ValueError, TypeError, IndexError):
        # IndexError: dateutil indexes its weekday tables with the BYDAY ordinal.
        logger.debug("Recurrence could not be evaluated: %r", recurrence)
        return None
    if nxt is None:
        return None
    if isinstance(anchor, date) and not isinstance(anchor, datetime):
        return nxt.date()
    return nxt


def validate_recurrence(value: str | None) -> str | None:
    """Validate a recurrence rule supplied by a client, for write-time use.

    Returns the stripped rule (an empty string becomes ``None``). Raises
    ``ValueError`` with a readable message when the rule is outside the
    supported subset described in the module docstring.
    """

    if value is None:
        return None
    # RFC 5545 section 2: enumerated values are case-insensitive, so normalise.
    text = value.strip().upper()
    if not text:
        return None
    body = text[6:] if text.startswith("RRULE:") else text

    parts: dict[str, str] = {}
    for chunk in body.split(";"):
        key, sep, raw = chunk.partition("=")
        key = key.strip().upper()
        raw = raw.strip()
        if not sep or not key or not raw:
            raise ValueError(f"malformed RRULE part: {chunk!r}")
        if key in parts:
            raise ValueError(f"duplicate RRULE part: {key}")
        if key not in _ALLOWED_KEYS:
            raise ValueError(f"unsupported RRULE part: {key}")
        parts[key] = raw

    freq = parts.get("FREQ")
    if freq is None:
        raise ValueError("RRULE must include FREQ")
    if freq not in SUPPORTED_FREQ:
        raise ValueError(f"FREQ must be one of {sorted(SUPPORTED_FREQ)}")
    if "INTERVAL" in parts and _parse_interval(parts["INTERVAL"]) is None:
        raise ValueError(f"INTERVAL must be an integer from 1 to {MAX_INTERVAL}")
    if "UNTIL" in parts and _parse_until(parts["UNTIL"], _VALIDATION_ANCHOR) is None:
        raise ValueError("UNTIL must be a valid YYYYMMDD or YYYYMMDDTHHMMSS[Z] value")
    if "WKST" in parts and parts["WKST"] not in _WEEKDAY_CODES:
        raise ValueError("WKST must be a two-letter weekday code")

    if "BYDAY" in parts:
        for token in parts["BYDAY"].split(","):
            match = _WEEKDAY_RE.match(token.strip())
            if not match:
                raise ValueError(f"invalid BYDAY value: {token!r}")
            ordinal = match.group("ord")
            if ordinal is None:
                continue
            if freq in {"DAILY", "WEEKLY"}:
                raise ValueError("BYDAY ordinals are only valid for MONTHLY or YEARLY")
            # RFC 5545 section 3.3.10 ABNF: ordwk = 1*2DIGIT ;1 to 53, signed.
            if int(ordinal) == 0 or abs(int(ordinal)) > 53:
                raise ValueError("BYDAY ordinal must be from -53 to 53, not 0")

    if "BYMONTH" in parts:
        try:
            months = [int(v) for v in parts["BYMONTH"].split(",")]
        except ValueError as exc:
            raise ValueError("BYMONTH must be integers from 1 to 12") from exc
        if any(not 1 <= m <= 12 for m in months):
            raise ValueError("BYMONTH must be integers from 1 to 12")

    if "BYMONTHDAY" in parts:
        try:
            days = [int(v) for v in parts["BYMONTHDAY"].split(",")]
        except ValueError as exc:
            raise ValueError("BYMONTHDAY must be integers from -31 to 31") from exc
        if any(d == 0 or abs(d) > 31 for d in days):
            raise ValueError("BYMONTHDAY must be integers from -31 to 31, not 0")
        if not _monthday_pairs_exist(parts):
            raise ValueError("BYMONTH and BYMONTHDAY never select a date")

    return text


def next_position(positions: list[float]) -> float:
    """Return a position that appends after the current maximum."""

    return (max(positions) + 1.0) if positions else 1.0
