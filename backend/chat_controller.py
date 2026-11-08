"""AI chat controller with persistent, categorized sessions.

Failure contract for ``POST /chat/sessions/{id}/messages``:

* Success returns 201 with the model reply. The user turn and the model turn
  are both persisted; the user turn is written only after Gemini has answered,
  so a failed generation never leaves an orphan user row.
* AI upstream failure, circuit-breaker open, or a missing API key returns
  503 with ``Retry-After``. Nothing is persisted, so no fallback text ever
  becomes conversation history.
* A request-shaped Gemini rejection (for example a 400 for one malformed
  message) returns 422 and does not count against the shared breaker.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID, uuid4

from google.genai import errors as genai_errors
from google.genai import types
from litestar import Controller, Request, delete, get, post
from litestar.exceptions import HTTPException
from litestar.params import FromPath, FromQuery, JSONBody, QueryParameter

try:
    from .config import get_settings
    from .data_protection import (
        hydrate_chat_message_record,
        protect_chat_content,
        sanitize_chat_message_for_llm,
    )
    from .rate_limit import enforce_ai_rate_limit_async
    from .schemas import (
        ChatCategory,
        ChatMessageRequest,
        ChatMessageResponse,
        ChatSessionCreate,
    )
    from .services import (
        create_supabase_user_client,
        get_gemini_circuit_breaker,
        get_genai_client,
        run_blocking,
    )
except ImportError:  # pragma: no cover
    from config import get_settings
    from data_protection import (
        hydrate_chat_message_record,
        protect_chat_content,
        sanitize_chat_message_for_llm,
    )
    from rate_limit import enforce_ai_rate_limit_async
    from schemas import (
        ChatCategory,
        ChatMessageRequest,
        ChatMessageResponse,
        ChatSessionCreate,
    )
    from services import (
        create_supabase_user_client,
        get_gemini_circuit_breaker,
        get_genai_client,
        run_blocking,
    )

logger = logging.getLogger(__name__)

CHAT_HISTORY_MAX_MESSAGES = 12
"""Newest messages sent to Gemini as context. Enforced in the query itself."""

CHAT_MESSAGES_DEFAULT_LIMIT = 200
CHAT_MESSAGES_MAX_LIMIT = 500
"""Bounds for ``GET /chat/sessions/{id}/messages?limit=``."""

CHAT_GENERATION_TIMEOUT_MS = 60_000
"""Per-request Gemini timeout. The SDK default is no timeout at all."""

CHAT_GENERATION_ATTEMPTS = 2
"""Total Gemini attempts. The SDK default of 5 could hold a thread for minutes."""

CHAT_MAX_OUTPUT_TOKENS = 4096
"""Generous ceiling for a chat reply. Long enough for thinking plus a full answer."""

CHAT_UNAVAILABLE_DETAIL = "AI is temporarily unavailable. Please try again shortly."
CHAT_RETRY_AFTER_SECONDS = "30"
CHAT_REPLY_TRUNCATED_NOTICE = "\n\n[Reply truncated at the output length limit.]"

# Gemini 4xx codes that describe the request rather than upstream health.
# 404 is deliberately absent: a missing model is server configuration, so it
# must count against the breaker and surface as 503, not "rephrase your message".
_REQUEST_SHAPED_CODES = frozenset({400, 413, 422})

# Postgres unique_violation (SQLSTATE 23505), surfaced by PostgREST as `code`.
_UNIQUE_VIOLATION = "23505"

SYSTEM_INSTRUCTIONS = {
    "books": (
        "You are an expert literary analyst and book recommender inside a"
        " cyberpunk-themed personal archive called Nexus OS. You have"
        " deep knowledge of literature across all genres. Be insightful,"
        " opinionated, and concise. Reference real books, authors, and"
        " literary movements. When recommending, explain WHY based on"
        " the user's taste profile."
    ),
    "movies": (
        "You are an elite film curator and cinema analyst inside a"
        " cyberpunk-themed media archive called Nexus OS. You have"
        " encyclopedic knowledge of cinema — directors, movements,"
        " cinematography, and narrative structure. Be sharp, opinionated,"
        " and reference real films. When recommending, focus on cinematic"
        " style and thematic connections."
    ),
    "anime": (
        "You are a hardcore anime curator specializing in dark,"
        " psychological, and complex narratives inside a cyberpunk-themed"
        " archive called Nexus OS. You know studios, directors,"
        " seasonal trends, and the difference between mainstream and"
        " underground. Be brutally honest. When recommending, focus on"
        " narrative depth, studio quality, and tonal match."
    ),
    "jobs": (
        "You are an elite career strategist inside a cyberpunk-themed"
        " personal archive called Nexus OS. You have deep knowledge of"
        " software engineering, cybersecurity, trading, and tech roles."
        " Analyze job applications, identify patterns in the user's career"
        " trajectory, and give sharp, actionable career advice. Reference"
        " real companies, roles, and industry trends. Be direct and"
        " opinionated."
    ),
    "general": (
        "You are a knowledgeable media assistant inside a cyberpunk-themed"
        " personal archive called Nexus OS. You can discuss books,"
        " movies, anime, and general media topics. Be helpful, concise,"
        " and insightful."
    ),
}


def _get_client(request: Request):
    """Return a caller-scoped PostgREST client, or raise 401 without a token."""

    access_token = getattr(request.state, "access_token", None)
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return create_supabase_user_client(access_token)


def _unavailable() -> HTTPException:
    """Return the uniform 503 used for every AI-unavailable path."""

    return HTTPException(
        status_code=503,
        detail=CHAT_UNAVAILABLE_DETAIL,
        headers={"Retry-After": CHAT_RETRY_AFTER_SECONDS},
    )


def _is_request_shaped_error(exc: BaseException) -> bool:
    """True when a Gemini error blames the request, not the upstream service.

    Only ``ClientError`` (4xx) can qualify, and only for the codes in
    ``_REQUEST_SHAPED_CODES``. 429, 401 and 403 stay breaker failures: they
    signal quota or credential trouble that should trip fail-fast.
    """

    return (
        isinstance(exc, genai_errors.ClientError)
        and getattr(exc, "code", None) in _REQUEST_SHAPED_CODES
    )


def _was_truncated(response: object) -> bool:
    """True when Gemini stopped because it hit the output token cap."""

    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return False
    finish_reason = getattr(candidates[0], "finish_reason", None)
    return finish_reason == types.FinishReason.MAX_TOKENS


def _chat_generation_config(system_instruction: str) -> types.GenerateContentConfig:
    """Build the per-request config: system prompt, output cap, bounded retries.

    The timeout and retry options live on the request, so this bounds chat
    without changing the shared client used by the other AI endpoints.
    """

    return types.GenerateContentConfig(
        system_instruction=system_instruction,
        max_output_tokens=CHAT_MAX_OUTPUT_TOKENS,
        http_options=types.HttpOptions(
            timeout=CHAT_GENERATION_TIMEOUT_MS,
            retry_options=types.HttpRetryOptions(attempts=CHAT_GENERATION_ATTEMPTS),
        ),
    )


async def _persist_model_reply(
    client, session_id: str, reply_id: str, content: str
) -> bool:
    """Save the model turn, retrying once. Return whether it was stored.

    The row id is generated client-side, so a retry after an ambiguous failure
    cannot create a second row. A duplicate-key error on the retry means the
    first write landed.
    """

    for attempt in (1, 2):
        try:
            builder = client.from_("chat_messages").insert(
                {
                    "id": reply_id,
                    "session_id": session_id,
                    "role": "model",
                    "content": protect_chat_content(content),
                }
            )
            await run_blocking(builder.execute)
            return True
        except Exception as exc:
            if getattr(exc, "code", None) == _UNIQUE_VIOLATION:
                # The first attempt landed before its response was lost.
                return True
            logger.warning(
                "Failed to persist AI response (attempt %d)",
                attempt,
                exc_info=True,
            )
    return False


class ChatController(Controller):
    """Persistent AI chat with categorized sessions."""

    path = "/chat"

    @get("/sessions")
    async def list_sessions(
        self,
        request: Request,
        category: FromQuery[ChatCategory | None] = None,
    ) -> list[dict]:
        """List chat sessions for the authenticated user.

        An unknown ``category`` is rejected by validation (400) before any
        database call.
        """

        try:
            query = _get_client(request).from_("chat_sessions").select("*")
            if category:
                query = query.eq("category", category)
            builder = query.order("created_at", desc=True)
            response = await run_blocking(builder.execute)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Failed to list chat sessions")
            raise HTTPException(
                status_code=502, detail="Failed to load sessions"
            ) from exc
        return response.data or []

    @post("/sessions")
    async def create_session(
        self,
        data: JSONBody[ChatSessionCreate],
        request: Request,
    ) -> dict:
        """Create a new chat session."""

        user_id = request.state.user_id
        try:
            builder = (
                _get_client(request)
                .from_("chat_sessions")
                .insert(
                    {
                        "user_id": user_id,
                        "title": data.title,
                        "category": data.category,
                    }
                )
            )
            response = await run_blocking(builder.execute)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Failed to create chat session")
            raise HTTPException(
                status_code=502, detail="Failed to create session"
            ) from exc
        return response.data[0] if response.data else {}

    @delete("/sessions/{session_id:uuid}")
    async def delete_session(
        self,
        session_id: FromPath[UUID],
        request: Request,
    ) -> None:
        """Delete a chat session and all its messages (cascade).

        A non-UUID id never reaches this handler: the route does not match.
        """

        try:
            builder = (
                _get_client(request)
                .from_("chat_sessions")
                .delete()
                .eq("id", str(session_id))
            )
            await run_blocking(builder.execute)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Failed to delete chat session")
            raise HTTPException(
                status_code=502, detail="Failed to delete session"
            ) from exc

    @get("/sessions/{session_id:uuid}/messages")
    async def get_messages(
        self,
        session_id: FromPath[UUID],
        request: Request,
        limit: Annotated[
            int, QueryParameter(ge=1, le=CHAT_MESSAGES_MAX_LIMIT)
        ] = CHAT_MESSAGES_DEFAULT_LIMIT,
    ) -> list[dict]:
        """Return the newest ``limit`` messages, oldest first.

        The window is selected in the query (newest first), then reversed so the
        client still receives a chronological list. Older messages are not
        returned once a session exceeds ``limit``.
        """

        try:
            builder = (
                _get_client(request)
                .from_("chat_messages")
                .select("*")
                .eq("session_id", str(session_id))
                .order("created_at", desc=True)
                .order("id", desc=True)
                .limit(limit)
            )
            response = await run_blocking(builder.execute)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Failed to load chat messages")
            raise HTTPException(
                status_code=502, detail="Failed to load messages"
            ) from exc
        rows = list(reversed(response.data or []))
        return [hydrate_chat_message_record(record) for record in rows]

    @post("/sessions/{session_id:uuid}/messages")
    async def send_message(
        self,
        session_id: FromPath[UUID],
        data: JSONBody[ChatMessageRequest],
        request: Request,
    ) -> ChatMessageResponse:
        """Send a message and get an AI response.

        The user turn is saved only after Gemini replies, so an AI failure
        leaves the conversation unchanged and returns 503.
        """

        user_id = request.state.user_id
        session_key = str(session_id)
        await enforce_ai_rate_limit_async(user_id, "chat")
        client = _get_client(request)

        # 1. Verify session ownership via RLS (fetch will be empty if not owned)
        try:
            session_builder = (
                client.from_("chat_sessions")
                .select("id, category")
                .eq("id", session_key)
            )
            session_resp = await run_blocking(session_builder.execute)
        except Exception as exc:
            logger.exception("Failed to verify chat session")
            raise HTTPException(
                status_code=502, detail="Session verification failed"
            ) from exc

        if not session_resp.data:
            raise HTTPException(status_code=404, detail="Session not found")

        category = session_resp.data[0].get("category") or "general"

        # 2. Fetch the newest history window, then restore chronological order.
        try:
            history_builder = (
                client.from_("chat_messages")
                .select("role, content")
                .eq("session_id", session_key)
                .order("created_at", desc=True)
                .order("id", desc=True)
                .limit(CHAT_HISTORY_MAX_MESSAGES)
            )
            history_resp = await run_blocking(history_builder.execute)
        except Exception as exc:
            logger.exception("Failed to load chat history")
            raise HTTPException(
                status_code=502, detail="Failed to load history"
            ) from exc

        # 3. Build Gemini context with system instruction + history
        system_instruction = SYSTEM_INSTRUCTIONS.get(
            category, SYSTEM_INSTRUCTIONS["general"]
        )

        newest_first = history_resp.data or []
        recent_history = [
            hydrate_chat_message_record(record) for record in reversed(newest_first)
        ]
        contents = [
            types.Content(
                role=msg["role"],
                parts=[
                    types.Part.from_text(
                        text=sanitize_chat_message_for_llm(msg["content"])
                    )
                ],
            )
            for msg in recent_history
        ]

        sanitized_user_message = sanitize_chat_message_for_llm(data.content)
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=sanitized_user_message)],
            )
        )

        # 4. Call Gemini. Every failure path raises before anything is written.
        genai_client = get_genai_client()
        breaker = get_gemini_circuit_breaker()
        if not genai_client:
            logger.error("GEMINI_API_KEY is not set; chat is unavailable")
            raise _unavailable()
        if not breaker.allows_requests():
            logger.warning("Gemini circuit breaker open; chat is unavailable")
            raise _unavailable()

        try:
            response = await run_blocking(
                genai_client.models.generate_content,
                model=get_settings().gemini_model,
                contents=contents,
                config=_chat_generation_config(system_instruction),
            )
        except Exception as exc:
            logger.exception("Gemini chat request failed")
            if _is_request_shaped_error(exc):
                raise HTTPException(
                    status_code=422,
                    detail="This message could not be processed. Try rephrasing it.",
                ) from exc
            breaker.record_failure()
            raise _unavailable() from exc

        # The upstream answered, so it is healthy even if the text is empty.
        breaker.record_success()
        ai_reply = response.text or ""
        if not ai_reply.strip():
            logger.warning("Gemini returned no text for chat request")
            raise HTTPException(
                status_code=503,
                detail="The AI returned no reply. Please try again.",
                headers={"Retry-After": CHAT_RETRY_AFTER_SECONDS},
            )
        if _was_truncated(response):
            logger.warning("Gemini chat reply hit the output token cap")
            ai_reply += CHAT_REPLY_TRUNCATED_NOTICE

        # 5. Persist the user turn, then the model turn.
        try:
            user_msg_builder = client.from_("chat_messages").insert(
                {
                    "session_id": session_key,
                    "role": "user",
                    "content": protect_chat_content(data.content),
                }
            )
            await run_blocking(user_msg_builder.execute)
        except Exception as exc:
            logger.exception("Failed to save user message")
            raise HTTPException(
                status_code=502, detail="Failed to save message"
            ) from exc

        reply_id = str(uuid4())
        stored = await _persist_model_reply(client, session_key, reply_id, ai_reply)
        if not stored:
            logger.error("AI reply %s was not saved after retry", reply_id)

        return ChatMessageResponse(role="model", content=ai_reply)
