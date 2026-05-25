"""AI chat controller with persistent, categorized sessions."""

from __future__ import annotations

import logging
from typing import Optional

from google.genai import types
from litestar import Controller, Request, delete, get, post
from litestar.exceptions import HTTPException
from litestar.params import Parameter

try:
    from .config import get_settings
    from .data_protection import (
        hydrate_chat_message_record,
        protect_chat_content,
        sanitize_chat_message_for_llm,
    )
    from .rate_limit import enforce_ai_rate_limit
    from .schemas import (
        ChatMessageRequest,
        ChatMessageResponse,
        ChatSessionCreate,
    )
    from .services import (
        create_supabase_user_client,
        get_gemini_circuit_breaker,
        get_genai_client,
    )
except ImportError:  # pragma: no cover
    from config import get_settings
    from data_protection import (
        hydrate_chat_message_record,
        protect_chat_content,
        sanitize_chat_message_for_llm,
    )
    from rate_limit import enforce_ai_rate_limit
    from schemas import (
        ChatMessageRequest,
        ChatMessageResponse,
        ChatSessionCreate,
    )
    from services import (
        create_supabase_user_client,
        get_gemini_circuit_breaker,
        get_genai_client,
    )

logger = logging.getLogger(__name__)

CHAT_HISTORY_MAX_MESSAGES = 12

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
    """Return a caller-scoped PostgREST client."""

    access_token = getattr(request.state, "access_token", None)
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return create_supabase_user_client(access_token)


class ChatController(Controller):
    """Persistent AI chat with categorized sessions."""

    path = "/chat"

    @get("/sessions")
    async def list_sessions(
        self,
        request: Request,
        category: Optional[str] = Parameter(query="category", default=None),
    ) -> list[dict]:
        """List chat sessions for the authenticated user."""

        try:
            query = _get_client(request).from_("chat_sessions").select("*")
            if category:
                query = query.eq("category", category)
            response = query.order("created_at", desc=True).execute()
        except Exception as exc:
            logger.exception("Failed to list chat sessions")
            raise HTTPException(
                status_code=502, detail="Failed to load sessions"
            ) from exc
        return response.data or []

    @post("/sessions")
    async def create_session(self, data: ChatSessionCreate, request: Request) -> dict:
        """Create a new chat session."""

        user_id = request.state.user_id
        try:
            response = (
                _get_client(request)
                .from_("chat_sessions")
                .insert(
                    {
                        "user_id": user_id,
                        "title": data.title,
                        "category": data.category,
                    }
                )
                .execute()
            )
        except Exception as exc:
            logger.exception("Failed to create chat session")
            raise HTTPException(
                status_code=502, detail="Failed to create session"
            ) from exc
        return response.data[0] if response.data else {}

    @delete("/sessions/{session_id:str}")
    async def delete_session(self, session_id: str, request: Request) -> None:
        """Delete a chat session and all its messages (cascade)."""

        try:
            _get_client(request).from_("chat_sessions").delete().eq(
                "id", session_id
            ).execute()
        except Exception as exc:
            logger.exception("Failed to delete chat session")
            raise HTTPException(
                status_code=502, detail="Failed to delete session"
            ) from exc

    @get("/sessions/{session_id:str}/messages")
    async def get_messages(self, session_id: str, request: Request) -> list[dict]:
        """Get all messages for a chat session."""

        try:
            response = (
                _get_client(request)
                .from_("chat_messages")
                .select("*")
                .eq("session_id", session_id)
                .order("created_at")
                .execute()
            )
        except Exception as exc:
            logger.exception("Failed to load chat messages")
            raise HTTPException(
                status_code=502, detail="Failed to load messages"
            ) from exc
        return [hydrate_chat_message_record(record) for record in (response.data or [])]

    @post("/sessions/{session_id:str}/messages")
    async def send_message(
        self,
        session_id: str,
        data: ChatMessageRequest,
        request: Request,
    ) -> ChatMessageResponse:
        """Send a message and get an AI response."""

        user_id = request.state.user_id
        enforce_ai_rate_limit(user_id, "chat")
        client = _get_client(request)

        # 1. Verify session ownership via RLS (fetch will be empty if not owned)
        try:
            session_resp = (
                client.from_("chat_sessions")
                .select("id, category")
                .eq("id", session_id)
                .execute()
            )
        except Exception as exc:
            logger.exception("Failed to verify chat session")
            raise HTTPException(
                status_code=502, detail="Session verification failed"
            ) from exc

        if not session_resp.data:
            raise HTTPException(status_code=404, detail="Session not found")

        category = session_resp.data[0].get("category", "general")

        # 2. Fetch history
        try:
            history_resp = (
                client.from_("chat_messages")
                .select("role, content")
                .eq("session_id", session_id)
                .order("created_at")
                .execute()
            )
        except Exception as exc:
            logger.exception("Failed to load chat history")
            raise HTTPException(
                status_code=502, detail="Failed to load history"
            ) from exc

        # 3. Build Gemini context with system instruction + history
        system_instruction = SYSTEM_INSTRUCTIONS.get(
            category, SYSTEM_INSTRUCTIONS["general"]
        )

        contents = []
        recent_history = [
            hydrate_chat_message_record(record)
            for record in (history_resp.data or [])[-CHAT_HISTORY_MAX_MESSAGES:]
        ]
        for msg in recent_history:
            role = msg["role"]
            contents.append(
                types.Content(
                    role=role,
                    parts=[
                        types.Part.from_text(
                            text=sanitize_chat_message_for_llm(msg["content"])
                        )
                    ],
                )
            )

        # Add new user message
        sanitized_user_message = sanitize_chat_message_for_llm(data.content)
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=sanitized_user_message)],
            )
        )

        # 4. Save user message
        try:
            client.from_("chat_messages").insert(
                {
                    "session_id": session_id,
                    "role": "user",
                    "content": protect_chat_content(data.content),
                }
            ).execute()
        except Exception as exc:
            logger.exception("Failed to save user message")
            raise HTTPException(
                status_code=502, detail="Failed to save message"
            ) from exc

        # 5. Call Gemini (honour the shared circuit breaker so a Gemini outage
        # short-circuits here the same way it does for /media/suggest).
        genai_client = get_genai_client()
        breaker = get_gemini_circuit_breaker()
        if not genai_client:
            ai_reply = "AI is not configured. Set GEMINI_API_KEY in environment."
        elif not breaker.allows_requests():
            logger.warning("Gemini circuit breaker open; returning fallback chat reply")
            ai_reply = (
                "AI service is temporarily unavailable. Please try again shortly."
            )
        else:
            try:
                response = genai_client.models.generate_content(
                    model=get_settings().gemini_model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                    ),
                )
                ai_reply = response.text or "No response generated."
                breaker.record_success()
            except Exception:
                logger.exception("Gemini chat request failed")
                breaker.record_failure()
                ai_reply = "AI request failed. Please try again."

        # 6. Save AI response
        try:
            client.from_("chat_messages").insert(
                {
                    "session_id": session_id,
                    "role": "model",
                    "content": protect_chat_content(ai_reply),
                }
            ).execute()
        except Exception:
            logger.warning("Failed to persist AI response", exc_info=True)

        return ChatMessageResponse(role="model", content=ai_reply)
