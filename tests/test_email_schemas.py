import pytest
from litestar import Litestar, post
from litestar.params import JSONBody
from litestar.status_codes import HTTP_201_CREATED, HTTP_400_BAD_REQUEST
from litestar.testing import TestClient
from pydantic import ValidationError

from backend.email_schemas import (
    MAX_RECIPIENTS_PER_MESSAGE,
    AIDraftRequest,
    AISummarizeRequest,
    ComposeEmailRequest,
    EmailAccountResponse,
    EmailMessageResponse,
    Folder,
    LabelEmailRequest,
    MoveEmailRequest,
    ReadEmailRequest,
    ToggleStarRequest,
)


def _compose(**overrides):
    payload = {
        "account_id": "acct-1",
        "to": ["jane@citadel.com"],
        "subject": "Hello",
        "body_html": "<p>Hi</p>",
    }
    payload.update(overrides)
    return ComposeEmailRequest(**payload)


# --- Response models ---------------------------------------------------------


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


# --- ComposeEmailRequest: basic shape ----------------------------------------


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
    with pytest.raises(ValidationError):
        _compose(to=[])


def test_compose_email_request_rejects_malformed_recipient():
    with pytest.raises(ValidationError):
        _compose(to=["not-an-email"])


def test_compose_email_request_validates_cc_and_bcc():
    with pytest.raises(ValidationError):
        _compose(cc=["broken@@nope"])

    # Valid multi-recipient payload passes and is normalised.
    req = _compose(cc=["  bob@acme.io  "], bcc=["sec@nexus.net"])
    assert req.cc == ["bob@acme.io"]
    assert req.bcc == ["sec@nexus.net"]


# --- Recipients: non-string entries are rejected, not dropped ----------------


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("to", [123, "x@y.io"]),
        ("to", [None]),
        ("cc", [None]),
        ("bcc", [["nested@x.io"]]),
    ],
)
def test_non_string_recipient_entries_are_rejected(field, value):
    with pytest.raises(ValidationError):
        _compose(**{field: value})


def test_blank_recipient_entries_are_still_skipped():
    req = _compose(to=["", "  ", "jane@citadel.com"])
    assert req.to == ["jane@citadel.com"]


# --- Recipients: address validation ------------------------------------------


@pytest.mark.parametrize(
    "bad",
    [
        'a@b.c>,"x"<y.z',  # display-name / separator injection
        "bob<bob@x.com>",  # display-name form is not a bare address
        "a b@x.com",  # whitespace inside the address
    ],
)
def test_recipients_must_be_bare_addresses(bad):
    with pytest.raises(ValidationError):
        _compose(to=[bad])


def test_recipient_with_trailing_newline_is_normalised_when_clean():
    req = _compose(to=["jane@citadel.com\n"])
    assert req.to == ["jane@citadel.com"]


def test_recipient_domain_is_kept_as_punycode():
    req = _compose(to=["jane@bücher.example"])
    assert req.to == ["jane@xn--bcher-kva.example"]


@pytest.mark.parametrize(
    "bad",
    [
        '"a"@x.io',  # quoted local part
        '"a,b"@x.io',  # quoted local part with separator
        "a\x0bb@x.io",  # control character in local part
        "a\r@x.io",  # CR in local part
        "用户@example.io",  # non-ASCII local part (SMTPUTF8)
        "u@localhost",  # special-use domain
        "u@x.test",  # special-use domain
        "u@x_y.io",  # underscore in domain
    ],
)
def test_recipients_outside_the_ascii_address_subset_are_rejected(bad):
    with pytest.raises(ValidationError):
        _compose(to=[bad])


# --- Recipients: frontend string form and deduplication ----------------------


def test_comma_or_semicolon_separated_string_is_split():
    req = _compose(to="a@x.io, b@y.io; c@z.io", cc="")
    assert req.to == ["a@x.io", "b@y.io", "c@z.io"]
    assert req.cc == []


def test_duplicate_recipients_are_removed_case_insensitively():
    req = _compose(to=["Jane@Citadel.com", "jane@citadel.com", "bob@acme.io"])
    assert req.to == ["Jane@citadel.com", "bob@acme.io"]


# --- Recipients: size limits -------------------------------------------------


def test_recipient_list_over_combined_limit_is_rejected():
    too_many = [f"user{i}@example.com" for i in range(MAX_RECIPIENTS_PER_MESSAGE)]
    with pytest.raises(ValidationError):
        _compose(to=too_many, cc=["extra@example.com"])


def test_recipient_list_at_combined_limit_is_accepted():
    at_limit = [f"user{i}@example.com" for i in range(MAX_RECIPIENTS_PER_MESSAGE)]
    req = _compose(to=at_limit)
    assert len(req.to) == MAX_RECIPIENTS_PER_MESSAGE


def test_duplicates_do_not_count_toward_the_limit():
    repeated = ["same@example.com"] * (MAX_RECIPIENTS_PER_MESSAGE + 10)
    req = _compose(to=repeated)
    assert req.to == ["same@example.com"]


# --- Subject: control characters ---------------------------------------------


@pytest.mark.parametrize(
    "subject",
    [
        "Hi\r\nBcc: evil@attacker.test",
        "Hi\nBcc: x",
        "Hi\x00",
        "Hi\x0bthere",  # vertical tab (Cc)
        "Hi\x7fthere",  # delete (Cc)
        "Hi\x85there",  # next line (Cc)
        "Hi there",  # line separator (Zl)
        "Hi there",  # paragraph separator (Zp)
    ],
)
def test_subject_with_control_or_line_break_characters_is_rejected(subject):
    with pytest.raises(ValidationError):
        _compose(subject=subject)


def test_subject_with_tab_is_allowed():
    assert _compose(subject="Quarterly\tupdate").subject == "Quarterly\tupdate"


@pytest.mark.parametrize("key", ["thread_id", "threadId"])
def test_thread_id_with_line_break_is_rejected(key):
    with pytest.raises(ValidationError):
        _compose(**{key: "thr\r\nBcc: x"})


def test_thread_id_length_is_bounded():
    assert _compose(thread_id="t" * 128).thread_id == "t" * 128
    with pytest.raises(ValidationError):
        _compose(thread_id="t" * 129)


def test_account_id_length_and_control_characters_are_bounded():
    with pytest.raises(ValidationError):
        _compose(account_id="")
    with pytest.raises(ValidationError):
        _compose(account_id="a" * 129)
    with pytest.raises(ValidationError):
        _compose(account_id="acct\n1")


def test_subject_length_limit():
    with pytest.raises(ValidationError):
        _compose(subject="x" * 999)


# --- in_reply_to: server-derived, never client-supplied ----------------------


@pytest.mark.parametrize("key", ["in_reply_to", "inReplyTo"])
def test_client_supplied_in_reply_to_is_rejected(key):
    with pytest.raises(ValidationError):
        _compose(**{key: "<abc@mail.example>"})


def test_in_reply_to_defaults_to_none_and_is_not_serialised():
    req = _compose()
    assert req.in_reply_to is None
    assert "in_reply_to" not in req.model_dump()


# --- Wire contract: the frontend payload shape -------------------------------


def test_frontend_camel_case_payload_is_accepted():
    req = ComposeEmailRequest.model_validate(
        {
            "accountId": "acct-1",
            "to": "a@x.io, b@y.io",
            "cc": "",
            "subject": "Hello",
            "body": "<p>Hi</p>",
        }
    )
    assert req.account_id == "acct-1"
    assert req.to == ["a@x.io", "b@y.io"]
    assert req.body_html == "<p>Hi</p>"


def test_snake_case_payload_is_still_accepted():
    req = _compose(body_html="<p>Hi</p>")
    assert req.account_id == "acct-1"


def test_unknown_keys_are_rejected():
    with pytest.raises(ValidationError):
        _compose(bodyy="typo")
    with pytest.raises(ValidationError):
        _compose(in_reply_too="<x@y.io>")


# --- Move / folder allow-list ------------------------------------------------


def test_move_email_request_accepts_known_folder():
    req = MoveEmailRequest(folder="archive")
    assert req.folder == Folder.ARCHIVE


@pytest.mark.parametrize("folder", ["starred", "deleted", "", "../etc", "Inbox "])
def test_move_email_request_rejects_unknown_folder(folder):
    with pytest.raises(ValidationError):
        MoveEmailRequest(folder=folder)


# --- Labels ------------------------------------------------------------------


def test_label_email_request():
    req = LabelEmailRequest(add=["work"], remove=["personal"])
    assert req.add == ["work"]
    assert req.remove == ["personal"]


def test_label_over_length_is_rejected():
    with pytest.raises(ValidationError):
        LabelEmailRequest(add=["x" * 101])


def test_label_list_over_limit_is_rejected():
    with pytest.raises(ValidationError):
        LabelEmailRequest(add=[f"l{i}" for i in range(51)])
    with pytest.raises(ValidationError):
        LabelEmailRequest(remove=[f"l{i}" for i in range(51)])


@pytest.mark.parametrize("label", ["", "   "])
def test_blank_label_is_rejected(label):
    with pytest.raises(ValidationError):
        LabelEmailRequest(add=[label])


def test_label_in_both_add_and_remove_is_rejected():
    with pytest.raises(ValidationError):
        LabelEmailRequest(add=["Work"], remove=["work"])


# --- Read / star / AI request models -----------------------------------------


def test_read_and_star_requests_reject_unknown_keys():
    assert ReadEmailRequest(is_read=True).is_read is True
    assert ToggleStarRequest(is_starred=False).is_starred is False
    with pytest.raises(ValidationError):
        ReadEmailRequest(is_read=True, extra_key=1)
    with pytest.raises(ValidationError):
        ToggleStarRequest(is_starred=True, extra_key=1)


def test_ai_draft_request_bounds():
    req = AIDraftRequest(email_id="e1", instruction="  be brief  ")
    assert req.instruction == "be brief"
    with pytest.raises(ValidationError):
        AIDraftRequest(email_id="")
    with pytest.raises(ValidationError):
        AIDraftRequest(email_id="e1", instruction="x" * 501)


def test_ai_summarize_request_bounds():
    assert AISummarizeRequest(email_ids=["a"]).email_ids == ["a"]
    with pytest.raises(ValidationError):
        AISummarizeRequest(email_ids=[])
    with pytest.raises(ValidationError):
        AISummarizeRequest(email_ids=[str(i) for i in range(21)])
    with pytest.raises(ValidationError):
        AISummarizeRequest(email_ids=[""])
    with pytest.raises(ValidationError):
        AISummarizeRequest(email_ids=["x" * 129])


def test_ai_draft_email_id_is_bounded_and_required():
    with pytest.raises(ValidationError):
        AIDraftRequest(instruction="no id")
    with pytest.raises(ValidationError):
        AIDraftRequest(email_id="x" * 129)


# --- Status code through Litestar --------------------------------------------


@post("/compose")
async def _compose_handler(data: JSONBody[ComposeEmailRequest]) -> dict:
    return {"account_id": data.account_id, "to": data.to}


@post("/move")
async def _move_handler(data: JSONBody[MoveEmailRequest]) -> dict:
    return {"folder": data.folder.value}


@pytest.fixture
def compose_client():
    with TestClient(
        app=Litestar(route_handlers=[_compose_handler, _move_handler])
    ) as client:
        yield client


def test_frontend_payload_is_accepted_over_http(compose_client):
    resp = compose_client.post(
        "/compose",
        json={
            "accountId": "acct-1",
            "to": "a@x.io, b@y.io",
            "cc": "",
            "subject": "Hello",
            "body": "<p>Hi</p>",
        },
    )
    assert resp.status_code == HTTP_201_CREATED
    assert resp.json() == {"account_id": "acct-1", "to": ["a@x.io", "b@y.io"]}


def test_non_string_recipient_returns_400_over_http(compose_client):
    resp = compose_client.post(
        "/compose",
        json={
            "accountId": "acct-1",
            "to": [123, "x@y.io"],
            "subject": "Hello",
            "body": "<p>Hi</p>",
        },
    )
    assert resp.status_code == HTTP_400_BAD_REQUEST


def test_crlf_subject_returns_400_over_http(compose_client):
    resp = compose_client.post(
        "/compose",
        json={
            "accountId": "acct-1",
            "to": "a@x.io",
            "subject": "Hi\r\nBcc: evil@attacker.test",
            "body": "<p>Hi</p>",
        },
    )
    assert resp.status_code == HTTP_400_BAD_REQUEST


def test_client_in_reply_to_returns_400_over_http(compose_client):
    resp = compose_client.post(
        "/compose",
        json={
            "accountId": "acct-1",
            "to": "a@x.io",
            "subject": "Hi",
            "body": "<p>Hi</p>",
            "inReplyTo": "<abc@mail.example>",
        },
    )
    assert resp.status_code == HTTP_400_BAD_REQUEST


def test_unknown_folder_returns_400_over_http(compose_client):
    resp = compose_client.post("/move", json={"folder": "starred"})
    assert resp.status_code == HTTP_400_BAD_REQUEST


def test_known_folder_is_accepted_over_http(compose_client):
    resp = compose_client.post("/move", json={"folder": "archive"})
    assert resp.status_code == HTTP_201_CREATED
    assert resp.json() == {"folder": "archive"}
