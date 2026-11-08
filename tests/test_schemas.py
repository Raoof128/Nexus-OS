"""Tests for request and response schema validation."""

import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.schemas import (
    DEFAULT_STATUS_BY_TYPE,
    MEDIA_STATUSES_BY_TYPE,
    ChatMessageRequest,
    ChatSessionCreate,
    MediaCreate,
    MediaUpdate,
    SuggestionItem,
    SuggestionResponse,
    media_status_allowed,
)

MEDIA_CONFIG_PATH = (
    Path(__file__).resolve().parents[1] / "frontend" / "src" / "lib" / "mediaConfig.js"
)


def _base_media(**overrides: object) -> dict[str, object]:
    """Return a minimal valid MediaCreate payload with overrides applied."""

    payload: dict[str, object] = {"title": "Akira", "creator": "Katsuhiro Otomo"}
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# MediaCreate: happy paths and the original behaviour
# ---------------------------------------------------------------------------


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


@pytest.mark.parametrize("rating", [1, 5])
def test_media_create_accepts_rating_bounds(rating: int) -> None:
    """Ratings 1 and 5 are the inclusive bounds and must be accepted."""

    assert MediaCreate(**_base_media(rating=rating)).rating == rating


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "<script>alert(1)</script>", "creator": "William Gibson"},
        {"title": "Neuromancer", "creator": "x' UNION SELECT password FROM users"},
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


# ---------------------------------------------------------------------------
# Non-string input must produce a ValidationError, never a TypeError
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        {"title": 123},
        {"title": b"<script>"},
        {"title": ["Akira"]},
        {"creator": 5},
        {"genre": 7},
        {"sub_info": 26},
        {"takeaway": 5},
        {"takeaway": b"notes"},
    ],
)
def test_media_create_rejects_non_string_text(payload: dict[str, object]) -> None:
    """Non-string text must fail validation cleanly (not raise TypeError)."""

    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(**payload))


@pytest.mark.parametrize("payload", [{"title": 123}, {"takeaway": 5}])
def test_media_update_rejects_non_string_text(payload: dict[str, object]) -> None:
    """MediaUpdate applies the same non-string rejection."""

    with pytest.raises(ValidationError):
        MediaUpdate(**payload)


def test_chat_session_create_rejects_non_string_title() -> None:
    """ChatSessionCreate.title must reject non-string input cleanly."""

    with pytest.raises(ValidationError):
        ChatSessionCreate(title=1)


# ---------------------------------------------------------------------------
# Control characters and bidi controls
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("value", ["Ak\x00ira", "Ak\x07ira", "Ak\x7fira"])
def test_media_create_rejects_control_characters_in_title(value: str) -> None:
    """NUL, BEL and DEL are not allowed in titles."""

    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(title=value))


def test_media_create_rejects_control_characters_in_takeaway() -> None:
    """Control characters are rejected in takeaways too."""

    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(takeaway="notes\x00here"))


def test_bidi_override_is_stripped_from_title() -> None:
    """Bidi override characters are removed rather than stored."""

    payload = MediaCreate(**_base_media(title="abc\u202edef"))

    assert payload.title == "abcdef"


def test_bidi_isolate_is_stripped_from_takeaway() -> None:
    """Bidi isolate characters are removed from takeaway notes."""

    payload = MediaCreate(**_base_media(takeaway="a\u2066b\u2069c"))

    assert payload.takeaway == "abc"


def test_persian_zwnj_is_preserved() -> None:
    """ZWNJ is used in normal Persian text and must survive normalisation."""

    text = "می‌خوانم"  # "I am reading", with ZWNJ

    payload = MediaCreate(**_base_media(title=text))

    assert payload.title == text


# ---------------------------------------------------------------------------
# Denylist false positives and the MongoDB rules removed
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "title",
    ["Gone = gone", "Tone = warm", "Done = done", "Read the db. file"],
)
def test_identity_fields_accept_text_that_looks_like_handlers(title: str) -> None:
    """Plain words that contain 'on' or 'db.' are not payloads."""

    assert MediaCreate(**_base_media(title=title)).title == title


def test_takeaway_accepts_one_equals_two() -> None:
    """'one = two' is ordinary prose and must not be treated as a handler."""

    payload = MediaCreate(**_base_media(takeaway="one = two"))

    assert payload.takeaway == "one = two"


def test_db_dot_creator_is_accepted() -> None:
    """MongoDB-style rules were dropped; PostgREST is parameterised."""

    assert MediaCreate(**_base_media(creator="db.users.find()")).creator == (
        "db.users.find()"
    )


# ---------------------------------------------------------------------------
# Takeaway normalisation keeps line breaks
# ---------------------------------------------------------------------------


def test_takeaway_keeps_paragraph_break() -> None:
    """A blank line between paragraphs is preserved in takeaway notes."""

    payload = MediaCreate(**_base_media(takeaway="line1\n\nline2"))

    assert payload.takeaway == "line1\n\nline2"


def test_takeaway_keeps_plain_angle_brackets_as_text() -> None:
    """Takeaway tolerates markup-like text, which React renders as text."""

    payload = MediaCreate(**_base_media(takeaway="<b>bold</b>"))

    assert payload.takeaway == "<b>bold</b>"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("a \t  b", "a b"),
        ("a\r\nb", "a\nb"),
        ("a\rb", "a\nb"),
        ("a\n\n\n\nb", "a\n\nb"),
        ("  padded note  ", "padded note"),
        ("line one  \n  line two", "line one\nline two"),
    ],
)
def test_takeaway_whitespace_rules(raw: str, expected: str) -> None:
    """Runs of spaces collapse per line and blank runs cap at one blank line."""

    assert MediaCreate(**_base_media(takeaway=raw)).takeaway == expected


def test_takeaway_rejects_svg_onload_handler() -> None:
    """Event-handler payloads in takeaways are still rejected."""

    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(takeaway="<svg onload=alert(1)>"))


def test_identity_fields_collapse_newlines() -> None:
    """Single-line identity fields still collapse line breaks."""

    assert MediaCreate(**_base_media(title="one\n\ntwo")).title == "one two"


# ---------------------------------------------------------------------------
# Length boundaries
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("field", "limit"),
    [("title", 200), ("creator", 100), ("genre", 80), ("sub_info", 100)],
)
def test_identity_length_boundaries(field: str, limit: int) -> None:
    """Each identity field accepts its maximum and rejects one more."""

    accepted = MediaCreate(**_base_media(**{field: "a" * limit}))
    assert len(getattr(accepted, field)) == limit
    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(**{field: "a" * (limit + 1)}))


def test_takeaway_length_boundary() -> None:
    """Takeaway accepts 2000 characters and rejects 2001."""

    assert MediaCreate(**_base_media(takeaway="a" * 2000)).takeaway == "a" * 2000
    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(takeaway="a" * 2001))


def test_takeaway_length_is_checked_after_normalisation() -> None:
    """Padding that collapses away does not count against the 2000 cap."""

    payload = MediaCreate(**_base_media(takeaway="a" + " " * 3000 + "b"))

    assert payload.takeaway == "a b"


# ---------------------------------------------------------------------------
# Type and status consistency
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("media_type", "status"),
    [
        (media_type, status)
        for media_type, statuses in MEDIA_STATUSES_BY_TYPE.items()
        for status in statuses
    ],
)
def test_every_status_is_accepted_for_its_own_type(
    media_type: str, status: str
) -> None:
    """Each type accepts every status in its own set."""

    payload = MediaCreate(**_base_media(type=media_type, status=status))

    assert payload.status == status


@pytest.mark.parametrize(
    ("media_type", "status"),
    [
        ("movie", "Reading"),
        ("movie", "To Read"),
        ("book", "Watching"),
        ("anime", "Applied"),
        ("job", "Finished"),
        ("job", "To Watch"),
        ("book", "Got the Job"),
    ],
)
def test_cross_type_status_is_rejected(media_type: str, status: str) -> None:
    """A status from another type's set is rejected with a 422-style error."""

    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(type=media_type, status=status))


@pytest.mark.parametrize(
    ("media_type", "expected"),
    [
        ("book", "To Read"),
        ("movie", "To Watch"),
        ("anime", "To Watch"),
        ("job", "Applied"),
    ],
)
def test_omitted_status_defaults_to_the_type_default(
    media_type: str, expected: str
) -> None:
    """Omitting status picks the type's default, not the book default."""

    payload = MediaCreate(**_base_media(type=media_type))

    assert payload.status == expected


def test_explicit_book_default_is_rejected_for_movie() -> None:
    """Sending 'To Read' explicitly for a movie is a cross-type status."""

    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(type="movie", status="To Read"))


def test_media_status_allowed_handles_unknown_type() -> None:
    """Unknown media types never allow a status."""

    assert media_status_allowed("podcast", "To Read") is False
    assert media_status_allowed("book", "To Read") is True
    assert media_status_allowed("book", "To Watch") is False


def test_defaults_are_members_of_their_own_sets() -> None:
    """Every default status belongs to its type's status set."""

    for media_type, default in DEFAULT_STATUS_BY_TYPE.items():
        assert default in MEDIA_STATUSES_BY_TYPE[media_type]


def _parse_media_config() -> dict[str, dict[str, object]]:
    """Read statuses and defaults per type from the frontend source of truth."""

    source = MEDIA_CONFIG_PATH.read_text(encoding="utf-8")
    parsed: dict[str, dict[str, object]] = {}
    for media_type in ("book", "movie", "anime", "job"):
        block = re.search(
            rf"^  {media_type}: \{{(.*?)^  \}}",
            source,
            re.DOTALL | re.MULTILINE,
        )
        assert block, f"mediaConfig.js has no block for {media_type}"
        statuses = re.search(r"statuses: \[(.*?)\]", block.group(1))
        default = re.search(r"defaultStatus: '([^']+)'", block.group(1))
        assert statuses and default
        parsed[media_type] = {
            "statuses": tuple(re.findall(r"'([^']+)'", statuses.group(1))),
            "default": default.group(1),
        }
    return parsed


def test_status_sets_match_frontend_media_config() -> None:
    """Backend status sets and defaults mirror frontend mediaConfig.js."""

    frontend = _parse_media_config()

    for media_type, config in frontend.items():
        assert MEDIA_STATUSES_BY_TYPE[media_type] == config["statuses"]
        assert DEFAULT_STATUS_BY_TYPE[media_type] == config["default"]


# ---------------------------------------------------------------------------
# MediaUpdate partial-update behaviour
# ---------------------------------------------------------------------------


def test_media_update_omitted_fields_are_not_dumped() -> None:
    """Fields omitted from the body stay out of the update payload."""

    dumped = MediaUpdate(status="Reading").model_dump(exclude_unset=True)

    assert dumped == {"status": "Reading"}


def test_media_update_explicit_null_rating_is_kept() -> None:
    """rating=null clears the rating, so it must survive exclude_unset."""

    dumped = MediaUpdate(rating=None).model_dump(exclude_unset=True)

    assert dumped == {"rating": None}


def test_media_update_empty_body_dumps_nothing() -> None:
    """An empty update has no fields to send."""

    assert MediaUpdate().model_dump(exclude_unset=True) == {}


def test_media_update_rejects_unsafe_title_and_takeaway() -> None:
    """MediaUpdate applies the same identity and takeaway checks as create."""

    with pytest.raises(ValidationError):
        MediaUpdate(title="<b>Akira</b>")
    with pytest.raises(ValidationError):
        MediaUpdate(takeaway="<img src=x onerror=alert(1)>")


def test_media_update_has_no_type_field() -> None:
    """Updates carry no type, so status-to-type checks happen in the controller."""

    assert "type" not in MediaUpdate.model_fields


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


def test_chat_message_accepts_maximum_length() -> None:
    """A 4000-character message is accepted."""

    assert len(ChatMessageRequest(content="a" * 4000).content) == 4000


def test_chat_message_rejects_over_maximum_length() -> None:
    """A 4001-character message is rejected."""

    with pytest.raises(ValidationError):
        ChatMessageRequest(content="a" * 4001)


def test_chat_message_rejects_nul_byte() -> None:
    """NUL cannot be stored in PostgreSQL text, so it is rejected up front."""

    with pytest.raises(ValidationError):
        ChatMessageRequest(content="hi\x00there")


@pytest.mark.parametrize("content", ["   ", "\n\t  \n"])
def test_chat_message_rejects_whitespace_only(content: str) -> None:
    """Whitespace-only messages are empty after stripping and are rejected."""

    with pytest.raises(ValidationError):
        ChatMessageRequest(content=content)


def test_chat_message_strips_outer_whitespace_and_keeps_line_breaks() -> None:
    """Chat is multi-line: inner newlines stay, outer whitespace is removed."""

    payload = ChatMessageRequest(content="  first line\nsecond line  ")

    assert payload.content == "first line\nsecond line"


def test_chat_message_rejects_non_string() -> None:
    """Non-string chat content raises ValidationError."""

    with pytest.raises(ValidationError):
        ChatMessageRequest(content=42)


def test_chat_message_strips_bidi_controls() -> None:
    """Bidi overrides are removed from chat content as well."""

    assert ChatMessageRequest(content="ab\u202ecd").content == "abcd"


# ---------------------------------------------------------------------------
# Suggestions (model output is clipped, never rejected)
# ---------------------------------------------------------------------------


def test_suggestion_item_clips_oversized_pitch() -> None:
    """An oversized Gemini pitch is clipped to 400 characters, not a 500."""

    item = SuggestionItem(title="Solaris", pitch="p" * 1_000_000)

    assert len(item.pitch) == 400


def test_suggestion_item_clips_each_field_to_its_bound() -> None:
    """Every model-generated field is clipped to its own limit."""

    item = SuggestionItem(
        title="t" * 500,
        creator="c" * 500,
        genre="g" * 500,
        year="y" * 500,
    )

    assert len(item.title) == 200
    assert len(item.creator) == 100
    assert len(item.genre) == 80
    assert len(item.year) == 16


def test_suggestion_item_accepts_integer_year() -> None:
    """A model may return the year as a number; it is converted to text."""

    assert SuggestionItem(title="Solaris", year=1972).year == "1972"


def test_suggestion_item_nulls_and_objects_become_empty() -> None:
    """None, booleans and nested objects are treated as absent."""

    item = SuggestionItem(title=None, creator={"x": 1}, genre=True, pitch=None)

    assert (item.title, item.creator, item.genre, item.pitch) == ("", "", "", "")


def test_suggestion_item_replaces_control_characters() -> None:
    """Control characters are replaced by spaces and whitespace collapsed."""

    item = SuggestionItem(title="Sola\x00ris\n\nNovel")

    assert item.title == "Sola ris Novel"


def test_suggestion_response_clips_nested_items() -> None:
    """Clipping applies to each item inside the response list."""

    response = SuggestionResponse(
        suggestions=[{"title": "x", "pitch": "p" * 2000}],
        source="gemini",
    )

    assert len(response.suggestions[0].pitch) == 400


# ---------------------------------------------------------------------------
# Chat session title
# ---------------------------------------------------------------------------


def test_chat_session_title_rejects_nul() -> None:
    """Chat session titles reject control characters."""

    with pytest.raises(ValidationError):
        ChatSessionCreate(title="Hello\x00")


@pytest.mark.parametrize("value", ["Ak\x85ira", "Ak\x9bira"])
def test_media_create_rejects_c1_control_characters(value: str) -> None:
    """C1 controls (U+0080-U+009F) are control characters and are rejected."""

    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(title=value))


@pytest.mark.parametrize(
    "takeaway",
    ["a < 1 and one = 2", "x<y. Turn on = yes"],
)
def test_takeaway_accepts_comparison_text_without_a_tag(takeaway: str) -> None:
    """A bare '<' followed later by 'on... =' is prose, not an event handler."""

    assert MediaCreate(**_base_media(takeaway=takeaway)).takeaway == takeaway


@pytest.mark.parametrize(
    "takeaway",
    ["<svg/onload=alert(1)>", "<details open ontoggle=alert(1)>"],
)
def test_takeaway_rejects_event_handlers_inside_tags(takeaway: str) -> None:
    """Handlers inside a real tag are still rejected after the tighter rule."""

    with pytest.raises(ValidationError):
        MediaCreate(**_base_media(takeaway=takeaway))
