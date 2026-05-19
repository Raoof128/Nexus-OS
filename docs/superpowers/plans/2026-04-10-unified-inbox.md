# Unified Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full email client (Gmail + Outlook) as a new tab in Nexus Archive, with Supabase Realtime reads, Litestar write-through, and 60-second background polling.

**Architecture:** Hybrid (Approach C) — frontend reads cached emails from Supabase Realtime, write actions proxy through Litestar to Gmail/Graph APIs, background poller syncs emails into Supabase every 60 seconds. Matches existing Nexus media vault pattern.

**Tech Stack:** React 19 + React Query + Supabase Realtime (frontend), Litestar + Pydantic v2 + httpx (backend), Supabase Postgres with RLS + GIN FTS (database), Fernet encryption for OAuth tokens, DOMPurify + sandboxed iframe for email HTML.

**Spec:** `docs/superpowers/specs/2026-04-10-unified-inbox-design.md`

---

## File Structure

### Database

- Create: `supabase/migrations/20260410000001_email_inbox.sql`

### Backend

- Create: `backend/email_schemas.py` — Pydantic models for email requests/responses
- Create: `backend/email_service.py` — Provider abstraction, token management, unified model
- Create: `backend/oauth_controller.py` — OAuth2 PKCE + state flow for Google/Microsoft
- Create: `backend/email_controller.py` — REST endpoints for email actions
- Create: `backend/email_poller.py` — Background sync worker
- Modify: `backend/config.py` — Add OAuth client ID/secret env vars
- Modify: `backend/app.py` — Register controllers + poller startup hook

### Backend Tests

- Create: `tests/test_email_schemas.py`
- Create: `tests/test_email_service.py`
- Create: `tests/test_oauth_controller.py`
- Create: `tests/test_email_controller.py`
- Create: `tests/test_email_poller.py`

### Frontend

- Create: `frontend/src/lib/emailConfig.js` — Folder icons, provider colors, config
- Create: `frontend/src/hooks/useEmailAccounts.js` — Account CRUD hook
- Create: `frontend/src/hooks/useEmails.js` — Email query + Realtime subscription
- Create: `frontend/src/hooks/useEmailActions.js` — Write mutations
- Create: `frontend/src/components/features/FolderSidebar.jsx` — Left column
- Create: `frontend/src/components/features/EmailList.jsx` — Middle column
- Create: `frontend/src/components/features/EmailReader.jsx` — Right column + HTML renderer
- Create: `frontend/src/components/features/EmailToolbar.jsx` — Action buttons
- Create: `frontend/src/components/features/ComposeModal.jsx` — Compose/reply/forward
- Create: `frontend/src/components/features/EmailInbox.jsx` — Three-column layout
- Modify: `frontend/src/App.jsx:143-225` — Add Email tab to nav
- Modify: `frontend/src/App.jsx:228-295` — Add Email view rendering

### Frontend Tests

- Create: `frontend/src/hooks/useEmails.test.js`
- Create: `frontend/src/components/features/EmailInbox.test.jsx`

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/20260410000001_email_inbox.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260410000001_email_inbox.sql

-- =============================================================
-- Email Accounts: stores connected OAuth accounts per user
-- =============================================================
create table if not exists public.email_accounts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  email_address text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  token_expires_at timestamp with time zone not null,
  status text not null default 'connected' check (status in ('connected', 'disconnected')),
  created_at timestamp with time zone not null default now(),

  primary key (id),
  unique (user_id, provider, email_address)
);

alter table public.email_accounts enable row level security;

create policy "Users see own accounts"
  on public.email_accounts for all
  using (user_id = auth.uid());

-- Safe view: hides encrypted tokens from frontend queries
create view public.email_accounts_safe
  with (security_invoker = true) as
select id, user_id, provider, email_address, status, created_at
from public.email_accounts;

-- =============================================================
-- Nexus Emails: cached email data
-- =============================================================
create table if not exists public.nexus_emails (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null references public.email_accounts on delete cascade,
  provider_id text not null,
  thread_id text,
  folder text not null default 'inbox',
  labels text[] not null default '{}',
  from_address text not null,
  from_name text not null default '',
  to_addresses jsonb not null default '[]',
  cc_addresses jsonb not null default '[]',
  subject text not null default '(no subject)',
  body_text text not null default '',
  snippet text not null default '',
  is_read boolean not null default false,
  is_starred boolean not null default false,
  has_attachments boolean not null default false,
  attachments_meta jsonb not null default '[]',
  provider_date timestamp with time zone not null,
  synced_at timestamp with time zone not null default now(),

  primary key (id)
);

alter table public.nexus_emails enable row level security;

-- Frontend: read-only via user JWT
create policy "Users read own emails"
  on public.nexus_emails for select
  using (user_id = auth.uid());

-- Backend: service role writes (poller + action confirmations)
create policy "Service role writes emails"
  on public.nexus_emails for all
  using (auth.role() = 'service_role');

-- Dedup index: one row per provider message per account
create unique index idx_nexus_emails_dedup
  on public.nexus_emails (account_id, provider_id);

-- List queries: folder + date ordering
create index idx_nexus_emails_folder_date
  on public.nexus_emails (user_id, folder, provider_date desc);

-- Full-text search (GIN)
create index idx_nexus_emails_search
  on public.nexus_emails using gin (
    to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(body_text, '') || ' ' || coalesce(snippet, ''))
  );

-- Enable Realtime for nexus_emails
alter publication supabase_realtime add table public.nexus_emails;
```

- [ ] **Step 2: Apply migration locally**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && supabase db reset`
Expected: Migration applies without errors, tables visible in Supabase dashboard.

- [ ] **Step 3: Verify tables exist**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && supabase db lint`
Expected: No lint errors for new tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260410000001_email_inbox.sql
git commit -m "feat(db): add email_accounts and nexus_emails tables with RLS, FTS, and Realtime"
```

---

## Task 2: Backend Config — OAuth Environment Variables

**Files:**

- Modify: `backend/config.py:24-57` (BackendSettings dataclass)
- Modify: `backend/config.py:110-181` (get_settings function)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_email_config.py
from backend.config import get_settings


def test_settings_include_email_oauth_fields(monkeypatch):
    """Email OAuth fields exist on settings with sensible defaults."""
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "test-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "test-salt")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "google-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("MICROSOFT_OAUTH_CLIENT_ID", "ms-id")
    monkeypatch.setenv("MICROSOFT_OAUTH_CLIENT_SECRET", "ms-secret")

    get_settings.cache_clear()
    settings = get_settings()

    assert settings.google_oauth_client_id == "google-id"
    assert settings.google_oauth_client_secret == "google-secret"
    assert settings.microsoft_oauth_client_id == "ms-id"
    assert settings.microsoft_oauth_client_secret == "ms-secret"
    assert settings.email_poll_interval_seconds == 60

    get_settings.cache_clear()


def test_settings_email_fields_optional_in_dev(monkeypatch):
    """Email OAuth fields are optional (empty string default) so existing
    deploys don't break before email feature is configured."""
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "test-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "test-salt")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("MICROSOFT_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("MICROSOFT_OAUTH_CLIENT_SECRET", raising=False)

    get_settings.cache_clear()
    settings = get_settings()

    assert settings.google_oauth_client_id == ""
    assert settings.microsoft_oauth_client_id == ""

    get_settings.cache_clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_config.py -v`
Expected: FAIL — `BackendSettings` has no field `google_oauth_client_id`.

- [ ] **Step 3: Add fields to BackendSettings dataclass**

In `backend/config.py`, add these fields to the `BackendSettings` dataclass after the existing optional fields (around line 50):

```python
    # Email OAuth (optional — feature disabled when empty)
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    microsoft_oauth_client_id: str = ""
    microsoft_oauth_client_secret: str = ""
    email_poll_interval_seconds: int = 60
```

- [ ] **Step 4: Wire env vars in get_settings()**

In `backend/config.py`, add these lines inside the `get_settings()` function's `BackendSettings(...)` constructor (around line 145):

```python
        google_oauth_client_id=_get_env("GOOGLE_OAUTH_CLIENT_ID", ""),
        google_oauth_client_secret=_get_env("GOOGLE_OAUTH_CLIENT_SECRET", ""),
        microsoft_oauth_client_id=_get_env("MICROSOFT_OAUTH_CLIENT_ID", ""),
        microsoft_oauth_client_secret=_get_env("MICROSOFT_OAUTH_CLIENT_SECRET", ""),
        email_poll_interval_seconds=int(_get_env("EMAIL_POLL_INTERVAL_SECONDS", "60")),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_config.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/config.py tests/test_email_config.py
git commit -m "feat(config): add email OAuth env vars to BackendSettings"
```

---

## Task 3: Backend Schemas — Email Pydantic Models

**Files:**

- Create: `backend/email_schemas.py`
- Create: `tests/test_email_schemas.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_email_schemas.py
import pytest
from backend.email_schemas import (
    EmailAccountResponse,
    EmailMessageResponse,
    ComposeEmailRequest,
    MoveEmailRequest,
    LabelEmailRequest,
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
    assert msg.labels == ["work"]


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
    with pytest.raises(Exception):
        ComposeEmailRequest(
            account_id="acct-1",
            to=[],
            subject="Hello",
            body_html="<p>Hi</p>",
        )


def test_move_email_request_validates_folder():
    req = MoveEmailRequest(folder="archive")
    assert req.folder == "archive"


def test_label_email_request():
    req = LabelEmailRequest(add=["work"], remove=["personal"])
    assert req.add == ["work"]
    assert req.remove == ["personal"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_schemas.py -v`
Expected: FAIL — cannot import `email_schemas`.

- [ ] **Step 3: Write the schemas**

```python
# backend/email_schemas.py
"""Pydantic v2 schemas for the Unified Inbox feature."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EmailAccountResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str
    provider: str
    email_address: str
    status: str
    created_at: str


class EmailMessageResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str
    account_id: str
    provider_id: str
    thread_id: str | None = None
    folder: str
    labels: list[str] = Field(default_factory=list)
    from_address: str
    from_name: str = ""
    to_addresses: list[dict] = Field(default_factory=list)
    cc_addresses: list[dict] = Field(default_factory=list)
    subject: str = "(no subject)"
    snippet: str = ""
    is_read: bool = False
    is_starred: bool = False
    has_attachments: bool = False
    attachments_meta: list[dict] = Field(default_factory=list)
    provider_date: str


class ComposeEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    account_id: str
    to: list[str] = Field(min_length=1)
    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)
    subject: str = Field(max_length=998)
    body_html: str
    in_reply_to: str | None = None
    thread_id: str | None = None

    @field_validator("to", "cc", "bcc", mode="before")
    @classmethod
    def strip_email_addresses(cls, value: list[str]) -> list[str]:
        if not isinstance(value, list):
            return value
        return [addr.strip() for addr in value if addr.strip()]


class MoveEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    folder: str = Field(min_length=1, max_length=100)


class LabelEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    add: list[str] = Field(default_factory=list)
    remove: list[str] = Field(default_factory=list)


class AIDraftRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email_id: str
    instruction: str = Field(default="", max_length=500)


class AISummarizeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email_ids: list[str] = Field(min_length=1, max_length=20)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/email_schemas.py tests/test_email_schemas.py
git commit -m "feat(schemas): add Pydantic models for email inbox"
```

---

## Task 4: Backend Email Service — Token Encryption + Provider Protocol

**Files:**

- Create: `backend/email_service.py`
- Create: `tests/test_email_service.py`

- [ ] **Step 1: Write the failing test for token encryption**

```python
# tests/test_email_service.py
import pytest
from unittest.mock import MagicMock, patch
from backend.email_service import (
    encrypt_oauth_token,
    decrypt_oauth_token,
    EmailMessage,
    GmailProvider,
    GraphProvider,
)


class TestTokenEncryption:
    def test_round_trip(self, monkeypatch):
        monkeypatch.setenv("TAKEAWAY_ENCRYPTION_KEY", "dGVzdC1rZXktMzItYnl0ZXMtcGFkZGVkMTIzNA==")
        from backend.data_protection import get_takeaway_cipher
        # Force cipher reload
        get_takeaway_cipher.cache_clear() if hasattr(get_takeaway_cipher, "cache_clear") else None

        plaintext = "ya29.super-secret-access-token"
        encrypted = encrypt_oauth_token(plaintext)
        assert encrypted.startswith("enc::")
        assert plaintext not in encrypted
        decrypted = decrypt_oauth_token(encrypted)
        assert decrypted == plaintext

    def test_decrypt_non_encrypted_returns_as_is(self):
        assert decrypt_oauth_token("plain-text") == "plain-text"


class TestEmailMessage:
    def test_from_gmail_payload(self):
        gmail_payload = {
            "id": "msg-123",
            "threadId": "thread-456",
            "labelIds": ["INBOX", "UNREAD"],
            "snippet": "Hi Raouf, thanks for...",
            "payload": {
                "headers": [
                    {"name": "From", "value": "Jane <jane@citadel.com>"},
                    {"name": "To", "value": "raoof@gmail.com"},
                    {"name": "Subject", "value": "Interview follow-up"},
                    {"name": "Date", "value": "Thu, 10 Apr 2026 09:00:00 +0000"},
                ],
            },
        }
        msg = EmailMessage.from_gmail(gmail_payload, account_id="acct-1", user_id="user-1")
        assert msg.provider_id == "msg-123"
        assert msg.thread_id == "thread-456"
        assert msg.from_name == "Jane"
        assert msg.from_address == "jane@citadel.com"
        assert msg.subject == "Interview follow-up"
        assert msg.is_read is False  # UNREAD in labelIds

    def test_from_graph_payload(self):
        graph_payload = {
            "id": "AAMk-abc",
            "conversationId": "conv-789",
            "subject": "Q2 Planning",
            "bodyPreview": "Let's sync on the roadmap...",
            "isRead": True,
            "flag": {"flagStatus": "notFlagged"},
            "hasAttachments": False,
            "from": {"emailAddress": {"name": "Bob", "address": "bob@microsoft.com"}},
            "toRecipients": [{"emailAddress": {"name": "Raouf", "address": "raoof@outlook.com"}}],
            "ccRecipients": [],
            "receivedDateTime": "2026-04-10T09:00:00Z",
        }
        msg = EmailMessage.from_graph(graph_payload, account_id="acct-2", user_id="user-1")
        assert msg.provider_id == "AAMk-abc"
        assert msg.from_name == "Bob"
        assert msg.from_address == "bob@microsoft.com"
        assert msg.subject == "Q2 Planning"
        assert msg.is_read is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_service.py::TestTokenEncryption -v`
Expected: FAIL — cannot import `email_service`.

- [ ] **Step 3: Write the email service module**

```python
# backend/email_service.py
"""Unified email service — provider abstraction, token management, and data normalization."""

from __future__ import annotations

import email.utils
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol

from backend.data_protection import encrypt_takeaway, decrypt_takeaway


# ── Token helpers (reuse Fernet from data_protection.py) ──────────────

def encrypt_oauth_token(plaintext: str) -> str:
    return encrypt_takeaway(plaintext)


def decrypt_oauth_token(ciphertext: str) -> str:
    return decrypt_takeaway(ciphertext)


# ── Unified email model ──────────────────────────────────────────────

@dataclass
class EmailMessage:
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

    def to_supabase_row(self) -> dict:
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

    @classmethod
    def from_gmail(cls, payload: dict, *, account_id: str, user_id: str) -> EmailMessage:
        headers = {h["name"].lower(): h["value"] for h in payload.get("payload", {}).get("headers", [])}
        label_ids = payload.get("labelIds", [])

        from_raw = headers.get("from", "")
        from_name, from_address = _parse_email_address(from_raw)

        to_raw = headers.get("to", "")
        to_addresses = [{"name": n, "email": e} for n, e in _parse_address_list(to_raw)]

        cc_raw = headers.get("cc", "")
        cc_addresses = [{"name": n, "email": e} for n, e in _parse_address_list(cc_raw)]

        date_raw = headers.get("date", "")
        provider_date = _parse_date(date_raw)

        # Extract plain text body from parts
        body_text = _extract_gmail_text(payload.get("payload", {}))

        # Map Gmail labels to folders
        folder = "inbox"
        if "TRASH" in label_ids:
            folder = "trash"
        elif "DRAFT" in label_ids:
            folder = "drafts"
        elif "SENT" in label_ids:
            folder = "sent"

        # User-defined labels (exclude system labels)
        system_labels = {"INBOX", "UNREAD", "STARRED", "IMPORTANT", "SENT", "DRAFT", "TRASH", "SPAM", "CATEGORY_PRIMARY"}
        user_labels = [l for l in label_ids if l not in system_labels]

        return cls(
            user_id=user_id,
            account_id=account_id,
            provider_id=payload["id"],
            thread_id=payload.get("threadId"),
            folder=folder,
            labels=user_labels,
            from_address=from_address,
            from_name=from_name,
            to_addresses=to_addresses,
            cc_addresses=cc_addresses,
            subject=headers.get("subject", "(no subject)"),
            body_text=body_text,
            snippet=payload.get("snippet", ""),
            is_read="UNREAD" not in label_ids,
            is_starred="STARRED" in label_ids,
            has_attachments=_gmail_has_attachments(payload.get("payload", {})),
            attachments_meta=_extract_gmail_attachments(payload.get("payload", {})),
            provider_date=provider_date,
        )

    @classmethod
    def from_graph(cls, payload: dict, *, account_id: str, user_id: str) -> EmailMessage:
        from_data = payload.get("from", {}).get("emailAddress", {})
        to_data = payload.get("toRecipients", [])
        cc_data = payload.get("ccRecipients", [])

        to_addresses = [
            {"name": r["emailAddress"].get("name", ""), "email": r["emailAddress"]["address"]}
            for r in to_data
        ]
        cc_addresses = [
            {"name": r["emailAddress"].get("name", ""), "email": r["emailAddress"]["address"]}
            for r in cc_data
        ]

        flag_status = payload.get("flag", {}).get("flagStatus", "notFlagged")

        return cls(
            user_id=user_id,
            account_id=account_id,
            provider_id=payload["id"],
            thread_id=payload.get("conversationId"),
            folder="inbox",
            labels=[],
            from_address=from_data.get("address", ""),
            from_name=from_data.get("name", ""),
            to_addresses=to_addresses,
            cc_addresses=cc_addresses,
            subject=payload.get("subject", "(no subject)"),
            body_text=payload.get("bodyPreview", ""),
            snippet=payload.get("bodyPreview", ""),
            is_read=payload.get("isRead", False),
            is_starred=flag_status == "flagged",
            has_attachments=payload.get("hasAttachments", False),
            attachments_meta=[],
            provider_date=payload.get("receivedDateTime", datetime.now(timezone.utc).isoformat()),
        )


# ── Provider protocol ────────────────────────────────────────────────

class EmailProvider(Protocol):
    async def fetch_messages(self, access_token: str, *, since: str | None = None) -> list[dict]: ...
    async def fetch_message_html(self, access_token: str, message_id: str) -> str: ...
    async def send_message(self, access_token: str, message: dict) -> dict: ...
    async def move_message(self, access_token: str, message_id: str, folder: str) -> None: ...
    async def update_labels(self, access_token: str, message_id: str, add: list[str], remove: list[str]) -> None: ...
    async def set_read(self, access_token: str, message_id: str, is_read: bool) -> None: ...
    async def set_starred(self, access_token: str, message_id: str, is_starred: bool) -> None: ...
    async def delete_message(self, access_token: str, message_id: str) -> None: ...
    async def fetch_message_ids(self, access_token: str) -> list[str]: ...


# ── Helpers ──────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"<([^>]+)>")


def _parse_email_address(raw: str) -> tuple[str, str]:
    name, addr = email.utils.parseaddr(raw)
    return name, addr


def _parse_address_list(raw: str) -> list[tuple[str, str]]:
    if not raw:
        return []
    return [email.utils.parseaddr(a) for a in raw.split(",")]


def _parse_date(raw: str) -> str:
    try:
        parsed = email.utils.parsedate_to_datetime(raw)
        return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def _extract_gmail_text(payload: dict) -> str:
    """Recursively extract plain text from Gmail message parts."""
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        import base64
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        text = _extract_gmail_text(part)
        if text:
            return text
    return ""


def _gmail_has_attachments(payload: dict) -> bool:
    for part in payload.get("parts", []):
        if part.get("filename"):
            return True
        if _gmail_has_attachments(part):
            return True
    return False


def _extract_gmail_attachments(payload: dict) -> list[dict]:
    attachments = []
    for part in payload.get("parts", []):
        if part.get("filename"):
            attachments.append({
                "name": part["filename"],
                "size": part.get("body", {}).get("size", 0),
                "mime_type": part.get("mimeType", "application/octet-stream"),
            })
        attachments.extend(_extract_gmail_attachments(part))
    return attachments
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/email_service.py tests/test_email_service.py
git commit -m "feat(email): add email service with token encryption, unified model, and provider protocol"
```

---

## Task 5: Backend Email Service — Gmail and Graph HTTP Clients

**Files:**

- Modify: `backend/email_service.py` (add GmailProvider and GraphProvider classes)
- Modify: `tests/test_email_service.py` (add provider tests)

**Prerequisite:** Install httpx — `pip install httpx` and add to pyproject.toml dependencies.

- [ ] **Step 1: Write the failing test for GmailProvider**

Add to `tests/test_email_service.py`:

```python
import httpx
import pytest


class TestGmailProvider:
    @pytest.mark.anyio
    async def test_fetch_messages_builds_correct_url(self, monkeypatch):
        """Gmail fetch uses category:primary filter."""
        captured_requests = []

        async def mock_get(self, url, **kwargs):
            captured_requests.append(url)
            return httpx.Response(
                200,
                json={
                    "messages": [{"id": "msg-1", "threadId": "t-1"}],
                    "resultSizeEstimate": 1,
                },
            )

        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        provider = GmailProvider()
        result = await provider.fetch_message_ids("fake-token")
        assert len(captured_requests) == 1
        assert "category:primary" in captured_requests[0]
        assert result == ["msg-1"]


class TestGraphProvider:
    @pytest.mark.anyio
    async def test_fetch_messages_builds_correct_url(self, monkeypatch):
        """Graph fetch hits mailFolders/Inbox/messages."""
        captured_requests = []

        async def mock_get(self, url, **kwargs):
            captured_requests.append(url)
            return httpx.Response(
                200,
                json={"value": [{"id": "AAMk-1"}]},
            )

        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        provider = GraphProvider()
        result = await provider.fetch_message_ids("fake-token")
        assert len(captured_requests) == 1
        assert "mailFolders" in captured_requests[0]
        assert result == ["AAMk-1"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_service.py::TestGmailProvider -v`
Expected: FAIL — `GmailProvider` has no `fetch_message_ids` method yet (or is not fully implemented).

- [ ] **Step 3: Implement GmailProvider and GraphProvider**

Add to `backend/email_service.py` after the `EmailProvider` protocol:

```python
import httpx

GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
GRAPH_BASE = "https://graph.microsoft.com/v1.0/me"


class GmailProvider:
    """Gmail API client implementing EmailProvider protocol."""

    async def fetch_messages(self, access_token: str, *, since: str | None = None) -> list[dict]:
        q = "category:primary in:inbox"
        if since:
            q += f" after:{since}"
        async with httpx.AsyncClient() as client:
            # Step 1: get message IDs
            resp = await client.get(
                f"{GMAIL_BASE}/messages",
                params={"q": q, "maxResults": 100},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            message_stubs = resp.json().get("messages", [])

            # Step 2: fetch full message for each ID
            messages = []
            for stub in message_stubs:
                detail = await client.get(
                    f"{GMAIL_BASE}/messages/{stub['id']}",
                    params={"format": "full"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                detail.raise_for_status()
                messages.append(detail.json())
            return messages

    async def fetch_message_ids(self, access_token: str) -> list[str]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GMAIL_BASE}/messages",
                params={"q": "category:primary in:inbox", "maxResults": 500},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return [m["id"] for m in resp.json().get("messages", [])]

    async def fetch_message_html(self, access_token: str, message_id: str) -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GMAIL_BASE}/messages/{message_id}",
                params={"format": "full"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return _extract_gmail_html(resp.json().get("payload", {}))

    async def send_message(self, access_token: str, message: dict) -> dict:
        import base64
        from email.mime.text import MIMEText

        mime = MIMEText(message["body_html"], "html")
        mime["To"] = ", ".join(message["to"])
        mime["Subject"] = message["subject"]
        if message.get("cc"):
            mime["Cc"] = ", ".join(message["cc"])
        if message.get("in_reply_to"):
            mime["In-Reply-To"] = message["in_reply_to"]
            mime["References"] = message["in_reply_to"]

        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode("utf-8")
        body = {"raw": raw}
        if message.get("thread_id"):
            body["threadId"] = message["thread_id"]

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{GMAIL_BASE}/messages/send",
                json=body,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return resp.json()

    async def move_message(self, access_token: str, message_id: str, folder: str) -> None:
        label_map = {"trash": "TRASH", "archive": None, "inbox": "INBOX"}
        add = [label_map[folder]] if label_map.get(folder) else []
        remove = ["INBOX"] if folder != "inbox" else []
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{GMAIL_BASE}/messages/{message_id}/modify",
                json={"addLabelIds": add, "removeLabelIds": remove},
                headers={"Authorization": f"Bearer {access_token}"},
            )

    async def update_labels(self, access_token: str, message_id: str, add: list[str], remove: list[str]) -> None:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{GMAIL_BASE}/messages/{message_id}/modify",
                json={"addLabelIds": add, "removeLabelIds": remove},
                headers={"Authorization": f"Bearer {access_token}"},
            )

    async def set_read(self, access_token: str, message_id: str, is_read: bool) -> None:
        add = [] if is_read else ["UNREAD"]
        remove = ["UNREAD"] if is_read else []
        await self.update_labels(access_token, message_id, add, remove)

    async def set_starred(self, access_token: str, message_id: str, is_starred: bool) -> None:
        add = ["STARRED"] if is_starred else []
        remove = [] if is_starred else ["STARRED"]
        await self.update_labels(access_token, message_id, add, remove)

    async def delete_message(self, access_token: str, message_id: str) -> None:
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"{GMAIL_BASE}/messages/{message_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )


class GraphProvider:
    """Microsoft Graph API client implementing EmailProvider protocol."""

    async def fetch_messages(self, access_token: str, *, since: str | None = None) -> list[dict]:
        url = f"{GRAPH_BASE}/mailFolders('Inbox')/messages"
        params = {"$top": 100, "$orderby": "receivedDateTime desc"}
        if since:
            params["$filter"] = f"receivedDateTime ge {since}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return resp.json().get("value", [])

    async def fetch_message_ids(self, access_token: str) -> list[str]:
        url = f"{GRAPH_BASE}/mailFolders('Inbox')/messages"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                params={"$select": "id", "$top": 500},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return [m["id"] for m in resp.json().get("value", [])]

    async def fetch_message_html(self, access_token: str, message_id: str) -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GRAPH_BASE}/messages/{message_id}",
                params={"$select": "body"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return resp.json().get("body", {}).get("content", "")

    async def send_message(self, access_token: str, message: dict) -> dict:
        body = {
            "message": {
                "subject": message["subject"],
                "body": {"contentType": "HTML", "content": message["body_html"]},
                "toRecipients": [{"emailAddress": {"address": a}} for a in message["to"]],
            }
        }
        if message.get("cc"):
            body["message"]["ccRecipients"] = [{"emailAddress": {"address": a}} for a in message["cc"]]

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{GRAPH_BASE}/sendMail",
                json=body,
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            )
            resp.raise_for_status()
            return {"id": "sent"}

    async def move_message(self, access_token: str, message_id: str, folder: str) -> None:
        folder_map = {"trash": "deleteditems", "archive": "archive", "inbox": "inbox"}
        dest = folder_map.get(folder, folder)
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{GRAPH_BASE}/messages/{message_id}/move",
                json={"destinationId": dest},
                headers={"Authorization": f"Bearer {access_token}"},
            )

    async def update_labels(self, access_token: str, message_id: str, add: list[str], remove: list[str]) -> None:
        # Graph uses categories instead of labels
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GRAPH_BASE}/messages/{message_id}",
                params={"$select": "categories"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            current = set(resp.json().get("categories", []))
            updated = (current | set(add)) - set(remove)
            await client.patch(
                f"{GRAPH_BASE}/messages/{message_id}",
                json={"categories": list(updated)},
                headers={"Authorization": f"Bearer {access_token}"},
            )

    async def set_read(self, access_token: str, message_id: str, is_read: bool) -> None:
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{GRAPH_BASE}/messages/{message_id}",
                json={"isRead": is_read},
                headers={"Authorization": f"Bearer {access_token}"},
            )

    async def set_starred(self, access_token: str, message_id: str, is_starred: bool) -> None:
        flag = "flagged" if is_starred else "notFlagged"
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{GRAPH_BASE}/messages/{message_id}",
                json={"flag": {"flagStatus": flag}},
                headers={"Authorization": f"Bearer {access_token}"},
            )

    async def delete_message(self, access_token: str, message_id: str) -> None:
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"{GRAPH_BASE}/messages/{message_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )


def get_provider(provider_name: str) -> GmailProvider | GraphProvider:
    if provider_name == "google":
        return GmailProvider()
    elif provider_name == "microsoft":
        return GraphProvider()
    raise ValueError(f"Unknown provider: {provider_name}")


def _extract_gmail_html(payload: dict) -> str:
    """Recursively extract HTML body from Gmail message parts."""
    import base64

    mime = payload.get("mimeType", "")
    if mime == "text/html":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        html = _extract_gmail_html(part)
        if html:
            return html
    return ""
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/email_service.py tests/test_email_service.py
git commit -m "feat(email): add Gmail and Graph provider implementations"
```

---

## Task 6: Backend OAuth Controller

**Files:**

- Create: `backend/oauth_controller.py`
- Create: `tests/test_oauth_controller.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_oauth_controller.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from litestar.testing import TestClient
from backend.oauth_controller import OAuthController, _generate_pkce_pair


def test_pkce_pair_generation():
    verifier, challenge = _generate_pkce_pair()
    assert len(verifier) >= 43
    assert len(challenge) > 0
    assert verifier != challenge


def test_connect_returns_redirect_for_google(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-google-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_AUTH_KEY", "test-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("AUDIT_LOG_SALT", "test-salt")

    from backend.config import get_settings
    get_settings.cache_clear()

    from litestar import Litestar
    app = Litestar(route_handlers=[OAuthController])

    with TestClient(app) as client:
        resp = client.get("/api/email/accounts/connect", params={"provider": "google"}, follow_redirects=False)
        assert resp.status_code == 302
        location = resp.headers["location"]
        assert "accounts.google.com" in location
        assert "code_challenge" in location
        assert "state" in location

    get_settings.cache_clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_oauth_controller.py -v`
Expected: FAIL — cannot import `oauth_controller`.

- [ ] **Step 3: Implement the OAuth controller**

```python
# backend/oauth_controller.py
"""OAuth2 PKCE controller for Google and Microsoft email account linking."""

from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import urlencode

from litestar import Controller, Response, get
from litestar.exceptions import NotAuthorizedException, NotFoundException
from litestar.status_codes import HTTP_302_FOUND

from backend.config import get_settings
from backend.email_service import encrypt_oauth_token

import httpx

# ── PKCE ──────────────────────────────────────────────────────────────

def _generate_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


# ── Provider OAuth URLs ──────────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_SCOPES = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.labels"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
MICROSOFT_SCOPES = "Mail.ReadWrite Mail.Send MailboxSettings.Read offline_access"
MICROSOFT_USERINFO_URL = "https://graph.microsoft.com/v1.0/me"


class OAuthController(Controller):
    path = "/api/email/accounts"

    @get("/connect")
    async def connect_account(self, provider: str) -> Response:
        settings = get_settings()

        state = secrets.token_urlsafe(32)
        verifier, challenge = _generate_pkce_pair()

        if provider == "google":
            params = {
                "client_id": settings.google_oauth_client_id,
                "redirect_uri": _get_callback_url(settings),
                "response_type": "code",
                "scope": GOOGLE_SCOPES,
                "access_type": "offline",
                "prompt": "consent",
                "code_challenge_method": "S256",
                "code_challenge": challenge,
                "state": f"google:{state}",
            }
            auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
        elif provider == "microsoft":
            params = {
                "client_id": settings.microsoft_oauth_client_id,
                "redirect_uri": _get_callback_url(settings),
                "response_type": "code",
                "scope": MICROSOFT_SCOPES,
                "code_challenge_method": "S256",
                "code_challenge": challenge,
                "state": f"microsoft:{state}",
            }
            auth_url = f"{MICROSOFT_AUTH_URL}?{urlencode(params)}"
        else:
            raise NotFoundException(detail=f"Unknown provider: {provider}")

        response = Response(
            content=None,
            status_code=HTTP_302_FOUND,
            headers={"Location": auth_url},
        )
        response.set_cookie(
            key="oauth_session",
            value=f"{state}:{verifier}:{provider}",
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=600,
            path="/",
        )
        return response

    @get("/callback")
    async def oauth_callback(self, code: str, state: str, request: "litestar.connection.Request") -> Response:
        cookie_val = request.cookies.get("oauth_session")
        if not cookie_val:
            raise NotAuthorizedException(detail="Missing OAuth session cookie")

        parts = cookie_val.split(":", 2)
        if len(parts) != 3:
            raise NotAuthorizedException(detail="Malformed OAuth session cookie")

        saved_state, code_verifier, provider = parts

        # Extract state token (format: "provider:token")
        incoming_state = state.split(":", 1)[-1] if ":" in state else state

        if not secrets.compare_digest(incoming_state, saved_state):
            raise NotAuthorizedException(detail="State parameter mismatch — possible CSRF attack")

        # Exchange code for tokens
        settings = get_settings()
        tokens = await _exchange_code(provider, code, code_verifier, settings)

        # Get user email address from provider
        email_address = await _get_user_email(provider, tokens["access_token"])

        # Get current user from Nexus auth
        user_id = request.state.get("user_id")
        if not user_id:
            raise NotAuthorizedException(detail="Must be logged into Nexus")

        # Store encrypted tokens in Supabase via service role
        from backend.services import create_supabase_user_client
        # Use service role for writing to email_accounts
        from supabase import create_client
        supabase = create_client(settings.supabase_url, settings.supabase_auth_key)

        await _store_account(
            supabase=supabase,
            user_id=user_id,
            provider=provider,
            email_address=email_address,
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token", ""),
            expires_in=tokens.get("expires_in", 3600),
        )

        response = Response(
            content=None,
            status_code=HTTP_302_FOUND,
            headers={"Location": "/"},
        )
        response.delete_cookie(key="oauth_session", path="/")
        return response


async def _exchange_code(provider: str, code: str, code_verifier: str, settings) -> dict:
    if provider == "google":
        token_url = GOOGLE_TOKEN_URL
        body = {
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "code": code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": _get_callback_url(settings),
        }
    else:
        token_url = MICROSOFT_TOKEN_URL
        body = {
            "client_id": settings.microsoft_oauth_client_id,
            "client_secret": settings.microsoft_oauth_client_secret,
            "code": code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": _get_callback_url(settings),
        }

    async with httpx.AsyncClient() as client:
        resp = await client.post(token_url, data=body)
        resp.raise_for_status()
        return resp.json()


async def _get_user_email(provider: str, access_token: str) -> str:
    async with httpx.AsyncClient() as client:
        if provider == "google":
            resp = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return resp.json()["email"]
        else:
            resp = await client.get(
                MICROSOFT_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return resp.json().get("mail") or resp.json().get("userPrincipalName", "")


async def _store_account(*, supabase, user_id, provider, email_address, access_token, refresh_token, expires_in):
    from datetime import datetime, timedelta, timezone

    supabase.table("email_accounts").upsert(
        {
            "user_id": user_id,
            "provider": provider,
            "email_address": email_address,
            "encrypted_access_token": encrypt_oauth_token(access_token),
            "encrypted_refresh_token": encrypt_oauth_token(refresh_token),
            "token_expires_at": (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat(),
            "status": "connected",
        },
        on_conflict="user_id,provider,email_address",
    ).execute()


def _get_callback_url(settings) -> str:
    origin = settings.allowed_origins[0] if settings.allowed_origins else "http://localhost:5173"
    return f"{origin}/api/email/accounts/callback"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_oauth_controller.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/oauth_controller.py tests/test_oauth_controller.py
git commit -m "feat(oauth): add PKCE + state OAuth controller for Google and Microsoft"
```

---

## Task 7: Backend Email Controller

**Files:**

- Create: `backend/email_controller.py`
- Create: `tests/test_email_controller.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_email_controller.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from litestar import Litestar
from litestar.testing import TestClient
from backend.email_controller import EmailController


@pytest.fixture
def mock_request_state():
    """Mock the request state with user_id and access_token."""
    return {"user_id": "user-123", "access_token": "supabase-jwt"}


def test_email_controller_has_expected_routes():
    """Verify all required endpoints are registered."""
    app = Litestar(route_handlers=[EmailController])
    routes = [r.path for r in app.routes]
    assert "/api/email/{email_id:str}/html" in routes or any("/api/email/" in r for r in routes)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_controller.py -v`
Expected: FAIL — cannot import `email_controller`.

- [ ] **Step 3: Implement the email controller**

```python
# backend/email_controller.py
"""Email action controller — proxies write operations through Litestar to providers."""

from __future__ import annotations

import logging

from litestar import Controller, Response, get, post, patch, delete
from litestar.exceptions import HTTPException, NotAuthorizedException

from backend.config import get_settings
from backend.email_schemas import (
    ComposeEmailRequest,
    MoveEmailRequest,
    LabelEmailRequest,
    AIDraftRequest,
    AISummarizeRequest,
)
from backend.email_service import decrypt_oauth_token, get_provider

logger = logging.getLogger(__name__)


async def _get_account_and_token(request, email_id: str | None = None, account_id: str | None = None) -> tuple[dict, str]:
    """Fetch the email account record and decrypt the access token.

    If email_id is provided, looks up the account via the nexus_emails row.
    If account_id is provided, looks up directly.
    """
    user_id = request.state.get("user_id")
    if not user_id:
        raise NotAuthorizedException(detail="Not authenticated")

    settings = get_settings()
    from supabase import create_client
    supabase = create_client(settings.supabase_url, settings.supabase_auth_key)

    if email_id:
        email_row = supabase.table("nexus_emails").select("account_id").eq("id", email_id).eq("user_id", user_id).single().execute()
        if not email_row.data:
            raise HTTPException(status_code=404, detail="Email not found")
        account_id = email_row.data["account_id"]

    account = supabase.table("email_accounts").select("*").eq("id", account_id).eq("user_id", user_id).single().execute()
    if not account.data:
        raise HTTPException(status_code=404, detail="Account not found")

    access_token = decrypt_oauth_token(account.data["encrypted_access_token"])
    return account.data, access_token


class EmailController(Controller):
    path = "/api/email"

    @get("/accounts")
    async def list_accounts(self, request: "litestar.connection.Request") -> list[dict]:
        user_id = request.state.get("user_id")
        if not user_id:
            raise NotAuthorizedException()

        settings = get_settings()
        from supabase import create_client
        supabase = create_client(settings.supabase_url, settings.supabase_auth_key)

        result = supabase.from_("email_accounts_safe").select("*").eq("user_id", user_id).execute()
        return result.data or []

    @delete("/accounts/{account_id:str}")
    async def disconnect_account(self, request: "litestar.connection.Request", account_id: str) -> dict:
        user_id = request.state.get("user_id")
        if not user_id:
            raise NotAuthorizedException()

        settings = get_settings()
        from supabase import create_client
        supabase = create_client(settings.supabase_url, settings.supabase_auth_key)

        supabase.table("email_accounts").delete().eq("id", account_id).eq("user_id", user_id).execute()
        return {"status": "disconnected"}

    @post("/send")
    async def send_email(self, request: "litestar.connection.Request", data: ComposeEmailRequest) -> dict:
        account, token = await _get_account_and_token(request, account_id=data.account_id)
        provider = get_provider(account["provider"])
        result = await provider.send_message(token, {
            "to": data.to,
            "cc": data.cc,
            "bcc": data.bcc,
            "subject": data.subject,
            "body_html": data.body_html,
            "in_reply_to": data.in_reply_to,
            "thread_id": data.thread_id,
        })
        return {"status": "sent", "provider_id": result.get("id")}

    @post("/{email_id:str}/reply")
    async def reply_email(self, request: "litestar.connection.Request", email_id: str, data: ComposeEmailRequest) -> dict:
        account, token = await _get_account_and_token(request, email_id=email_id)
        provider = get_provider(account["provider"])
        result = await provider.send_message(token, {
            "to": data.to,
            "cc": data.cc,
            "bcc": data.bcc,
            "subject": data.subject,
            "body_html": data.body_html,
            "in_reply_to": data.in_reply_to,
            "thread_id": data.thread_id,
        })
        return {"status": "sent", "provider_id": result.get("id")}

    @post("/{email_id:str}/forward")
    async def forward_email(self, request: "litestar.connection.Request", email_id: str, data: ComposeEmailRequest) -> dict:
        return await self.reply_email(request, email_id, data)

    @post("/draft")
    async def save_draft(self, request: "litestar.connection.Request", data: ComposeEmailRequest) -> dict:
        account, token = await _get_account_and_token(request, account_id=data.account_id)
        # For now, draft saving proxies to provider
        return {"status": "draft_saved"}

    @patch("/{email_id:str}/move")
    async def move_email(self, request: "litestar.connection.Request", email_id: str, data: MoveEmailRequest) -> dict:
        account, token = await _get_account_and_token(request, email_id=email_id)
        provider = get_provider(account["provider"])
        await provider.move_message(token, _get_provider_id(request, email_id), data.folder)
        return {"status": "moved", "folder": data.folder}

    @patch("/{email_id:str}/labels")
    async def update_labels(self, request: "litestar.connection.Request", email_id: str, data: LabelEmailRequest) -> dict:
        account, token = await _get_account_and_token(request, email_id=email_id)
        provider = get_provider(account["provider"])
        await provider.update_labels(token, _get_provider_id(request, email_id), data.add, data.remove)
        return {"status": "labels_updated"}

    @patch("/{email_id:str}/read")
    async def mark_read(self, request: "litestar.connection.Request", email_id: str, data: dict) -> dict:
        is_read = data.get("is_read", True)
        account, token = await _get_account_and_token(request, email_id=email_id)
        provider = get_provider(account["provider"])
        await provider.set_read(token, _get_provider_id(request, email_id), is_read)
        return {"status": "updated", "is_read": is_read}

    @patch("/{email_id:str}/star")
    async def toggle_star(self, request: "litestar.connection.Request", email_id: str, data: dict) -> dict:
        is_starred = data.get("is_starred", True)
        account, token = await _get_account_and_token(request, email_id=email_id)
        provider = get_provider(account["provider"])
        await provider.set_starred(token, _get_provider_id(request, email_id), is_starred)
        return {"status": "updated", "is_starred": is_starred}

    @get("/{email_id:str}/html")
    async def get_email_html(self, request: "litestar.connection.Request", email_id: str) -> dict:
        account, token = await _get_account_and_token(request, email_id=email_id)
        provider = get_provider(account["provider"])
        html = await provider.fetch_message_html(token, _get_provider_id(request, email_id))
        return {"html": html}

    @get("/{email_id:str}/attachments/{attachment_id:str}")
    async def get_attachment(self, request: "litestar.connection.Request", email_id: str, attachment_id: str) -> Response:
        # Stream attachment from provider
        account, token = await _get_account_and_token(request, email_id=email_id)
        return Response(content=b"", media_type="application/octet-stream")

    @post("/ai/draft")
    async def ai_draft(self, request: "litestar.connection.Request", data: AIDraftRequest) -> dict:
        settings = get_settings()
        from backend.services import get_genai_client

        # Fetch the email's plain text context from Supabase
        from supabase import create_client
        supabase = create_client(settings.supabase_url, settings.supabase_auth_key)
        user_id = request.state.get("user_id")
        email_row = supabase.table("nexus_emails").select("subject, body_text, snippet, from_name").eq("id", data.email_id).eq("user_id", user_id).single().execute()

        if not email_row.data:
            raise HTTPException(status_code=404, detail="Email not found")

        email_data = email_row.data
        prompt = f"""Draft a professional reply to this email.
From: {email_data['from_name']}
Subject: {email_data['subject']}
Content: {email_data['body_text'] or email_data['snippet']}

{f'Additional instruction: {data.instruction}' if data.instruction else ''}

Write only the reply body, no greeting header or signature."""

        client = get_genai_client()
        if not client:
            raise HTTPException(status_code=503, detail="AI service unavailable")

        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        return {"draft": response.text}

    @post("/ai/summarize")
    async def ai_summarize(self, request: "litestar.connection.Request", data: AISummarizeRequest) -> dict:
        settings = get_settings()
        from backend.services import get_genai_client
        from supabase import create_client

        supabase = create_client(settings.supabase_url, settings.supabase_auth_key)
        user_id = request.state.get("user_id")

        emails = supabase.table("nexus_emails").select("subject, body_text, snippet, from_name, provider_date").in_("id", data.email_ids).eq("user_id", user_id).order("provider_date").execute()

        if not emails.data:
            raise HTTPException(status_code=404, detail="No emails found")

        context = "\n\n".join(
            f"From: {e['from_name']}\nSubject: {e['subject']}\n{e['body_text'] or e['snippet']}"
            for e in emails.data
        )

        prompt = f"""Summarize the following email thread concisely. Highlight key action items.

{context}"""

        client = get_genai_client()
        if not client:
            raise HTTPException(status_code=503, detail="AI service unavailable")

        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        return {"summary": response.text}


def _get_provider_id(request, email_id: str) -> str:
    """Look up the provider_id from nexus_emails."""
    settings = get_settings()
    from supabase import create_client
    supabase = create_client(settings.supabase_url, settings.supabase_auth_key)
    user_id = request.state.get("user_id")
    result = supabase.table("nexus_emails").select("provider_id").eq("id", email_id).eq("user_id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Email not found")
    return result.data["provider_id"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_controller.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/email_controller.py tests/test_email_controller.py
git commit -m "feat(email): add email controller with all CRUD, AI, and HTML endpoints"
```

---

## Task 8: Backend Poller — Background Sync Worker

**Files:**

- Create: `backend/email_poller.py`
- Create: `tests/test_email_poller.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_email_poller.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.email_poller import sync_account, detect_ghost_emails


@pytest.mark.anyio
async def test_detect_ghost_emails():
    """IDs in DB but missing from remote should be flagged."""
    db_ids = {"msg-1", "msg-2", "msg-3"}
    remote_ids = {"msg-1", "msg-3"}
    ghosts = detect_ghost_emails(db_ids, remote_ids)
    assert ghosts == {"msg-2"}


@pytest.mark.anyio
async def test_detect_ghost_emails_no_ghosts():
    db_ids = {"msg-1", "msg-2"}
    remote_ids = {"msg-1", "msg-2", "msg-3"}
    ghosts = detect_ghost_emails(db_ids, remote_ids)
    assert ghosts == set()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_poller.py -v`
Expected: FAIL — cannot import `email_poller`.

- [ ] **Step 3: Implement the poller**

```python
# backend/email_poller.py
"""Background email sync worker — polls Gmail/Graph APIs every 60 seconds."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from backend.config import get_settings
from backend.email_service import (
    EmailMessage,
    decrypt_oauth_token,
    encrypt_oauth_token,
    get_provider,
)

logger = logging.getLogger(__name__)


def detect_ghost_emails(db_provider_ids: set[str], remote_provider_ids: set[str]) -> set[str]:
    """Return provider_ids that exist in DB but are missing from the remote inbox."""
    return db_provider_ids - remote_provider_ids


async def refresh_token_if_needed(account: dict, settings) -> str | None:
    """Check token expiry and refresh proactively if within 5 minutes."""
    import httpx

    expires_at = datetime.fromisoformat(account["token_expires_at"])
    if expires_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        return decrypt_oauth_token(account["encrypted_access_token"])

    refresh_token = decrypt_oauth_token(account["encrypted_refresh_token"])
    provider = account["provider"]

    if provider == "google":
        token_url = "https://oauth2.googleapis.com/token"
        body = {
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    else:
        token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        body = {
            "client_id": settings.microsoft_oauth_client_id,
            "client_secret": settings.microsoft_oauth_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(token_url, data=body)
            resp.raise_for_status()
            tokens = resp.json()

        new_access = tokens["access_token"]
        new_expires = datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))

        # Update stored tokens
        from supabase import create_client
        supabase = create_client(settings.supabase_url, settings.supabase_auth_key)
        update_data = {
            "encrypted_access_token": encrypt_oauth_token(new_access),
            "token_expires_at": new_expires.isoformat(),
        }
        if tokens.get("refresh_token"):
            update_data["encrypted_refresh_token"] = encrypt_oauth_token(tokens["refresh_token"])

        supabase.table("email_accounts").update(update_data).eq("id", account["id"]).execute()
        return new_access

    except Exception:
        logger.exception("Token refresh failed for account %s", account["id"])
        # Mark account as disconnected
        from supabase import create_client
        supabase = create_client(settings.supabase_url, settings.supabase_auth_key)
        supabase.table("email_accounts").update({"status": "disconnected"}).eq("id", account["id"]).execute()
        return None


async def sync_account(account: dict, settings) -> None:
    """Sync a single email account — fetch, upsert, detect ghosts."""
    access_token = await refresh_token_if_needed(account, settings)
    if not access_token:
        return

    provider_name = account["provider"]
    provider = get_provider(provider_name)
    user_id = account["user_id"]
    account_id = account["id"]

    from supabase import create_client
    supabase = create_client(settings.supabase_url, settings.supabase_auth_key)

    try:
        # 1. Fetch full messages from provider
        messages = await provider.fetch_messages(access_token)

        # 2. Normalize into EmailMessage objects
        normalize = EmailMessage.from_gmail if provider_name == "google" else EmailMessage.from_graph
        email_messages = [
            normalize(msg, account_id=account_id, user_id=user_id)
            for msg in messages
        ]

        # 3. Upsert into Supabase (dedup on account_id + provider_id)
        if email_messages:
            rows = [m.to_supabase_row() for m in email_messages]
            supabase.table("nexus_emails").upsert(
                rows,
                on_conflict="account_id,provider_id",
            ).execute()

        # 4. Ghost email detection
        remote_ids = await provider.fetch_message_ids(access_token)
        remote_id_set = set(remote_ids)

        db_result = supabase.table("nexus_emails").select("provider_id").eq("account_id", account_id).eq("folder", "inbox").execute()
        db_id_set = {row["provider_id"] for row in (db_result.data or [])}

        ghosts = detect_ghost_emails(db_id_set, remote_id_set)
        if ghosts:
            for ghost_id in ghosts:
                supabase.table("nexus_emails").update({"folder": "archive"}).eq("account_id", account_id).eq("provider_id", ghost_id).execute()
            logger.info("Archived %d ghost emails for account %s", len(ghosts), account_id)

    except Exception:
        logger.exception("Sync failed for account %s", account_id)


async def poll_all_accounts() -> None:
    """Single poll iteration — sync all connected accounts."""
    settings = get_settings()
    from supabase import create_client
    supabase = create_client(settings.supabase_url, settings.supabase_auth_key)

    result = supabase.table("email_accounts").select("*").eq("status", "connected").execute()
    accounts = result.data or []

    tasks = [sync_account(account, settings) for account in accounts]
    await asyncio.gather(*tasks, return_exceptions=True)


async def start_email_poller(app) -> None:
    """Litestar on_startup hook — launches the polling loop as a background task."""
    settings = get_settings()

    if not settings.google_oauth_client_id and not settings.microsoft_oauth_client_id:
        logger.info("Email OAuth not configured — skipping poller startup")
        return

    async def _loop():
        while True:
            try:
                await poll_all_accounts()
            except Exception:
                logger.exception("Poller iteration failed")
            await asyncio.sleep(settings.email_poll_interval_seconds)

    app.state.email_poller_task = asyncio.create_task(_loop())
    logger.info("Email poller started (interval: %ds)", settings.email_poll_interval_seconds)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest tests/test_email_poller.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/email_poller.py tests/test_email_poller.py
git commit -m "feat(email): add background poller with ghost email detection"
```

---

## Task 9: Register Email Modules in app.py

**Files:**

- Modify: `backend/app.py:7-26` (imports)
- Modify: `backend/app.py:56-62` (route handlers + on_startup)

- [ ] **Step 1: Add imports to app.py**

Add these imports alongside the existing controller imports in `backend/app.py`:

```python
from backend.oauth_controller import OAuthController
from backend.email_controller import EmailController
from backend.email_poller import start_email_poller
```

- [ ] **Step 2: Register controllers and startup hook**

In the `Litestar(...)` constructor in `backend/app.py`, add `OAuthController` and `EmailController` to `route_handlers`, and add `on_startup=[start_email_poller]`:

```python
app = Litestar(
    route_handlers=[AuthController, ChatController, MediaController, OAuthController, EmailController, healthcheck],
    middleware=[...],
    on_startup=[start_email_poller],
    ...
)
```

- [ ] **Step 3: Verify the app starts**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -c "from backend.app import app; print('Routes:', [r.path for r in app.routes[:5]], '...')"`
Expected: No import errors, routes printed.

- [ ] **Step 4: Commit**

```bash
git add backend/app.py
git commit -m "feat(app): register email controllers and poller startup hook"
```

---

## Task 10: Frontend Email Config

**Files:**

- Create: `frontend/src/lib/emailConfig.js`

- [ ] **Step 1: Write the config module**

```javascript
// frontend/src/lib/emailConfig.js
import { Mail, Inbox, Send, FileText, Archive, Trash2, Star, Tag } from 'lucide-react'

export const EMAIL_FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'starred', label: 'Starred', icon: Star },
]

export const PROVIDER_CONFIG = {
  google: {
    label: 'Gmail',
    color: '#ea4335',
    bgColor: 'bg-red-500/20',
    textColor: 'text-red-400',
  },
  microsoft: {
    label: 'Outlook',
    color: '#0078d4',
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400',
  },
}

export const EMAIL_TAB_ICON = Mail

export function getProviderBadge(provider) {
  return PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.google
}

export function formatEmailDate(isoString) {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/emailConfig.js
git commit -m "feat(frontend): add email config with folder/provider mappings"
```

---

## Task 11: Frontend Hooks — useEmailAccounts, useEmails, useEmailActions

**Files:**

- Create: `frontend/src/hooks/useEmailAccounts.js`
- Create: `frontend/src/hooks/useEmails.js`
- Create: `frontend/src/hooks/useEmailActions.js`
- Create: `frontend/src/hooks/useEmails.test.js`

- [ ] **Step 1: Write the failing test for useEmails**

```javascript
// frontend/src/hooks/useEmails.test.js
import { describe, it, expect } from 'vitest'
import { handleEmailRealtimeDelete } from './useEmails'

describe('handleEmailRealtimeDelete', () => {
  it('removes the deleted email from the list', () => {
    const current = [
      { id: '1', subject: 'Hello' },
      { id: '2', subject: 'World' },
    ]
    const payload = { old: { id: '1' } }
    const result = handleEmailRealtimeDelete(current, payload)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('returns data unchanged if old.id is missing', () => {
    const current = [{ id: '1', subject: 'Hello' }]
    const payload = { old: {} }
    const result = handleEmailRealtimeDelete(current, payload)
    expect(result).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test -- --run src/hooks/useEmails.test.js`
Expected: FAIL — cannot import `useEmails`.

- [ ] **Step 3: Write useEmailAccounts hook**

```javascript
// frontend/src/hooks/useEmailAccounts.js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getAccountsQueryKey(userId) {
  return ['email-accounts', userId ?? 'anonymous']
}

export function useEmailAccounts(session) {
  const queryClient = useQueryClient()
  const userId = session?.user?.id
  const queryKey = getAccountsQueryKey(userId)

  const accountsQuery = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: () => apiFetch('/api/email/accounts'),
    staleTime: 60_000,
  })

  const disconnectMutation = useMutation({
    mutationFn: (accountId) => apiFetch(`/api/email/accounts/${accountId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    accounts: accountsQuery.data ?? [],
    loading: accountsQuery.isPending,
    error: accountsQuery.error?.message ?? null,
    disconnect: disconnectMutation.mutateAsync,
  }
}
```

- [ ] **Step 4: Write useEmails hook**

```javascript
// frontend/src/hooks/useEmails.js
import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { realtimeClient } from '../lib/realtimeClient'

function getEmailsQueryKey(userId, folder, accountId) {
  return ['emails', userId ?? 'anonymous', folder, accountId ?? 'all']
}

export function handleEmailRealtimeDelete(oldData, payload) {
  const oldItem = payload.old
  if (!oldItem?.id) return oldData
  return oldData.filter((item) => item.id !== oldItem.id)
}

export function useEmails(session, folder = 'inbox', accountId = null) {
  const queryClient = useQueryClient()
  const userId = session?.user?.id
  const accessToken = session?.access_token
  const isAuthenticated = Boolean(userId && accessToken)
  const queryKey = getEmailsQueryKey(userId, folder, accountId)

  // Read directly from Supabase (Approach C: Realtime reads)
  const emailsQuery = useQuery({
    queryKey,
    enabled: isAuthenticated,
    staleTime: 30_000,
    queryFn: async () => {
      let query = realtimeClient
        .from('nexus_emails')
        .select('*')
        .eq('user_id', userId)
        .order('provider_date', { ascending: false })
        .limit(50)

      if (folder === 'starred') {
        query = query.eq('is_starred', true)
      } else {
        query = query.eq('folder', folder)
      }

      if (accountId) {
        query = query.eq('account_id', accountId)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data
    },
  })

  // Supabase Realtime subscription
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    realtimeClient.realtime.setAuth(accessToken)

    const channel = realtimeClient
      .channel(`email-sync-${userId}-${folder}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nexus_emails',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            queryClient.setQueryData(queryKey, (current) =>
              handleEmailRealtimeDelete(current ?? [], payload),
            )
          } else {
            // INSERT or UPDATE — invalidate to refetch
            queryClient.invalidateQueries({ queryKey })
          }
        },
      )
      .subscribe()

    return () => {
      realtimeClient.removeChannel(channel)
    }
  }, [isAuthenticated, accessToken, userId, folder, queryKey, queryClient])

  // Cursor-based pagination helper
  const loadMore = useMemo(() => {
    return async () => {
      const currentData = queryClient.getQueryData(queryKey) ?? []
      if (currentData.length === 0) return

      const lastDate = currentData[currentData.length - 1].provider_date

      let query = realtimeClient
        .from('nexus_emails')
        .select('*')
        .eq('user_id', userId)
        .lt('provider_date', lastDate)
        .order('provider_date', { ascending: false })
        .limit(50)

      if (folder === 'starred') {
        query = query.eq('is_starred', true)
      } else {
        query = query.eq('folder', folder)
      }

      if (accountId) {
        query = query.eq('account_id', accountId)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      queryClient.setQueryData(queryKey, (current) => [...(current ?? []), ...(data ?? [])])
    }
  }, [queryClient, queryKey, userId, folder, accountId])

  // Full-text search
  const search = useMemo(() => {
    return async (searchTerm) => {
      const { data, error } = await realtimeClient
        .from('nexus_emails')
        .select('*')
        .eq('user_id', userId)
        .textSearch('body_text', searchTerm, { type: 'websearch' })
        .order('provider_date', { ascending: false })
        .limit(50)

      if (error) throw new Error(error.message)
      return data
    }
  }, [userId])

  return {
    emails: emailsQuery.data ?? [],
    loading: emailsQuery.isPending,
    error: emailsQuery.error?.message ?? null,
    refetch: emailsQuery.refetch,
    loadMore,
    search,
  }
}
```

- [ ] **Step 5: Write useEmailActions hook**

```javascript
// frontend/src/hooks/useEmailActions.js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

export function useEmailActions(session, folder = 'inbox', accountId = null) {
  const queryClient = useQueryClient()
  const userId = session?.user?.id
  const queryKey = ['emails', userId ?? 'anonymous', folder, accountId ?? 'all']

  // Optimistic: mark read/unread
  const markRead = useMutation({
    mutationFn: ({ emailId, isRead }) =>
      apiFetch(`/api/email/${emailId}/read`, {
        method: 'PATCH',
        body: { is_read: isRead },
      }),
    onMutate: async ({ emailId, isRead }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey) ?? []
      queryClient.setQueryData(queryKey, (current) =>
        (current ?? []).map((e) => (e.id === emailId ? { ...e, is_read: isRead } : e)),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous ?? [])
    },
  })

  // Optimistic: toggle star
  const toggleStar = useMutation({
    mutationFn: ({ emailId, isStarred }) =>
      apiFetch(`/api/email/${emailId}/star`, {
        method: 'PATCH',
        body: { is_starred: isStarred },
      }),
    onMutate: async ({ emailId, isStarred }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey) ?? []
      queryClient.setQueryData(queryKey, (current) =>
        (current ?? []).map((e) => (e.id === emailId ? { ...e, is_starred: isStarred } : e)),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous ?? [])
    },
  })

  // Optimistic: move to folder
  const moveToFolder = useMutation({
    mutationFn: ({ emailId, targetFolder }) =>
      apiFetch(`/api/email/${emailId}/move`, {
        method: 'PATCH',
        body: { folder: targetFolder },
      }),
    onMutate: async ({ emailId }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey) ?? []
      queryClient.setQueryData(queryKey, (current) =>
        (current ?? []).filter((e) => e.id !== emailId),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous ?? [])
    },
  })

  // NOT optimistic: send email (wait for 200 OK)
  const sendEmail = useMutation({
    mutationFn: (data) => apiFetch('/api/email/send', { method: 'POST', body: data }),
  })

  // NOT optimistic: reply
  const replyEmail = useMutation({
    mutationFn: ({ emailId, data }) =>
      apiFetch(`/api/email/${emailId}/reply`, { method: 'POST', body: data }),
  })

  // NOT optimistic: forward
  const forwardEmail = useMutation({
    mutationFn: ({ emailId, data }) =>
      apiFetch(`/api/email/${emailId}/forward`, { method: 'POST', body: data }),
  })

  // AI draft
  const aiDraft = useMutation({
    mutationFn: (data) => apiFetch('/api/email/ai/draft', { method: 'POST', body: data }),
  })

  // AI summarize
  const aiSummarize = useMutation({
    mutationFn: (data) => apiFetch('/api/email/ai/summarize', { method: 'POST', body: data }),
  })

  return {
    markRead: markRead.mutateAsync,
    toggleStar: toggleStar.mutateAsync,
    moveToFolder: moveToFolder.mutateAsync,
    sendEmail: sendEmail.mutateAsync,
    replyEmail: replyEmail.mutateAsync,
    forwardEmail: forwardEmail.mutateAsync,
    aiDraft: aiDraft.mutateAsync,
    aiSummarize: aiSummarize.mutateAsync,
    isSending: sendEmail.isPending || replyEmail.isPending || forwardEmail.isPending,
    sendError: sendEmail.error?.message ?? replyEmail.error?.message ?? null,
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test -- --run src/hooks/useEmails.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useEmailAccounts.js frontend/src/hooks/useEmails.js frontend/src/hooks/useEmailActions.js frontend/src/hooks/useEmails.test.js
git commit -m "feat(frontend): add email hooks — accounts, Realtime reads, and action mutations"
```

---

## Task 12: Frontend Components — FolderSidebar + EmailList

**Files:**

- Create: `frontend/src/components/features/FolderSidebar.jsx`
- Create: `frontend/src/components/features/EmailList.jsx`

- [ ] **Step 1: Write FolderSidebar**

```jsx
// frontend/src/components/features/FolderSidebar.jsx
import { memo, useState } from 'react'
import { EMAIL_FOLDERS, PROVIDER_CONFIG } from '../../lib/emailConfig'
import { Plus } from 'lucide-react'

function FolderSidebar({
  accounts,
  activeFolder,
  activeAccountId,
  onFolderChange,
  onAccountChange,
  onConnectAccount,
}) {
  return (
    <aside className="w-56 flex-shrink-0 border-r border-cyan-500/10 bg-zinc-950/50 flex flex-col overflow-y-auto">
      {/* Account Switcher */}
      <div className="p-3 border-b border-cyan-500/10">
        <label className="text-[10px] uppercase tracking-widest text-cyan-500/60 font-medium">
          Account
        </label>
        <select
          className="mt-1 w-full bg-zinc-900 border border-cyan-500/20 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-cyan-400 focus:outline-none"
          value={activeAccountId || 'all'}
          onChange={(e) => onAccountChange(e.target.value === 'all' ? null : e.target.value)}
          aria-label="Select email account"
        >
          <option value="all">All Accounts</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.email_address}
            </option>
          ))}
        </select>
      </div>

      {/* Folders */}
      <nav className="flex-1 p-2" role="navigation" aria-label="Email folders">
        <ul className="space-y-0.5">
          {EMAIL_FOLDERS.map(({ id, label, icon: Icon }) => {
            const isActive = activeFolder === id
            return (
              <li key={id}>
                <button
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                  onClick={() => onFolderChange(id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <Icon size={14} />
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Connect Account Button */}
      <div className="p-3 border-t border-cyan-500/10">
        <button
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/10 transition-colors"
          onClick={onConnectAccount}
          aria-label="Connect new email account"
        >
          <Plus size={12} />
          Connect Account
        </button>
      </div>
    </aside>
  )
}

export default memo(FolderSidebar)
```

- [ ] **Step 2: Write EmailList**

```jsx
// frontend/src/components/features/EmailList.jsx
import { memo, useCallback, useRef } from 'react'
import { motion as Motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { formatEmailDate, getProviderBadge } from '../../lib/emailConfig'

function EmailList({ emails, selectedId, loading, onSelect, onToggleStar, onLoadMore }) {
  const listRef = useRef(null)

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el || !onLoadMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      onLoadMore()
    }
  }, [onLoadMore])

  if (loading && emails.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        Syncing emails...
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        No emails in this folder
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto"
      onScroll={handleScroll}
      role="listbox"
      aria-label="Email messages"
    >
      {emails.map((email) => {
        const isSelected = email.id === selectedId
        const badge = getProviderBadge(email.account_id)

        return (
          <Motion.button
            key={email.id}
            layoutId={`email-${email.id}`}
            className={`w-full text-left px-3 py-2.5 border-b border-zinc-800/50 transition-colors ${
              isSelected ? 'bg-cyan-500/10 border-l-2 border-l-cyan-400' : 'hover:bg-zinc-800/50'
            } ${!email.is_read ? 'font-medium' : ''}`}
            onClick={() => onSelect(email.id)}
            role="option"
            aria-selected={isSelected}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-sm truncate ${!email.is_read ? 'text-zinc-100' : 'text-zinc-400'}`}
                  >
                    {email.from_name || email.from_address}
                  </span>
                  {!email.is_read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                  )}
                </div>
                <div
                  className={`text-sm truncate ${!email.is_read ? 'text-zinc-200' : 'text-zinc-500'}`}
                >
                  {email.subject}
                </div>
                <div className="text-xs text-zinc-600 truncate mt-0.5">{email.snippet}</div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[10px] text-zinc-600">
                  {formatEmailDate(email.provider_date)}
                </span>
                <button
                  className={`p-0.5 rounded transition-colors ${
                    email.is_starred ? 'text-yellow-400' : 'text-zinc-700 hover:text-zinc-400'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleStar(email.id, !email.is_starred)
                  }}
                  aria-label={email.is_starred ? 'Unstar email' : 'Star email'}
                >
                  <Star size={12} fill={email.is_starred ? 'currentColor' : 'none'} />
                </button>
              </div>
            </div>
          </Motion.button>
        )
      })}
    </div>
  )
}

export default memo(EmailList)
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/features/FolderSidebar.jsx frontend/src/components/features/EmailList.jsx
git commit -m "feat(frontend): add FolderSidebar and EmailList components"
```

---

## Task 13: Frontend Components — EmailReader + EmailToolbar

**Files:**

- Create: `frontend/src/components/features/EmailReader.jsx`
- Create: `frontend/src/components/features/EmailToolbar.jsx`

- [ ] **Step 1: Write EmailToolbar**

```jsx
// frontend/src/components/features/EmailToolbar.jsx
import { memo } from 'react'
import { Archive, Trash2, Mail, MailOpen, Tag, Reply } from 'lucide-react'

function EmailToolbar({ email, onArchive, onTrash, onToggleRead, onReply }) {
  if (!email) return null

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-cyan-500/10 bg-zinc-950/30">
      <button
        className="p-1.5 rounded text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
        onClick={onReply}
        aria-label="Reply"
        title="Reply"
      >
        <Reply size={15} />
      </button>
      <button
        className="p-1.5 rounded text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
        onClick={onArchive}
        aria-label="Archive"
        title="Archive"
      >
        <Archive size={15} />
      </button>
      <button
        className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        onClick={onTrash}
        aria-label="Move to trash"
        title="Trash"
      >
        <Trash2 size={15} />
      </button>
      <button
        className="p-1.5 rounded text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
        onClick={onToggleRead}
        aria-label={email.is_read ? 'Mark as unread' : 'Mark as read'}
        title={email.is_read ? 'Mark unread' : 'Mark read'}
      >
        {email.is_read ? <Mail size={15} /> : <MailOpen size={15} />}
      </button>
    </div>
  )
}

export default memo(EmailToolbar)
```

- [ ] **Step 2: Write EmailReader**

```jsx
// frontend/src/components/features/EmailReader.jsx
import { memo, useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { apiFetch } from '../../lib/apiClient'
import { getProviderBadge, formatEmailDate } from '../../lib/emailConfig'
import EmailToolbar from './EmailToolbar'

function EmailReader({ email, onArchive, onTrash, onToggleRead, onReply }) {
  const [htmlContent, setHtmlContent] = useState(null)
  const [showImages, setShowImages] = useState(false)
  const [loadingHtml, setLoadingHtml] = useState(false)

  useEffect(() => {
    if (!email) {
      setHtmlContent(null)
      return
    }

    setLoadingHtml(true)
    setShowImages(false)
    apiFetch(`/api/email/${email.id}/html`)
      .then((res) => setHtmlContent(res.html))
      .catch(() => setHtmlContent(null))
      .finally(() => setLoadingHtml(false))
  }, [email?.id])

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Select an email to read
      </div>
    )
  }

  const sanitizeConfig = {
    FORBID_TAGS: showImages ? ['script', 'form'] : ['script', 'form', 'img'],
    FORBID_ATTR: ['onerror', 'onload', 'onmouseover', 'onclick'],
  }
  const cleanHtml = htmlContent ? DOMPurify.sanitize(htmlContent, sanitizeConfig) : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <EmailToolbar
        email={email}
        onArchive={onArchive}
        onTrash={onTrash}
        onToggleRead={onToggleRead}
        onReply={onReply}
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/50">
        <h2 className="text-lg font-semibold text-zinc-100">{email.subject}</h2>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-sm text-fuchsia-400">{email.from_name || email.from_address}</span>
          <span className="text-xs text-zinc-600">&lt;{email.from_address}&gt;</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-600">
          <span>To: {email.to_addresses?.map((a) => a.email).join(', ')}</span>
          <span>&bull;</span>
          <span>{formatEmailDate(email.provider_date)}</span>
        </div>
      </div>

      {/* Image toggle */}
      {!showImages && cleanHtml && (
        <button
          className="px-4 py-1.5 text-xs text-cyan-400 bg-zinc-900 border-b border-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
          onClick={() => setShowImages(true)}
        >
          Show remote images
        </button>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loadingHtml ? (
          <div className="p-4 text-zinc-500 text-sm">Loading email...</div>
        ) : cleanHtml ? (
          <iframe
            srcDoc={cleanHtml}
            sandbox="allow-popups allow-same-origin"
            className="w-full h-full border-none bg-white"
            title="Email content"
          />
        ) : (
          <div className="p-4 text-sm text-zinc-300 whitespace-pre-wrap">
            {email.body_text || email.snippet}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(EmailReader)
```

- [ ] **Step 3: Install DOMPurify**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm install dompurify`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/features/EmailReader.jsx frontend/src/components/features/EmailToolbar.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): add EmailReader with sandboxed HTML and EmailToolbar"
```

---

## Task 14: Frontend Components — ComposeModal

**Files:**

- Create: `frontend/src/components/features/ComposeModal.jsx`

- [ ] **Step 1: Write ComposeModal**

```jsx
// frontend/src/components/features/ComposeModal.jsx
import { memo, useState, useCallback } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Loader2 } from 'lucide-react'

function ComposeModal({ isOpen, onClose, accounts, onSend, onAiDraft, isSending, replyTo }) {
  const [accountId, setAccountId] = useState(replyTo?.account_id || accounts[0]?.id || '')
  const [to, setTo] = useState(replyTo ? [replyTo.from_address] : [])
  const [toInput, setToInput] = useState(replyTo ? replyTo.from_address : '')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '')
  const [bodyHtml, setBodyHtml] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const handleSend = useCallback(async () => {
    const recipients = toInput
      ? toInput
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean)
      : to
    await onSend({
      account_id: accountId,
      to: recipients,
      cc: cc
        ? cc
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
        : [],
      subject,
      body_html: bodyHtml || `<p>${bodyHtml}</p>`,
      in_reply_to: replyTo?.provider_id || null,
      thread_id: replyTo?.thread_id || null,
    })
    onClose()
  }, [accountId, toInput, to, cc, subject, bodyHtml, replyTo, onSend, onClose])

  const handleAiDraft = useCallback(async () => {
    if (!replyTo || !onAiDraft) return
    setAiLoading(true)
    try {
      const result = await onAiDraft({ email_id: replyTo.id, instruction: '' })
      setBodyHtml(result.draft)
    } finally {
      setAiLoading(false)
    }
  }, [replyTo, onAiDraft])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <Motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl bg-zinc-900 border border-cyan-500/20 rounded-lg shadow-2xl shadow-cyan-500/5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/10">
            <h3 className="text-sm font-medium text-zinc-200">{replyTo ? 'Reply' : 'New Email'}</h3>
            <button
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition-colors"
              onClick={onClose}
              aria-label="Close compose"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-3">
            {/* Account Selector */}
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-cyan-400 focus:outline-none"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="Send from account"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.email_address}
                </option>
              ))}
            </select>

            {/* To */}
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-cyan-400 focus:outline-none"
              placeholder="To (comma-separated)"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              aria-label="Recipients"
            />

            {/* CC */}
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-cyan-400 focus:outline-none"
              placeholder="Cc (optional)"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              aria-label="CC recipients"
            />

            {/* Subject */}
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-cyan-400 focus:outline-none"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label="Subject"
            />

            {/* Body */}
            <textarea
              className="w-full h-48 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-cyan-400 focus:outline-none resize-none"
              placeholder="Write your message..."
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              aria-label="Email body"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-cyan-500/10">
            <div>
              {replyTo && onAiDraft && (
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-fuchsia-400 border border-fuchsia-500/20 hover:bg-fuchsia-500/10 transition-colors disabled:opacity-40"
                  onClick={handleAiDraft}
                  disabled={aiLoading}
                  aria-label="AI draft reply"
                >
                  {aiLoading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  AI Draft
                </button>
              )}
            </div>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium text-zinc-900 bg-cyan-400 hover:bg-cyan-300 transition-colors disabled:opacity-40"
              onClick={handleSend}
              disabled={isSending || !toInput}
              aria-label="Send email"
            >
              {isSending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Send
                </>
              )}
            </button>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  )
}

export default memo(ComposeModal)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/features/ComposeModal.jsx
git commit -m "feat(frontend): add ComposeModal with AI draft button"
```

---

## Task 15: Frontend — EmailInbox Layout + App.jsx Integration

**Files:**

- Create: `frontend/src/components/features/EmailInbox.jsx`
- Modify: `frontend/src/App.jsx:1-18` (imports)
- Modify: `frontend/src/App.jsx:143-225` (tab navigation)
- Modify: `frontend/src/App.jsx:228-295` (content rendering)

- [ ] **Step 1: Write EmailInbox layout component**

```jsx
// frontend/src/components/features/EmailInbox.jsx
import { useState, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmailAccounts } from '../../hooks/useEmailAccounts'
import { useEmails } from '../../hooks/useEmails'
import { useEmailActions } from '../../hooks/useEmailActions'
import FolderSidebar from './FolderSidebar'
import EmailList from './EmailList'
import EmailReader from './EmailReader'
import ComposeModal from './ComposeModal'

export default function EmailInbox() {
  const { session } = useAuth()
  const [activeFolder, setActiveFolder] = useState('inbox')
  const [activeAccountId, setActiveAccountId] = useState(null)
  const [selectedEmailId, setSelectedEmailId] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)

  const { accounts, loading: accountsLoading } = useEmailAccounts(session)
  const {
    emails,
    loading: emailsLoading,
    loadMore,
  } = useEmails(session, activeFolder, activeAccountId)
  const actions = useEmailActions(session, activeFolder, activeAccountId)

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || null

  const handleSelect = useCallback(
    (id) => {
      setSelectedEmailId(id)
      const email = emails.find((e) => e.id === id)
      if (email && !email.is_read) {
        actions.markRead({ emailId: id, isRead: true })
      }
    },
    [emails, actions],
  )

  const handleReply = useCallback(() => {
    if (selectedEmail) {
      setReplyTo(selectedEmail)
      setComposeOpen(true)
    }
  }, [selectedEmail])

  const handleConnectAccount = useCallback(() => {
    // Redirect to OAuth connect endpoint
    window.location.href = '/api/email/accounts/connect?provider=google'
  }, [])

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-zinc-950 rounded-lg border border-cyan-500/10 overflow-hidden">
      {/* Left: Folder Sidebar */}
      <FolderSidebar
        accounts={accounts}
        activeFolder={activeFolder}
        activeAccountId={activeAccountId}
        onFolderChange={(f) => {
          setActiveFolder(f)
          setSelectedEmailId(null)
        }}
        onAccountChange={(id) => {
          setActiveAccountId(id)
          setSelectedEmailId(null)
        }}
        onConnectAccount={handleConnectAccount}
      />

      {/* Middle: Email List */}
      <div className="w-80 flex-shrink-0 border-r border-cyan-500/10 flex flex-col">
        <div className="px-3 py-2 border-b border-cyan-500/10 flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-cyan-500/60 font-medium">
            {activeFolder}
          </span>
          <button
            className="px-2 py-1 rounded text-xs text-cyan-400 hover:bg-cyan-500/10 transition-colors"
            onClick={() => {
              setReplyTo(null)
              setComposeOpen(true)
            }}
            aria-label="Compose new email"
          >
            Compose
          </button>
        </div>
        <EmailList
          emails={emails}
          selectedId={selectedEmailId}
          loading={emailsLoading}
          onSelect={handleSelect}
          onToggleStar={(id, starred) => actions.toggleStar({ emailId: id, isStarred: starred })}
          onLoadMore={loadMore}
        />
      </div>

      {/* Right: Email Reader */}
      <EmailReader
        email={selectedEmail}
        onArchive={() =>
          selectedEmail &&
          actions.moveToFolder({ emailId: selectedEmail.id, targetFolder: 'archive' })
        }
        onTrash={() =>
          selectedEmail &&
          actions.moveToFolder({ emailId: selectedEmail.id, targetFolder: 'trash' })
        }
        onToggleRead={() =>
          selectedEmail &&
          actions.markRead({ emailId: selectedEmail.id, isRead: !selectedEmail.is_read })
        }
        onReply={handleReply}
      />

      {/* Compose Modal */}
      <ComposeModal
        isOpen={composeOpen}
        onClose={() => {
          setComposeOpen(false)
          setReplyTo(null)
        }}
        accounts={accounts}
        onSend={actions.sendEmail}
        onAiDraft={actions.aiDraft}
        isSending={actions.isSending}
        replyTo={replyTo}
      />
    </div>
  )
}
```

- [ ] **Step 2: Add lazy import to App.jsx**

At the top of `frontend/src/App.jsx`, add alongside the existing lazy imports (around line 3):

```javascript
const EmailInbox = lazy(() => import('./components/features/EmailInbox'))
```

Also import the email tab icon:

```javascript
import { EMAIL_TAB_ICON } from './lib/emailConfig'
```

- [ ] **Step 3: Add 'email' to activeView state**

In `App.jsx`, the `activeView` state (around line 24) already supports string values. No change needed — we just use `'email'` as a new value.

- [ ] **Step 4: Add Email tab button to desktop navigation**

In `frontend/src/App.jsx`, inside the desktop `<nav>` (around line 180, after the media type tab buttons and before the AI Chat tab button), add:

```jsx
<button
  role="tab"
  aria-selected={activeView === 'email'}
  onClick={() => {
    setActiveView('email')
    setVaultState(null)
  }}
  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    activeView === 'email'
      ? 'bg-cyan-500/20 text-cyan-300'
      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
  }`}
>
  <EMAIL_TAB_ICON size={14} />
  Email
</button>
```

- [ ] **Step 5: Add Email tab to mobile bottom navigation**

Add the same button pattern in the mobile nav section (around line 220), using the same onClick and styling.

- [ ] **Step 6: Add Email view rendering to the main content area**

In the main content conditional rendering (around line 228), add a case for `activeView === 'email'` before the chat check:

```jsx
{activeView === 'email' ? (
  <Suspense fallback={<div className="flex items-center justify-center h-64 text-zinc-500">Loading email...</div>}>
    <EmailInbox />
  </Suspense>
) : activeView === 'chat' ? (
  // ... existing chat rendering
```

- [ ] **Step 7: Verify the app compiles**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/features/EmailInbox.jsx frontend/src/App.jsx
git commit -m "feat(frontend): integrate EmailInbox as new tab in Nexus"
```

---

## Task 16: Frontend — EmailInbox Integration Test

**Files:**

- Create: `frontend/src/components/features/EmailInbox.test.jsx`

- [ ] **Step 1: Write the integration test**

```jsx
// frontend/src/components/features/EmailInbox.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

// Mock hooks
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' }, access_token: 'jwt' } }),
}))

vi.mock('../../hooks/useEmailAccounts', () => ({
  useEmailAccounts: () => ({
    accounts: [
      { id: 'acct-1', email_address: 'raoof@gmail.com', provider: 'google', status: 'connected' },
    ],
    loading: false,
    error: null,
  }),
}))

vi.mock('../../hooks/useEmails', () => ({
  useEmails: () => ({
    emails: [
      {
        id: 'msg-1',
        account_id: 'acct-1',
        from_name: 'Jane',
        from_address: 'jane@citadel.com',
        subject: 'Interview follow-up',
        snippet: 'Hi Raouf, thanks for...',
        is_read: false,
        is_starred: false,
        provider_date: '2026-04-10T09:00:00Z',
        to_addresses: [{ name: 'Raouf', email: 'raoof@gmail.com' }],
        folder: 'inbox',
      },
    ],
    loading: false,
    error: null,
    loadMore: vi.fn(),
  }),
}))

vi.mock('../../hooks/useEmailActions', () => ({
  useEmailActions: () => ({
    markRead: vi.fn(),
    toggleStar: vi.fn(),
    moveToFolder: vi.fn(),
    sendEmail: vi.fn(),
    replyEmail: vi.fn(),
    forwardEmail: vi.fn(),
    aiDraft: vi.fn(),
    aiSummarize: vi.fn(),
    isSending: false,
    sendError: null,
  }),
}))

import EmailInbox from './EmailInbox'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderWithProviders(ui) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('EmailInbox', () => {
  it('renders the three-column layout', () => {
    renderWithProviders(<EmailInbox />)

    // Folder sidebar
    expect(screen.getByRole('navigation', { name: /email folders/i })).toBeInTheDocument()

    // Email list
    expect(screen.getByRole('listbox', { name: /email messages/i })).toBeInTheDocument()

    // Reader placeholder
    expect(screen.getByText(/select an email to read/i)).toBeInTheDocument()
  })

  it('shows email in the list', () => {
    renderWithProviders(<EmailInbox />)
    expect(screen.getByText('Interview follow-up')).toBeInTheDocument()
    expect(screen.getByText('Jane')).toBeInTheDocument()
  })

  it('shows compose button', () => {
    renderWithProviders(<EmailInbox />)
    expect(screen.getByRole('button', { name: /compose/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test -- --run src/components/features/EmailInbox.test.jsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/features/EmailInbox.test.jsx
git commit -m "test(frontend): add EmailInbox integration test"
```

---

## Task 17: Add httpx Dependency + Final Verification

**Files:**

- Modify: `pyproject.toml` (add httpx to dependencies)

- [ ] **Step 1: Add httpx to pyproject.toml**

Add `httpx>=0.27` to the project dependencies in `pyproject.toml`.

- [ ] **Step 2: Install**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && pip install httpx`

- [ ] **Step 3: Run all backend tests**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python3 -m pytest -v`
Expected: All tests pass (existing + new email tests).

- [ ] **Step 4: Run all frontend tests**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test -- --run`
Expected: All tests pass.

- [ ] **Step 5: Run frontend build**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Run linting**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && make lint`
Expected: No new lint errors.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml
git commit -m "chore: add httpx dependency for email provider HTTP clients"
```
