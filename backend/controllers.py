"""Authenticated media API controllers.

Every handler follows the same shape:

1. Authenticate: read the caller's access token. A missing token is a 401 and
   is raised *before* any external call, so it never reaches the broad
   external-failure handler that maps Supabase errors to 502.
2. Validate the request (422) and check ownership-scoped results (404).
3. Call Supabase through a caller-scoped PostgREST client so Postgres enforces
   row-level security. Failures there are logged and mapped to 502.
4. Write an audit event for mutations and return the hydrated record.
"""

import logging
from typing import Annotated, Any

from litestar import Controller, Request, delete, get, post, put
from litestar.exceptions import HTTPException
from litestar.params import FromPath, JSONBody, QueryParameter

try:
    from .audit_logger import log_audit_event
    from .data_protection import encrypt_takeaway, hydrate_media_record
    from .rate_limit import enforce_ai_rate_limit_async
    from .schemas import (
        MediaCreate,
        MediaUpdate,
        SuggestionItem,
        SuggestionResponse,
    )
    from .services import (
        create_supabase_user_client,
        get_media_suggestion,
        run_blocking,
    )
except ImportError:  # pragma: no cover - supports backend cwd execution
    from audit_logger import log_audit_event
    from data_protection import encrypt_takeaway, hydrate_media_record
    from rate_limit import enforce_ai_rate_limit_async
    from schemas import (
        MediaCreate,
        MediaUpdate,
        SuggestionItem,
        SuggestionResponse,
    )
    from services import (
        create_supabase_user_client,
        get_media_suggestion,
        run_blocking,
    )

logger = logging.getLogger(__name__)

VALID_MEDIA_TYPES = frozenset({"book", "movie", "anime", "job"})
DEFAULT_SUGGESTION_TYPE = "book"

MISSING_TOKEN_DETAIL = "Missing or invalid authorization token"  # nosec B105
TAKEAWAY_ENCRYPTION_DETAIL = (
    "Takeaway notes require server-side encryption to be configured."
)


def _require_access_token(request: Request) -> str:
    """Return the caller's access token or raise 401.

    Call this before any ``try`` block that wraps a Supabase call, so that an
    authentication failure is never logged or re-raised as a 502.
    """

    access_token = getattr(request.state, "access_token", None)
    if not access_token:
        raise HTTPException(status_code=401, detail=MISSING_TOKEN_DETAIL)
    return access_token


def _get_user_client(access_token: str) -> Any:
    """Return a caller-scoped PostgREST client so Postgres enforces RLS."""

    return create_supabase_user_client(access_token)


def _encrypt_takeaway_or_422(takeaway: str | None) -> str | None:
    """Encrypt takeaway notes, or reject the request when encryption is off."""

    try:
        return encrypt_takeaway(takeaway)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=TAKEAWAY_ENCRYPTION_DETAIL) from exc


class MediaController(Controller):
    """Authenticated media endpoints."""

    path = "/media"

    @get()
    async def get_media(
        self,
        request: Request,
        media_type: Annotated[str | None, QueryParameter(name="type")] = None,
        page: Annotated[int, QueryParameter(ge=1)] = 1,
        limit: Annotated[int, QueryParameter(ge=1, le=500)] = 200,
    ) -> list[dict[str, Any]]:
        """Return the authenticated user's media, newest first, paginated."""

        user_id = request.state.user_id
        access_token = _require_access_token(request)
        # The filter is validated before the external call so a bad value is a
        # 422 and never reaches Supabase.
        if media_type is not None and media_type not in VALID_MEDIA_TYPES:
            raise HTTPException(status_code=422, detail="Invalid media type")
        offset = (page - 1) * limit
        try:
            query = _get_user_client(access_token).from_("media").select("*")
            if media_type:
                query = query.eq("type", media_type)
            builder = query.order("created_at", desc=True).range(
                offset, offset + limit - 1
            )
            response = await run_blocking(builder.execute)
        except Exception as exc:
            logger.exception("Failed to fetch media for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to fetch media"
            ) from exc
        return [hydrate_media_record(record) for record in (response.data or [])]

    @post()
    async def create_media(
        self, data: JSONBody[MediaCreate], request: Request
    ) -> dict[str, Any]:
        """Create a new media entry for the authenticated user."""

        user_id = request.state.user_id
        access_token = _require_access_token(request)
        media_data = data.model_dump()
        media_data["user_id"] = user_id
        media_data["takeaway"] = _encrypt_takeaway_or_422(media_data.get("takeaway"))
        try:
            builder = _get_user_client(access_token).from_("media").insert(media_data)
            response = await run_blocking(builder.execute)
        except Exception as exc:
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
        media_id: FromPath[str],
        data: JSONBody[MediaUpdate],
        request: Request,
    ) -> dict[str, Any]:
        """Update an existing media entry for the authenticated user."""

        user_id = request.state.user_id
        access_token = _require_access_token(request)
        # exclude_unset keeps explicit nulls (e.g. rating=null clears a rating)
        # while fields omitted from the request body stay untouched.
        update_data = data.model_dump(exclude_unset=True)
        if "takeaway" in update_data:
            update_data["takeaway"] = _encrypt_takeaway_or_422(update_data["takeaway"])
        if not update_data:
            raise HTTPException(status_code=422, detail="No fields to update")
        try:
            builder = (
                _get_user_client(access_token)
                .from_("media")
                .update(update_data)
                .eq("id", media_id)
            )
            response = await run_blocking(builder.execute)
        except Exception as exc:
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
    async def delete_media(self, media_id: FromPath[str], request: Request) -> None:
        """Delete a media entry for the authenticated user."""

        user_id = request.state.user_id
        access_token = _require_access_token(request)
        try:
            builder = (
                _get_user_client(access_token)
                .from_("media")
                .delete()
                .eq("id", media_id)
            )
            await run_blocking(builder.execute)
        except Exception as exc:
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
        media_type: Annotated[str | None, QueryParameter(name="type")] = (
            DEFAULT_SUGGESTION_TYPE
        ),
    ) -> SuggestionResponse:
        """Return an AI-assisted recommendation for the given media type.

        An unknown or missing ``type`` falls back to ``book``.
        """

        user_id = request.state.user_id
        access_token = _require_access_token(request)
        suggestion_type = (
            media_type if media_type in VALID_MEDIA_TYPES else DEFAULT_SUGGESTION_TYPE
        )
        await enforce_ai_rate_limit_async(user_id, "suggest")
        try:
            query = (
                _get_user_client(access_token)
                .from_("media")
                .select("title, genre, rating, type, creator")
                .eq("type", suggestion_type)
            )
            items = await run_blocking(query.execute)
        except Exception as exc:
            logger.exception(
                "Failed to load media for suggestion for user %s",
                user_id,
            )
            raise HTTPException(
                status_code=502,
                detail="Failed to load media for suggestions",
            ) from exc

        library = items.data or []
        suggestion = await get_media_suggestion(library, suggestion_type)
        log_audit_event(
            action="media.suggest",
            user_id=user_id,
            metadata={
                "type": suggestion_type,
                "library_size": len(library),
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
