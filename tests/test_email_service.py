"""Tests for the email service: token encryption, unified model, and providers."""

from __future__ import annotations

import base64
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
            ids = await provider.fetch_message_ids("token-abc")

        mock_client.get.assert_called_once()
        call_args = mock_client.get.call_args
        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        assert "gmail.googleapis.com" in url
        assert "messages" in url
        assert ids == ["abc", "def"]


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
            ids = await provider.fetch_message_ids("token-xyz")

        mock_client.get.assert_called_once()
        call_args = mock_client.get.call_args
        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        assert "graph.microsoft.com" in url
        assert "Inbox" in url or "messages" in url
        assert ids == ["graph-id-1"]


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
