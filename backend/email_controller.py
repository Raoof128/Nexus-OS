"""REST endpoints for the unified inbox email feature."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from time import monotonic
from typing import Awaitable, Callable
from uuid import UUID

import httpx
from litestar import Controller, Request, Response, delete, get, patch, post
from litestar.exceptions import HTTPException
from litestar.params import Parameter

try:
    from .config import get_settings
    from .data_protection import (
        sanitize_chat_message_for_llm,
        serialize_email_context_for_llm,
    )
    from .email_schemas import (
        AIDraftRequest,
        AISummarizeRequest,
        ComposeEmailRequest,
        LabelEmailRequest,
        MoveEmailRequest,
        ReadEmailRequest,
        ToggleStarRequest,
    )
    from .email_service import decrypt_oauth_token, get_provider
    from .rate_limit import enforce_ai_rate_limit, enforce_email_send_rate_limit
    from .services import (
        create_supabase_user_client,
        get_gemini_circuit_breaker,
        get_genai_client,
        run_blocking,
    )
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from data_protection import (
        sanitize_chat_message_for_llm,
        serialize_email_context_for_llm,
    )
    from email_schemas import (
        AIDraftRequest,
        AISummarizeRequest,
        ComposeEmailRequest,
        LabelEmailRequest,
        MoveEmailRequest,
        ReadEmailRequest,
        ToggleStarRequest,
    )
    from email_service import decrypt_oauth_token, get_provider
    from rate_limit import enforce_ai_rate_limit, enforce_email_send_rate_limit
    from services import (
        create_supabase_user_client,
        get_gemini_circuit_breaker,
        get_genai_client,
        run_blocking,
    )

logger = logging.getLogger(__name__)

_AI_EMAIL_CONTEXT_MAX_CHARS = 48_000
# Start with a useful context window, then enforce the exact serialized limit
# below. This retains substantially more ordinary ASCII prose while remaining
# safe when untrusted Unicode expands during JSON escaping.
_AI_EMAIL_INPUT_CHAR_BUDGET = 24_000
_AI_EMAIL_MAX_MESSAGES = 20
_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
_MAX_ENCODED_ATTACHMENT_RESPONSE_BYTES = 36 * 1024 * 1024
_IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]+$")
_IDEMPOTENCY_KEY_MAX_LENGTH = 128
_IDEMPOTENCY_TTL_SECONDS = 10 * 60
_IDEMPOTENCY_MAX_ENTRIES = 10_000
_EMAIL_PAGE_DEFAULT = 50
_EMAIL_PAGE_MAX = 100
_EMAIL_SEARCH_MAX_LENGTH = 200
_EMAIL_FOLDERS = {"inbox", "sent", "drafts", "archive", "trash", "starred"}


@dataclass
class _IdempotencyEntry:
    """One in-flight or successful per-process outbound-email operation."""

    fingerprint: str
    created_at: float
    task: asyncio.Task[dict]


_idempotency_entries: dict[str, _IdempotencyEntry] = {}
_idempotency_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _require_auth(request: Request) -> tuple[str, str]:
    """Return (user_id, access_token) or raise 401."""

    settings = get_settings()
    access_token = request.cookies.get(settings.access_cookie_name)
    user_id = getattr(request.state, "user_id", None)
    if not access_token or not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id, access_token


def _db(access_token: str):
    """Return a PostgREST client scoped to the caller's JWT."""
    return create_supabase_user_client(access_token)


async def _get_account(db, account_id: str, user_id: str) -> dict:
    """Fetch an email account row and assert ownership."""

    builder = (
        db.from_("email_accounts")
        .select("*")
        .eq("id", account_id)
        .eq("user_id", user_id)
        .maybe_single()
    )
    resp = await run_blocking(builder.execute)
    if not resp or not resp.data:
        raise HTTPException(status_code=404, detail="Email account not found")
    return resp.data


async def _get_email(db, email_id: str, user_id: str) -> dict:
    """Fetch an email message row and assert ownership."""

    builder = (
        db.from_("nexus_emails")
        .select("*")
        .eq("id", email_id)
        .eq("user_id", user_id)
        .maybe_single()
    )
    resp = await run_blocking(builder.execute)
    if not resp or not resp.data:
        raise HTTPException(status_code=404, detail="Email not found")
    return resp.data


def _serialize_bounded_email_context(emails: list[dict]) -> str:
    """Serialize a representative email context under a hard character cap."""

    bounded: list[dict] = []
    remaining_budget = _AI_EMAIL_INPUT_CHAR_BUDGET
    selected_emails = emails[:_AI_EMAIL_MAX_MESSAGES]
    for index, email_row in enumerate(selected_emails):
        remaining_emails = len(selected_emails) - index
        if remaining_emails <= 0:
            break
        share = remaining_budget // remaining_emails
        if share <= 0:
            break

        values = {
            "from_address": str(email_row.get("from_address") or "Unknown"),
            "provider_date": str(email_row.get("provider_date") or "Unknown"),
            "subject": str(email_row.get("subject") or "(no subject)"),
            "body_text": str(email_row.get("body_text") or ""),
        }
        from_budget = min(320, max(1, share // 8))
        date_budget = min(128, max(1, share // 12))
        subject_budget = min(998, max(1, share // 4))
        metadata_budget = from_budget + date_budget + subject_budget
        if metadata_budget > share:
            scale = share / metadata_budget
            from_budget = max(1, int(from_budget * scale))
            date_budget = max(1, int(date_budget * scale))
            subject_budget = max(1, share - from_budget - date_budget)
        body_budget = max(0, share - from_budget - date_budget - subject_budget)
        entry = {
            "from_address": values["from_address"][:from_budget],
            "provider_date": values["provider_date"][:date_budget],
            "subject": values["subject"][:subject_budget],
            "body_text": values["body_text"][:body_budget],
        }
        consumed = sum(len(value) for value in entry.values())
        remaining_budget -= consumed
        bounded.append(entry)

    context = serialize_email_context_for_llm(bounded)
    # Keep the limit true even if serializer escaping rules change later. Each
    # pass halves all input fields and always reserializes the XML as a unit, so
    # the result cannot contain a truncated/unterminated delimiter.
    while len(context) > _AI_EMAIL_CONTEXT_MAX_CHARS and any(
        value for item in bounded for value in item.values()
    ):
        bounded = [
            {key: value[: len(value) // 2] for key, value in item.items()}
            for item in bounded
        ]
        context = serialize_email_context_for_llm(bounded)
    return context


async def _read_limited_response(response, *, max_bytes: int) -> bytes:
    """Read a streamed HTTP response while enforcing a strict byte ceiling."""

    content_length = response.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise HTTPException(status_code=413, detail="Attachment is too large")
        except ValueError:
            # Invalid upstream metadata is not trusted; the streamed byte count
            # below remains authoritative.
            pass

    body = bytearray()
    async for chunk in response.aiter_bytes():
        if len(body) + len(chunk) > max_bytes:
            raise HTTPException(status_code=413, detail="Attachment is too large")
        body.extend(chunk)
    return bytes(body)


def _idempotency_fingerprint(payload: dict) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


async def _execute_outbound_email(
    *,
    request: Request,
    user_id: str,
    account_id: str,
    operation_name: str,
    payload: dict,
    operation: Callable[[], Awaitable[dict]],
) -> dict:
    """Rate-limit a send and coalesce safe retries with an idempotency key.

    This cache is intentionally process-local: it makes browser/network retries
    safer in the current architecture without persisting message contents. A
    shared Redis/database idempotency store is still required for guarantees
    across multiple API processes.
    """

    idempotency_key = request.headers.get("idempotency-key")
    if not idempotency_key:
        raise HTTPException(
            status_code=400,
            detail="Idempotency-Key is required for outbound email",
        )
    if len(
        idempotency_key
    ) > _IDEMPOTENCY_KEY_MAX_LENGTH or not _IDEMPOTENCY_KEY_PATTERN.fullmatch(
        idempotency_key
    ):
        raise HTTPException(status_code=400, detail="Invalid Idempotency-Key")

    cache_key = f"{user_id}:{account_id}:{operation_name}:{idempotency_key}"
    fingerprint = _idempotency_fingerprint(payload)
    now = monotonic()
    async with _idempotency_lock:
        stale_keys = [
            key
            for key, entry in _idempotency_entries.items()
            if entry.task.done() and now - entry.created_at >= _IDEMPOTENCY_TTL_SECONDS
        ]
        for key in stale_keys:
            del _idempotency_entries[key]

        entry = _idempotency_entries.get(cache_key)
        if entry:
            if entry.fingerprint != fingerprint:
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency-Key was already used with a different request",
                )
        else:
            if len(_idempotency_entries) >= _IDEMPOTENCY_MAX_ENTRIES:
                completed = [
                    (key, item)
                    for key, item in _idempotency_entries.items()
                    if item.task.done()
                ]
                if not completed:
                    raise HTTPException(
                        status_code=503,
                        detail="Too many email operations are currently in progress",
                    )
                oldest_key, _ = min(
                    completed,
                    key=lambda item: item[1].created_at,
                )
                del _idempotency_entries[oldest_key]

            async def rate_limited_operation() -> dict:
                # Redis is synchronous. Run it outside the event loop, and put
                # it inside the shared task so duplicate keys consume one slot.
                await run_blocking(
                    enforce_email_send_rate_limit,
                    user_id,
                    account_id,
                )
                return await operation()

            entry = _IdempotencyEntry(
                fingerprint=fingerprint,
                created_at=now,
                task=asyncio.create_task(rate_limited_operation()),
            )
            _idempotency_entries[cache_key] = entry

    try:
        result = await asyncio.shield(entry.task)
    except BaseException:
        if entry.task.done():
            async with _idempotency_lock:
                if _idempotency_entries.get(cache_key) is entry:
                    del _idempotency_entries[cache_key]
        raise
    return result or {"ok": True}


# ---------------------------------------------------------------------------
# Controller
# ---------------------------------------------------------------------------


class EmailController(Controller):
    """Authenticated email endpoints for the unified inbox."""

    path = "/api/email"

    @get("/messages")
    async def list_messages(
        self,
        request: Request,
        folder: str = Parameter(query="folder", default="inbox"),
        account_id: str | None = Parameter(query="account_id", default=None),
        cursor_date: str | None = Parameter(query="cursor_date", default=None),
        cursor_id: str | None = Parameter(query="cursor_id", default=None),
        search: str | None = Parameter(query="search", default=None),
        limit: int = Parameter(
            query="limit",
            default=_EMAIL_PAGE_DEFAULT,
            ge=1,
            le=_EMAIL_PAGE_MAX,
        ),
    ) -> dict:
        """Return one caller-scoped page of cached email messages.

        The browser intentionally does not own a Supabase auth session. Email
        reads therefore cross this cookie-authenticated boundary instead of
        issuing anonymous PostgREST requests from the frontend.
        """

        user_id, access_token = _require_auth(request)
        if folder not in _EMAIL_FOLDERS:
            raise HTTPException(status_code=400, detail="Unknown email folder")

        if bool(cursor_date) != bool(cursor_id):
            raise HTTPException(
                status_code=400,
                detail="cursor_date and cursor_id must be provided together",
            )

        normalized_cursor_date: str | None = None
        normalized_cursor_id: str | None = None
        if cursor_date and cursor_id:
            try:
                normalized_cursor_date = datetime.fromisoformat(
                    cursor_date.replace("Z", "+00:00")
                ).isoformat()
                normalized_cursor_id = str(UUID(cursor_id))
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid email cursor",
                ) from exc

        normalized_account_id: str | None = None
        if account_id:
            try:
                normalized_account_id = str(UUID(account_id))
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid account id",
                ) from exc

        search_term = (search or "").strip()
        if len(search_term) > _EMAIL_SEARCH_MAX_LENGTH:
            raise HTTPException(status_code=400, detail="Email search is too long")

        try:
            query = (
                _db(access_token)
                .from_("nexus_emails")
                .select("*")
                .eq("user_id", user_id)
            )
            if folder == "starred":
                query = query.eq("is_starred", True)
            else:
                query = query.eq("folder", folder)
            if normalized_account_id:
                query = query.eq("account_id", normalized_account_id)
            if search_term:
                query = query.text_search(
                    "body_text",
                    search_term,
                    options={"type": "websearch"},
                )
            if normalized_cursor_date and normalized_cursor_id:
                query = query.or_(
                    f"provider_date.lt.{normalized_cursor_date},"
                    f"and(provider_date.eq.{normalized_cursor_date},"
                    f"id.lt.{normalized_cursor_id})"
                )

            response = await run_blocking(
                query.order("provider_date", desc=True)
                .order("id", desc=True)
                .limit(limit + 1)
                .execute
            )
        except HTTPException:
            raise
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to list email messages for user %s", user_id)
            raise HTTPException(
                status_code=502,
                detail="Failed to load email messages",
            ) from exc

        rows = response.data or []
        page = rows[:limit]
        has_more = len(rows) > limit
        next_cursor = None
        if has_more and page:
            last = page[-1]
            next_cursor = {
                "provider_date": last["provider_date"],
                "id": last["id"],
            }
        return {"items": page, "next_cursor": next_cursor}

    # ------------------------------------------------------------------
    # Account management
    # ------------------------------------------------------------------

    @get("/accounts")
    async def list_accounts(self, request: Request) -> list[dict]:
        """Return all connected email accounts for the authenticated user."""

        user_id, access_token = _require_auth(request)
        try:
            builder = (
                _db(access_token)
                .from_("email_accounts_safe")
                .select("*")
                .eq("user_id", user_id)
            )
            resp = await run_blocking(builder.execute)
        except Exception as exc:  # pragma: no cover - external dependency failure
            logger.exception("Failed to list email accounts for user %s", user_id)
            raise HTTPException(
                status_code=502, detail="Failed to list accounts"
            ) from exc
        return resp.data or []

    @delete("/accounts/{account_id:str}", status_code=204)
    async def disconnect_account(self, account_id: str, request: Request) -> None:
        """Disconnect (delete) a linked email account."""

        user_id, access_token = _require_auth(request)
        try:
            builder = (
                _db(access_token)
                .from_("email_accounts")
                .delete()
                .eq("id", account_id)
                .eq("user_id", user_id)
            )
            await run_blocking(builder.execute)
        except Exception as exc:  # pragma: no cover
            logger.exception(
                "Failed to disconnect account %s for user %s", account_id, user_id
            )
            raise HTTPException(
                status_code=502, detail="Failed to disconnect account"
            ) from exc

    # ------------------------------------------------------------------
    # Send / compose
    # ------------------------------------------------------------------

    @post("/send")
    async def send_email(self, data: ComposeEmailRequest, request: Request) -> dict:
        """Send an email via the connected provider."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        account = await _get_account(db, data.account_id, user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        message = {
            "to": data.to,
            "cc": data.cc,
            "bcc": data.bcc,
            "subject": data.subject,
            "body_html": data.body_html,
            "in_reply_to": data.in_reply_to,
            "thread_id": data.thread_id,
        }

        async def send_operation() -> dict:
            try:
                return await provider.send_message(token, message)
            except Exception as exc:  # pragma: no cover
                logger.exception("Send failed for account %s", data.account_id)
                raise HTTPException(status_code=502, detail="Send failed") from exc

        return await _execute_outbound_email(
            request=request,
            user_id=user_id,
            account_id=data.account_id,
            operation_name="send",
            payload=data.model_dump(mode="json"),
            operation=send_operation,
        )

    @post("/{email_id:str}/reply")
    async def reply_email(
        self,
        email_id: str,
        data: ComposeEmailRequest,
        request: Request,
    ) -> dict:
        """Reply to an existing email via the provider."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = await _get_email(db, email_id, user_id)
        account = await _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        message = {
            "to": data.to,
            "cc": data.cc,
            "bcc": data.bcc,
            "subject": data.subject,
            "body_html": data.body_html,
            "thread_id": email_row.get("thread_id"),
        }

        async def reply_operation() -> dict:
            try:
                return await provider.reply_message(
                    token,
                    email_row["provider_id"],
                    message,
                )
            except Exception as exc:  # pragma: no cover
                logger.exception("Reply failed for email %s", email_id)
                raise HTTPException(status_code=502, detail="Reply failed") from exc

        return await _execute_outbound_email(
            request=request,
            user_id=user_id,
            account_id=account["id"],
            operation_name=f"reply:{email_id}",
            payload=data.model_dump(mode="json"),
            operation=reply_operation,
        )

    @post("/{email_id:str}/forward")
    async def forward_email(
        self,
        email_id: str,
        data: ComposeEmailRequest,
        request: Request,
    ) -> dict:
        """Forward an email via the provider."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = await _get_email(db, email_id, user_id)
        account = await _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        message = {
            "to": data.to,
            "cc": data.cc,
            "bcc": data.bcc,
            "subject": f"Fwd: {email_row.get('subject', '')}",
            "body_html": data.body_html,
            "thread_id": email_row.get("thread_id"),
        }

        async def forward_operation() -> dict:
            try:
                return await provider.send_message(token, message)
            except Exception as exc:  # pragma: no cover
                logger.exception("Forward failed for email %s", email_id)
                raise HTTPException(status_code=502, detail="Forward failed") from exc

        return await _execute_outbound_email(
            request=request,
            user_id=user_id,
            account_id=account["id"],
            operation_name=f"forward:{email_id}",
            payload=data.model_dump(mode="json"),
            operation=forward_operation,
        )

    @post("/draft")
    async def save_draft(self, data: ComposeEmailRequest, request: Request) -> dict:
        """Save a draft email to Supabase (local only)."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        # Validate account ownership
        await _get_account(db, data.account_id, user_id)

        draft_row = {
            "user_id": user_id,
            "account_id": data.account_id,
            "to": data.to,
            "cc": data.cc,
            "bcc": data.bcc,
            "subject": data.subject,
            "body_html": data.body_html,
            "in_reply_to": data.in_reply_to,
            "thread_id": data.thread_id,
        }

        try:
            builder = db.from_("email_drafts").insert(draft_row)
            resp = await run_blocking(builder.execute)
        except Exception as exc:  # pragma: no cover
            logger.exception("Draft save failed for user %s", user_id)
            raise HTTPException(status_code=502, detail="Draft save failed") from exc
        return (resp.data or [{}])[0]

    # ------------------------------------------------------------------
    # Mutation actions
    # ------------------------------------------------------------------

    @patch("/{email_id:str}/move")
    async def move_email(
        self,
        email_id: str,
        data: MoveEmailRequest,
        request: Request,
    ) -> dict:
        """Move an email to a different folder."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = await _get_email(db, email_id, user_id)
        account = await _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            new_provider_id = await provider.move_message(
                token,
                email_row["provider_id"],
                data.folder,
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Move failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Move failed") from exc

        try:
            update_row = {"folder": data.folder}
            if new_provider_id:
                update_row["provider_id"] = new_provider_id
            builder = (
                db.from_("nexus_emails")
                .update(update_row)
                .eq("id", email_id)
                .eq("user_id", user_id)
            )
            await run_blocking(builder.execute)
        except Exception as exc:  # pragma: no cover
            # The provider mutation is already committed. Returning success
            # would hide a stale local row and let ghost reconciliation later
            # misclassify it, so surface a repairable partial failure.
            logger.exception(
                "Provider move succeeded but local update failed for email %s",
                email_id,
            )
            raise HTTPException(
                status_code=502,
                detail="Move completed at provider but local sync failed",
            ) from exc

        return {"ok": True, "folder": data.folder}

    @patch("/{email_id:str}/labels")
    async def update_labels(
        self,
        email_id: str,
        data: LabelEmailRequest,
        request: Request,
    ) -> dict:
        """Add/remove labels on an email."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = await _get_email(db, email_id, user_id)
        account = await _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            await provider.update_labels(
                token, email_row["provider_id"], data.add, data.remove
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Label update failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Label update failed") from exc

        return {"ok": True}

    @patch("/{email_id:str}/read")
    async def mark_read(
        self,
        email_id: str,
        data: ReadEmailRequest,
        request: Request,
    ) -> dict:
        """Set read/unread status on an email."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = await _get_email(db, email_id, user_id)
        is_read = data.is_read

        account = await _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            await provider.set_read(token, email_row["provider_id"], is_read)
        except Exception as exc:  # pragma: no cover
            logger.exception("Mark-read failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Mark read failed") from exc

        try:
            builder = (
                db.from_("nexus_emails").update({"is_read": is_read}).eq("id", email_id)
            )
            await run_blocking(builder.execute)
        except Exception:  # pragma: no cover
            logger.warning("Local read-status update failed for email %s", email_id)

        return {"ok": True, "is_read": is_read}

    @patch("/{email_id:str}/star")
    async def toggle_star(
        self,
        email_id: str,
        data: ToggleStarRequest,
        request: Request,
    ) -> dict:
        """Set starred status on an email."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = await _get_email(db, email_id, user_id)
        is_starred = data.is_starred

        account = await _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            await provider.set_starred(token, email_row["provider_id"], is_starred)
        except Exception as exc:  # pragma: no cover
            logger.exception("Toggle-star failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Toggle star failed") from exc

        try:
            builder = (
                db.from_("nexus_emails")
                .update({"is_starred": is_starred})
                .eq("id", email_id)
            )
            await run_blocking(builder.execute)
        except Exception:  # pragma: no cover
            logger.warning("Local star update failed for email %s", email_id)

        return {"ok": True, "is_starred": is_starred}

    # ------------------------------------------------------------------
    # Read / fetch
    # ------------------------------------------------------------------

    @get("/{email_id:str}/html")
    async def fetch_html(self, email_id: str, request: Request) -> dict:
        """Fetch the full HTML body for an email from the provider."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = await _get_email(db, email_id, user_id)
        account = await _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            html = await provider.fetch_message_html(token, email_row["provider_id"])
        except Exception as exc:  # pragma: no cover
            logger.exception("HTML fetch failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="HTML fetch failed") from exc

        return {"html": html}

    @get("/{email_id:str}/attachments/{attachment_id:str}")
    async def stream_attachment(
        self,
        email_id: str,
        attachment_id: str,
        request: Request,
    ) -> Response:
        """Stream an attachment from the provider."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = await _get_email(db, email_id, user_id)
        account = await _get_account(db, email_row["account_id"], user_id)
        token = decrypt_oauth_token(account["access_token_enc"])

        # Gmail attachment download
        if account["provider"] == "google":
            url = (
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/"
                f"{email_row['provider_id']}/attachments/{attachment_id}"
            )
            try:
                async with httpx.AsyncClient() as http:
                    async with http.stream(
                        "GET",
                        url,
                        headers={"Authorization": f"Bearer {token}"},
                    ) as resp:
                        resp.raise_for_status()
                        encoded_response = await _read_limited_response(
                            resp,
                            max_bytes=_MAX_ENCODED_ATTACHMENT_RESPONSE_BYTES,
                        )
                data = json.loads(encoded_response).get("data", "")
                padded_data = data + "=" * (-len(data) % 4)
                raw = base64.b64decode(padded_data, altchars=b"-_", validate=True)
                if len(raw) > _MAX_ATTACHMENT_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="Attachment is too large",
                    )
            except HTTPException:
                raise
            except Exception as exc:  # pragma: no cover
                raise HTTPException(
                    status_code=502, detail="Attachment fetch failed"
                ) from exc
        elif account["provider"] == "microsoft":
            url = (
                f"https://graph.microsoft.com/v1.0/me/messages/"
                f"{email_row['provider_id']}/attachments/{attachment_id}"
            )
            try:
                async with httpx.AsyncClient() as http:
                    async with http.stream(
                        "GET",
                        url,
                        headers={"Authorization": f"Bearer {token}"},
                    ) as resp:
                        resp.raise_for_status()
                        encoded_response = await _read_limited_response(
                            resp,
                            max_bytes=_MAX_ENCODED_ATTACHMENT_RESPONSE_BYTES,
                        )
                data = json.loads(encoded_response).get("contentBytes", "")
                raw = base64.b64decode(data, validate=True)
                if len(raw) > _MAX_ATTACHMENT_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="Attachment is too large",
                    )
            except HTTPException:
                raise
            except Exception as exc:  # pragma: no cover
                raise HTTPException(
                    status_code=502, detail="Attachment fetch failed"
                ) from exc
        else:
            raise HTTPException(status_code=400, detail="Unknown provider")

        # Sanitize attachment_id before embedding in header to prevent injection.
        safe_name = (
            "".join(c for c in attachment_id if c.isalnum() or c in ("-", "_", "."))
            or "attachment"
        )
        return Response(
            content=raw,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
        )

    # ------------------------------------------------------------------
    # AI endpoints
    # ------------------------------------------------------------------

    @post("/ai/draft")
    async def ai_draft(self, data: AIDraftRequest, request: Request) -> dict:
        """Use Gemini to draft a reply to an email."""

        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_ai_rate_limit, user_id, "email_draft")

        db = _db(access_token)
        email_row = await _get_email(db, data.email_id, user_id)

        client = get_genai_client()
        if not client:
            raise HTTPException(status_code=503, detail="AI service not configured")

        breaker = get_gemini_circuit_breaker()
        if not breaker.allows_requests():
            raise HTTPException(
                status_code=503,
                detail="AI service temporarily unavailable. Please try again shortly.",
            )

        instruction = sanitize_chat_message_for_llm(
            data.instruction or "Write a professional reply."
        )
        context = _serialize_bounded_email_context([email_row])

        prompt = (
            "You are an AI assistant drafting a professional reply to an "
            "email thread.\n"
            "Below is the context of the email(s) you are replying to:\n"
            f"{context}\n"
            "User Instruction for this reply:\n"
            f"<user_instruction>{instruction}</user_instruction>\n\n"
            "Draft a concise and professional reply based ONLY on the provided context "
            "and instructions. Return only the reply body text."
        )

        try:
            settings = get_settings()
            response = await run_blocking(
                client.models.generate_content,
                model=settings.gemini_model,
                contents=prompt,
            )
            breaker.record_success()
        except Exception as exc:  # pragma: no cover
            logger.exception("Gemini draft failed for email %s", data.email_id)
            breaker.record_failure()
            raise HTTPException(status_code=502, detail="AI draft failed") from exc

        return {"draft": response.text or ""}

    @post("/ai/summarize")
    async def ai_summarize(self, data: AISummarizeRequest, request: Request) -> dict:
        """Use Gemini to summarize a thread of emails."""

        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_ai_rate_limit, user_id, "email_summarize")

        db = _db(access_token)
        # Fetch all requested emails and assert ownership
        try:
            builder = (
                db.from_("nexus_emails")
                .select("subject, body_text, from_address, provider_date")
                .in_("id", data.email_ids)
                .eq("user_id", user_id)
            )
            resp = await run_blocking(builder.execute)
        except Exception as exc:  # pragma: no cover
            logger.exception("Failed to fetch emails for summarization")
            raise HTTPException(
                status_code=502, detail="Failed to fetch emails"
            ) from exc

        emails = resp.data or []
        if not emails:
            raise HTTPException(status_code=404, detail="No emails found")

        client = get_genai_client()
        if not client:
            raise HTTPException(status_code=503, detail="AI service not configured")

        breaker = get_gemini_circuit_breaker()
        if not breaker.allows_requests():
            raise HTTPException(
                status_code=503,
                detail="AI service temporarily unavailable. Please try again shortly.",
            )

        context = _serialize_bounded_email_context(emails)

        prompt = (
            "Summarize the following email thread concisely.\n"
            "Highlight the key points, decisions, and any action items.\n"
            f"{context}\n\n"
            "Provide a structured summary. Return only the summary text."
        )

        try:
            settings = get_settings()
            response = await run_blocking(
                client.models.generate_content,
                model=settings.gemini_model,
                contents=prompt,
            )
            breaker.record_success()
        except Exception as exc:  # pragma: no cover
            logger.exception("Gemini summarize failed")
            breaker.record_failure()
            raise HTTPException(status_code=502, detail="AI summarize failed") from exc

        return {"summary": response.text or ""}
