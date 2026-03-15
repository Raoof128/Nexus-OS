"""Tests for recommendation service resilience helpers."""

from backend.services import (
    SuggestionPayload,
    build_local_suggestion,
    parse_gemini_response,
    prune_media_context,
)


def test_prune_media_context_preserves_high_value_items() -> None:
    """Context pruning should keep the best-rated items first."""

    items = [
        {"title": "Low Priority", "genre": "Fantasy", "rating": 1},
        {"title": "High Priority", "genre": "Cyberpunk", "rating": 5},
    ]

    pruned = prune_media_context(items)

    assert pruned[0]["title"] == "High Priority"


def test_build_local_suggestion_book_genre() -> None:
    """Book fallback suggestions should match genre signal."""

    suggestion = build_local_suggestion(
        [{"title": "Neuromancer", "genre": "Cyberpunk", "rating": 5}],
        media_type="book",
    )

    assert suggestion == SuggestionPayload(
        suggestion="Altered Carbon",
        reasoning="Local fallback active. Neon-noir detective energy.",
        source="local",
    )


def test_build_local_suggestion_movie_genre() -> None:
    """Movie fallback suggestions should match genre signal."""

    suggestion = build_local_suggestion(
        [{"title": "Hereditary", "genre": "Horror", "rating": 5}],
        media_type="movie",
    )

    assert suggestion == SuggestionPayload(
        suggestion="Midsommar",
        reasoning=("Local fallback active. Daylight horror that subverts the genre."),
        source="local",
    )


def test_build_local_suggestion_anime_default() -> None:
    """Anime fallback should return default when no genre matches."""

    suggestion = build_local_suggestion(
        [{"title": "Something", "genre": "Slice of Life"}],
        media_type="anime",
    )

    assert suggestion == SuggestionPayload(
        suggestion="Cowboy Bebop",
        reasoning=("Local fallback active. Genre-defining space western."),
        source="local",
    )


def test_parse_gemini_response_extracts_title_and_reasoning() -> None:
    """Structured Gemini output should map into the API payload."""

    suggestion = parse_gemini_response(
        "Title: Snow Crash\nReasoning: Fast satire with maximal cyberpunk energy."
    )

    assert suggestion == SuggestionPayload(
        suggestion="Snow Crash",
        reasoning="Fast satire with maximal cyberpunk energy.",
        source="gemini",
    )
