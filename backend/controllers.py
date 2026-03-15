"""Book API controllers."""

import logging
from functools import lru_cache

from litestar import Controller, Request, get, post
from litestar.exceptions import HTTPException
from supabase import Client, create_client
from google import genai

try:
    from .config import get_settings
    from .schemas import BookCreate, SuggestionResponse
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from schemas import BookCreate, SuggestionResponse

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Create the shared Supabase client from validated settings."""

    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


class BookController(Controller):
    path = "/books"

    @get()
    async def get_books(self, request: Request) -> list[dict]:
        user_id = request.state.user_id
        try:
            response = (
                get_supabase_client()
                .table("books")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to fetch books for user %s", user_id)
            raise HTTPException(status_code=502, detail="Failed to fetch books") from exc
        return response.data or []

    @post()
    async def create_book(self, data: BookCreate, request: Request) -> dict:
        user_id = request.state.user_id
        book_data = data.model_dump()
        book_data["user_id"] = user_id
        try:
            response = get_supabase_client().table("books").insert(book_data).execute()
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to create book for user %s", user_id)
            raise HTTPException(status_code=502, detail="Failed to create book") from exc
        return response.data[0] if response.data else {}

    @get("/suggest")
    async def suggest_book(self, request: Request) -> SuggestionResponse:
        user_id = request.state.user_id
        try:
            books = (
                get_supabase_client()
                .table("books")
                .select("title, genre, rating")
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception(
                "Failed to load books for suggestion request for user %s",
                user_id,
            )
            raise HTTPException(
                status_code=502,
                detail="Failed to load books for suggestions",
            ) from exc

        gemini_api_key = get_settings().gemini_api_key
        if not gemini_api_key:
            return SuggestionResponse(
                suggestion="Neuromancer",
                reasoning="Gemini API Key missing, static response.",
            )

        client = genai.Client(api_key=gemini_api_key)
        prompt = f"Based on the user's books: {books.data}, suggest a dark cyberpunk book to read next. Respond with only a simple title and reasoning."

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return SuggestionResponse(suggestion="Generated", reasoning=response.text)
