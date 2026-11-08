"""Tests for the email service: token encryption, unified model, and providers."""

from __future__ import annotations

import base64
from email import message_from_bytes
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from cryptography.fernet import Fernet

from backend.config import get_settings
from backend.email_service import (
    EmailMessage,
    GmailProvider,
    GraphProvider,
    MailIdListTruncatedError,
    OAuthTokenDecryptionError,
    UnsupportedFolderError,
    UntrustedPageLinkError,
    _decode_rfc2047,
    decrypt_oauth_token,
    encrypt_oauth_token,
    get_provider,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """Drop cached settings before and after each test so keys never leak."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


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
            ids = await provider.fetch_message_ids("token-abc")

        assert mock_client.get.call_count == 2
        assert ids == ["a", "b", "c"]
        # Second call must carry the page token.
        second_call = mock_client.get.call_args_list[1]
        assert second_call.kwargs["params"].get("pageToken") == "PAGE2"


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


# ---------------------------------------------------------------------------
# Shared async-client mocking helpers
# ---------------------------------------------------------------------------


def _resp(body: dict | None = None) -> MagicMock:
    r = MagicMock()
    r.raise_for_status = MagicMock()
    r.json.return_value = body if body is not None else {}
    return r


def _client(get=None, post=None, patch_=None, delete=None) -> AsyncMock:
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    if get is not None:
        client.get = AsyncMock(side_effect=get)
    if post is not None:
        client.post = AsyncMock(side_effect=post)
    if patch_ is not None:
        client.patch = AsyncMock(side_effect=patch_)
    if delete is not None:
        client.delete = AsyncMock(side_effect=delete)
    return client


def _patch_client(client: AsyncMock):
    return patch("backend.email_service.httpx.AsyncClient", return_value=client)


def _decoded_mime(raw: str):
    padded = raw + "=" * (-len(raw) % 4)
    return message_from_bytes(base64.urlsafe_b64decode(padded))


def _gmail_with_headers(
    headers: list[dict],
    *,
    internal_date: str | None = None,
    parts: list[dict] | None = None,
    mime_type: str = "multipart/mixed",
) -> dict:
    payload = {
        "id": "msg-x",
        "threadId": "thread-x",
        "labelIds": ["INBOX"],
        "snippet": "",
        "payload": {
            "headers": headers,
            "mimeType": mime_type,
            "parts": parts or [],
        },
    }
    if internal_date is not None:
        payload["internalDate"] = internal_date
    return payload


# ---------------------------------------------------------------------------
# 7. Strict OAuth token decryption (fails closed)
# ---------------------------------------------------------------------------


class TestStrictTokenDecryption:
    def test_missing_key_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        get_settings.cache_clear()
        monkeypatch.setenv(
            "TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")
        )
        encrypted = encrypt_oauth_token("ya29.token")
        monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", "")
        get_settings.cache_clear()
        with pytest.raises(OAuthTokenDecryptionError):
            decrypt_oauth_token(encrypted)

    def test_wrong_key_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        get_settings.cache_clear()
        monkeypatch.setenv(
            "TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")
        )
        encrypted = encrypt_oauth_token("ya29.token")
        monkeypatch.setenv(
            "TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")
        )
        get_settings.cache_clear()
        with pytest.raises(OAuthTokenDecryptionError):
            decrypt_oauth_token(encrypted)

    def test_tampered_token_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        get_settings.cache_clear()
        monkeypatch.setenv(
            "TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")
        )
        encrypted = encrypt_oauth_token("ya29.token")
        mid = len(encrypted) // 2
        flipped = "A" if encrypted[mid] != "A" else "B"
        tampered = encrypted[:mid] + flipped + encrypted[mid + 1 :]
        with pytest.raises(OAuthTokenDecryptionError):
            decrypt_oauth_token(tampered)

    def test_unprefixed_value_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        get_settings.cache_clear()
        monkeypatch.setenv(
            "TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")
        )
        with pytest.raises(OAuthTokenDecryptionError):
            decrypt_oauth_token("ya29.plaintext-token")

    def test_ciphertext_does_not_contain_plaintext(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        get_settings.cache_clear()
        monkeypatch.setenv(
            "TAKEAWAY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")
        )
        assert "ya29" not in encrypt_oauth_token("ya29.token")


# ---------------------------------------------------------------------------
# 8. Remote id list truncation (ghost detection must be skipped)
# ---------------------------------------------------------------------------


class TestIdListTruncation:
    @pytest.mark.anyio
    async def test_gmail_raises_when_cap_hit_with_token_pending(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("backend.email_service._MAX_ID_PAGES", 1)
        client = _client(
            get=[_resp({"messages": [{"id": "a"}], "nextPageToken": "NEXT"})]
        )
        with _patch_client(client), pytest.raises(MailIdListTruncatedError):
            await GmailProvider().fetch_message_ids("token")

    @pytest.mark.anyio
    async def test_gmail_complete_at_cap_returns_ids(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("backend.email_service._MAX_ID_PAGES", 1)
        client = _client(get=[_resp({"messages": [{"id": "a"}]})])
        with _patch_client(client):
            ids = await GmailProvider().fetch_message_ids("token")
        assert ids == ["a"]

    @pytest.mark.anyio
    async def test_graph_raises_when_cap_hit_with_next_link_pending(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("backend.email_service._MAX_ID_PAGES", 1)
        next_link = "https://graph.microsoft.com/v1.0/me/mailFolders('Inbox')/messages?$skiptoken=abc"
        client = _client(
            get=[_resp({"value": [{"id": "a"}], "@odata.nextLink": next_link})]
        )
        with _patch_client(client), pytest.raises(MailIdListTruncatedError):
            await GraphProvider().fetch_message_ids("token")


# ---------------------------------------------------------------------------
# 9. Graph nextLink origin check and happy-path paging
# ---------------------------------------------------------------------------


class TestGraphNextLinkTrust:
    @pytest.mark.anyio
    @pytest.mark.parametrize(
        "bad_link",
        [
            "https://evil.example/steal",
            "http://graph.microsoft.com/v1.0/me/messages?$skiptoken=x",
            "https://graph.microsoft.com.evil.example/x",
            "https://user@graph.microsoft.com/x",
            "https://graph.microsoft.com:8443/x",
        ],
    )
    async def test_refuses_untrusted_next_link_without_second_request(
        self, bad_link: str
    ) -> None:
        client = _client(
            get=[_resp({"value": [{"id": "a"}], "@odata.nextLink": bad_link})]
        )
        with _patch_client(client), pytest.raises(UntrustedPageLinkError):
            await GraphProvider().fetch_message_ids("token")
        assert client.get.call_count == 1

    @pytest.mark.anyio
    async def test_two_page_happy_path(self) -> None:
        next_link = "https://graph.microsoft.com/v1.0/me/mailFolders('Inbox')/messages?$skiptoken=p2"
        client = _client(
            get=[
                _resp(
                    {"value": [{"id": "a"}, {"id": "b"}], "@odata.nextLink": next_link}
                ),
                _resp({"value": [{"id": "c"}]}),
            ]
        )
        with _patch_client(client):
            ids = await GraphProvider().fetch_message_ids("token")
        assert ids == ["a", "b", "c"]
        second = client.get.call_args_list[1]
        assert second.args[0] == next_link
        assert second.kwargs["params"] is None


# ---------------------------------------------------------------------------
# 10. Bounded fetches
# ---------------------------------------------------------------------------


class TestBoundedFetches:
    @pytest.mark.anyio
    async def test_graph_fetch_messages_sends_top_and_order(self) -> None:
        client = _client(get=[_resp({"value": []})])
        with _patch_client(client):
            await GraphProvider().fetch_messages("token")
        params = client.get.call_args.kwargs["params"]
        assert params["$top"] == 50
        assert params["$orderby"] == "receivedDateTime desc"

    @pytest.mark.anyio
    async def test_gmail_fetch_messages_keeps_order_and_fetches_all(self) -> None:
        def _get(url: str, **_kwargs):
            if url.endswith("/messages"):
                return _resp({"messages": [{"id": "m1"}, {"id": "m2"}, {"id": "m3"}]})
            return _resp({"id": url.rsplit("/", 1)[1]})

        client = _client(get=_get)
        with _patch_client(client):
            messages = await GmailProvider().fetch_messages("token")
        assert [m["id"] for m in messages] == ["m1", "m2", "m3"]

    @pytest.mark.anyio
    async def test_gmail_fetch_messages_propagates_failure(self) -> None:
        def _get(url: str, **_kwargs):
            if url.endswith("/messages"):
                return _resp({"messages": [{"id": "m1"}, {"id": "m2"}]})
            if url.endswith("/m2"):
                raise RuntimeError("boom")
            return _resp({"id": "m1"})

        client = _client(get=_get)
        with _patch_client(client), pytest.raises(RuntimeError, match="boom"):
            await GmailProvider().fetch_messages("token")


# ---------------------------------------------------------------------------
# 11. Move, delete and label semantics
# ---------------------------------------------------------------------------


class TestGmailMoveAndDelete:
    @pytest.mark.anyio
    async def test_archive_removes_inbox_and_adds_nothing(self) -> None:
        client = _client(post=[_resp()])
        with _patch_client(client):
            result = await GmailProvider().move_message("token", "m1", "archive")
        assert result is None
        body = client.post.call_args.kwargs["json"]
        assert body == {"addLabelIds": [], "removeLabelIds": ["INBOX"]}

    @pytest.mark.anyio
    async def test_inbox_clears_trash_and_spam(self) -> None:
        client = _client(post=[_resp()])
        with _patch_client(client):
            await GmailProvider().move_message("token", "m1", "inbox")
        body = client.post.call_args.kwargs["json"]
        assert body == {"addLabelIds": ["INBOX"], "removeLabelIds": ["TRASH", "SPAM"]}

    @pytest.mark.anyio
    @pytest.mark.parametrize("bad_folder", ["unread", "starred", "Inbox; DROP"])
    async def test_unknown_folder_rejected_before_any_call(
        self, bad_folder: str
    ) -> None:
        client = _client(post=[])
        with _patch_client(client), pytest.raises(UnsupportedFolderError):
            await GmailProvider().move_message("token", "m1", bad_folder)
        client.post.assert_not_called()

    @pytest.mark.anyio
    async def test_delete_moves_to_trash_not_permanent(self) -> None:
        client = _client(post=[_resp()], delete=[_resp()])
        with _patch_client(client):
            await GmailProvider().delete_message("token", "m1")
        assert client.post.call_args.args[0].endswith("/messages/m1/trash")
        client.delete.assert_not_called()


class TestGraphMoveAndLabels:
    @pytest.mark.anyio
    @pytest.mark.parametrize(
        ("folder", "destination"),
        [
            ("archive", "archive"),
            ("trash", "deleteditems"),
            ("spam", "junkemail"),
            ("sent", "sentitems"),
            ("drafts", "drafts"),
            ("inbox", "inbox"),
        ],
    )
    async def test_move_maps_to_well_known_and_returns_new_id(
        self, folder: str, destination: str
    ) -> None:
        client = _client(post=[_resp({"id": "new-id"})])
        with _patch_client(client):
            new_id = await GraphProvider().move_message("token", "old-id", folder)
        assert new_id == "new-id"
        assert client.post.call_args.args[0].endswith("/messages/old-id/move")
        assert client.post.call_args.kwargs["json"] == {"destinationId": destination}

    @pytest.mark.anyio
    async def test_move_rejects_unknown_folder(self) -> None:
        client = _client(post=[])
        with _patch_client(client), pytest.raises(UnsupportedFolderError):
            await GraphProvider().move_message("token", "m1", "unread")
        client.post.assert_not_called()

    @pytest.mark.anyio
    async def test_update_labels_fails_loudly(self) -> None:
        with pytest.raises(NotImplementedError):
            await GraphProvider().update_labels("token", "m1", ["Work"], [])


class TestReadAndStar:
    @pytest.mark.anyio
    async def test_gmail_mark_unread_adds_unread_label(self) -> None:
        client = _client(post=[_resp()])
        with _patch_client(client):
            await GmailProvider().set_read("token", "m1", False)
        assert client.post.call_args.args[0].endswith("/messages/m1/modify")
        assert client.post.call_args.kwargs["json"] == {
            "addLabelIds": ["UNREAD"],
            "removeLabelIds": [],
        }

    @pytest.mark.anyio
    async def test_gmail_mark_read_removes_unread_label(self) -> None:
        client = _client(post=[_resp()])
        with _patch_client(client):
            await GmailProvider().set_read("token", "m1", True)
        assert client.post.call_args.kwargs["json"] == {
            "addLabelIds": [],
            "removeLabelIds": ["UNREAD"],
        }

    @pytest.mark.anyio
    async def test_gmail_star_and_unstar(self) -> None:
        client = _client(post=[_resp(), _resp()])
        with _patch_client(client):
            await GmailProvider().set_starred("token", "m1", True)
            await GmailProvider().set_starred("token", "m1", False)
        assert client.post.call_args_list[0].kwargs["json"] == {
            "addLabelIds": ["STARRED"],
            "removeLabelIds": [],
        }
        assert client.post.call_args_list[1].kwargs["json"] == {
            "addLabelIds": [],
            "removeLabelIds": ["STARRED"],
        }

    @pytest.mark.anyio
    async def test_graph_set_read_patches_is_read(self) -> None:
        client = _client(patch_=[_resp()])
        with _patch_client(client):
            await GraphProvider().set_read("token", "g1", True)
        assert client.patch.call_args.args[0].endswith("/messages/g1")
        assert client.patch.call_args.kwargs["json"] == {"isRead": True}

    @pytest.mark.anyio
    async def test_graph_set_starred_uses_flag_status(self) -> None:
        client = _client(patch_=[_resp(), _resp()])
        with _patch_client(client):
            await GraphProvider().set_starred("token", "g1", True)
            await GraphProvider().set_starred("token", "g1", False)
        assert client.patch.call_args_list[0].kwargs["json"] == {
            "flag": {"flagStatus": "flagged"}
        }
        assert client.patch.call_args_list[1].kwargs["json"] == {
            "flag": {"flagStatus": "notFlagged"}
        }


# ---------------------------------------------------------------------------
# 12. Sending: Bcc, reply threading, header safety
# ---------------------------------------------------------------------------


class TestSending:
    @pytest.mark.anyio
    async def test_gmail_bcc_header_is_set(self) -> None:
        client = _client(post=[_resp({"id": "sent-1"})])
        with _patch_client(client):
            await GmailProvider().send_message(
                "token",
                {
                    "to": ["a@example.com"],
                    "cc": [],
                    "bcc": ["sec@example.com"],
                    "subject": "Hi",
                    "body_html": "<p>x</p>",
                },
            )
        mime = _decoded_mime(client.post.call_args.kwargs["json"]["raw"])
        assert mime["Bcc"] == "sec@example.com"

    @pytest.mark.anyio
    async def test_gmail_no_bcc_header_when_empty(self) -> None:
        client = _client(post=[_resp({"id": "sent-1"})])
        with _patch_client(client):
            await GmailProvider().send_message(
                "token", {"to": ["a@example.com"], "subject": "Hi", "body_html": "x"}
            )
        mime = _decoded_mime(client.post.call_args.kwargs["json"]["raw"])
        assert mime["Bcc"] is None

    @pytest.mark.anyio
    async def test_gmail_reply_uses_parent_message_id_and_chain(self) -> None:
        parent = _resp(
            {
                "payload": {
                    "headers": [
                        {"name": "Message-ID", "value": "<parent@mail.gmail.com>"},
                        {"name": "References", "value": "<root@example.com>"},
                    ]
                }
            }
        )
        client = _client(get=[parent], post=[_resp({"id": "sent-2"})])
        with _patch_client(client):
            await GmailProvider().send_message(
                "token",
                {
                    "to": ["a@example.com"],
                    "subject": "Re: Hi",
                    "body_html": "x",
                    "in_reply_to": "gmail-internal-id",
                    "thread_id": "thread-1",
                },
            )
        get_call = client.get.call_args
        assert get_call.args[0].endswith("/messages/gmail-internal-id")
        assert get_call.kwargs["params"]["format"] == "metadata"
        assert get_call.kwargs["params"]["metadataHeaders"] == [
            "Message-ID",
            "References",
        ]
        mime = _decoded_mime(client.post.call_args.kwargs["json"]["raw"])
        assert mime["In-Reply-To"] == "<parent@mail.gmail.com>"
        assert mime["References"] == "<root@example.com> <parent@mail.gmail.com>"
        assert client.post.call_args.kwargs["json"]["threadId"] == "thread-1"

    @pytest.mark.anyio
    async def test_gmail_angle_bracket_reply_ref_is_used_directly(self) -> None:
        client = _client(post=[_resp({"id": "sent-3"})])
        with _patch_client(client):
            await GmailProvider().send_message(
                "token",
                {
                    "to": ["a@example.com"],
                    "body_html": "x",
                    "in_reply_to": "<direct@x>",
                },
            )
        client.get.assert_not_called()
        mime = _decoded_mime(client.post.call_args.kwargs["json"]["raw"])
        assert mime["In-Reply-To"] == "<direct@x>"

    @pytest.mark.anyio
    async def test_gmail_rejects_line_breaks_in_headers(self) -> None:
        client = _client(post=[])
        with _patch_client(client), pytest.raises(ValueError):
            await GmailProvider().send_message(
                "token",
                {"to": ["a@example.com"], "subject": "Hi\r\nBcc: evil@example.com"},
            )
        client.post.assert_not_called()

    @pytest.mark.anyio
    async def test_graph_reply_uses_reply_endpoint_without_reply_to(self) -> None:
        client = _client(post=[_resp()])
        with _patch_client(client):
            result = await GraphProvider().send_message(
                "token",
                {
                    "to": ["a@example.com"],
                    "subject": "Re: Hi",
                    "body_html": "<p>x</p>",
                    "in_reply_to": "graph-msg-1",
                },
            )
        assert result == {}
        url = client.post.call_args.args[0]
        assert url.endswith("/messages/graph-msg-1/reply")
        message = client.post.call_args.kwargs["json"]["message"]
        assert "replyTo" not in message
        assert message["body"]["contentType"] == "HTML"

    @pytest.mark.anyio
    async def test_graph_new_mail_uses_send_mail(self) -> None:
        client = _client(post=[_resp()])
        with _patch_client(client):
            await GraphProvider().send_message(
                "token",
                {"to": ["a@example.com"], "bcc": ["sec@example.com"], "body_html": "x"},
            )
        assert client.post.call_args.args[0].endswith("/sendMail")
        message = client.post.call_args.kwargs["json"]["message"]
        assert message["bccRecipients"] == [
            {"emailAddress": {"address": "sec@example.com"}}
        ]


# ---------------------------------------------------------------------------
# 13. Parsing edge cases
# ---------------------------------------------------------------------------


class TestParsingEdgeCases:
    def test_rfc2047_from_name_and_subject_are_decoded(self) -> None:
        name_b64 = base64.b64encode("Café".encode()).decode()
        subject_b64 = base64.b64encode("Café au lait".encode()).decode()
        payload = _gmail_with_headers(
            [
                {"name": "From", "value": f"=?UTF-8?B?{name_b64}?= <cafe@example.com>"},
                {"name": "Subject", "value": f"=?UTF-8?B?{subject_b64}?="},
                {"name": "Date", "value": "Thu, 10 Apr 2025 12:00:00 +0000"},
            ]
        )
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.from_name == "Café"
        assert msg.subject == "Café au lait"

    def test_plain_ascii_subject_unchanged(self) -> None:
        assert _decode_rfc2047("Plain subject") == "Plain subject"

    def test_undecodable_encoded_word_falls_back_to_raw(self) -> None:
        raw = "=?bogus-charset?Q?x?="
        assert _decode_rfc2047(raw) == raw

    def test_date_is_normalised_to_utc(self) -> None:
        payload = _gmail_with_headers(
            [{"name": "Date", "value": "Thu, 10 Apr 2025 14:00:00 +0200"}]
        )
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.provider_date == "2025-04-10T12:00:00+00:00"

    def test_negative_zero_date_treated_as_utc(self) -> None:
        payload = _gmail_with_headers(
            [{"name": "Date", "value": "Thu, 10 Apr 2025 12:00:00 -0000"}]
        )
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.provider_date == "2025-04-10T12:00:00+00:00"

    def test_missing_date_falls_back_to_internal_date(self) -> None:
        payload = _gmail_with_headers([], internal_date="1744286400000")
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.provider_date == "2025-04-10T12:00:00+00:00"

    def test_unparseable_date_falls_back_to_internal_date(self) -> None:
        payload = _gmail_with_headers(
            [{"name": "Date", "value": "not a date"}], internal_date="1744286400000"
        )
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.provider_date == "2025-04-10T12:00:00+00:00"

    def test_no_usable_date_raises(self) -> None:
        payload = _gmail_with_headers([{"name": "Date", "value": "garbage"}])
        with pytest.raises(ValueError):
            EmailMessage.from_gmail(payload, account_id="a", user_id="u")

    def test_malformed_base64_body_becomes_empty(self) -> None:
        payload = _gmail_with_headers(
            [{"name": "Date", "value": "Thu, 10 Apr 2025 12:00:00 +0000"}],
            parts=[{"mimeType": "text/plain", "body": {"data": "A"}}],
            mime_type="text/plain",
        )
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.body_text == ""

    def test_nested_attachment_is_detected(self) -> None:
        pdf = {
            "mimeType": "application/pdf",
            "filename": "invoice.pdf",
            "headers": [{"name": "Content-Disposition", "value": "attachment"}],
            "body": {"attachmentId": "att-1", "size": 10},
        }
        related = {"mimeType": "multipart/related", "parts": [pdf]}
        payload = _gmail_with_headers(
            [{"name": "Date", "value": "Thu, 10 Apr 2025 12:00:00 +0000"}],
            parts=[
                {"mimeType": "multipart/alternative", "parts": []},
                {"mimeType": "multipart/mixed", "parts": [related]},
            ],
        )
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.has_attachments is True
        assert [a["filename"] for a in msg.attachments_meta] == ["invoice.pdf"]

    def test_inline_content_id_image_is_not_an_attachment(self) -> None:
        logo = {
            "mimeType": "image/png",
            "filename": "logo.png",
            "headers": [{"name": "Content-ID", "value": "<logo@x>"}],
            "body": {"attachmentId": "att-logo", "size": 5},
        }
        payload = _gmail_with_headers(
            [{"name": "Date", "value": "Thu, 10 Apr 2025 12:00:00 +0000"}],
            parts=[{"mimeType": "multipart/related", "parts": [logo]}],
        )
        msg = EmailMessage.from_gmail(payload, account_id="a", user_id="u")
        assert msg.has_attachments is False
        assert msg.attachments_meta == []


class TestGraphNullSafety:
    def test_null_sender_and_recipients_do_not_raise(self) -> None:
        payload = _graph_payload()
        payload["from"] = None
        payload["toRecipients"] = [{"emailAddress": None}]
        payload["flag"] = None
        msg = EmailMessage.from_graph(payload, account_id="a", user_id="u")
        assert msg.from_address == ""
        assert msg.from_name == ""
        assert msg.to_addresses == [{"name": "", "address": ""}]
        assert msg.is_starred is False


# ---------------------------------------------------------------------------
# 14. Provider factory typing contract
# ---------------------------------------------------------------------------


class TestProviderContract:
    def test_both_providers_expose_the_protocol_methods(self) -> None:
        for provider in (GmailProvider(), GraphProvider()):
            for name in (
                "fetch_messages",
                "fetch_message_html",
                "send_message",
                "move_message",
                "update_labels",
                "set_read",
                "set_starred",
                "delete_message",
                "fetch_message_ids",
            ):
                assert callable(getattr(provider, name))
