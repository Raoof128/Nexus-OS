"""Media API controllers."""

import logging
from typing import Optional

from litestar import Controller, Request, delete, get, post, put
from litestar.exceptions import HTTPException
from litestar.params import Parameter

try:
    from .audit_logger import log_audit_event
    from .data_protection import encrypt_takeaway, hydrate_book_record
    from .rate_limit import enforce_suggest_rate_limit
    from .schemas import MediaCreate, MediaUpdate, SuggestionResponse
    from .services import create_supabase_user_client, get_book_suggestion
except ImportError:  # pragma: no cover - supports backend cwd execution
    from audit_logger import log_audit_event
    from data_protection import encrypt_takeaway, hydrate_book_record
    from rate_limit import enforce_suggest_rate_limit
    from schemas import MediaCreate, MediaUpdate, SuggestionResponse
    from services import create_supabase_user_client, get_book_suggestion

logger = logging.getLogger(__name__)

VALID_MEDIA_TYPES = {"book", "movie", "anime"}


def _get_user_client(request: Request):
    """Return a caller-scoped PostgREST client so Postgres enforces RLS."""

    access_token = getattr(request.state, "access_token", None)
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid authorization token",
        )
    return create_supabase_user_client(access_token)


class MediaController(Controller):
    """Authenticated media endpoints."""

    path = "/media"

    @get()
    async def get_media(
        self,
        request: Request,
        type: Optional[str] = Parameter(query="type", default=None),
    ) -> list[dict]:
        """Return the authenticated user's media, optionally filtered by type."""

        user_id = request.state.user_id
        try:
            query = _get_user_client(request).from_("media").select("*")
            if type and type in VALID_MEDIA_TYPES:
                query = query.eq("type", type)
            response = query.order("created_at", desc=True).execute()
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to fetch media for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to fetch media"
            ) from exc
        return [hydrate_book_record(record) for record in (response.data or [])]

    @post()
    async def create_media(self, data: MediaCreate, request: Request) -> dict:
        """Create a new media entry for the authenticated user."""

        user_id = request.state.user_id
        media_data = data.model_dump()
        media_data["user_id"] = user_id
        media_data["takeaway"] = encrypt_takeaway(media_data.get("takeaway"))
        try:
            response = (
                _get_user_client(request).from_("media").insert(media_data).execute()
            )
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to create media for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to create media"
            ) from exc

        log_audit_event(
            action="media.create",
            user_id=user_id,
            metadata={
                "type": media_data["type"],
                "status": media_data["status"],
                "title": media_data["title"],
            },
        )
        created = response.data[0] if response.data else {}
        return hydrate_book_record(created)

    @put("/{media_id:str}")
    async def update_media(
        self,
        media_id: str,
        data: MediaUpdate,
        request: Request,
    ) -> dict:
        """Update an existing media entry for the authenticated user."""

        user_id = request.state.user_id
        update_data = data.model_dump(exclude_none=True)
        if "takeaway" in update_data:
            update_data["takeaway"] = encrypt_takeaway(update_data["takeaway"])
        if not update_data:
            raise HTTPException(status_code=422, detail="No fields to update")
        try:
            response = (
                _get_user_client(request)
                .from_("media")
                .update(update_data)
                .eq("id", media_id)
                .execute()
            )
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to update media %s for user %s", media_id, user_id)
            raise HTTPException(
                status_code=502, detail="Failed to update media"
            ) from exc

        if not response.data:
            raise HTTPException(status_code=404, detail="Media not found")

        log_audit_event(
            action="media.update",
            user_id=user_id,
            metadata={"media_id": media_id},
        )
        return hydrate_book_record(response.data[0])

    @delete("/{media_id:str}")
    async def delete_media(self, media_id: str, request: Request) -> None:
        """Delete a media entry for the authenticated user."""

        user_id = request.state.user_id
        try:
            _get_user_client(request).from_("media").delete().eq(
                "id", media_id
            ).execute()
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to delete media %s for user %s", media_id, user_id)
            raise HTTPException(
                status_code=502, detail="Failed to delete media"
            ) from exc

        log_audit_event(
            action="media.delete",
            user_id=user_id,
            metadata={"media_id": media_id},
        )

    @get("/suggest")
    async def suggest_media(self, request: Request) -> SuggestionResponse:
        """Return an AI-assisted recommendation based on the current library."""

        user_id = request.state.user_id
        enforce_suggest_rate_limit(user_id)
        try:
            items = (
                _get_user_client(request)
                .from_("media")
                .select("title, genre, rating")
                .execute()
            )
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception(
                "Failed to load media for suggestion for user %s",
                user_id,
            )
            raise HTTPException(
                status_code=502,
                detail="Failed to load media for suggestions",
            ) from exc

        suggestion = get_book_suggestion(items.data or [])
        log_audit_event(
            action="media.suggest",
            user_id=user_id,
            metadata={
                "library_size": len(items.data or []),
                "source": suggestion.source,
            },
        )
        return SuggestionResponse(
            suggestion=suggestion.suggestion,
            reasoning=suggestion.reasoning,
            source=suggestion.source,
        )
