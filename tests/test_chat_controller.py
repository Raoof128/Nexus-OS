"""Behaviour tests for the chat controller endpoints.

The auth middleware is bypassed through ``_inject_auth`` so these tests focus
on chat logic. Real JWT validation is covered by the auth tests.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from google.genai import errors as genai_errors
from google.genai import types
from litestar.status_codes import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
    HTTP_404_NOT_FOUND,
    HTTP_422_UNPROCESSABLE_ENTITY,
    HTTP_503_SERVICE_UNAVAILABLE,
)
from litestar.testing import TestClient

from backend import chat_controller as chat_mod
from backend.app import app
from backend.rate_limit import reset_rate_limiters

SESSION_ID = str(uuid4())
CHAT_PATH = f"/chat/sessions/{SESSION_ID}/messages"


@dataclass
class FakeSupabaseResponse:
    data: list[dict] | None = None


def _fake_jwt_payload(user_id: str = "user-123") -> dict:
    return {
        "sub": user_id,
        "email": "test@nexus.net",
        "aud": "authenticated",
    }


def _chain(**execute_kwargs) -> MagicMock:
    """Return a mock PostgREST builder where every filter returns itself."""

    builder = MagicMock()
    for name in ("select", "eq", "order", "limit", "insert", "delete"):
        getattr(builder, name).return_value = builder
    builder.execute.return_value = FakeSupabaseResponse(data=[])
    for key, value in execute_kwargs.items():
        setattr(builder, key, value)
    return builder


def _db(tables: dict[str, MagicMock]) -> MagicMock:
    db = MagicMock()
    db.from_.side_effect = lambda table: tables.get(table, MagicMock())
    return db


def _gemini_reply(text: str = "AI reply", finish_reason=None) -> MagicMock:
    reply = MagicMock()
    reply.text = text
    candidates = []
    if finish_reason is not None:
        candidates = [SimpleNamespace(finish_reason=finish_reason)]
    reply.candidates = candidates
    return reply


def _client_error(code: int) -> genai_errors.ClientError:
    return genai_errors.ClientError(
        code,
        {"error": {"code": code, "message": "boom", "status": "ERR"}},
    )


@pytest.fixture(autouse=True)
def _fresh_rate_limiters():
    reset_rate_limiters()
    yield
    reset_rate_limiters()


@pytest.fixture()
def client():
    with TestClient(app=app, base_url="http://testserver.local") as tc:
        yield tc


@pytest.fixture()
def _inject_auth(monkeypatch):
    from backend import auth as auth_mod

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            scope.setdefault("state", {})["user_id"] = "user-123"
            scope["state"]["auth_payload"] = _fake_jwt_payload()
            scope["state"]["access_token"] = "fake-token"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)


@pytest.fixture()
def ai_env():
    """Patch the AI breaker, Gemini client and rate limiter for one request."""

    breaker = MagicMock()
    breaker.allows_requests.return_value = True
    ai = MagicMock()
    ai.models.generate_content.return_value = _gemini_reply()
    limiter = AsyncMock()
    with (
        patch.object(chat_mod, "get_gemini_circuit_breaker", return_value=breaker),
        patch.object(chat_mod, "get_genai_client", return_value=ai),
        patch.object(chat_mod, "enforce_ai_rate_limit_async", limiter),
    ):
        yield SimpleNamespace(breaker=breaker, ai=ai, limiter=limiter)


def _session_and_history(history=None, insert_results=None):
    """Return (db, messages_chain) for a send_message request.

    ``messages_chain.execute`` yields the history read first, then one result
    per insert (user turn, then model turn), so tests can script failures.
    """

    session_chain = _chain()
    session_chain.execute.return_value = FakeSupabaseResponse(
        data=[{"id": SESSION_ID, "category": "general"}]
    )
    messages_chain = _chain()
    results = [FakeSupabaseResponse(data=history or [])]
    results += insert_results or [
        FakeSupabaseResponse(data=[{}]),
        FakeSupabaseResponse(data=[{}]),
    ]
    messages_chain.execute.side_effect = results
    return _db({"chat_sessions": session_chain, "chat_messages": messages_chain}), (
        messages_chain
    )


@pytest.mark.usefixtures("_inject_auth")
class TestListSessions:
    @patch("backend.chat_controller.create_supabase_user_client")
    def test_returns_sessions(self, mock_db_fn, client):
        query = _chain()
        query.execute.return_value = FakeSupabaseResponse(
            data=[{"id": SESSION_ID, "title": "Chat"}]
        )
        mock_db_fn.return_value = _db({"chat_sessions": query})

        response = client.get("/chat/sessions")
        assert response.status_code == HTTP_200_OK
        assert response.json()[0]["title"] == "Chat"

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_valid_category_filters_query(self, mock_db_fn, client):
        query = _chain()
        query.execute.return_value = FakeSupabaseResponse(data=[])
        mock_db_fn.return_value = _db({"chat_sessions": query})

        response = client.get("/chat/sessions?category=books")
        assert response.status_code == HTTP_200_OK
        query.eq.assert_called_once_with("category", "books")

    @pytest.mark.parametrize("query", ["category=bogus", "category="])
    @patch("backend.chat_controller.create_supabase_user_client")
    def test_invalid_or_empty_category_is_rejected_before_db_call(
        self, mock_db_fn, client, query
    ):
        response = client.get(f"/chat/sessions?{query}")
        assert response.status_code == HTTP_400_BAD_REQUEST
        mock_db_fn.assert_not_called()


@pytest.mark.usefixtures("_inject_auth")
class TestSendMessage:
    @patch("backend.chat_controller.create_supabase_user_client")
    def test_success_persists_both_turns_and_returns_reply(
        self, mock_db_fn, ai_env, client
    ):
        db, messages = _session_and_history()
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_201_CREATED
        assert response.json() == {"role": "model", "content": "AI reply"}
        ai_env.breaker.record_success.assert_called_once()
        ai_env.breaker.record_failure.assert_not_called()
        inserted_roles = [
            call.args[0]["role"] for call in messages.insert.call_args_list
        ]
        assert inserted_roles == ["user", "model"]

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_history_is_newest_window_sent_oldest_first(
        self, mock_db_fn, ai_env, client
    ):
        newest_first = [{"role": "model", "content": f"m{i}"} for i in range(20, 0, -1)]
        # The database applies the limit; the fake returns only that window.
        window = newest_first[: chat_mod.CHAT_HISTORY_MAX_MESSAGES]
        db, messages = _session_and_history(history=window)
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})
        assert response.status_code == HTTP_201_CREATED

        query_order = [c.kwargs for c in messages.order.call_args_list]
        assert query_order[0] == {"desc": True}
        messages.limit.assert_any_call(chat_mod.CHAT_HISTORY_MAX_MESSAGES)

        contents = ai_env.ai.models.generate_content.call_args.kwargs["contents"]
        texts = [part.text for content in contents for part in content.parts]
        # 12 history turns in chronological order, then the new user message.
        assert len(contents) == chat_mod.CHAT_HISTORY_MAX_MESSAGES + 1
        assert texts[0] == "m9"
        assert texts[-2] == "m20"
        assert texts[-1] == "Hi"

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_generation_config_bounds_timeout_retries_and_output(
        self, mock_db_fn, ai_env, client
    ):
        db, _ = _session_and_history()
        mock_db_fn.return_value = db

        client.post(CHAT_PATH, json={"content": "Hi"})

        config = ai_env.ai.models.generate_content.call_args.kwargs["config"]
        assert config.http_options.timeout == chat_mod.CHAT_GENERATION_TIMEOUT_MS
        assert config.http_options.retry_options.attempts == 2
        assert config.max_output_tokens == chat_mod.CHAT_MAX_OUTPUT_TOKENS
        assert config.system_instruction == chat_mod.SYSTEM_INSTRUCTIONS["general"]

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_truncated_reply_gets_notice(self, mock_db_fn, ai_env, client):
        ai_env.ai.models.generate_content.return_value = _gemini_reply(
            "partial answer", finish_reason=types.FinishReason.MAX_TOKENS
        )
        db, _ = _session_and_history()
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_201_CREATED
        assert response.json()["content"].startswith("partial answer")
        assert chat_mod.CHAT_REPLY_TRUNCATED_NOTICE in response.json()["content"]

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_session_not_found(self, mock_db_fn, ai_env, client):
        session_chain = _chain()
        session_chain.execute.return_value = FakeSupabaseResponse(data=[])
        mock_db_fn.return_value = _db({"chat_sessions": session_chain})

        response = client.post(CHAT_PATH, json={"content": "Hi"})
        assert response.status_code == HTTP_404_NOT_FOUND
        ai_env.ai.models.generate_content.assert_not_called()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_non_uuid_session_id_is_not_found_and_spends_no_quota(
        self, mock_db_fn, ai_env, client
    ):
        response = client.post(
            "/chat/sessions/not-a-uuid/messages", json={"content": "Hi"}
        )

        assert response.status_code == HTTP_404_NOT_FOUND
        ai_env.limiter.assert_not_called()
        mock_db_fn.assert_not_called()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_missing_gemini_key_returns_503_without_insert(
        self, mock_db_fn, ai_env, client
    ):
        db, messages = _session_and_history()
        mock_db_fn.return_value = db

        with patch.object(chat_mod, "get_genai_client", return_value=None):
            response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
        assert response.headers["Retry-After"] == chat_mod.CHAT_RETRY_AFTER_SECONDS
        assert "GEMINI" not in response.text
        messages.insert.assert_not_called()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_open_breaker_returns_503_without_insert(self, mock_db_fn, ai_env, client):
        ai_env.breaker.allows_requests.return_value = False
        db, messages = _session_and_history()
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
        ai_env.ai.models.generate_content.assert_not_called()
        messages.insert.assert_not_called()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_upstream_exception_returns_503_records_failure_and_no_insert(
        self, mock_db_fn, ai_env, client
    ):
        ai_env.ai.models.generate_content.side_effect = RuntimeError("upstream down")
        db, messages = _session_and_history()
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
        ai_env.breaker.record_failure.assert_called_once()
        ai_env.breaker.record_success.assert_not_called()
        messages.insert.assert_not_called()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_request_shaped_gemini_400_is_422_and_not_breaker_failure(
        self, mock_db_fn, ai_env, client
    ):
        ai_env.ai.models.generate_content.side_effect = _client_error(400)
        db, messages = _session_and_history()
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_422_UNPROCESSABLE_ENTITY
        ai_env.breaker.record_failure.assert_not_called()
        messages.insert.assert_not_called()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_rate_limited_gemini_429_counts_as_breaker_failure(
        self, mock_db_fn, ai_env, client
    ):
        ai_env.ai.models.generate_content.side_effect = _client_error(429)
        db, _ = _session_and_history()
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
        ai_env.breaker.record_failure.assert_called_once()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_model_insert_failure_still_returns_reply_after_one_retry(
        self, mock_db_fn, ai_env, client
    ):
        db, messages = _session_and_history(
            insert_results=[
                FakeSupabaseResponse(data=[{}]),
                RuntimeError("db write failed"),
                RuntimeError("db write failed"),
            ]
        )
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_201_CREATED
        assert response.json()["content"] == "AI reply"
        model_inserts = [
            c.args[0]
            for c in messages.insert.call_args_list
            if c.args[0]["role"] == "model"
        ]
        assert len(model_inserts) == 2
        # Both attempts reuse one client-generated id, so the retry is idempotent.
        assert model_inserts[0]["id"] == model_inserts[1]["id"]

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_retry_hitting_unique_violation_counts_as_stored(
        self, mock_db_fn, ai_env, client
    ):
        duplicate = RuntimeError("duplicate key value violates unique constraint")
        duplicate.code = "23505"
        db, messages = _session_and_history(
            insert_results=[
                FakeSupabaseResponse(data=[{}]),
                RuntimeError("timeout after commit"),
                duplicate,
            ]
        )
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_201_CREATED
        assert response.json()["content"] == "AI reply"
        assert len(messages.insert.call_args_list) == 3

    @pytest.mark.parametrize("code", [400, 413, 422])
    @patch("backend.chat_controller.create_supabase_user_client")
    def test_request_shaped_gemini_errors_are_422(
        self, mock_db_fn, ai_env, client, code
    ):
        ai_env.ai.models.generate_content.side_effect = _client_error(code)
        db, messages = _session_and_history()
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_422_UNPROCESSABLE_ENTITY
        ai_env.breaker.record_failure.assert_not_called()
        messages.insert.assert_not_called()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_gemini_404_missing_model_is_503_and_trips_breaker(
        self, mock_db_fn, ai_env, client
    ):
        ai_env.ai.models.generate_content.side_effect = _client_error(404)
        db, messages = _session_and_history()
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
        ai_env.breaker.record_failure.assert_called_once()
        messages.insert.assert_not_called()

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_user_insert_failure_returns_502_and_skips_model_reply(
        self, mock_db_fn, ai_env, client
    ):
        db, messages = _session_and_history(
            insert_results=[RuntimeError("db write failed")]
        )
        mock_db_fn.return_value = db

        response = client.post(CHAT_PATH, json={"content": "Hi"})

        assert response.status_code == 502
        assert len(messages.insert.call_args_list) == 1


@pytest.mark.usefixtures("_inject_auth")
class TestSessionCrud:
    @patch("backend.chat_controller.create_supabase_user_client")
    def test_create_session_returns_201_with_body(self, mock_db_fn, client):
        sessions = _chain()
        sessions.execute.return_value = FakeSupabaseResponse(
            data=[{"id": SESSION_ID, "title": "Books", "category": "books"}]
        )
        mock_db_fn.return_value = _db({"chat_sessions": sessions})

        response = client.post(
            "/chat/sessions", json={"title": "Books", "category": "books"}
        )

        assert response.status_code == HTTP_201_CREATED
        assert response.json()["category"] == "books"

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_delete_session_returns_204(self, mock_db_fn, client):
        sessions = _chain()
        mock_db_fn.return_value = _db({"chat_sessions": sessions})

        response = client.delete(f"/chat/sessions/{SESSION_ID}")

        assert response.status_code == HTTP_204_NO_CONTENT
        sessions.eq.assert_called_with("id", SESSION_ID)

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_get_messages_returns_newest_window_in_chronological_order(
        self, mock_db_fn, client
    ):
        messages = _chain()
        messages.execute.return_value = FakeSupabaseResponse(
            data=[
                {"id": "b", "session_id": SESSION_ID, "role": "model", "content": "2"},
                {"id": "a", "session_id": SESSION_ID, "role": "user", "content": "1"},
            ]
        )
        mock_db_fn.return_value = _db({"chat_messages": messages})

        response = client.get(f"/chat/sessions/{SESSION_ID}/messages?limit=50")

        assert response.status_code == HTTP_200_OK
        assert [row["content"] for row in response.json()] == ["1", "2"]
        messages.limit.assert_called_with(50)
        assert messages.order.call_args_list[0].kwargs == {"desc": True}

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_get_messages_default_limit_and_bounds(self, mock_db_fn, client):
        messages = _chain()
        mock_db_fn.return_value = _db({"chat_messages": messages})

        assert client.get(f"/chat/sessions/{SESSION_ID}/messages").status_code == 200
        messages.limit.assert_called_with(chat_mod.CHAT_MESSAGES_DEFAULT_LIMIT)

        over_max = chat_mod.CHAT_MESSAGES_MAX_LIMIT + 1
        too_big = client.get(f"/chat/sessions/{SESSION_ID}/messages?limit={over_max}")
        assert too_big.status_code == HTTP_400_BAD_REQUEST

    @patch("backend.chat_controller.create_supabase_user_client")
    def test_non_uuid_path_on_delete_and_messages_is_404(self, mock_db_fn, client):
        assert client.delete("/chat/sessions/s1").status_code == HTTP_404_NOT_FOUND
        assert (
            client.get("/chat/sessions/s1/messages").status_code == HTTP_404_NOT_FOUND
        )
        mock_db_fn.assert_not_called()


class TestGetClientWithoutToken:
    def test_missing_access_token_raises_401(self):
        request = SimpleNamespace(state=SimpleNamespace())
        with pytest.raises(chat_mod.HTTPException) as excinfo:
            chat_mod._get_client(request)
        assert excinfo.value.status_code == 401
