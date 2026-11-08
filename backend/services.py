"""Service helpers for backend integrations.

Covers the Supabase client factories, the Gemini-backed media recommender with
its local fallback, and the in-process resilience primitives (circuit breaker
and suggestion cache) that wrap the Gemini call.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from functools import lru_cache, partial
from time import monotonic
from typing import Any, Callable

import tiktoken
from anyio import fail_after, to_thread
from google import genai
from google.genai import types as genai_types
from postgrest import SyncPostgrestClient

from supabase import Client, create_client

try:
    from .config import get_settings
    from .data_protection import serialize_media_context_for_llm
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from data_protection import serialize_media_context_for_llm

logger = logging.getLogger(__name__)

# Gemini timeouts are expressed in milliseconds because that is the unit of
# ``genai.types.HttpOptions.timeout``; ``get_timeout_in_seconds`` divides by 1000.
GEMINI_TIMEOUT_MS_DEFAULT = 60_000
# Number of suggestions kept from one Gemini reply (the prompt asks for three).
MAX_SUGGESTIONS_PER_REPLY = 3
# Rough character-to-token ratio used only when the BPE tokenizer is unavailable.
_CHARS_PER_TOKEN_ESTIMATE = 4


async def run_blocking(func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Run a blocking sync call in a worker thread.

    The controllers are ``async`` but the PostgREST and Gemini SDKs are
    synchronous, so calling them directly would block the event loop and stall
    every other concurrent request. Offloading to anyio's thread pool keeps the
    loop free.
    """

    return await to_thread.run_sync(partial(func, *args, **kwargs))


# ── AI suggestion cache ─────────────────────────────────────────────────
# A recommendation is a pure function of (media_type, the user's library), so a
# repeat request with an unchanged library can reuse the previous Gemini answer
# instead of paying the multi-second call and quota again.
#
# The key is content-addressed: identical (media_type, pruned library, model,
# prompt version) tuples share one entry, across any users with the same
# library. The cache lives in process memory and is not an identity or privacy
# boundary; it must never be relied on to isolate users.

_SUGGESTION_CACHE_TTL_SECONDS = 600
# Bump when the prompt templates or reply-parsing rules change, so answers
# produced under the old prompt are not served for the new one.
PROMPT_VERSION = "2026-11-08"
_suggestion_cache: dict[str, tuple[float, SuggestionPayload]] = {}


def _suggestion_cache_key(media_type: str, pruned: list[dict], model: str) -> str:
    """Build a stable cache key from the inputs that shape a Gemini answer.

    The key covers the media type, the pruned library, the Gemini model and the
    prompt version. SHA-256 (not the built-in ``hash()``) keeps the key
    collision-resistant, so two different inputs cannot be served each other's
    cached answer.
    """

    payload = json.dumps(
        [pruned, media_type, model, PROMPT_VERSION], sort_keys=True, default=str
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{media_type}:{digest}"


def _get_cached_suggestion(key: str) -> SuggestionPayload | None:
    cached = _suggestion_cache.get(key)
    if cached is None:
        return None
    stored_at, payload = cached
    if monotonic() - stored_at > _SUGGESTION_CACHE_TTL_SECONDS:
        _suggestion_cache.pop(key, None)
        return None
    return payload


def _store_cached_suggestion(key: str, payload: SuggestionPayload) -> None:
    # Sweep expired entries on write. They are otherwise only removed when the
    # same key is read again, so stale per-library keys would accumulate.
    now = monotonic()
    expired = [
        k
        for k, (stored_at, _) in _suggestion_cache.items()
        if now - stored_at > _SUGGESTION_CACHE_TTL_SECONDS
    ]
    for k in expired:
        _suggestion_cache.pop(k, None)
    _suggestion_cache[key] = (now, payload)


def reset_suggestion_cache() -> None:
    """Clear the suggestion cache (used by tests for isolation)."""

    _suggestion_cache.clear()


# ── Local fallback matrices per media type ──────────────────────────────

LOCAL_FALLBACKS: dict[str, dict[str, tuple[str, str, str, str]]] = {
    # (title, creator, genre, pitch)
    "book": {
        "cyberpunk": (
            "Altered Carbon",
            "Richard K. Morgan",
            "Cyberpunk",
            "Consciousness is downloadable. Death is a temporary"
            " inconvenience. A murdered man hires a killer to find"
            " his own murderer.",
        ),
        "existentialist": (
            "The Stranger",
            "Albert Camus",
            "Existentialist Fiction",
            "A man kills a stranger on a sun-drenched beach and feels"
            " nothing. Society demands he perform grief he cannot fake.",
        ),
        "horror": (
            "The Shining",
            "Stephen King",
            "Horror",
            "Isolation turns a family man into a vessel for an evil"
            " hotel. The real horror is how familiar his descent feels.",
        ),
        "_default": (
            "Neuromancer",
            "William Gibson",
            "Cyberpunk",
            "A washed-up hacker gets one last job: hack the most"
            " powerful AI in existence. The genre was born here.",
        ),
    },
    "movie": {
        "horror": (
            "Midsommar",
            "Ari Aster",
            "Horror",
            "A grief-stricken woman joins a sunlit pagan ritual that"
            " becomes the most beautiful nightmare ever filmed.",
        ),
        "sci-fi": (
            "Arrival",
            "Denis Villeneuve",
            "Sci-Fi",
            "Aliens arrive and a linguist must decode their language"
            " before time itself becomes the enemy.",
        ),
        "thriller": (
            "Oldboy",
            "Park Chan-wook",
            "Thriller",
            "Imprisoned for 15 years with no explanation, a man is"
            " released to find the answer will destroy him.",
        ),
        "_default": (
            "Blade Runner 2049",
            "Denis Villeneuve",
            "Sci-Fi",
            "A replicant cop unearths a secret that could shatter"
            " the fragile peace between humans and machines.",
        ),
    },
    "anime": {
        "psychological": (
            "Monster",
            "Madhouse",
            "Psychological Thriller",
            "A surgeon saves a child who grows into a serial killer."
            " Now he must hunt the life he saved.",
        ),
        "action": (
            "Mob Psycho 100",
            "Bones",
            "Action",
            "The most powerful psychic alive just wants to be normal."
            " His restraint is more terrifying than his power.",
        ),
        "sci-fi": (
            "Steins;Gate",
            "White Fox",
            "Sci-Fi Thriller",
            "A self-proclaimed mad scientist accidentally invents time"
            " travel and must undo every change before reality collapses.",
        ),
        "_default": (
            "Cowboy Bebop",
            "Sunrise",
            "Sci-Fi",
            "A crew of broke bounty hunters drift through space running"
            " from the pasts they can never outrun.",
        ),
    },
    "job": {
        "engineering": (
            "Staff Engineer @ Stripe",
            "Stripe",
            "Payments Infrastructure",
            "Build the financial backbone of the internet."
            " Distributed systems at planetary scale.",
        ),
        "ai": (
            "ML Engineer @ Anthropic",
            "Anthropic",
            "AI Safety",
            "Train frontier models that understand nuance."
            " Safety is the product, not the afterthought.",
        ),
        "product": (
            "Product Manager @ Linear",
            "Linear",
            "Developer Tools",
            "Ship the tool that engineers actually want to use."
            " Taste matters more than process.",
        ),
        "_default": (
            "Senior Software Engineer @ Cloudflare",
            "Cloudflare",
            "Edge Computing",
            "Push code to 300 cities in under a second. The edge is the new origin.",
        ),
    },
}

# ── Master prompts per media type ────────────────────────────────────────

MASTER_PROMPTS = {
    "book": (
        "Act as a master archivist. I am providing a list of books from my"
        " personal library: {context}.\n"
        "Analyze the underlying themes, pacing, and philosophical depth.\n"
        "Suggest 3 new books that match this exact psychological profile."
        " Do NOT suggest titles already in the list.\n\n"
        "Output requirements:\n"
        "Return ONLY a valid JSON array of objects. No markdown backticks,"
        " no intro text, no conversational filler.\n"
        "Each object must have exactly these keys:\n"
        '- "title": (string)\n'
        '- "creator": (string, author name)\n'
        '- "genre": (string)\n'
        '- "year": (string, original publication year e.g. "1984")\n'
        '- "pitch": (string, punchy 2-sentence hook)\n'
    ),
    "movie": (
        "Act as an elite film curator. I am providing a list of movies"
        " from my personal library: {context}.\n"
        "Analyze the cinematic style, pacing, and narrative complexity.\n"
        "Suggest 3 film recommendations that elevate this specific taste"
        " profile. Do NOT suggest titles already in the list.\n\n"
        "Output requirements:\n"
        "Return ONLY a valid JSON array of objects. No markdown backticks,"
        " no intro text, no conversational filler.\n"
        "Each object must have exactly these keys:\n"
        '- "title": (string)\n'
        '- "creator": (string, director name)\n'
        '- "genre": (string)\n'
        '- "year": (string, release year e.g. "1999")\n'
        '- "pitch": (string, high-stakes 2-sentence hook)\n'
    ),
    "anime": (
        "Act as a hardcore anime curator specializing in dark,"
        " psychological, and complex narratives. I am providing a list"
        " of anime from my personal library: {context}.\n"
        "Analyze the themes, studio styles, and narrative depth.\n"
        "Suggest 3 anime series that match this intense energy."
        " Do not suggest generic tropes unless they violently subvert"
        " the genre. Do NOT suggest titles already in the list.\n\n"
        "Output requirements:\n"
        "Return ONLY a valid JSON array of objects. No markdown backticks,"
        " no intro text, no conversational filler.\n"
        "Each object must have exactly these keys:\n"
        '- "title": (string)\n'
        '- "creator": (string, animation studio)\n'
        '- "genre": (string)\n'
        '- "year": (string, first air year e.g. "1998")\n'
        '- "pitch": (string, gripping 2-sentence hook on psychological'
        " stakes)\n"
    ),
    "job": (
        "Act as an elite career strategist. I am providing a list of job"
        " applications from my tracker: {context}.\n"
        "Analyze the roles, companies, industries, and seniority level.\n"
        "Suggest 3 new companies or roles that match this career trajectory"
        " and skill profile. Do NOT suggest companies already in the list.\n\n"
        "Output requirements:\n"
        "Return ONLY a valid JSON array of objects. No markdown backticks,"
        " no intro text, no conversational filler.\n"
        "Each object must have exactly these keys:\n"
        '- "title": (string, role title e.g. "Senior Backend Engineer")\n'
        '- "creator": (string, company name)\n'
        '- "genre": (string, industry or domain)\n'
        '- "year": (string, empty string "")\n'
        '- "pitch": (string, punchy 2-sentence reason why this role fits)\n'
    ),
}


@dataclass
class GeminiCircuitBreaker:
    """Small in-memory circuit breaker for unstable AI upstream calls.

    The breaker opens after ``failure_threshold`` consecutive failures and
    admits requests again once ``reset_timeout_seconds`` has passed since it
    opened. Failures recorded while it is already open do not move the reset
    deadline, so a burst of in-flight failures cannot extend the outage.
    """

    failure_threshold: int
    reset_timeout_seconds: int
    consecutive_failures: int = 0
    opened_at: float | None = None

    def allows_requests(self) -> bool:
        if self.opened_at is None:
            return True
        if monotonic() - self.opened_at >= self.reset_timeout_seconds:
            self.opened_at = None
            self.consecutive_failures = 0
            return True
        return False

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.consecutive_failures += 1
        reached = self.consecutive_failures >= self.failure_threshold
        if self.opened_at is None and reached:
            self.opened_at = monotonic()


@dataclass(frozen=True)
class SuggestionItem:
    """A single media recommendation."""

    title: str
    creator: str = ""
    genre: str = ""
    pitch: str = ""
    year: str = ""


@dataclass(frozen=True)
class SuggestionPayload:
    """Multi-suggestion result used by controllers.

    ``suggestions`` is a tuple because the payload is cached process-wide and
    shared across requests; a mutable list would let one caller change what
    every later caller receives.
    """

    suggestions: tuple[SuggestionItem, ...] = ()
    source: str = "local"


def create_supabase_user_client(access_token: str) -> SyncPostgrestClient:
    """Return a PostgREST client bound to the caller token so RLS is enforced.

    The caller owns the returned client and its HTTP session; call
    ``aclose()`` (or use it as a context manager) when the request is done.
    """

    settings = get_settings()
    rest_url = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    return SyncPostgrestClient(
        rest_url,
        headers={
            "apikey": settings.supabase_auth_key,
            "Authorization": f"Bearer {access_token}",
        },
    )


def create_supabase_auth_client() -> Client:
    """Return a fresh Supabase client for per-request auth operations.

    Deliberately not cached: the GoTrue session and its refresh timer live on
    the instance, so one client must never serve two requests.
    """

    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_auth_key)


@lru_cache(maxsize=1)
def create_supabase_service_client() -> Client:
    """Return a Supabase client with the service role key. Bypasses RLS.

    Use ONLY for backend operations that need to write to RLS-protected tables
    (e.g., the email poller writing to nexus_emails). Never expose this to
    user-facing code paths. The client carries no per-user session, so it is
    cached and shared by the poller across cycles.
    """

    settings = get_settings()
    key = settings.supabase_service_role_key
    if not key:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is required for email poller writes. "
            "Find it in your Supabase dashboard under Settings > API > service_role."
        )
    return create_client(settings.supabase_url, key)


def _gemini_timeout_ms() -> int:
    """Return the per-request Gemini timeout in milliseconds.

    Reads ``gemini_timeout_ms`` from settings when present and falls back to
    ``GEMINI_TIMEOUT_MS_DEFAULT`` otherwise or when the value is not usable.
    """

    value = getattr(get_settings(), "gemini_timeout_ms", GEMINI_TIMEOUT_MS_DEFAULT)
    try:
        timeout_ms = int(value)
    except (TypeError, ValueError):
        return GEMINI_TIMEOUT_MS_DEFAULT
    return timeout_ms if timeout_ms > 0 else GEMINI_TIMEOUT_MS_DEFAULT


@lru_cache(maxsize=1)
def get_genai_client() -> genai.Client | None:
    """Return a Gemini client when configured.

    The timeout is set once here so every caller of the shared client (media
    suggestions, chat, email) gets a bounded SDK call instead of an open-ended
    httpx read.
    """

    api_key = get_settings().gemini_api_key
    if not api_key:
        return None
    return genai.Client(
        api_key=api_key,
        http_options=genai_types.HttpOptions(timeout=_gemini_timeout_ms()),
    )


@lru_cache(maxsize=1)
def get_token_encoder() -> tiktoken.Encoding:
    """Return the cl100k_base tokenizer used for context-budget estimation.

    The first call may download the BPE file (tiktoken uses ``requests.get``
    without a timeout). Callers that cannot afford that must handle a failure;
    ``prune_media_context`` falls back to a character estimate.
    """

    return tiktoken.get_encoding("cl100k_base")


@lru_cache(maxsize=1)
def get_gemini_circuit_breaker() -> GeminiCircuitBreaker:
    """Return the shared circuit breaker instance for Gemini requests."""

    settings = get_settings()
    return GeminiCircuitBreaker(
        failure_threshold=settings.gemini_circuit_breaker_failures,
        reset_timeout_seconds=settings.gemini_circuit_breaker_reset_seconds,
    )


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN_ESTIMATE)


def prune_media_context(media_context: list[dict]) -> list[dict]:
    """Trim media context to stay within a rough token budget.

    Returns ``[]`` for an empty library. Callers must treat that as "no personal
    signal" rather than substituting a placeholder title, which would otherwise
    reach the model as if the user owned it.
    """

    if not media_context:
        return []

    try:
        encoder: tiktoken.Encoding | None = get_token_encoder()
    except Exception:
        # No network or a corrupt cache must not fail the request; the budget
        # is a rough estimate, so a character count is good enough.
        logger.warning("Tokenizer unavailable, using character estimate", exc_info=True)
        encoder = None

    budget = get_settings().gemini_context_token_budget
    pruned: list[dict] = []
    used_tokens = 0

    ranked = sorted(
        media_context,
        key=lambda m: (-(m.get("rating") or 0), str(m.get("title") or "")),
    )

    for item in ranked:
        compact = {
            "title": item.get("title"),
            "genre": item.get("genre") or "Unknown",
            "rating": item.get("rating") or "unrated",
            "type": item.get("type") or "book",
            "creator": item.get("creator") or "Unknown",
        }
        text = str(compact)
        estimated = (
            len(encoder.encode(text)) if encoder is not None else _estimate_tokens(text)
        )
        if pruned and used_tokens + estimated > budget:
            break
        pruned.append(compact)
        used_tokens += estimated

    return pruned


def build_prompt(media_context: list[dict], media_type: str = "book") -> str:
    """Build a type-specific master prompt for Gemini."""

    template = MASTER_PROMPTS.get(media_type, MASTER_PROMPTS["book"])
    context = serialize_media_context_for_llm(media_context)
    return template.format(context=context)


def _genre_matches(genre_key: str, genre_text: str) -> bool:
    """Return True when ``genre_key`` appears as a whole word in ``genre_text``.

    Word boundaries stop the short key ``ai`` from matching ``Retail`` or
    ``Maintenance`` while keeping hyphenated keys such as ``sci-fi`` intact.
    """

    pattern = rf"(?<![a-z0-9]){re.escape(genre_key)}(?![a-z0-9])"
    return re.search(pattern, genre_text) is not None


def build_local_suggestion(
    media_context: list[dict],
    media_type: str = "book",
) -> SuggestionPayload:
    """Return deterministic fallback suggestions based on genre and type."""

    fallbacks = LOCAL_FALLBACKS.get(media_type, LOCAL_FALLBACKS["book"])

    lowered_genres = [
        str(item.get("genre") or "").strip().lower()
        for item in media_context
        if item.get("genre")
    ]
    top_genre = lowered_genres[0] if lowered_genres else ""

    for genre_key, (title, creator, genre, pitch) in fallbacks.items():
        if genre_key != "_default" and _genre_matches(genre_key, top_genre):
            return SuggestionPayload(
                suggestions=(
                    SuggestionItem(
                        title=title,
                        creator=creator,
                        genre=genre,
                        pitch=f"Local fallback. {pitch}",
                    ),
                ),
                source="local",
            )

    dt, dc, dg, dp = fallbacks["_default"]
    return SuggestionPayload(
        suggestions=(
            SuggestionItem(
                title=dt, creator=dc, genre=dg, pitch=f"Local fallback. {dp}"
            ),
        ),
        source="local",
    )


def _as_str(value: object) -> str:
    """Coerce one model-supplied field to a stripped string.

    ``None``, booleans and containers become ``""`` rather than the literal
    text ``"None"``, so a null field never reaches the response schema as a
    non-string.
    """

    if value is None or isinstance(value, bool):
        return ""
    if isinstance(value, (int, float)):
        return str(value).strip()
    if isinstance(value, str):
        return value.strip()
    return ""


def _item_from_dict(raw: dict) -> SuggestionItem | None:
    """Build a SuggestionItem from one model object, or None if unusable."""

    title_value = raw.get("title")
    if not isinstance(title_value, str):
        return None
    title = title_value.strip()
    if not title:
        return None
    return SuggestionItem(
        title=title,
        creator=_as_str(raw.get("creator")),
        genre=_as_str(raw.get("genre")),
        pitch=_as_str(raw.get("pitch")) or _as_str(raw.get("reasoning")),
        year=_as_str(raw.get("year")),
    )


def parse_gemini_json_response(response_text: str) -> list[SuggestionItem]:
    """Parse Gemini output into suggestion items.

    Invalid entries are skipped before the per-reply cap is applied, so bad
    objects do not use up the budget that valid ones need. Returns ``[]`` when
    no usable suggestion is present; callers treat that as a failed parse.
    """

    text = response_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return _parse_legacy_response(response_text)

    if not isinstance(data, list):
        return _parse_legacy_response(response_text)

    items: list[SuggestionItem] = []
    for raw in data:
        if not isinstance(raw, dict):
            continue
        item = _item_from_dict(raw)
        if item is None:
            continue
        items.append(item)
        if len(items) == MAX_SUGGESTIONS_PER_REPLY:
            break
    return items


def _parse_legacy_response(response_text: str) -> list[SuggestionItem]:
    """Parse ``Title:`` / ``Reasoning:`` labelled output.

    Returns ``[]`` unless a ``Title:`` label with a value is present. Free-form
    prose is never turned into a suggestion, since it would be cached and served
    as if it were a real recommendation.
    """

    title = ""
    reasoning = ""
    for line in response_text.splitlines():
        normalized = line.strip()
        if normalized.lower().startswith("title:"):
            title = normalized.split(":", 1)[1].strip()
        if normalized.lower().startswith("reasoning:"):
            reasoning = normalized.split(":", 1)[1].strip()
    if not title:
        return []
    return [SuggestionItem(title=title, pitch=reasoning)]


async def _run_gemini_call(func: Callable[..., Any], /, **kwargs: Any) -> Any:
    """Run a Gemini SDK call in a worker thread with a wall-clock cap.

    The SDK timeout (``HttpOptions.timeout``) is the primary control: it makes
    the blocked httpx call raise, which the caller records as a breaker failure.
    This deadline is a backstop for slow streams that keep the per-read timeout
    alive. ``abandon_on_cancel=True`` lets the request return on deadline; the
    worker thread still ends on its own SDK timeout. Only Gemini calls use this,
    because abandoning a database write would leave its outcome unknown.
    """

    deadline_seconds = _gemini_timeout_ms() / 1000
    with fail_after(deadline_seconds):
        return await to_thread.run_sync(
            partial(func, **kwargs),
            abandon_on_cancel=True,
        )


async def get_media_suggestion(
    media_context: list[dict],
    media_type: str = "book",
) -> SuggestionPayload:
    """Create a resilient recommendation based on current user media.

    Order of checks: empty library (no Gemini call), Gemini client configured,
    cache hit (served even while the breaker is open), breaker gate, upstream
    call. Only a parsed, non-empty reply is marked as a breaker success and
    cached.
    """

    pruned = await run_blocking(prune_media_context, media_context)
    if not pruned:
        return build_local_suggestion([], media_type)

    client = get_genai_client()
    if client is None:
        return build_local_suggestion(pruned, media_type)

    model = get_settings().gemini_model
    cache_key = _suggestion_cache_key(media_type, pruned, model)
    cached = _get_cached_suggestion(cache_key)
    if cached is not None:
        return cached

    breaker = get_gemini_circuit_breaker()
    if not breaker.allows_requests():
        logger.warning("Gemini circuit breaker open, returning local fallback")
        return build_local_suggestion(pruned, media_type)

    try:
        response = await _run_gemini_call(
            client.models.generate_content,
            model=model,
            contents=build_prompt(pruned, media_type),
        )
    except Exception:  # pragma: no cover - third-party failure path
        breaker.record_failure()
        logger.exception("Gemini recommendation request failed")
        return build_local_suggestion(pruned, media_type)

    if not response.text:
        breaker.record_failure()
        logger.warning("Gemini returned an empty recommendation payload")
        return build_local_suggestion(pruned, media_type)

    items = parse_gemini_json_response(response.text)
    if not items:
        breaker.record_failure()
        logger.warning("Gemini reply contained no usable recommendations")
        return build_local_suggestion(pruned, media_type)

    breaker.record_success()
    payload = SuggestionPayload(suggestions=tuple(items), source="gemini")
    _store_cached_suggestion(cache_key, payload)
    return payload
