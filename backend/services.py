"""Service helpers for backend integrations."""

from __future__ import annotations

from functools import lru_cache

from google import genai
from litestar.exceptions import HTTPException
from supabase import Client, create_client

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Return a shared Supabase client built from validated settings."""

    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


@lru_cache(maxsize=1)
def get_genai_client() -> genai.Client | None:
    """Return a Gemini client when configured."""

    api_key = get_settings().gemini_api_key
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def build_book_suggestion_reasoning(book_context: list[dict]) -> str:
    """Create a recommendation based on current user books."""

    client = get_genai_client()
    if client is None:
        return "Gemini API Key missing, static response."

    prompt = (
        "Based on the user's books, suggest a dark cyberpunk book to read next. "
        "Respond with a concise title and reasoning. Context: "
        f"{book_context}"
    )
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    if not response.text:
        raise HTTPException(status_code=502, detail="Empty recommendation response")
    return response.text
