"""Tests for recommendation service resilience helpers."""

from backend.services import (
    SuggestionPayload,
    build_local_suggestion,
    parse_gemini_response,
    prune_book_context,
)


def test_prune_book_context_preserves_high_value_books() -> None:
    """Context pruning should keep the best-rated items first."""

    books = [
        {"title": "Low Priority", "genre": "Fantasy", "rating": 1},
        {"title": "High Priority", "genre": "Cyberpunk", "rating": 5},
    ]

    pruned = prune_book_context(books)

    assert pruned[0]["title"] == "High Priority"


def test_build_local_suggestion_uses_genre_signal() -> None:
    """Fallback suggestions should remain relevant to the library genre."""

    suggestion = build_local_suggestion(
        [{"title": "Neuromancer", "genre": "Cyberpunk", "rating": 5}]
    )

    assert suggestion == SuggestionPayload(
        suggestion="Altered Carbon",
        reasoning=(
            "Local fallback active. Keeps the neon-noir atmosphere while broadening"
            " the detective angle."
        ),
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
