"""Media API controllers."""

import logging
from typing import Optional

from litestar import Controller, Request, delete, get, post, put
from litestar.exceptions import HTTPException
from litestar.params import Parameter

try:
    from .audit_logger import log_audit_event
    from .data_protection import encrypt_takeaway, hydrate_media_record
    from .rate_limit import enforce_ai_rate_limit
    from .schemas import (
        MediaCreate,
        MediaUpdate,
        SuggestionItem,
        SuggestionResponse,
    )
    from .services import create_supabase_user_client, get_media_suggestion
except ImportError:  # pragma: no cover - supports backend cwd execution
    from audit_logger import log_audit_event
    from data_protection import encrypt_takeaway, hydrate_media_record
    from rate_limit import enforce_ai_rate_limit
    from schemas import (
        MediaCreate,
        MediaUpdate,
        SuggestionItem,
        SuggestionResponse,
    )
    from services import create_supabase_user_client, get_media_suggestion

logger = logging.getLogger(__name__)

VALID_MEDIA_TYPES = {"book", "movie", "anime", "job"}


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
        page: int = Parameter(query="page", default=1, ge=1),
        limit: int = Parameter(query="limit", default=200, ge=1, le=500),
    ) -> list[dict]:
        """Return the authenticated user's media with pagination."""

        user_id = request.state.user_id
        offset = (page - 1) * limit
        try:
            query = _get_user_client(request).from_("media").select("*")
            if type and type in VALID_MEDIA_TYPES:
                query = query.eq("type", type)
            response = (
                query.order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to fetch media for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to fetch media"
            ) from exc
        return [hydrate_media_record(record) for record in (response.data or [])]

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
            },
        )
        created = response.data[0] if response.data else {}
        return hydrate_media_record(created)

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
        return hydrate_media_record(response.data[0])

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
    async def suggest_media(
        self,
        request: Request,
        type: Optional[str] = Parameter(query="type", default="book"),
    ) -> SuggestionResponse:
        """Return an AI-assisted recommendation for the given media type."""

        user_id = request.state.user_id
        media_type = type if type in VALID_MEDIA_TYPES else "book"
        enforce_ai_rate_limit(user_id, "suggest")
        try:
            query = (
                _get_user_client(request)
                .from_("media")
                .select("title, genre, rating, type, creator")
            )
            query = query.eq("type", media_type)
            items = query.execute()
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception(
                "Failed to load media for suggestion for user %s",
                user_id,
            )
            raise HTTPException(
                status_code=502,
                detail="Failed to load media for suggestions",
            ) from exc

        suggestion = get_media_suggestion(items.data or [], media_type)
        log_audit_event(
            action="media.suggest",
            user_id=user_id,
            metadata={
                "type": media_type,
                "library_size": len(items.data or []),
                "source": suggestion.source,
            },
        )
        return SuggestionResponse(
            suggestions=[
                SuggestionItem(
                    title=s.title,
                    creator=s.creator,
                    genre=s.genre,
                    pitch=s.pitch,
                    year=s.year,
                )
                for s in suggestion.suggestions
            ],
            source=suggestion.source,
        )
