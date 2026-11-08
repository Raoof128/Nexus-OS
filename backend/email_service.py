"""Email service: at-rest token encryption, the unified message model, and
provider adapters for Gmail (Google) and Outlook (Microsoft Graph).

Provider adapters implement the :class:`EmailProvider` protocol. Every method
takes a plaintext OAuth access token and performs HTTP calls with ``httpx``.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import urllib.parse
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from email.errors import HeaderParseError
from email.header import decode_header, make_header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import getaddresses, parseaddr, parsedate_to_datetime
from typing import Protocol

import httpx
from cryptography.fernet import InvalidToken

try:
    from .data_protection import (
        ENCRYPTED_PREFIX,
        encrypt_takeaway,
        get_takeaway_cipher,
    )
except ImportError:  # pragma: no cover - supports backend cwd execution
    from data_protection import (  # type: ignore[no-redef]
        ENCRYPTED_PREFIX,
        encrypt_takeaway,
        get_takeaway_cipher,
    )

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_GRAPH_BASE = "https://graph.microsoft.com/v1.0/me"
_GRAPH_HOST = urllib.parse.urlsplit(_GRAPH_BASE).hostname or "graph.microsoft.com"

# Connect/read timeouts for every outbound provider call.
_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

# Upper bound on concurrent per-message GETs in fetch_messages.
_MAX_CONCURRENT_GETS = 4

# Safety cap on pagination when listing all inbox message ids for ghost
# detection: 20 pages x 500 ids = up to 10k messages per account.
_MAX_ID_PAGES = 20

# Graph message-list window used by fetch_messages (the poll window).
_GRAPH_RECENT_WINDOW = 50

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

# Unified folder name -> (label to add or None, labels to remove) for Gmail.
_GMAIL_FOLDER_LABELS: dict[str, tuple[str | None, list[str]]] = {
    "inbox": ("INBOX", ["TRASH", "SPAM"]),
    "archive": (None, ["INBOX"]),
    "trash": ("TRASH", ["INBOX"]),
    "sent": ("SENT", ["INBOX"]),
    "drafts": ("DRAFT", ["INBOX"]),
    "spam": ("SPAM", ["INBOX"]),
}

# Unified folder name -> Microsoft Graph well-known folder name.
_GRAPH_FOLDER_IDS: dict[str, str] = {
    "inbox": "inbox",
    "archive": "archive",
    "trash": "deleteditems",
    "spam": "junkemail",
    "sent": "sentitems",
    "drafts": "drafts",
}

SUPPORTED_FOLDERS: tuple[str, ...] = tuple(_GMAIL_FOLDER_LABELS)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class OAuthTokenDecryptionError(RuntimeError):
    """A stored OAuth token could not be decrypted.

    Raised instead of returning the stored value, so ciphertext is never sent
    to a provider as a bearer token.
    """


class MailIdListTruncatedError(RuntimeError):
    """The remote id list hit ``_MAX_ID_PAGES`` with more pages still pending.

    A partial id set must not be treated as the complete remote set, so ghost
    detection is skipped when this is raised.
    """


class UntrustedPageLinkError(RuntimeError):
    """A pagination link returned by the provider points outside the API host.

    The bearer token is never sent to a link that fails the origin check.
    """


class UnsupportedFolderError(ValueError):
    """The requested unified folder is not one this service can move to."""


# ---------------------------------------------------------------------------
# Token encryption helpers
# ---------------------------------------------------------------------------


def encrypt_oauth_token(plaintext: str) -> str:
    """Encrypt an OAuth access or refresh token for at-rest storage."""
    return encrypt_takeaway(plaintext)  # type: ignore[return-value]


def decrypt_oauth_token(ciphertext: str) -> str:
    """Decrypt an at-rest OAuth token, failing closed.

    Unlike the shared ``decrypt_takeaway`` helper, this never returns the input
    unchanged. A value without the ``enc::`` prefix, a missing encryption key, or
    a token that fails authentication all raise :class:`OAuthTokenDecryptionError`.
    """
    if not isinstance(ciphertext, str) or not ciphertext.startswith(ENCRYPTED_PREFIX):
        raise OAuthTokenDecryptionError("OAuth token is not encrypted")
    cipher = get_takeaway_cipher()
    if cipher is None:
        raise OAuthTokenDecryptionError("No token encryption key is configured")
    token = ciphertext.removeprefix(ENCRYPTED_PREFIX).encode("utf-8")
    try:
        return cipher.decrypt(token).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise OAuthTokenDecryptionError("OAuth token failed to decrypt") from exc


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _decode_base64url(data: str) -> str:
    """Decode a base64url-encoded body part to UTF-8 text.

    A malformed part yields an empty string rather than failing the message.
    """
    padded = data + "=" * (-len(data) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded)
    except ValueError:  # binascii.Error is a ValueError subclass
        logger.warning("Malformed base64url body part; treating as empty")
        return ""
    return raw.decode("utf-8", errors="replace")


def _extract_body(part: dict, mime_type: str) -> str:
    """Recursively return the first body part of ``mime_type``."""
    if part.get("mimeType", "") == mime_type:
        data = part.get("body", {}).get("data", "")
        return _decode_base64url(data) if data else ""
    for sub in part.get("parts", []):
        result = _extract_body(sub, mime_type)
        if result:
            return result
    return ""


def _extract_plain_text(part: dict) -> str:
    """Recursively extract the first text/plain body from a Gmail message part."""
    return _extract_body(part, "text/plain")


def _extract_html(part: dict) -> str:
    """Recursively extract the first text/html body from a Gmail message part."""
    return _extract_body(part, "text/html")


def _decode_rfc2047(value: str) -> str:
    """Decode RFC 2047 encoded-words in a header value.

    Values without an encoded-word marker, and values that fail to decode, are
    returned unchanged.
    """
    if not value or "=?" not in value:
        return value
    try:
        return str(make_header(decode_header(value)))
    except (UnicodeError, LookupError, ValueError, TypeError, HeaderParseError):
        return value


def _normalise_gmail_date(date_header: str, internal_date_ms: str | None) -> str:
    """Return the message date as an ISO 8601 UTC string.

    Uses the ``Date`` header when it parses. Otherwise falls back to Gmail's
    ``internalDate`` (epoch milliseconds). Raises ``ValueError`` when neither
    yields a usable instant, so the caller can skip the message instead of
    writing an empty value into a NOT NULL timestamp column.
    """
    if date_header:
        try:
            parsed: datetime | None = parsedate_to_datetime(date_header)
        except (TypeError, ValueError, IndexError):
            parsed = None
        if parsed is not None:
            if parsed.tzinfo is None:  # "-0000" yields a naive datetime
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
    if internal_date_ms:
        try:
            return datetime.fromtimestamp(
                int(internal_date_ms) / 1000, tz=timezone.utc
            ).isoformat()
        except (TypeError, ValueError, OverflowError, OSError):
            pass
    raise ValueError("Gmail message has no usable date")


def _is_attachment(part: dict) -> bool:
    """Return True for a downloadable attachment part.

    Inline parts (``Content-Disposition: inline`` or a ``Content-ID``, such as
    signature images referenced from the body) are not attachments.
    """
    if not part.get("filename") or not part.get("body", {}).get("attachmentId"):
        return False
    headers = {
        h.get("name", "").lower(): h.get("value", "")
        for h in part.get("headers", []) or []
    }
    disposition = headers.get("content-disposition", "").lower()
    if "content-id" in headers or disposition.startswith("inline"):
        return False
    return True


def _iter_attachments(part: dict) -> Iterator[dict]:
    """Yield attachment parts at any depth of the MIME tree.

    Children of a ``message/rfc822`` part are not descended into. Their
    attachments belong to the embedded message, and their ids cannot be fetched
    through the outer message id.
    """
    for sub in part.get("parts", []) or []:
        if _is_attachment(sub):
            yield sub
        if sub.get("mimeType", "") != "message/rfc822":
            yield from _iter_attachments(sub)


def _gmail_folder(label_ids: list[str]) -> str:
    if "TRASH" in label_ids:
        return "trash"
    if "DRAFT" in label_ids:
        return "drafts"
    if "SENT" in label_ids:
        return "sent"
    return "inbox"


def _check_header_value(name: str, value: str) -> str:
    """Reject CR or LF in a value that will become a MIME header line."""
    if "\r" in value or "\n" in value:
        raise ValueError(f"Header {name} must not contain line breaks")
    return value


def _is_trusted_graph_link(link: str) -> bool:
    """Return True only for an https link on the Microsoft Graph host, default port."""
    try:
        parsed = urllib.parse.urlsplit(link)
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname == _GRAPH_HOST
        and parsed.username is None
        and parsed.password is None
        and port in (None, 443)
    )


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


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
        """Return a dict suitable for an upsert into the nexus_emails table.

        The upsert conflict key is ``(account_id, provider_id)``.
        """
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
        """Construct an EmailMessage from a Gmail API message resource.

        Raises ``ValueError`` when the message has no usable date.
        """

        msg_payload = payload.get("payload", {})
        headers: list[dict] = msg_payload.get("headers", [])
        header_map = {h["name"].lower(): h["value"] for h in headers}

        from_name, from_address = parseaddr(header_map.get("from", ""))
        from_name = _decode_rfc2047(from_name)

        to_addresses = [
            {"name": n, "address": a}
            for n, a in getaddresses([header_map.get("to", "")])
            if a
        ]
        cc_addresses = [
            {"name": n, "address": a}
            for n, a in getaddresses([header_map.get("cc", "")])
            if a
        ]

        label_ids: list[str] = payload.get("labelIds", [])
        user_labels = [lbl for lbl in label_ids if lbl not in _GMAIL_SYSTEM_LABELS]
        folder = _gmail_folder(label_ids)
        is_read = "UNREAD" not in label_ids
        is_starred = "STARRED" in label_ids

        body_text = _extract_plain_text(msg_payload)
        snippet = payload.get("snippet", "")
        subject = _decode_rfc2047(header_map.get("subject", "(no subject)"))
        thread_id = payload.get("threadId")
        provider_id = payload.get("id", "")
        provider_date = _normalise_gmail_date(
            header_map.get("date", ""), payload.get("internalDate")
        )

        attachments_meta: list[dict] = [
            {
                "filename": part["filename"],
                "mime_type": part.get("mimeType", ""),
                "size": part.get("body", {}).get("size", 0),
                "attachment_id": part["body"]["attachmentId"],
            }
            for part in _iter_attachments(msg_payload)
        ]
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
        """Construct an EmailMessage from a Microsoft Graph message resource.

        Graph's ``bodyPreview`` (about 255 characters) is stored as both
        ``body_text`` and ``snippet``. Gmail's ``body_text`` is the full plain
        text. Full Graph bodies come from :meth:`GraphProvider.fetch_message_html`.
        """

        from_obj = (payload.get("from") or {}).get("emailAddress") or {}
        from_name = from_obj.get("name") or ""
        from_address = from_obj.get("address") or ""

        to_addresses = _graph_recipients(payload.get("toRecipients"))
        cc_addresses = _graph_recipients(payload.get("ccRecipients"))

        is_read = bool(payload.get("isRead", False))
        flag_status = (payload.get("flag") or {}).get("flagStatus", "notFlagged")
        is_starred = flag_status == "flagged"

        body_preview = payload.get("bodyPreview") or ""
        subject = payload.get("subject") or "(no subject)"
        provider_date = payload.get("receivedDateTime") or ""
        provider_id = payload.get("id", "")
        thread_id = payload.get("conversationId")

        has_attachments = bool(payload.get("hasAttachments", False))

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


def _graph_recipients(recipients: list[dict] | None) -> list[dict]:
    """Map Graph recipient objects to ``{name, address}`` dicts, null-safe."""
    result: list[dict] = []
    for r in recipients or []:
        addr_obj = r.get("emailAddress") or {}
        result.append(
            {
                "name": addr_obj.get("name") or "",
                "address": addr_obj.get("address") or "",
            }
        )
    return result


# ---------------------------------------------------------------------------
# Provider protocol
# ---------------------------------------------------------------------------


class EmailProvider(Protocol):
    """Async interface every email backend must satisfy.

    Contract notes:

    * ``fetch_message_ids`` returns the COMPLETE remote id set, or raises
      :class:`MailIdListTruncatedError` when it cannot.
    * ``send_message`` returns the provider's response. Gmail returns the sent
      message resource. Graph returns ``{}`` because the API answers 202 with no
      body.
    * ``move_message`` returns the id of the moved message when the provider
      issues a new one (Graph), or ``None`` when the id is kept (Gmail).
    * ``update_labels`` raises ``NotImplementedError`` on providers without labels.
    * ``delete_message`` on Gmail moves the message to Trash. It does not
      permanently delete it.
    """

    async def fetch_messages(
        self, access_token: str, *, since: str | None = None
    ) -> list[dict]: ...

    async def fetch_message_html(self, access_token: str, message_id: str) -> str: ...

    async def send_message(self, access_token: str, message: dict) -> dict: ...

    async def move_message(
        self, access_token: str, message_id: str, folder: str
    ) -> str | None: ...

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
        return _auth_headers(access_token)

    async def fetch_messages(
        self, access_token: str, *, since: str | None = None
    ) -> list[dict]:
        """Return full message resources for the primary inbox.

        Per-message GETs run concurrently, bounded by ``_MAX_CONCURRENT_GETS``.
        Results keep the listing order. The first failure cancels the rest.
        """
        q = "category:primary in:inbox"
        if since:
            q += f" after:{since}"
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"{_GMAIL_BASE}/messages",
                headers=self._headers(access_token),
                params={"q": q},
            )
            resp.raise_for_status()
            ids = [m["id"] for m in resp.json().get("messages", [])]
            semaphore = asyncio.Semaphore(_MAX_CONCURRENT_GETS)

            async def _fetch_one(msg_id: str) -> dict:
                async with semaphore:
                    r = await client.get(
                        f"{_GMAIL_BASE}/messages/{msg_id}",
                        headers=self._headers(access_token),
                        params={"format": "full"},
                    )
                    r.raise_for_status()
                    return r.json()

            tasks = [asyncio.create_task(_fetch_one(i)) for i in ids]
            try:
                return list(await asyncio.gather(*tasks))
            except BaseException:
                for task in tasks:
                    task.cancel()
                raise

    async def fetch_message_ids(self, access_token: str) -> list[str]:
        """Return the full inbox-primary message id list, following pagination.

        Used by the poller's ghost detection, so the result must be the COMPLETE
        remote id set. If the id list is still incomplete after
        ``_MAX_ID_PAGES`` pages, :class:`MailIdListTruncatedError` is raised
        rather than returning a partial set. The bound is 20 pages x 500 = 10k ids.
        """

        ids: list[str] = []
        params: dict = {"q": "category:primary in:inbox", "maxResults": 500}
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            for _ in range(_MAX_ID_PAGES):
                resp = await client.get(
                    f"{_GMAIL_BASE}/messages",
                    headers=self._headers(access_token),
                    params=params,
                )
                resp.raise_for_status()
                body = resp.json()
                ids.extend(m["id"] for m in body.get("messages", []))
                next_token = body.get("nextPageToken")
                if not next_token:
                    return ids
                params = {**params, "pageToken": next_token}
        raise MailIdListTruncatedError(
            f"Inbox id list exceeds {_MAX_ID_PAGES} pages; ghost detection skipped"
        )

    async def fetch_message_html(self, access_token: str, message_id: str) -> str:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"{_GMAIL_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
                params={"format": "full"},
            )
            resp.raise_for_status()
            return _extract_html(resp.json().get("payload", {}))

    async def _parent_threading(
        self,
        client: httpx.AsyncClient,
        access_token: str,
        parent_ref: str,
    ) -> tuple[str | None, str]:
        """Return the parent's RFC 5322 Message-ID and References header.

        ``parent_ref`` is normally a Gmail message id. A value already in
        ``<...>`` form is taken as the Message-ID itself.
        """
        if parent_ref.startswith("<"):
            return parent_ref, ""
        resp = await client.get(
            f"{_GMAIL_BASE}/messages/{parent_ref}",
            headers=self._headers(access_token),
            params={
                "format": "metadata",
                "metadataHeaders": ["Message-ID", "References"],
            },
        )
        resp.raise_for_status()
        headers = {
            h["name"].lower(): h["value"]
            for h in resp.json().get("payload", {}).get("headers", [])
        }
        return headers.get("message-id"), headers.get("references", "").strip()

    async def send_message(self, access_token: str, message: dict) -> dict:
        """Send a MIME message through Gmail.

        A reply sets ``In-Reply-To`` to the parent's real Message-ID and builds
        ``References`` from the parent's chain. A Gmail message id is never put
        in a threading header.
        """
        mime_msg = MIMEMultipart("alternative")
        mime_msg["Subject"] = _check_header_value("Subject", message.get("subject", ""))
        mime_msg["To"] = _check_header_value("To", ", ".join(message.get("to") or []))
        cc_list = message.get("cc") or []
        if cc_list:
            mime_msg["Cc"] = _check_header_value("Cc", ", ".join(cc_list))
        bcc_list = message.get("bcc") or []
        if bcc_list:
            mime_msg["Bcc"] = _check_header_value("Bcc", ", ".join(bcc_list))

        payload: dict = {}
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            parent_ref = message.get("in_reply_to")
            if parent_ref:
                parent_mid, parent_refs = await self._parent_threading(
                    client, access_token, parent_ref
                )
                if parent_mid:
                    mime_msg["In-Reply-To"] = _check_header_value(
                        "In-Reply-To", parent_mid
                    )
                    chain = " ".join(x for x in (parent_refs, parent_mid) if x)
                    mime_msg["References"] = _check_header_value("References", chain)

            body_html = message.get("body_html") or ""
            mime_msg.attach(MIMEText(body_html, "html", "utf-8"))
            raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).rstrip(b"=")
            payload["raw"] = raw.decode("utf-8")
            if message.get("thread_id"):
                payload["threadId"] = message["thread_id"]

            resp = await client.post(
                f"{_GMAIL_BASE}/messages/send",
                headers=self._headers(access_token),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def move_message(
        self, access_token: str, message_id: str, folder: str
    ) -> str | None:
        """Move a message by changing its labels. The id is unchanged.

        Raises :class:`UnsupportedFolderError` for an unknown folder, before any
        HTTP call is made.
        """
        if folder not in _GMAIL_FOLDER_LABELS:
            raise UnsupportedFolderError(f"Unsupported folder: {folder}")
        add_label, remove_labels = _GMAIL_FOLDER_LABELS[folder]
        add = [add_label] if add_label else []
        await self.update_labels(access_token, message_id, add, remove_labels)
        return None

    async def update_labels(
        self,
        access_token: str,
        message_id: str,
        add: list[str],
        remove: list[str],
    ) -> None:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
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
        """Move a message to Trash. This is recoverable with ``messages.untrash``.

        Gmail's ``messages.delete`` is permanent and is not used here.
        """
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{_GMAIL_BASE}/messages/{message_id}/trash",
                headers=self._headers(access_token),
            )
            resp.raise_for_status()


# ---------------------------------------------------------------------------
# Microsoft Graph provider
# ---------------------------------------------------------------------------


class GraphProvider:
    """Email provider backed by the Microsoft Graph REST API."""

    def _headers(self, access_token: str) -> dict[str, str]:
        return _auth_headers(access_token)

    async def fetch_messages(
        self, access_token: str, *, since: str | None = None
    ) -> list[dict]:
        """Return the newest inbox messages in one bounded page.

        Sends ``$top`` and ``$orderby=receivedDateTime desc``, so the result is
        the most recent window. Graph's default page size is 10. Older messages
        are not paged here, so ghost detection uses :meth:`fetch_message_ids`.
        """
        params: dict = {
            "$top": _GRAPH_RECENT_WINDOW,
            "$orderby": "receivedDateTime desc",
        }
        if since:
            params["$filter"] = f"receivedDateTime ge {since}"
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"{_GRAPH_BASE}/mailFolders('Inbox')/messages",
                headers=self._headers(access_token),
                params=params,
            )
            resp.raise_for_status()
            return resp.json().get("value", [])

    async def fetch_message_ids(self, access_token: str) -> list[str]:
        """Return the full inbox id list, following ``@odata.nextLink``.

        Used by the poller's ghost detection, so the result must be the COMPLETE
        remote id set. Raises :class:`MailIdListTruncatedError` if the list is
        still incomplete after ``_MAX_ID_PAGES`` pages. Raises
        :class:`UntrustedPageLinkError` before sending the bearer token to any
        ``nextLink`` that is not https on the Graph host.
        """

        ids: list[str] = []
        url: str = f"{_GRAPH_BASE}/mailFolders('Inbox')/messages"
        params: dict | None = {"$select": "id", "$top": 500}
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            for _ in range(_MAX_ID_PAGES):
                resp = await client.get(
                    url,
                    headers=self._headers(access_token),
                    params=params,
                )
                resp.raise_for_status()
                body = resp.json()
                ids.extend(m["id"] for m in body.get("value", []))
                next_link = body.get("@odata.nextLink")
                if not next_link:
                    return ids
                if not _is_trusted_graph_link(next_link):
                    raise UntrustedPageLinkError(
                        "Refusing to follow a nextLink outside the Graph host"
                    )
                # nextLink already embeds the query params (incl. skiptoken).
                url = next_link
                params = None
        raise MailIdListTruncatedError(
            f"Inbox id list exceeds {_MAX_ID_PAGES} pages; ghost detection skipped"
        )

    async def fetch_message_html(self, access_token: str, message_id: str) -> str:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"{_GRAPH_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
                params={"$select": "body"},
            )
            resp.raise_for_status()
            return resp.json().get("body", {}).get("content", "")

    async def send_message(self, access_token: str, message: dict) -> dict:
        """Send a message through Graph.

        A reply (``in_reply_to`` set to a Graph message id) goes to
        ``POST /messages/{id}/reply``. The reply's recipients are the parent's
        ``replyTo``, or its sender. Otherwise the message goes to ``sendMail``.
        Both endpoints answer 202 with no body, so the result is ``{}``.
        """
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

        parent_id = message.get("in_reply_to")
        if parent_id:
            url = f"{_GRAPH_BASE}/messages/{parent_id}/reply"
            body: dict = {"message": graph_message}
        else:
            url = f"{_GRAPH_BASE}/sendMail"
            body = {"message": graph_message}

        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.post(
                url,
                headers=self._headers(access_token),
                json=body,
            )
            resp.raise_for_status()
            return {}

    async def move_message(
        self, access_token: str, message_id: str, folder: str
    ) -> str | None:
        """Move a message and return the new id.

        Graph creates a copy in the destination folder with a new id (201
        response). The new id is returned so the caller can update
        ``provider_id``. Raises :class:`UnsupportedFolderError` for an unknown
        folder, before any HTTP call.
        """
        if folder not in _GRAPH_FOLDER_IDS:
            raise UnsupportedFolderError(f"Unsupported folder: {folder}")
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{_GRAPH_BASE}/messages/{message_id}/move",
                headers=self._headers(access_token),
                json={"destinationId": _GRAPH_FOLDER_IDS[folder]},
            )
            resp.raise_for_status()
            new_id = resp.json().get("id")
            return new_id if isinstance(new_id, str) and new_id else None

    async def update_labels(
        self,
        access_token: str,
        message_id: str,
        add: list[str],
        remove: list[str],
    ) -> None:
        """Not supported. Graph has message categories, which are not wired up here.

        Raises ``NotImplementedError`` rather than reporting success, so the
        caller can answer with an error.
        """
        raise NotImplementedError("Label updates are not supported for Graph accounts")

    async def set_read(self, access_token: str, message_id: str, is_read: bool) -> None:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
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
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.patch(
                f"{_GRAPH_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
                json={"flag": {"flagStatus": flag_status}},
            )
            resp.raise_for_status()

    async def delete_message(self, access_token: str, message_id: str) -> None:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.delete(
                f"{_GRAPH_BASE}/messages/{message_id}",
                headers=self._headers(access_token),
            )
            resp.raise_for_status()


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def get_provider(provider_name: str) -> EmailProvider:
    """Return the provider adapter for ``provider_name`` ("google" or "microsoft").

    Raises ``ValueError`` for any other name.
    """
    if provider_name == "google":
        return GmailProvider()
    if provider_name == "microsoft":
        return GraphProvider()
    raise ValueError(f"Unknown provider: {provider_name}")
