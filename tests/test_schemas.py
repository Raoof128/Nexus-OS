"""Tests for request and response schema validation."""

import pytest
from pydantic import ValidationError

from backend.schemas import MediaCreate


def test_media_create_accepts_valid_book() -> None:
    """A valid book payload should pass schema validation."""

    payload = MediaCreate(
        type="book",
        title="  Perfect    Blue  ",
        creator="Satoshi Kon",
        genre="Psychological",
        status="Finished",
        rating=5,
        takeaway="Sharp and unsettling.",
    )

    assert payload.title == "Perfect Blue"
    assert payload.type == "book"
    assert payload.status == "Finished"
    assert payload.rating == 5


def test_media_create_accepts_valid_movie() -> None:
    """A valid movie payload should pass schema validation."""

    payload = MediaCreate(
        type="movie",
        title="Blade Runner",
        creator="Ridley Scott",
        status="To Watch",
    )

    assert payload.type == "movie"
    assert payload.status == "To Watch"


def test_media_create_accepts_valid_anime() -> None:
    """A valid anime payload should pass schema validation."""

    payload = MediaCreate(
        type="anime",
        title="Cowboy Bebop",
        creator="Sunrise",
        status="Watching",
        sub_info="26",
    )

    assert payload.type == "anime"
    assert payload.sub_info == "26"


@pytest.mark.parametrize("status", ["Queued", "Dropped", ""])
def test_media_create_rejects_invalid_status(status: str) -> None:
    """Unsupported statuses should be rejected before persistence."""

    with pytest.raises(ValidationError):
        MediaCreate(title="Akira", creator="Katsuhiro Otomo", status=status)


@pytest.mark.parametrize("rating", [0, 6])
def test_media_create_rejects_invalid_rating(rating: int) -> None:
    """Out-of-range ratings should be rejected before persistence."""

    with pytest.raises(ValidationError):
        MediaCreate(title="Akira", creator="Katsuhiro Otomo", rating=rating)


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "<script>alert(1)</script>", "creator": "William Gibson"},
        {"title": "Neuromancer", "creator": "db.users.find()"},
    ],
)
def test_media_create_rejects_unsafe_fields(payload: dict[str, str]) -> None:
    """Suspicious XSS or injection strings should be blocked."""

    with pytest.raises(ValidationError):
        MediaCreate(**payload)


def test_media_create_rejects_xss_in_takeaway() -> None:
    """Free-form takeaways should reject embedded scripts."""

    with pytest.raises(ValidationError):
        MediaCreate(
            title="Snow Crash",
            creator="Neal Stephenson",
            takeaway="<img src=x onerror=alert(1)>",
        )
