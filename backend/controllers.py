"""Book API controllers."""

import logging

from litestar import Controller, Request, get, post
from litestar.exceptions import HTTPException

try:
    from .audit_logger import log_audit_event
    from .data_protection import encrypt_takeaway, hydrate_book_record
    from .rate_limit import enforce_suggest_rate_limit
    from .schemas import BookCreate, SuggestionResponse
    from .services import create_supabase_user_client, get_book_suggestion
except ImportError:  # pragma: no cover - supports backend cwd execution
    from audit_logger import log_audit_event
    from data_protection import encrypt_takeaway, hydrate_book_record
    from rate_limit import enforce_suggest_rate_limit
    from schemas import BookCreate, SuggestionResponse
    from services import create_supabase_user_client, get_book_suggestion

logger = logging.getLogger(__name__)


def _get_user_books_client(request: Request):
    """Return a caller-scoped Supabase client so Postgres enforces RLS."""

    access_token = getattr(request.state, "access_token", None)
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid authorization token",
        )
    return create_supabase_user_client(access_token)


class BookController(Controller):
    """Authenticated book endpoints."""

    path = "/books"

    @get()
    async def get_books(self, request: Request) -> list[dict]:
        """Return the authenticated user's books."""

        user_id = request.state.user_id
        try:
            response = (
                _get_user_books_client(request).table("books").select("*").execute()
            )
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to fetch books for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to fetch books"
            ) from exc
        return [hydrate_book_record(record) for record in (response.data or [])]

    @post()
    async def create_book(self, data: BookCreate, request: Request) -> dict:
        """Create a new book entry for the authenticated user."""

        user_id = request.state.user_id
        book_data = data.model_dump()
        book_data["user_id"] = user_id
        book_data["takeaway"] = encrypt_takeaway(book_data.get("takeaway"))
        try:
            response = (
                _get_user_books_client(request)
                .table("books")
                .insert(book_data)
                .execute()
            )
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to create book for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to create book"
            ) from exc

        log_audit_event(
            action="book.create",
            user_id=user_id,
            metadata={"status": book_data["status"], "title": book_data["title"]},
        )
        created_book = response.data[0] if response.data else {}
        return hydrate_book_record(created_book)

    @get("/suggest")
    async def suggest_book(self, request: Request) -> SuggestionResponse:
        """Return an AI-assisted recommendation based on the current library."""

        user_id = request.state.user_id
        enforce_suggest_rate_limit(user_id)
        try:
            books = (
                _get_user_books_client(request)
                .table("books")
                .select("title, genre, rating")
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
