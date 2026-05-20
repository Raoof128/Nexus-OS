"""Email service: token encryption and provider implementations."""

from __future__ import annotations

import base64
import email.mime.multipart
import email.mime.text
import email.utils
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

import httpx

try:
    from .data_protection import decrypt_takeaway, encrypt_takeaway
except ImportError:  # pragma: no cover - supports backend cwd execution
    from data_protection import decrypt_takeaway, encrypt_takeaway

# ---------------------------------------------------------------------------
# Token encryption helpers
# ---------------------------------------------------------------------------

_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_GRAPH_BASE = "https://graph.microsoft.com/v1.0/me"

_GMAIL_SYSTEM_LABELS = {
    "INBOX",
    "UNREAD",
    "STARRED",
    "IMPORTANT",
    "SENT",
    "DRAFT",
    "TRASH",
    "SPAM",
    "CATEGORY_PERSONAL",
    "CATEGORY_SOCIAL",
    "CATEGORY_PROMOTIONS",
    "CATEGORY_UPDATES",
    "CATEGORY_FORUMS",
}


def encrypt_oauth_token(plaintext: str) -> str:
    """Encrypt an OAuth access/refresh token for at-rest storage."""
    return encrypt_takeaway(plaintext)


def decrypt_oauth_token(ciphertext: str) -> str:
    """Decrypt an at-rest OAuth token back to plaintext."""
    return decrypt_takeaway(ciphertext)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _decode_base64url(data: str) -> str:
    """Decode a base64url-encoded string to UTF-8 text."""
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def _extract_plain_text(part: dict) -> str:
    """Recursively extract the first text/plain body from a Gmail message part."""
    mime = part.get("mimeType", "")
    if mime == "text/plain":
        data = part.get("body", {}).get("data", "")
        return _decode_base64url(data) if data else ""
    for sub in part.get("parts", []):
        result = _extract_plain_text(sub)
        if result:
            return result
    return ""


def _extract_html(part: dict) -> str:
    """Recursively extract the first text/html body from a Gmail message part."""
    mime = part.get("mimeType", "")
    if mime == "text/html":
        data = part.get("body", {}).get("data", "")
        return _decode_base64url(data) if data else ""
    for sub in part.get("parts", []):
        result = _extract_html(sub)
        if result:
            return result
    return ""


def _gmail_folder(label_ids: list[str]) -> str:
    if "TRASH" in label_ids:
        return "trash"
    if "DRAFT" in label_ids:
        return "drafts"
    if "SENT" in label_ids:
        return "sent"
    return "inbox"


# ---------------------------------------------------------------------------
# Unified EmailMessage dataclass
# ---------------------------------------------------------------------------


@dataclass
class EmailMessage:
    """Provider-agnostic email message used throughout the unified inbox."""

    user_id: str
    account_id: str
    provider_id: str
    thread_id: str | None
    folder: str
    labels: list[str]
    from_address: str
    from_name: str
    to_addresses: list[dict]
    cc_addresses: list[dict]
    subject: str
    body_text: str
    snippet: str
    is_read: bool
    is_starred: bool
    has_attachments: bool
    attachments_meta: list[dict]
    provider_date: str

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def to_supabase_row(self) -> dict:
        """Return a dict suitable for an upsert into the email_messages table."""
        return {
            "user_id": self.user_id,
            "account_id": self.account_id,
            "provider_id": self.provider_id,
            "thread_id": self.thread_id,
            "folder": self.folder,
            "labels": self.labels,
            "from_address": self.from_address,
            "from_name": self.from_name,
            "to_addresses": self.to_addresses,
            "cc_addresses": self.cc_addresses,
            "subject": self.subject,
            "body_text": self.body_text,
            "snippet": self.snippet,
            "is_read": self.is_read,
            "is_starred": self.is_starred,
            "has_attachments": self.has_attachments,
            "attachments_meta": self.attachments_meta,
            "provider_date": self.provider_date,
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    # Factory: Gmail
    # ------------------------------------------------------------------

    @classmethod
    def from_gmail(
        cls,
        payload: dict,
        *,
        account_id: str,
        user_id: str,
    ) -> "EmailMessage":
        """Construct an EmailMessage from a Gmail API message resource."""

        msg_payload = payload.get("payload", {})
        headers: list[dict] = msg_payload.get("headers", [])
        header_map = {h["name"].lower(): h["value"] for h in headers}

        raw_from = header_map.get("from", "")
        from_name, from_address = email.utils.parseaddr(raw_from)

        raw_to = header_map.get("to", "")
        to_addresses = [
            {"name": n, "address": a}
            for n, a in email.utils.getaddresses([raw_to])
            if a
        ]

        raw_cc = header_map.get("cc", "")
        cc_addresses = [
            {"name": n, "address": a}
            for n, a in email.utils.getaddresses([raw_cc])
            if a
        ]

        label_ids: list[str] = payload.get("labelIds", [])
        user_labels = [lbl for lbl in label_ids if lbl not in _GMAIL_SYSTEM_LABELS]
        folder = _gmail_folder(label_ids)
        is_read = "UNREAD" not in label_ids
        is_starred = "STARRED" in label_ids

        body_text = _extract_plain_text(msg_payload)
        snippet = payload.get("snippet", "")
        subject = header_map.get("subject", "(no subject)")
        thread_id = payload.get("threadId")
        provider_id = payload.get("id", "")
        provider_date = header_map.get("date", "")

        # Attachments
        parts = msg_payload.get("parts", [])
        attachments_meta: list[dict] = []
        for part in parts:
            if part.get("filename") and part.get("body", {}).get("attachmentId"):
                attachments_meta.append(
                    {
                        "filename": part["filename"],
                        "mime_type": part.get("mimeType", ""),
                        "size": part.get("body", {}).get("size", 0),
                        "attachment_id": part["body"]["attachmentId"],
                    }
                )
        has_attachments = bool(attachments_meta)

        return cls(
            user_id=user_id,
            account_id=account_id,
            provider_id=provider_id,
            thread_id=thread_id,
            folder=folder,
            labels=user_labels,
            from_address=from_address,
            from_name=from_name,
            to_addresses=to_addresses,
            cc_addresses=cc_addresses,
            subject=subject,
            body_text=body_text,
            snippet=snippet,
            is_read=is_read,
            is_starred=is_starred,
            has_attachments=has_attachments,
            attachments_meta=attachments_meta,
            provider_date=provider_date,
        )

    # ------------------------------------------------------------------
    # Factory: Microsoft Graph
    # ------------------------------------------------------------------

    @classmethod
    def from_graph(
        cls,
        payload: dict,
        *,
        account_id: str,
        user_id: str,
    ) -> "EmailMessage":
        """Construct an EmailMessage from a Microsoft Graph message resource."""

        from_obj = payload.get("from", {}).get("emailAddress", {})
        from_name = from_obj.get("name", "")
        from_address = from_obj.get("address", "")

        to_addresses = [
            {
                "name": r.get("emailAddress", {}).get("name", ""),
                "address": r.get("emailAddress", {}).get("address", ""),
            }
            for r in payload.get("toRecipients", [])
        ]

        cc_addresses = [
            {
                "name": r.get("emailAddress", {}).get("name", ""),
                "address": r.get("emailAddress", {}).get("address", ""),
            }
            for r in payload.get("ccRecipients", [])
        ]

        is_read = payload.get("isRead", False)
        flag_status = payload.get("flag", {}).get("flagStatus", "notFlagged")
        is_starred = flag_status == "flagged"

        body_preview = payload.get("bodyPreview", "")
        subject = payload.get("subject", "(no subject)") or "(no subject)"
        provider_date = payload.get("receivedDateTime", "")
        provider_id = payload.get("id", "")
        thread_id = payload.get("conversationId")

        has_attachments = payload.get("hasAttachments", False)

        return cls(
            user_id=user_id,
            account_id=account_id,
            provider_id=provider_id,
            thread_id=thread_id,
            folder="inbox",
            labels=[],
            from_address=from_address,
            from_name=from_name,
            to_addresses=to_addresses,
            cc_addresses=cc_addresses,
            subject=subject,
            body_text=body_preview,
            snippet=body_preview,
            is_read=is_read,
            is_starred=is_starred,
            has_attachments=has_attachments,
            attachments_meta=[],
            provider_date=provider_date,
        )


# ---------------------------------------------------------------------------
# Provider protocol
# ---------------------------------------------------------------------------


class EmailProvider(Protocol):
    """Async interface every email backend must satisfy."""

    async def fetch_messages(
        self, access_token: str, *, since: str | None = None
    ) -> list[dict]: ...

    async def fetch_message_html(self, access_token: str, message_id: str) -> str: ...

    async def send_message(self, access_token: str, message: dict) -> dict: ...

    async def move_message(
        self, access_token: str, message_id: str, folder: str
    ) -> None: ...

    async def update_labels(
        self,
        access_token: str,
        message_id: str,
        add: list[str],
        remove: list[str],
    ) -> None: ...

    async def set_read(
        self, access_token: str, message_id: str, is_read: bool
    ) -> None: ...

    async def set_starred(
        self, access_token: str, message_id: str, is_starred: bool
    ) -> None: ...

    async def delete_message(self, access_token: str, message_id: str) -> None: ...

    async def fetch_message_ids(self, access_token: str) -> list[str]: ...


# ---------------------------------------------------------------------------
# Gmail provider
# ---------------------------------------------------------------------------


class GmailProvider:
    """Email provider backed by the Gmail REST API."""

    def _headers(self, access_token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {access_token}"}

    async def fetch_messages(
        self, access_token: str, *, since: str | None = None
    ) -> list[dict]:
        q = "category:primary in:inbox"
        if since:
            q += f" after:{since}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{_GMAIL_BASE}/messages",
                headers=self._headers(access_token),
                params={"q": q},
            )
            resp.raise_for_status()
            ids = [m["id"] for m in resp.json().get("messages", [])]
            messages = []
            for msg_id in ids:
                r = await client.get(
                    f"{_GMAIL_BASE}/messages/{msg_id}",
                    headers=self._headers(access_token),
                    params={"format": "full"},
                )
                r.raise_for_status()
                messages.append(r.json())
            return messages

    async def fetch_message_ids(self, access_token: str) -> list[str]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{_GMAIL_BASE}/messages",
                headers=self._headers(access_token),
                params={"q": "category:primary in:inbox", "maxResults": 500},
            )
            resp.raise_for_status()
            return [m["id"] for m in resp.json().get("messages", [])]

    async def fetch_message_html(self, access_token: str, message_id: str) -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{_GMAIL_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
                params={"format": "full"},
            )
            resp.raise_for_status()
            return _extract_html(resp.json().get("payload", {}))

    async def send_message(self, access_token: str, message: dict) -> dict:
        # Build a proper RFC 2822 MIME email and encode it as base64url for Gmail.
        mime_msg = email.mime.multipart.MIMEMultipart("alternative")
        mime_msg["Subject"] = message.get("subject", "")
        mime_msg["To"] = ", ".join(message.get("to") or [])
        cc_list = message.get("cc") or []
        if cc_list:
            mime_msg["Cc"] = ", ".join(cc_list)
        in_reply_to = message.get("in_reply_to")
        if in_reply_to:
            mime_msg["In-Reply-To"] = in_reply_to
            mime_msg["References"] = in_reply_to
        body_html = message.get("body_html") or ""
        mime_msg.attach(email.mime.text.MIMEText(body_html, "html", "utf-8"))
        raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).rstrip(b"=").decode("utf-8")

        payload: dict = {"raw": raw}
        if message.get("thread_id"):
            payload["threadId"] = message["thread_id"]

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_GMAIL_BASE}/messages/send",
                headers=self._headers(access_token),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def move_message(
        self, access_token: str, message_id: str, folder: str
    ) -> None:
        folder_map = {
            "inbox": ("INBOX", []),
            "trash": ("TRASH", ["INBOX"]),
            "sent": ("SENT", ["INBOX"]),
            "drafts": ("DRAFT", ["INBOX"]),
            "spam": ("SPAM", ["INBOX"]),
        }
        add_label, remove_labels = folder_map.get(folder.lower(), (folder.upper(), []))
        await self.update_labels(access_token, message_id, [add_label], remove_labels)

    async def update_labels(
        self,
        access_token: str,
        message_id: str,
        add: list[str],
        remove: list[str],
    ) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_GMAIL_BASE}/messages/{message_id}/modify",
                headers=self._headers(access_token),
                json={"addLabelIds": add, "removeLabelIds": remove},
            )
            resp.raise_for_status()

    async def set_read(self, access_token: str, message_id: str, is_read: bool) -> None:
        if is_read:
            await self.update_labels(access_token, message_id, [], ["UNREAD"])
        else:
            await self.update_labels(access_token, message_id, ["UNREAD"], [])

    async def set_starred(
        self, access_token: str, message_id: str, is_starred: bool
    ) -> None:
        if is_starred:
            await self.update_labels(access_token, message_id, ["STARRED"], [])
        else:
            await self.update_labels(access_token, message_id, [], ["STARRED"])

    async def delete_message(self, access_token: str, message_id: str) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{_GMAIL_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
            )
            resp.raise_for_status()


# ---------------------------------------------------------------------------
# Microsoft Graph provider
# ---------------------------------------------------------------------------


class GraphProvider:
    """Email provider backed by the Microsoft Graph REST API."""

    def _headers(self, access_token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {access_token}"}

    async def fetch_messages(
        self, access_token: str, *, since: str | None = None
    ) -> list[dict]:
        params: dict = {}
        if since:
            params["$filter"] = f"receivedDateTime ge {since}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{_GRAPH_BASE}/mailFolders('Inbox')/messages",
                headers=self._headers(access_token),
                params=params,
            )
            resp.raise_for_status()
            return resp.json().get("value", [])

    async def fetch_message_ids(self, access_token: str) -> list[str]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{_GRAPH_BASE}/mailFolders('Inbox')/messages",
                headers=self._headers(access_token),
                params={"$select": "id", "$top": 500},
            )
            resp.raise_for_status()
            return [m["id"] for m in resp.json().get("value", [])]

    async def fetch_message_html(self, access_token: str, message_id: str) -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{_GRAPH_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
                params={"$select": "body"},
            )
            resp.raise_for_status()
            return resp.json().get("body", {}).get("content", "")

    async def send_message(self, access_token: str, message: dict) -> dict:
        # Build the Microsoft Graph sendMail payload structure.
        graph_message: dict = {
            "subject": message.get("subject", ""),
            "body": {
                "contentType": "HTML",
                "content": message.get("body_html") or "",
            },
            "toRecipients": [
                {"emailAddress": {"address": addr}}
                for addr in (message.get("to") or [])
            ],
        }
        cc_list = message.get("cc") or []
        if cc_list:
            graph_message["ccRecipients"] = [
                {"emailAddress": {"address": addr}} for addr in cc_list
            ]
        bcc_list = message.get("bcc") or []
        if bcc_list:
            graph_message["bccRecipients"] = [
                {"emailAddress": {"address": addr}} for addr in bcc_list
            ]
        if message.get("in_reply_to"):
            graph_message["replyTo"] = [
                {"emailAddress": {"address": message["in_reply_to"]}}
            ]

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_GRAPH_BASE}/sendMail",
                headers=self._headers(access_token),
                json={"message": graph_message},
            )
            resp.raise_for_status()
            return {}

    async def move_message(
        self, access_token: str, message_id: str, folder: str
    ) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_GRAPH_BASE}/messages/{message_id}/move",
                headers=self._headers(access_token),
                json={"destinationId": folder},
            )
            resp.raise_for_status()

    async def update_labels(
        self,
        access_token: str,
        message_id: str,
        add: list[str],
        remove: list[str],
    ) -> None:
        # Graph doesn't have a direct label concept — no-op for now
        pass

    async def set_read(self, access_token: str, message_id: str, is_read: bool) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{_GRAPH_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
                json={"isRead": is_read},
            )
            resp.raise_for_status()

    async def set_starred(
        self, access_token: str, message_id: str, is_starred: bool
    ) -> None:
        flag_status = "flagged" if is_starred else "notFlagged"
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{_GRAPH_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
                json={"flag": {"flagStatus": flag_status}},
            )
            resp.raise_for_status()

    async def delete_message(self, access_token: str, message_id: str) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{_GRAPH_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
            )
            resp.raise_for_status()


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def get_provider(provider_name: str) -> GmailProvider | GraphProvider:
    """Return the correct provider instance for the given provider name."""
    if provider_name == "google":
        return GmailProvider()
    elif provider_name == "microsoft":
        return GraphProvider()
    raise ValueError(f"Unknown provider: {provider_name}")
