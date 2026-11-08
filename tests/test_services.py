"""Tests for recommendation service resilience helpers."""

import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest

import backend.services as services
from backend.schemas import SuggestionItem as SchemaSuggestionItem
from backend.services import (
    GeminiCircuitBreaker,
    build_local_suggestion,
    parse_gemini_json_response,
    prune_media_context,
)

# Captured before the autouse fixture swaps in a stub, so the real lru_cache
# wrapper (with cache_clear) stays reachable for the client-construction tests.
_REAL_GET_GENAI_CLIENT = services.get_genai_client


class _WordEncoder:
    """Stand-in for the tiktoken encoder: one token per whitespace word."""

    def encode(self, text: str) -> list[str]:
        return text.split()


@pytest.fixture(autouse=True)
def _isolated_services(monkeypatch):
    """Keep every test off the network and off shared module state.

    The tokenizer is stubbed so no BPE file is fetched, Gemini is disabled by
    default, and the cache and breaker are reset before and after each test.
    """

    monkeypatch.setattr(services, "get_token_encoder", lambda: _WordEncoder())
    monkeypatch.setattr(services, "get_genai_client", lambda: None)
    services.reset_suggestion_cache()
    services.get_gemini_circuit_breaker.cache_clear()
    yield
    services.reset_suggestion_cache()
    services.get_gemini_circuit_breaker.cache_clear()


def _fake_gemini(monkeypatch, *, text=None, side_effect=None) -> MagicMock:
    """Install a fake Gemini client whose generate_content returns ``text``."""

    fake_client = MagicMock()
    if side_effect is not None:
        fake_client.models.generate_content.side_effect = side_effect
    else:
        fake_response = MagicMock()
        fake_response.text = text
        fake_client.models.generate_content.return_value = fake_response
    monkeypatch.setattr(services, "get_genai_client", lambda: fake_client)
    return fake_client


def test_prune_media_context_preserves_high_value_items() -> None:
    """Context pruning should keep the best-rated items first."""

    items = [
        {"title": "Low Priority", "genre": "Fantasy", "rating": 1},
        {"title": "High Priority", "genre": "Cyberpunk", "rating": 5},
    ]

    pruned = prune_media_context(items)

    assert pruned[0]["title"] == "High Priority"


def test_prune_media_context_empty_library_returns_empty() -> None:
    """An empty library prunes to nothing, not to a placeholder title."""

    assert prune_media_context([]) == []


def test_prune_media_context_falls_back_when_tokenizer_unavailable(
    monkeypatch,
) -> None:
    """A tokenizer load failure must not fail the request."""

    def _broken():
        raise OSError("blob host unreachable")

    monkeypatch.setattr(services, "get_token_encoder", _broken)
    pruned = prune_media_context([{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}])

    assert pruned[0]["title"] == "Solaris"


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


@pytest.mark.parametrize(
    ("media_type", "genre", "expected_title"),
    [
        # "ai" must not match inside other words.
        ("job", "Retail", "Senior Software Engineer @ Cloudflare"),
        ("job", "Maintenance", "Senior Software Engineer @ Cloudflare"),
        # Whole-word matches still work, including multi-word and punctuated genres.
        ("job", "AI Safety", "ML Engineer @ Anthropic"),
        ("job", "AI & Machine Learning", "ML Engineer @ Anthropic"),
        ("movie", "Sci-Fi", "Arrival"),
        ("movie", "Psychological Thriller", "Oldboy"),
        ("anime", "Psychological Thriller", "Monster"),
    ],
)
def test_build_local_suggestion_matches_whole_genre_words(
    media_type: str, genre: str, expected_title: str
) -> None:
    """Genre keys match whole words only, so 'Retail' is not an AI role."""

    result = build_local_suggestion([{"title": "x", "genre": genre}], media_type)

    assert result.suggestions[0].title == expected_title


def test_local_suggestions_use_tuples() -> None:
    """Cached payloads must not expose a mutable list."""

    result = build_local_suggestion([{"title": "x", "genre": "Horror"}], "movie")

    assert isinstance(result.suggestions, tuple)


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


def test_parse_gemini_null_fields_become_empty_strings() -> None:
    """Explicit JSON nulls must not reach the schema as None or 'None'."""

    raw = '[{"title":"Dune","creator":null,"genre":null,"pitch":null,"year":null}]'
    items = parse_gemini_json_response(raw)

    assert len(items) == 1
    item = items[0]
    assert (item.creator, item.genre, item.pitch, item.year) == ("", "", "", "")
    # The result must build the response schema without a ValidationError.
    SchemaSuggestionItem(
        title=item.title,
        creator=item.creator,
        genre=item.genre,
        pitch=item.pitch,
        year=item.year,
    )


def test_parse_gemini_numeric_year_is_stringified() -> None:
    """A numeric year is kept as text, not dropped."""

    items = parse_gemini_json_response('[{"title":"Solaris","year":1972}]')

    assert items[0].year == "1972"


def test_parse_gemini_numeric_creator_is_stringified() -> None:
    """A numeric creator is coerced to a string."""

    items = parse_gemini_json_response('[{"title":"Solaris","creator":42}]')

    assert items[0].creator == "42"


@pytest.mark.parametrize(
    "raw",
    [
        '[{"title": 42}]',  # numeric title
        '[{"title": "   "}]',  # whitespace-only title
        '[{"title": null}]',  # null title
        '[{"creator": "Nobody"}]',  # missing title
        '["just a string"]',  # non-object entry
    ],
)
def test_parse_gemini_drops_unusable_titles(raw: str) -> None:
    """Items without a non-empty string title are dropped."""

    assert parse_gemini_json_response(raw) == []


def test_parse_gemini_invalid_entries_do_not_consume_the_cap() -> None:
    """Valid items after bad ones still appear, up to three."""

    raw = (
        '[{"title": 42}, {"title": "  "}, "junk",'
        ' {"title": "A"}, {"title": "B"}, {"title": "C"}, {"title": "D"}]'
    )
    titles = [item.title for item in parse_gemini_json_response(raw)]

    assert titles == ["A", "B", "C"]


def test_parse_gemini_empty_array_returns_empty() -> None:
    """A valid but empty array is a failed parse, not a suggestion."""

    assert parse_gemini_json_response("[]") == []


def test_parse_gemini_prose_returns_empty() -> None:
    """Free-form prose must not become a suggestion."""

    raw = "Sure! Here are some ideas you might enjoy reading next."

    assert parse_gemini_json_response(raw) == []


def test_parse_legacy_without_title_label_returns_empty() -> None:
    """A reasoning line without a Title label is not a suggestion."""

    assert parse_gemini_json_response("Reasoning: only reasoning here") == []


async def test_run_blocking_executes_sync_callable() -> None:
    """run_blocking offloads a sync call to a thread and returns its result."""

    result = await services.run_blocking(lambda x, y: x + y, 40, y=2)
    assert result == 42


async def test_get_media_suggestion_caches_gemini_result(monkeypatch) -> None:
    """An unchanged library reuses the prior Gemini answer without re-calling."""

    fake_client = _fake_gemini(
        monkeypatch,
        text=(
            '[{"title": "Dune", "creator": "Herbert",'
            ' "genre": "Sci-Fi", "pitch": "Epic"}]'
        ),
    )
    services.get_gemini_circuit_breaker().record_success()

    media = [{"title": "Neuromancer", "genre": "Sci-Fi", "rating": 9}]
    first = await services.get_media_suggestion(media, "book")
    second = await services.get_media_suggestion(media, "book")

    assert first.source == "gemini"
    assert second.suggestions[0].title == "Dune"
    # Identical library → Gemini invoked exactly once (second call served cached).
    assert fake_client.models.generate_content.call_count == 1


def test_cache_key_changes_with_model_and_prompt_version(monkeypatch) -> None:
    """A model or prompt change must not reuse answers from the old config."""

    pruned = [{"title": "Solaris", "genre": "Sci-Fi"}]
    base = services._suggestion_cache_key("book", pruned, "model-a")

    assert base == services._suggestion_cache_key("book", pruned, "model-a")
    assert base != services._suggestion_cache_key("book", pruned, "model-b")
    monkeypatch.setattr(services, "PROMPT_VERSION", "next-prompt")
    assert base != services._suggestion_cache_key("book", pruned, "model-a")


async def test_reset_suggestion_cache_clears_entries(monkeypatch) -> None:
    """reset_suggestion_cache forces the next request to re-call Gemini."""

    fake_client = _fake_gemini(monkeypatch, text='[{"title": "Dune"}]')
    services.get_gemini_circuit_breaker().record_success()

    media = [{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}]
    await services.get_media_suggestion(media, "book")
    services.reset_suggestion_cache()
    await services.get_media_suggestion(media, "book")

    assert fake_client.models.generate_content.call_count == 2


async def test_empty_library_skips_gemini(monkeypatch) -> None:
    """An empty library is answered locally without any Gemini call."""

    fake_client = _fake_gemini(monkeypatch, text='[{"title": "Dune"}]')

    result = await services.get_media_suggestion([], "book")

    assert result.source == "local"
    assert result.suggestions[0].title == "Neuromancer"
    assert fake_client.models.generate_content.call_count == 0


async def test_prose_reply_is_local_and_not_cached(monkeypatch) -> None:
    """Prose from Gemini is a failed parse: local answer, no cache, breaker failure."""

    fake_client = _fake_gemini(monkeypatch, text="Sure! Here are some ideas...")
    services.get_gemini_circuit_breaker().record_success()
    media = [{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}]

    first = await services.get_media_suggestion(media, "book")
    second = await services.get_media_suggestion(media, "book")

    assert first.source == "local"
    assert second.source == "local"
    # Not cached, so the second call re-invokes Gemini.
    assert fake_client.models.generate_content.call_count == 2
    breaker = services.get_gemini_circuit_breaker()
    assert breaker.consecutive_failures == 2


async def test_unparseable_reply_does_not_mark_breaker_successful(monkeypatch) -> None:
    """Empty-parse output must not reset a failing breaker to healthy."""

    _fake_gemini(monkeypatch, text="[]")
    breaker = services.get_gemini_circuit_breaker()
    breaker.record_failure()

    await services.get_media_suggestion(
        [{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}], "book"
    )

    assert breaker.consecutive_failures == 2


async def test_gemini_exception_returns_local_and_records_failure(monkeypatch) -> None:
    """A raised SDK error falls back locally and counts toward the breaker."""

    _fake_gemini(
        monkeypatch,
        side_effect=httpx.TimeoutException("read timed out"),
    )

    result = await services.get_media_suggestion(
        [{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}], "book"
    )

    assert result.source == "local"
    assert services.get_gemini_circuit_breaker().consecutive_failures == 1


async def test_slow_gemini_call_is_abandoned_at_deadline(monkeypatch) -> None:
    """The request returns at the deadline even if the worker thread is still busy."""

    def _slow(**_kwargs):
        time.sleep(0.5)
        raise RuntimeError("late")

    _fake_gemini(monkeypatch, side_effect=_slow)
    monkeypatch.setattr(services, "_gemini_timeout_ms", lambda: 50)

    started = time.monotonic()
    result = await services.get_media_suggestion(
        [{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}], "book"
    )

    assert result.source == "local"
    assert time.monotonic() - started < 0.4
    assert services.get_gemini_circuit_breaker().consecutive_failures == 1


async def test_cache_hit_served_while_breaker_open(monkeypatch) -> None:
    """A fresh cached answer is returned even when the breaker is open."""

    fake_client = _fake_gemini(monkeypatch, text='[{"title": "Dune"}]')
    breaker = services.get_gemini_circuit_breaker()
    breaker.record_success()
    media = [{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}]
    await services.get_media_suggestion(media, "book")

    for _ in range(breaker.failure_threshold):
        breaker.record_failure()
    assert breaker.allows_requests() is False

    result = await services.get_media_suggestion(media, "book")

    assert result.source == "gemini"
    assert result.suggestions[0].title == "Dune"
    assert fake_client.models.generate_content.call_count == 1


async def test_gemini_payload_suggestions_are_tuple(monkeypatch) -> None:
    """Gemini results are stored as an immutable tuple."""

    _fake_gemini(monkeypatch, text='[{"title": "Dune"}]')
    services.get_gemini_circuit_breaker().record_success()

    result = await services.get_media_suggestion(
        [{"title": "Solaris", "genre": "Sci-Fi", "rating": 8}], "book"
    )

    assert isinstance(result.suggestions, tuple)


def test_get_genai_client_sets_sdk_timeout(monkeypatch) -> None:
    """The shared Gemini client carries a per-request SDK timeout in milliseconds."""

    fake_client_cls = MagicMock()
    monkeypatch.setattr(
        services,
        "get_settings",
        lambda: SimpleNamespace(gemini_api_key="test-key", gemini_timeout_ms=45_000),
    )
    monkeypatch.setattr(services.genai, "Client", fake_client_cls)
    _REAL_GET_GENAI_CLIENT.cache_clear()
    try:
        _REAL_GET_GENAI_CLIENT()
    finally:
        _REAL_GET_GENAI_CLIENT.cache_clear()

    options = fake_client_cls.call_args.kwargs["http_options"]
    assert options.timeout == 45_000


def test_get_genai_client_timeout_defaults_when_unset(monkeypatch) -> None:
    """Without a configured timeout the default applies."""

    fake_client_cls = MagicMock()
    monkeypatch.setattr(
        services, "get_settings", lambda: SimpleNamespace(gemini_api_key="test-key")
    )
    monkeypatch.setattr(services.genai, "Client", fake_client_cls)
    _REAL_GET_GENAI_CLIENT.cache_clear()
    try:
        _REAL_GET_GENAI_CLIENT()
    finally:
        _REAL_GET_GENAI_CLIENT.cache_clear()

    options = fake_client_cls.call_args.kwargs["http_options"]
    assert options.timeout == services.GEMINI_TIMEOUT_MS_DEFAULT


def test_breaker_opens_after_threshold_and_resets(monkeypatch) -> None:
    """The breaker blocks while open and admits requests after the reset window."""

    clock = {"now": 1000.0}
    monkeypatch.setattr(services, "monotonic", lambda: clock["now"])
    breaker = GeminiCircuitBreaker(failure_threshold=2, reset_timeout_seconds=60)

    breaker.record_failure()
    assert breaker.allows_requests() is True
    breaker.record_failure()
    assert breaker.allows_requests() is False

    clock["now"] += 59
    assert breaker.allows_requests() is False
    clock["now"] += 1
    assert breaker.allows_requests() is True
    assert breaker.consecutive_failures == 0


def test_late_failure_does_not_extend_outage(monkeypatch) -> None:
    """Failures while open keep the original reset deadline."""

    clock = {"now": 1000.0}
    monkeypatch.setattr(services, "monotonic", lambda: clock["now"])
    breaker = GeminiCircuitBreaker(failure_threshold=2, reset_timeout_seconds=60)
    breaker.record_failure()
    breaker.record_failure()
    tripped_at = breaker.opened_at

    clock["now"] += 30
    breaker.record_failure()

    assert breaker.opened_at == tripped_at
    clock["now"] += 30
    assert breaker.allows_requests() is True


def test_create_supabase_service_client_is_cached(monkeypatch) -> None:
    """The service-role client is built once and reused."""

    created = []

    def _fake_create_client(url, key):
        created.append((url, key))
        return object()

    monkeypatch.setattr(
        services,
        "get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-key",
        ),
    )
    monkeypatch.setattr(services, "create_client", _fake_create_client)
    services.create_supabase_service_client.cache_clear()
    try:
        first = services.create_supabase_service_client()
        second = services.create_supabase_service_client()
    finally:
        services.create_supabase_service_client.cache_clear()

    assert first is second
    assert len(created) == 1


def test_create_supabase_service_client_requires_key(monkeypatch) -> None:
    """A missing service role key is a clear runtime error, not a silent client."""

    monkeypatch.setattr(
        services,
        "get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="",
        ),
    )
    services.create_supabase_service_client.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="SUPABASE_SERVICE_ROLE_KEY"):
            services.create_supabase_service_client()
    finally:
        services.create_supabase_service_client.cache_clear()
