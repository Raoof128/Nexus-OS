"""Pure helpers for the Notes app: ordering, trash purge, palette validation."""

from __future__ import annotations

from datetime import datetime, timedelta

# Keep's 12 colors and 9 backgrounds (names matched to Google Keep). The UI maps
# each name to a neon/glass variant; the backend only validates membership.
COLORS: tuple[str, ...] = (
    "default",
    "Coral",
    "Peach",
    "Sand",
    "Mint",
    "Sage",
    "Fog",
    "Storm",
    "Dusk",
    "Blossom",
    "Clay",
    "Chalk",
)

BACKGROUNDS: tuple[str, ...] = (
    "Groceries",
    "Food",
    "Music",
    "Recipes",
    "Notes",
    "Places",
    "Travel",
    "Video",
    "Celebration",
)

TRASH_RETENTION_DAYS = 7


def next_position(positions: list[float]) -> float:
    """Return a position that sorts a new row after every existing one."""

    if not positions:
        return 1.0
    return max(positions) + 1.0


def purge_cutoff(now: datetime) -> str:
    """ISO timestamp; rows with deleted_at older than this are purged."""

    return (now - timedelta(days=TRASH_RETENTION_DAYS)).isoformat()


def is_valid_color(color: str) -> bool:
    return color in COLORS


def is_valid_background(background: str | None) -> bool:
    return background is None or background in BACKGROUNDS
