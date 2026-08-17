"""Tests for the email service: token encryption, unified model, and providers."""

from __future__ import annotations

import base64
import email
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from cryptography.fernet import Fernet

from backend.config import get_settings
from backend.email_service import (
    EmailMessage,
    GmailProvider,
    GraphProvider,
    decrypt_oauth_token,
    encrypt_oauth_token,
    get_provider,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _b64url(text: str) -> str:
    """Encode text as base64url (no padding) for Gmail payload stubs."""
    return base64.urlsafe_b64encode(text.encode()).rstrip(b"=").decode()


def _gmail_payload(
    msg_id: str = "msg-001",
    thread_id: str = "thread-001",
    subject: str = "Hello",
    from_header: str = "Alice <alice@example.com>",
    to_header: str = "bob@example.com",
    label_ids: list[str] | None = None,
    body: str = "Hello world",
) -> dict:
    if label_ids is None:
        label_ids = ["INBOX"]
    return {
        "id": msg_id,
        "threadId": thread_id,
        "labelIds": label_ids,
        "snippet": body[:100],
        "payload": {
            "headers": [
                {"name": "Subject", "value": subject},
                {"name": "From", "value": from_header},
                {"name": "To", "value": to_header},
                {"name": "Date", "value": "Thu, 10 Apr 2025 12:00:00 +0000"},
            ],
            "mimeType": "multipart/alternative",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": _b64url(body)},
                }
            ],
        },
    }


def _graph_payload(
    msg_id: str = "graph-001",
    conversation_id: str = "conv-001",
    subject: str = "Hi",
    from_name: str = "Alice",
    from_address: str = "alice@example.com",
    is_read: bool = False,
    is_starred: bool = False,
    body_preview: str = "Graph body",
) -> dict:
    return {
        "id": msg_id,
        "conversationId": conversation_id,
        "subject": subject,
        "from": {"emailAddress": {"name": from_name, "address": from_address}},
        "toRecipients": [
            {"emailAddress": {"name": "Bob", "address": "bob@example.com"}}
        ],
        "ccRecipients": [],
        "isRead": is_read,
        "flag": {"flagStatus": "flagged" if is_starred else "notFlagged"},
        "bodyPreview": body_preview,
        "receivedDateTime": "2025-04-10T12:00:00Z",
        "hasAttachments": False,
    }


# ---------------------------------------------------------------------------
# 1. Token encryption round-trip
# ---------------------------------------------------------------------------


class TestTokenEncryption:
    def test_round_trip(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Encrypting then decrypting an OAuth token returns the original value."""
        get_settings.cache_clear()
        monkeypatch.setenv(
            "TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")
        )
        plaintext = "ya29.very-secret-access-token"
        encrypted = encrypt_oauth_token(plaintext)
        assert encrypted.startswith("enc::")
        assert decrypt_oauth_token(encrypted) == plaintext

    def test_encrypted_value_differs_from_plaintext(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        get_settings.cache_clear()
        monkeypatch.setenv(
            "TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")
        )
        plaintext = "secret"
        assert encrypt_oauth_token(plaintext) != plaintext


# ---------------------------------------------------------------------------
# 2. EmailMessage.from_gmail
# ---------------------------------------------------------------------------


class TestEmailMessageFromGmail:
    def test_basic_parsing(self) -> None:
        payload = _gmail_payload()
        msg = EmailMessage.from_gmail(payload, account_id="acc-1", user_id="user-1")
        assert msg.provider_id == "msg-001"
        assert msg.thread_id == "thread-001"
        assert msg.from_address == "alice@example.com"
        assert msg.from_name == "Alice"
        assert msg.subject == "Hello"
        assert msg.body_text == "Hello world"
        assert msg.snippet == "Hello world"
        assert msg.folder == "inbox"
        assert msg.is_read is True
        assert msg.is_starred is False
        assert msg.account_id == "acc-1"
        assert msg.user_id == "user-1"

    def test_unread_label(self) -> None:
        payload = _gmail_payload(label_ids=["INBOX", "UNREAD"])
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.is_read is False

    def test_starred_label(self) -> None:
        payload = _gmail_payload(label_ids=["INBOX", "STARRED"])
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.is_starred is True

    def test_trash_folder(self) -> None:
        payload = _gmail_payload(label_ids=["TRASH"])
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.folder == "trash"

    def test_sent_folder(self) -> None:
        payload = _gmail_payload(label_ids=["SENT"])
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.folder == "sent"

    def test_draft_folder(self) -> None:
        payload = _gmail_payload(label_ids=["DRAFT"])
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.folder == "drafts"

    def test_system_labels_excluded_from_user_labels(self) -> None:
        payload = _gmail_payload(label_ids=["INBOX", "UNREAD", "my-custom-label"])
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert "INBOX" not in msg.labels
        assert "UNREAD" not in msg.labels
        assert "my-custom-label" in msg.labels

    def test_to_supabase_row_has_synced_at(self) -> None:
        payload = _gmail_payload()
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        row = msg.to_supabase_row()
        assert "synced_at" in row
        assert row["provider_id"] == "msg-001"


# ---------------------------------------------------------------------------
# 3. EmailMessage.from_graph
# ---------------------------------------------------------------------------


class TestEmailMessageFromGraph:
    def test_basic_parsing(self) -> None:
        payload = _graph_payload()
        msg = EmailMessage.from_graph(payload, account_id="acc-2", user_id="user-2")
        assert msg.provider_id == "graph-001"
        assert msg.thread_id == "conv-001"
        assert msg.from_address == "alice@example.com"
        assert msg.from_name == "Alice"
        assert msg.subject == "Hi"
        assert msg.body_text == "Graph body"
        assert msg.snippet == "Graph body"
        assert msg.is_read is False
        assert msg.is_starred is False
        assert msg.folder == "inbox"
        assert msg.account_id == "acc-2"
        assert msg.user_id == "user-2"

    def test_is_read_true(self) -> None:
        payload = _graph_payload(is_read=True)
        msg = EmailMessage.from_graph(payload, account_id="a", user_id="u")
        assert msg.is_read is True

    def test_flagged_is_starred(self) -> None:
        payload = _graph_payload(is_starred=True)
        msg = EmailMessage.from_graph(payload, account_id="a", user_id="u")
        assert msg.is_starred is True

    def test_to_addresses_parsed(self) -> None:
        payload = _graph_payload()
        msg = EmailMessage.from_graph(payload, account_id="a", user_id="u")
        assert len(msg.to_addresses) == 1
        assert msg.to_addresses[0]["address"] == "bob@example.com"

    def test_to_supabase_row_has_synced_at(self) -> None:
        payload = _graph_payload()
        msg = EmailMessage.from_graph(payload, account_id="a", user_id="u")
        row = msg.to_supabase_row()
        assert "synced_at" in row


# ---------------------------------------------------------------------------
# 4. GmailProvider.fetch_message_ids — URL check (mocked httpx)
# ---------------------------------------------------------------------------


class TestGmailProviderFetchMessageIds:
    @pytest.mark.anyio
    async def test_hits_correct_url(self) -> None:
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"messages": [{"id": "abc"}, {"id": "def"}]}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("backend.email_service.httpx.AsyncClient", return_value=mock_client):
            provider = GmailProvider()
            result = await provider.fetch_message_ids("token-abc")

        mock_client.get.assert_called_once()
        call_args = mock_client.get.call_args
        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        assert "gmail.googleapis.com" in url
        assert "messages" in url
        assert result.ids == ["abc", "def"]
        assert result.complete is True

    @pytest.mark.anyio
    async def test_follows_pagination(self) -> None:
        """All pages are walked via nextPageToken, not just the first."""

        page1 = MagicMock()
        page1.raise_for_status = MagicMock()
        page1.json.return_value = {
            "messages": [{"id": "a"}, {"id": "b"}],
            "nextPageToken": "PAGE2",
        }
        page2 = MagicMock()
        page2.raise_for_status = MagicMock()
        page2.json.return_value = {"messages": [{"id": "c"}]}  # no token → stop

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=[page1, page2])

        with patch("backend.email_service.httpx.AsyncClient", return_value=mock_client):
            provider = GmailProvider()
            result = await provider.fetch_message_ids("token-abc")

        assert mock_client.get.call_count == 2
        assert result.ids == ["a", "b", "c"]
        assert result.complete is True
        # Second call must carry the page token.
        second_call = mock_client.get.call_args_list[1]
        assert second_call.kwargs["params"].get("pageToken") == "PAGE2"

    @pytest.mark.anyio
    async def test_reports_incomplete_when_page_cap_is_exhausted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A capped listing must not masquerade as a complete mailbox snapshot."""

        page1 = MagicMock()
        page1.raise_for_status = MagicMock()
        page1.json.return_value = {
            "messages": [{"id": "a"}],
            "nextPageToken": "PAGE2",
        }
        page2 = MagicMock()
        page2.raise_for_status = MagicMock()
        page2.json.return_value = {
            "messages": [{"id": "b"}],
            "nextPageToken": "PAGE3",
        }
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=[page1, page2])
        monkeypatch.setattr("backend.email_service._MAX_ID_PAGES", 2)

        with patch("backend.email_service.httpx.AsyncClient", return_value=mock_client):
            result = await GmailProvider().fetch_message_ids("token-abc")

        assert result.ids == ["a", "b"]
        assert result.complete is False


# ---------------------------------------------------------------------------
# 5. GraphProvider.fetch_message_ids — URL check (mocked httpx)
# ---------------------------------------------------------------------------


class TestGraphProviderFetchMessageIds:
    @pytest.mark.anyio
    async def test_hits_correct_url(self) -> None:
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"value": [{"id": "graph-id-1"}]}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("backend.email_service.httpx.AsyncClient", return_value=mock_client):
            provider = GraphProvider()
            result = await provider.fetch_message_ids("token-xyz")

        mock_client.get.assert_called_once()
        call_args = mock_client.get.call_args
        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        assert "graph.microsoft.com" in url
        assert "Inbox" in url or "messages" in url
        assert result.ids == ["graph-id-1"]
        assert result.complete is True

    @pytest.mark.anyio
    async def test_reports_incomplete_when_page_cap_is_exhausted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Graph pagination caps must also suppress destructive reconciliation."""

        page1 = MagicMock()
        page1.raise_for_status = MagicMock()
        page1.json.return_value = {
            "value": [{"id": "a"}],
            "@odata.nextLink": "https://graph.microsoft.com/page-2",
        }
        page2 = MagicMock()
        page2.raise_for_status = MagicMock()
        page2.json.return_value = {
            "value": [{"id": "b"}],
            "@odata.nextLink": "https://graph.microsoft.com/page-3",
        }
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=[page1, page2])
        monkeypatch.setattr("backend.email_service._MAX_ID_PAGES", 2)

        with patch("backend.email_service.httpx.AsyncClient", return_value=mock_client):
            result = await GraphProvider().fetch_message_ids("token-xyz")

        assert result.ids == ["a", "b"]
        assert result.complete is False


@pytest.mark.anyio
async def test_gmail_send_includes_bcc_header() -> None:
    """Removing the Bcc MIME header would silently drop Gmail BCC recipients."""

    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"id": "sent-1"}
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(return_value=response)

    with patch("backend.email_service.httpx.AsyncClient", return_value=client):
        await GmailProvider().send_message(
            "token",
            {
                "to": ["to@example.com"],
                "bcc": ["hidden@example.com"],
                "subject": "Confidential",
                "body_html": "<p>Hello</p>",
            },
        )

    raw = client.post.call_args.kwargs["json"]["raw"]
    decoded = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    message = email.message_from_bytes(decoded)
    assert message["Bcc"] == "hidden@example.com"


@pytest.mark.anyio
async def test_gmail_archive_removes_inbox_without_adding_fake_label() -> None:
    """Archiving in Gmail means removing INBOX, not adding an ARCHIVE label."""

    provider = GmailProvider()
    provider.update_labels = AsyncMock()

    await provider.move_message("token", "message-1", "archive")

    provider.update_labels.assert_awaited_once_with("token", "message-1", [], ["INBOX"])


@pytest.mark.anyio
async def test_gmail_move_rejects_unknown_folder() -> None:
    provider = GmailProvider()
    provider.update_labels = AsyncMock()

    with pytest.raises(ValueError, match="Unsupported Gmail folder"):
        await provider.move_message("token", "message-1", "arbitrary")

    provider.update_labels.assert_not_awaited()


@pytest.mark.anyio
async def test_gmail_reply_uses_original_rfc_message_id_and_subject() -> None:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {
        "payload": {
            "headers": [
                {"name": "Message-ID", "value": "<original@example.com>"},
                {"name": "Subject", "value": "Original subject"},
            ]
        }
    }
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(return_value=response)
    provider = GmailProvider()
    provider.send_message = AsyncMock(return_value={"id": "reply-1"})

    with patch("backend.email_service.httpx.AsyncClient", return_value=client):
        await provider.reply_message(
            "token",
            "opaque-gmail-api-id",
            {
                "to": ["sender@example.com"],
                "subject": "Edited subject",
                "body_html": "<p>Reply</p>",
                "thread_id": "thread-1",
            },
        )

    sent = provider.send_message.await_args.args[1]
    assert sent["in_reply_to"] == "<original@example.com>"
    assert sent["subject"] == "Original subject"
    assert "opaque-gmail-api-id" not in sent.values()


@pytest.mark.anyio
async def test_graph_trash_uses_deleted_items_well_known_folder() -> None:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"id": "immutable-message-id"}
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(return_value=response)

    with patch("backend.email_service.httpx.AsyncClient", return_value=client):
        moved_id = await GraphProvider().move_message("token", "message-1", "trash")

    assert client.post.call_args.kwargs["json"] == {"destinationId": "deleteditems"}
    assert client.post.call_args.kwargs["headers"]["Prefer"] == 'IdType="ImmutableId"'
    assert moved_id == "immutable-message-id"


@pytest.mark.anyio
async def test_graph_reply_uses_reply_endpoint_and_message_body() -> None:
    """A Graph reply must target the reply action, not put a message ID in replyTo."""

    response = MagicMock()
    response.raise_for_status = MagicMock()
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(return_value=response)

    with patch("backend.email_service.httpx.AsyncClient", return_value=client):
        await GraphProvider().reply_message(
            "token",
            "opaque-provider-message-id",
            {
                "to": ["sender@example.com"],
                "cc": [],
                "body_html": "<p>Reply</p>",
            },
        )

    call = client.post.call_args
    assert call.args[0].endswith("/messages/opaque-provider-message-id/reply")
    assert call.kwargs["json"] == {
        "message": {
            "body": {"contentType": "HTML", "content": "<p>Reply</p>"},
            "toRecipients": [{"emailAddress": {"address": "sender@example.com"}}],
        }
    }


# ---------------------------------------------------------------------------
# 6. Factory function
# ---------------------------------------------------------------------------


class TestGetProvider:
    def test_returns_gmail_provider(self) -> None:
        assert isinstance(get_provider("google"), GmailProvider)

    def test_returns_graph_provider(self) -> None:
        assert isinstance(get_provider("microsoft"), GraphProvider)

    def test_raises_on_unknown_provider(self) -> None:
        with pytest.raises(ValueError, match="Unknown provider"):
            get_provider("yahoo")
