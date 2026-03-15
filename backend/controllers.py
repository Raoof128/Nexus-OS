"""Book API controllers."""

import logging

from litestar import Controller, Request, get, post
from litestar.exceptions import HTTPException

try:
    from .audit_logger import log_audit_event
    from .schemas import BookCreate, SuggestionResponse
    from .services import get_book_suggestion, get_supabase_client
except ImportError:  # pragma: no cover - supports backend cwd execution
    from audit_logger import log_audit_event
    from schemas import BookCreate, SuggestionResponse
    from services import get_book_suggestion, get_supabase_client

logger = logging.getLogger(__name__)


class BookController(Controller):
    """Authenticated book endpoints."""

    path = "/books"

    @get()
    async def get_books(self, request: Request) -> list[dict]:
        """Return the authenticated user's books."""

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
            raise HTTPException(
                status_code=502,
                detail="Failed to fetch books",
            ) from exc
        return response.data or []

    @post()
    async def create_book(self, data: BookCreate, request: Request) -> dict:
        """Create a new book entry for the authenticated user."""

        user_id = request.state.user_id
        book_data = data.model_dump()
        book_data["user_id"] = user_id
        try:
            response = get_supabase_client().table("books").insert(book_data).execute()
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to create book for user %s", user_id)
            raise HTTPException(
                status_code=502,
                detail="Failed to create book",
            ) from exc

        log_audit_event(
            action="book.create",
            user_id=user_id,
            metadata={
                "status": book_data["status"],
                "title": book_data["title"],
            },
        )
        return response.data[0] if response.data else {}

    @get("/suggest")
    async def suggest_book(self, request: Request) -> SuggestionResponse:
        """Return an AI-assisted recommendation based on the current library."""

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

        suggestion = get_book_suggestion(books.data or [])
        log_audit_event(
            action="book.suggest",
            user_id=user_id,
            metadata={
                "library_size": len(books.data or []),
                "source": suggestion.source,
            },
        )
        return SuggestionResponse(
            suggestion=suggestion.suggestion,
            reasoning=suggestion.reasoning,
            source=suggestion.source,
        )
