"""Service helpers for backend integrations."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from time import monotonic

import tiktoken
from google import genai
from postgrest import SyncPostgrestClient

from supabase import Client, create_client

try:
    from .config import get_settings
    from .data_protection import serialize_media_context_for_llm
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from data_protection import serialize_media_context_for_llm

logger = logging.getLogger(__name__)

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
            "Push code to 300 cities in under a second."
            " The edge is the new origin.",
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
    """Small in-memory circuit breaker for unstable AI upstream calls."""

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
        if self.consecutive_failures >= self.failure_threshold:
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
    """Structured multi-suggestion response used by controllers."""

    suggestions: list[SuggestionItem] = field(default_factory=list)
    source: str = "local"


def create_supabase_user_client(access_token: str) -> SyncPostgrestClient:
    """Return a PostgREST client bound to the caller token so RLS is enforced."""

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
    """Return a fresh Supabase client for per-request auth operations."""

    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_auth_key)


@lru_cache(maxsize=1)
def get_genai_client() -> genai.Client | None:
    """Return a Gemini client when configured."""

    api_key = get_settings().gemini_api_key
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


@lru_cache(maxsize=1)
def get_token_encoder() -> tiktoken.Encoding:
    """Return a tokenizer for rough context-budget estimation."""

    return tiktoken.get_encoding("cl100k_base")


@lru_cache(maxsize=1)
def get_gemini_circuit_breaker() -> GeminiCircuitBreaker:
    """Return the shared circuit breaker instance for Gemini requests."""

    settings = get_settings()
    return GeminiCircuitBreaker(
        failure_threshold=settings.gemini_circuit_breaker_failures,
        reset_timeout_seconds=settings.gemini_circuit_breaker_reset_seconds,
    )


def prune_media_context(media_context: list[dict]) -> list[dict]:
    """Trim media context to stay within a rough token budget."""

    encoder = get_token_encoder()
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
        estimated = len(encoder.encode(str(compact)))
        if pruned and used_tokens + estimated > budget:
            break
        pruned.append(compact)
        used_tokens += estimated

    return pruned or [
        {"title": "Neuromancer", "genre": "Cyberpunk", "rating": 5, "type": "book"}
    ]


def build_prompt(media_context: list[dict], media_type: str = "book") -> str:
    """Build a type-specific master prompt for Gemini."""

    template = MASTER_PROMPTS.get(media_type, MASTER_PROMPTS["book"])
    context = serialize_media_context_for_llm(media_context)
    return template.format(context=context)


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
        if genre_key != "_default" and genre_key in top_genre:
            return SuggestionPayload(
                suggestions=[
                    SuggestionItem(
                        title=title,
                        creator=creator,
                        genre=genre,
                        pitch=f"Local fallback. {pitch}",
                    )
                ],
                source="local",
            )

    dt, dc, dg, dp = fallbacks["_default"]
    return SuggestionPayload(
        suggestions=[
            SuggestionItem(
                title=dt, creator=dc, genre=dg, pitch=f"Local fallback. {dp}"
            )
        ],
        source="local",
    )


def parse_gemini_json_response(response_text: str) -> list[SuggestionItem]:
    """Parse Gemini JSON array output into suggestion items."""

    text = response_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return _parse_legacy_response(response_text)

    if isinstance(data, list):
        return [
            SuggestionItem(
                title=item.get("title", "Unknown"),
                creator=item.get("creator", ""),
                genre=item.get("genre", ""),
                pitch=item.get("pitch", item.get("reasoning", "")),
                year=str(item.get("year", "")),
            )
            for item in data[:3]
            if isinstance(item, dict) and item.get("title")
        ]

    return _parse_legacy_response(response_text)


def _parse_legacy_response(response_text: str) -> list[SuggestionItem]:
    """Fallback parser for non-JSON Gemini output."""

    title = "Recommended title"
    reasoning = response_text.strip()
    for line in response_text.splitlines():
        normalized = line.strip()
        if normalized.lower().startswith("title:"):
            title = normalized.split(":", 1)[1].strip() or title
        if normalized.lower().startswith("reasoning:"):
            reasoning = normalized.split(":", 1)[1].strip() or reasoning
    return [SuggestionItem(title=title, pitch=reasoning)]


def get_media_suggestion(
    media_context: list[dict],
    media_type: str = "book",
) -> SuggestionPayload:
    """Create a resilient recommendation based on current user media."""

    client = get_genai_client()
    pruned = prune_media_context(media_context)
    breaker = get_gemini_circuit_breaker()

    if client is None:
        return build_local_suggestion(pruned, media_type)
    if not breaker.allows_requests():
        logger.warning("Gemini circuit breaker open, returning local fallback")
        return build_local_suggestion(pruned, media_type)

    try:
        response = client.models.generate_content(
            model=get_settings().gemini_model,
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

    breaker.record_success()
    items = parse_gemini_json_response(response.text)
    if not items:
        return build_local_suggestion(pruned, media_type)

    return SuggestionPayload(suggestions=items, source="gemini")
