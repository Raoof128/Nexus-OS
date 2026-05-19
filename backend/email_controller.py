"""REST endpoints for the unified inbox email feature."""

from __future__ import annotations

import logging

from litestar import Controller, Request, Response, delete, get, patch, post
from litestar.exceptions import HTTPException

try:
    from .config import get_settings
    from .email_schemas import (
        AIDraftRequest,
        AISummarizeRequest,
        ComposeEmailRequest,
        LabelEmailRequest,
        MoveEmailRequest,
    )
    from .email_service import decrypt_oauth_token, get_provider
    from .services import create_supabase_user_client, get_genai_client
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from email_schemas import (
        AIDraftRequest,
        AISummarizeRequest,
        ComposeEmailRequest,
        LabelEmailRequest,
        MoveEmailRequest,
    )
    from email_service import decrypt_oauth_token, get_provider
    from services import create_supabase_user_client, get_genai_client

logger = logging.getLogger(__name__)


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


def _get_account(db, account_id: str, user_id: str) -> dict:
    """Fetch an email account row and assert ownership."""

    resp = (
        db.from_("email_accounts")
        .select("*")
        .eq("id", account_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not resp or not resp.data:
        raise HTTPException(status_code=404, detail="Email account not found")
    return resp.data


def _get_email(db, email_id: str, user_id: str) -> dict:
    """Fetch an email message row and assert ownership."""

    resp = (
        db.from_("email_messages")
        .select("*")
        .eq("id", email_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not resp or not resp.data:
        raise HTTPException(status_code=404, detail="Email not found")
    return resp.data


# ---------------------------------------------------------------------------
# Controller
# ---------------------------------------------------------------------------


class EmailController(Controller):
    """Authenticated email endpoints for the unified inbox."""

    path = "/api/email"

    # ------------------------------------------------------------------
    # Account management
    # ------------------------------------------------------------------

    @get("/accounts")
    async def list_accounts(self, request: Request) -> list[dict]:
        """Return all connected email accounts for the authenticated user."""

        user_id, access_token = _require_auth(request)
        try:
            resp = (
                _db(access_token)
                .from_("email_accounts_safe")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
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
            _db(access_token).from_("email_accounts").delete().eq("id", account_id).eq(
                "user_id", user_id
            ).execute()
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
        account = _get_account(db, data.account_id, user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            result = await provider.send_message(
                token,
                {
                    "to": data.to,
                    "cc": data.cc,
                    "bcc": data.bcc,
                    "subject": data.subject,
                    "body_html": data.body_html,
                    "in_reply_to": data.in_reply_to,
                    "thread_id": data.thread_id,
                },
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Send failed for account %s", data.account_id)
            raise HTTPException(status_code=502, detail="Send failed") from exc
        return result or {"ok": True}

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
        email_row = _get_email(db, email_id, user_id)
        account = _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            result = await provider.send_message(
                token,
                {
                    "to": data.to,
                    "cc": data.cc,
                    "subject": data.subject,
                    "body_html": data.body_html,
                    "in_reply_to": email_row.get("provider_id"),
                    "thread_id": email_row.get("thread_id"),
                },
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Reply failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Reply failed") from exc
        return result or {"ok": True}

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
        email_row = _get_email(db, email_id, user_id)
        account = _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            result = await provider.send_message(
                token,
                {
                    "to": data.to,
                    "cc": data.cc,
                    "subject": f"Fwd: {email_row.get('subject', '')}",
                    "body_html": data.body_html,
                    "thread_id": email_row.get("thread_id"),
                },
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Forward failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Forward failed") from exc
        return result or {"ok": True}

    @post("/draft")
    async def save_draft(self, data: ComposeEmailRequest, request: Request) -> dict:
        """Save a draft email to Supabase (local only)."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        # Validate account ownership
        _get_account(db, data.account_id, user_id)

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
            resp = db.from_("email_drafts").insert(draft_row).execute()
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
        email_row = _get_email(db, email_id, user_id)
        account = _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            await provider.move_message(token, email_row["provider_id"], data.folder)
        except Exception as exc:  # pragma: no cover
            logger.exception("Move failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Move failed") from exc

        try:
            db.from_("email_messages").update({"folder": data.folder}).eq(
                "id", email_id
            ).execute()
        except Exception:  # pragma: no cover
            logger.warning("Local folder update failed for email %s", email_id)

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
        email_row = _get_email(db, email_id, user_id)
        account = _get_account(db, email_row["account_id"], user_id)
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
        request: Request,
    ) -> dict:
        """Toggle read/unread status on an email."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = _get_email(db, email_id, user_id)

        # Determine the desired is_read value from query param (default: True)
        is_read_param = request.query_params.get("is_read", "true")
        is_read = is_read_param.lower() not in ("false", "0", "no")

        account = _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            await provider.set_read(token, email_row["provider_id"], is_read)
        except Exception as exc:  # pragma: no cover
            logger.exception("Mark-read failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Mark read failed") from exc

        try:
            db.from_("email_messages").update({"is_read": is_read}).eq(
                "id", email_id
            ).execute()
        except Exception:  # pragma: no cover
            logger.warning("Local read-status update failed for email %s", email_id)

        return {"ok": True, "is_read": is_read}

    @patch("/{email_id:str}/star")
    async def toggle_star(
        self,
        email_id: str,
        request: Request,
    ) -> dict:
        """Toggle starred status on an email."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = _get_email(db, email_id, user_id)

        is_starred = not email_row.get("is_starred", False)

        account = _get_account(db, email_row["account_id"], user_id)
        provider = get_provider(account["provider"])
        token = decrypt_oauth_token(account["access_token_enc"])

        try:
            await provider.set_starred(token, email_row["provider_id"], is_starred)
        except Exception as exc:  # pragma: no cover
            logger.exception("Toggle-star failed for email %s", email_id)
            raise HTTPException(status_code=502, detail="Toggle star failed") from exc

        try:
            db.from_("email_messages").update({"is_starred": is_starred}).eq(
                "id", email_id
            ).execute()
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
        email_row = _get_email(db, email_id, user_id)
        account = _get_account(db, email_row["account_id"], user_id)
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
        email_row = _get_email(db, email_id, user_id)
        account = _get_account(db, email_row["account_id"], user_id)
        token = decrypt_oauth_token(account["access_token_enc"])

        import httpx as _httpx

        # Gmail attachment download
        if account["provider"] == "google":
            url = (
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/"
                f"{email_row['provider_id']}/attachments/{attachment_id}"
            )
            try:
                async with _httpx.AsyncClient() as http:
                    resp = await http.get(
                        url,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    resp.raise_for_status()
                    import base64

                    data = resp.json().get("data", "")
                    raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
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
                async with _httpx.AsyncClient() as http:
                    resp = await http.get(
                        url,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    resp.raise_for_status()
                    raw = resp.content
            except Exception as exc:  # pragma: no cover
                raise HTTPException(
                    status_code=502, detail="Attachment fetch failed"
                ) from exc
        else:
            raise HTTPException(status_code=400, detail="Unknown provider")

        return Response(
            content=raw,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{attachment_id}"'},
        )

    # ------------------------------------------------------------------
    # AI endpoints
    # ------------------------------------------------------------------

    @post("/ai/draft")
    async def ai_draft(self, data: AIDraftRequest, request: Request) -> dict:
        """Use Gemini to draft a reply to an email."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)
        email_row = _get_email(db, data.email_id, user_id)

        client = get_genai_client()
        if not client:
            raise HTTPException(status_code=503, detail="AI service not configured")

        subject = email_row.get("subject", "")
        body = email_row.get("body_text", "")
        instruction = data.instruction or "Write a professional reply."

        prompt = (
            f"You are drafting a reply to the following email.\n\n"
            f"Subject: {subject}\n\n"
            f"Body:\n{body}\n\n"
            f"Instruction: {instruction}\n\n"
            f"Draft a concise and professional reply. Return only the reply body."
        )

        try:
            settings = get_settings()
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=prompt,
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Gemini draft failed for email %s", data.email_id)
            raise HTTPException(status_code=502, detail="AI draft failed") from exc

        return {"draft": response.text or ""}

    @post("/ai/summarize")
    async def ai_summarize(self, data: AISummarizeRequest, request: Request) -> dict:
        """Use Gemini to summarize a thread of emails."""

        user_id, access_token = _require_auth(request)
        db = _db(access_token)

        # Fetch all requested emails and assert ownership
        try:
            resp = (
                db.from_("email_messages")
                .select("subject, body_text, from_address, provider_date")
                .in_("id", data.email_ids)
                .eq("user_id", user_id)
                .execute()
            )
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

        thread_text = "\n\n---\n\n".join(
            f"From: {e.get('from_address', '')}\n"
            f"Date: {e.get('provider_date', '')}\n"
            f"Subject: {e.get('subject', '')}\n"
            f"{e.get('body_text', '')}"
            for e in emails
        )

        prompt = (
            "Summarize the following email thread concisely. "
            "Highlight the key points, decisions, and any action items.\n\n"
            f"{thread_text}"
        )

        try:
            settings = get_settings()
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=prompt,
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("Gemini summarize failed")
            raise HTTPException(status_code=502, detail="AI summarize failed") from exc

        return {"summary": response.text or ""}
