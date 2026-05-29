import pytest

from backend.email_schemas import (
    ComposeEmailRequest,
    EmailAccountResponse,
    EmailMessageResponse,
    LabelEmailRequest,
    MoveEmailRequest,
)


def test_email_account_response_from_dict():
    data = {
        "id": "abc-123",
        "provider": "google",
        "email_address": "raoof@gmail.com",
        "status": "connected",
        "created_at": "2026-04-10T10:00:00Z",
    }
    account = EmailAccountResponse(**data)
    assert account.provider == "google"
    assert account.email_address == "raoof@gmail.com"


def test_email_message_response_from_dict():
    data = {
        "id": "msg-1",
        "account_id": "acct-1",
        "provider_id": "gmail-123",
        "thread_id": "thread-1",
        "folder": "inbox",
        "labels": ["work"],
        "from_address": "jane@citadel.com",
        "from_name": "Jane",
        "to_addresses": [{"name": "Raouf", "email": "raoof@gmail.com"}],
        "cc_addresses": [],
        "subject": "Interview follow-up",
        "snippet": "Hi Raouf, thanks for...",
        "is_read": False,
        "is_starred": False,
        "has_attachments": False,
        "attachments_meta": [],
        "provider_date": "2026-04-10T09:00:00Z",
    }
    msg = EmailMessageResponse(**data)
    assert msg.subject == "Interview follow-up"
    assert msg.is_read is False


def test_compose_email_request_strips_whitespace():
    req = ComposeEmailRequest(
        account_id="acct-1",
        to=["  jane@citadel.com  "],
        subject="  Hello  ",
        body_html="<p>Hi</p>",
    )
    assert req.subject == "Hello"
    assert req.to == ["jane@citadel.com"]


def test_compose_email_request_rejects_empty_to():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ComposeEmailRequest(
            account_id="acct-1",
            to=[],
            subject="Hello",
            body_html="<p>Hi</p>",
        )


def test_compose_email_request_rejects_malformed_recipient():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ComposeEmailRequest(
            account_id="acct-1",
            to=["not-an-email"],
            subject="Hello",
            body_html="<p>Hi</p>",
        )


def test_compose_email_request_validates_cc_and_bcc():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ComposeEmailRequest(
            account_id="acct-1",
            to=["jane@citadel.com"],
            cc=["broken@@nope"],
            subject="Hello",
            body_html="<p>Hi</p>",
        )

    # Valid multi-recipient payload passes and is normalised.
    req = ComposeEmailRequest(
        account_id="acct-1",
        to=["jane@citadel.com"],
        cc=["  bob@acme.io  "],
        bcc=["sec@nexus.net"],
        subject="Hello",
        body_html="<p>Hi</p>",
    )
    assert req.cc == ["bob@acme.io"]
    assert req.bcc == ["sec@nexus.net"]


def test_move_email_request_validates_folder():
    req = MoveEmailRequest(folder="archive")
    assert req.folder == "archive"


def test_label_email_request():
    req = LabelEmailRequest(add=["work"], remove=["personal"])
    assert req.add == ["work"]
    assert req.remove == ["personal"]
