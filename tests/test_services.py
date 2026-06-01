"""Tests for recommendation service resilience helpers."""

from unittest.mock import MagicMock

import backend.services as services
from backend.services import (
    build_local_suggestion,
    parse_gemini_json_response,
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

    result = build_local_suggestion(
        [{"title": "Neuromancer", "genre": "Cyberpunk", "rating": 5}],
        media_type="book",
    )

    assert result.source == "local"
    assert len(result.suggestions) == 1
    assert result.suggestions[0].title == "Altered Carbon"
    assert "Local fallback" in result.suggestions[0].pitch


def test_build_local_suggestion_movie_genre() -> None:
    """Movie fallback suggestions should match genre signal."""

    result = build_local_suggestion(
        [{"title": "Hereditary", "genre": "Horror", "rating": 5}],
        media_type="movie",
    )

    assert result.suggestions[0].title == "Midsommar"


def test_build_local_suggestion_anime_default() -> None:
    """Anime fallback should return default when no genre matches."""

    result = build_local_suggestion(
        [{"title": "Something", "genre": "Slice of Life"}],
        media_type="anime",
    )

    assert result.suggestions[0].title == "Cowboy Bebop"


def test_parse_gemini_json_response_valid_array() -> None:
    """Valid JSON array from Gemini should parse into SuggestionItems."""

    raw = (
        '[{"title":"Snow Crash","creator":"Stephenson",'
        '"genre":"Cyberpunk","pitch":"Neon madness."}]'
    )
    items = parse_gemini_json_response(raw)

    assert len(items) == 1
    assert items[0].title == "Snow Crash"
    assert items[0].creator == "Stephenson"
    assert items[0].pitch == "Neon madness."


def test_parse_gemini_json_response_with_backticks() -> None:
    """JSON wrapped in markdown backticks should still parse."""

    raw = (
        "```json\n"
        '[{"title":"Akira","creator":"Otomo",'
        '"genre":"Sci-Fi","pitch":"Neo-Tokyo explodes."}]'
        "\n```"
    )
    items = parse_gemini_json_response(raw)

    assert len(items) == 1
    assert items[0].title == "Akira"


def test_parse_gemini_json_response_falls_back_to_legacy() -> None:
    """Non-JSON Gemini output should fall back to Title/Reasoning parsing."""

    raw = "Title: Snow Crash\nReasoning: Fast cyberpunk energy."
    items = parse_gemini_json_response(raw)

    assert len(items) == 1
    assert items[0].title == "Snow Crash"


async def test_run_blocking_executes_sync_callable() -> None:
    """run_blocking offloads a sync call to a thread and returns its result."""

    result = await services.run_blocking(lambda x, y: x + y, 40, y=2)
    assert result == 42


async def test_get_media_suggestion_caches_gemini_result(monkeypatch) -> None:
    """An unchanged library reuses the prior Gemini answer without re-calling."""

    services.reset_suggestion_cache()
    fake_response = MagicMock()
    fake_response.text = (
        '[{"title": "Dune", "creator": "Herbert", "genre": "Sci-Fi", "pitch": "Epic"}]'
    )
    fake_client = MagicMock()
    fake_client.models.generate_content.return_value = fake_response
    monkeypatch.setattr(services, "get_genai_client", lambda: fake_client)
    services.get_gemini_circuit_breaker().record_success()

    media = [{"title": "Neuromancer", "genre": "Sci-Fi", "rating": 9}]
    first = await services.get_media_suggestion(media, "book")
    second = await services.get_media_suggestion(media, "book")

    assert first.source == "gemini"
    assert second.suggestions[0].title == "Dune"
    # Identical library → Gemini invoked exactly once (second call served cached).
    assert fake_client.models.generate_content.call_count == 1
    services.reset_suggestion_cache()


async def test_reset_suggestion_cache_clears_entries(monkeypatch) -> None:
    """reset_suggestion_cache forces the next request to re-call Gemini."""

    services.reset_suggestion_cache()
    fake_response = MagicMock()
    fake_response.text = '[{"title": "Dune"}]'
    fake_client = MagicMock()
    fake_client.models.generate_content.return_value = fake_response
    monkeypatch.setattr(services, "get_genai_client", lambda: fake_client)
    services.get_gemini_circuit_breaker().record_success()

    media = [{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}]
    await services.get_media_suggestion(media, "book")
    services.reset_suggestion_cache()
    await services.get_media_suggestion(media, "book")

    assert fake_client.models.generate_content.call_count == 2
    services.reset_suggestion_cache()
