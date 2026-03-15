"""Tests for request and response schema validation."""

import pytest
from pydantic import ValidationError

from backend.schemas import BookCreate


def test_book_create_accepts_valid_payload() -> None:
    """A valid payload should pass schema validation."""

    payload = BookCreate(
        title="  Perfect    Blue  ",
        author="Satoshi Kon",
        genre="Psychological",
        status="Finished",
        rating=5,
        takeaway="Sharp and unsettling.",
    )

    assert payload.title == "Perfect Blue"
    assert payload.status == "Finished"
    assert payload.rating == 5


@pytest.mark.parametrize("status", ["Queued", "Dropped", ""])
def test_book_create_rejects_invalid_status(status: str) -> None:
    """Unsupported statuses should be rejected before persistence."""

    with pytest.raises(ValidationError):
        BookCreate(title="Akira", author="Katsuhiro Otomo", status=status)


@pytest.mark.parametrize("rating", [0, 6])
def test_book_create_rejects_invalid_rating(rating: int) -> None:
    """Out-of-range ratings should be rejected before persistence."""

    with pytest.raises(ValidationError):
        BookCreate(title="Akira", author="Katsuhiro Otomo", rating=rating)


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "<script>alert(1)</script>", "author": "William Gibson"},
        {"title": "Neuromancer", "author": "db.users.find()"},
    ],
)
def test_book_create_rejects_unsafe_identity_fields(payload: dict[str, str]) -> None:
    """Suspicious XSS or injection strings should be blocked."""

    with pytest.raises(ValidationError):
        BookCreate(**payload)


def test_book_create_rejects_xss_in_takeaway() -> None:
    """Free-form takeaways should reject embedded scripts."""

    with pytest.raises(ValidationError):
        BookCreate(
            title="Snow Crash",
            author="Neal Stephenson",
            takeaway="<img src=x onerror=alert(1)>",
        )
