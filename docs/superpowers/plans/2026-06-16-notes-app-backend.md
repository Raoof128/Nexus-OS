# Notes App — Phase 1 (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete backend for the Keep-style Notes app — Supabase schema (4 tables, RLS, anti-IDOR composite FKs), encryption helpers, pure service logic, Pydantic schemas, and a `/api/notes` controller with full CRUD, pin/archive/move/copy, soft-delete/restore, lazy 7-day purge, labels, and checklist items.

**Architecture:** Controller (`notes_controller.py`, routing/DI) + pure service (`notes_service.py`, position/purge/validation logic), mirroring the Tasks app. All Supabase `.execute()` calls wrapped in `run_blocking`; per-request RLS PostgREST clients; mutations rate-limited; title/body/checklist text Fernet-encrypted via the graceful `protect_chat_content` pattern.

**Tech Stack:** Python 3.12 + Litestar + Pydantic v2; Supabase Postgres (PostgREST); pytest. Ruff (line-length 88, double quotes).

**Spec:** `docs/superpowers/specs/2026-06-16-notes-app-design.md`
**Branch:** `feat/notes-app` (off `main`)

---

## Naming decision (locked)

Tables are namespaced **`nexus_*`** (`nexus_notes`, `nexus_note_labels`,
`nexus_note_label_links`, `nexus_note_items`), matching the proven `nexus_tasks` /
`nexus_emails` convention and avoiding the bare-name collision that bit the Tasks
migration. This supersedes the un-namespaced draft names in §3/§6 of the spec.

Encrypted columns use the `_encrypted` suffix (`title_encrypted`,
`content_encrypted`, `text_encrypted`) consistent with `nexus_tasks.notes_encrypted`.

---

## File Structure

**Create:**
- `supabase/migrations/20260616000001_notes.sql` — 4 tables + RLS + composite FKs + indexes
- `backend/notes_service.py` — pure helpers: `next_position`, `purge_cutoff`, palette constants + `is_valid_color`/`is_valid_background`
- `backend/notes_schemas.py` — Pydantic request models
- `backend/notes_controller.py` — `NotesController` at `/api/notes`
- `tests/test_notes_service.py` — service unit tests
- `tests/test_notes_controller.py` — controller integration tests

**Modify:**
- `backend/data_protection.py` — add `protect_note_text` + `hydrate_note_record`
- `backend/rate_limit.py` — add `enforce_notes_rate_limit` + `_notes_rate_limiter`
- `backend/config.py` — add `notes_rate_limit_requests` / `notes_rate_limit_window_seconds`
- `backend/app.py` — import + register `NotesController`

---

### Task 1: Migration — schema, RLS, composite FKs, indexes

**Files:**
- Create: `supabase/migrations/20260616000001_notes.sql`

- [ ] **Step 1: Write the migration**

```sql
BEGIN;

-- Tables are namespaced `nexus_*` (matching nexus_tasks/nexus_emails) to avoid
-- colliding with any other tables in the project.
CREATE TABLE public.nexus_notes (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title_encrypted   TEXT,
  content_encrypted TEXT,
  type              TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'list')),
  color             TEXT NOT NULL DEFAULT 'default',
  background        TEXT,
  pinned            BOOLEAN NOT NULL DEFAULT false,
  archived          BOOLEAN NOT NULL DEFAULT false,
  position          DOUBLE PRECISION NOT NULL DEFAULT 0,
  reminder_at       TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite key target so note_items can require a same-owner reference.
  CONSTRAINT nexus_notes_id_user_key UNIQUE (user_id, id)
);

CREATE TABLE public.nexus_note_labels (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nexus_note_labels_user_name_key UNIQUE (user_id, name)
);

CREATE TABLE public.nexus_note_label_links (
  note_id  UUID NOT NULL REFERENCES public.nexus_notes (id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.nexus_note_labels (id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, label_id)
);

CREATE TABLE public.nexus_note_items (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  note_id        UUID NOT NULL,
  parent_id      UUID,
  text_encrypted TEXT,
  checked        BOOLEAN NOT NULL DEFAULT false,
  position       DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nexus_note_items_id_user_key UNIQUE (user_id, id),

  -- Cross-tenant integrity: an item's note MUST belong to the same user. The
  -- composite FK makes referencing another user's note structurally impossible
  -- (RLS only guards row ownership, not the owner of referenced rows).
  CONSTRAINT nexus_note_items_note_same_owner_fkey
    FOREIGN KEY (user_id, note_id)
    REFERENCES public.nexus_notes (user_id, id) ON DELETE CASCADE,

  -- Same guarantee for sub-items. parent_id is nullable; with MATCH SIMPLE the
  -- FK is skipped when parent_id IS NULL and enforced otherwise.
  CONSTRAINT nexus_note_items_parent_same_owner_fkey
    FOREIGN KEY (user_id, parent_id)
    REFERENCES public.nexus_note_items (user_id, id) ON DELETE CASCADE
);

ALTER TABLE public.nexus_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_labels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_label_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_label_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notes"
  ON public.nexus_notes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own note labels"
  ON public.nexus_note_labels FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own note items"
  ON public.nexus_note_items FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- Join table has no user_id: scope via parent-note ownership.
CREATE POLICY "Users manage own note label links"
  ON public.nexus_note_label_links FOR ALL
  USING (EXISTS (SELECT 1 FROM public.nexus_notes n
                 WHERE n.id = note_id AND n.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nexus_notes n
                 WHERE n.id = note_id AND n.user_id = auth.uid()));

CREATE INDEX nexus_notes_user_state_idx
  ON public.nexus_notes (user_id, archived, deleted_at, position);
CREATE INDEX nexus_notes_user_pinned_idx
  ON public.nexus_notes (user_id, pinned) WHERE pinned;
CREATE INDEX nexus_note_label_links_label_idx
  ON public.nexus_note_label_links (label_id);
CREATE INDEX nexus_note_items_user_note_position_idx
  ON public.nexus_note_items (user_id, note_id, position);

COMMIT;
```

- [ ] **Step 2: Sanity-check the SQL parses**

Run: `python3 -c "import pathlib, re; s=pathlib.Path('supabase/migrations/20260616000001_notes.sql').read_text(); assert s.count('(') == s.count(')'), 'unbalanced parens'; assert s.strip().startswith('BEGIN') and s.strip().endswith('COMMIT;'); print('ok')"`
Expected: `ok`

> Applying to the remote Supabase project is a deploy step done after this plan
> (the backend tests below mock PostgREST and do not require the live schema).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260616000001_notes.sql
git commit -m "feat(notes): schema migration — 4 tables, RLS, composite FKs, indexes"
```

---

### Task 2: notes_service — pure helpers

**Files:**
- Create: `backend/notes_service.py`
- Test: `tests/test_notes_service.py`

- [ ] **Step 1: Write the failing test**

```python
"""Unit tests for the Notes service helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.notes_service import (
    BACKGROUNDS,
    COLORS,
    is_valid_background,
    is_valid_color,
    next_position,
    purge_cutoff,
)


def test_next_position_empty():
    assert next_position([]) == 1.0


def test_next_position_appends_after_max():
    assert next_position([1.0, 5.0, 3.0]) == 6.0


def test_purge_cutoff_is_seven_days_before():
    now = datetime(2026, 6, 16, 12, 0, tzinfo=timezone.utc)
    assert purge_cutoff(now) == (now - timedelta(days=7)).isoformat()


def test_color_validation():
    assert is_valid_color("default") is True
    assert "Coral" in COLORS
    assert is_valid_color("Coral") is True
    assert is_valid_color("not-a-color") is False


def test_background_validation():
    assert is_valid_background(None) is True  # background is optional
    assert "Travel" in BACKGROUNDS
    assert is_valid_background("Travel") is True
    assert is_valid_background("nope") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_notes_service.py -v`
Expected: FAIL (`ModuleNotFoundError: backend.notes_service`)

- [ ] **Step 3: Implement**

```python
"""Pure helpers for the Notes app: ordering, trash purge, palette validation."""

from __future__ import annotations

from datetime import datetime, timedelta

# Keep's 12 colors and 9 backgrounds (names matched to Google Keep). The UI maps
# each name to a neon/glass variant; the backend only validates membership.
COLORS: tuple[str, ...] = (
    "default",
    "Coral",
    "Peach",
    "Sand",
    "Mint",
    "Sage",
    "Fog",
    "Storm",
    "Dusk",
    "Blossom",
    "Clay",
    "Chalk",
)

BACKGROUNDS: tuple[str, ...] = (
    "Groceries",
    "Food",
    "Music",
    "Recipes",
    "Notes",
    "Places",
    "Travel",
    "Video",
    "Celebration",
)

TRASH_RETENTION_DAYS = 7


def next_position(positions: list[float]) -> float:
    """Return a position that sorts a new row after every existing one."""

    if not positions:
        return 1.0
    return max(positions) + 1.0


def purge_cutoff(now: datetime) -> str:
    """ISO timestamp; rows with deleted_at older than this are purged."""

    return (now - timedelta(days=TRASH_RETENTION_DAYS)).isoformat()


def is_valid_color(color: str) -> bool:
    return color in COLORS


def is_valid_background(background: str | None) -> bool:
    return background is None or background in BACKGROUNDS
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_notes_service.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/notes_service.py tests/test_notes_service.py
git commit -m "feat(notes): service helpers — position, purge cutoff, palette validation"
```

---

### Task 3: data_protection — note encryption helpers

**Files:**
- Modify: `backend/data_protection.py` (append after `hydrate_task_record`)
- Test: `tests/test_notes_encryption.py`

- [ ] **Step 1: Write the failing test**

```python
"""Notes field-level encryption helpers."""

from __future__ import annotations

from backend.data_protection import hydrate_note_record, protect_note_text


def test_protect_note_text_none_passthrough():
    assert protect_note_text(None) is None


def test_protect_then_hydrate_roundtrip_plaintext_when_no_key(monkeypatch):
    # With no encryption key configured, content stores as plaintext (graceful).
    import backend.data_protection as dp

    monkeypatch.setattr(dp, "get_takeaway_cipher", lambda: None)
    stored = dp.protect_note_text("buy milk")
    assert stored == "buy milk"
    record = {
        "title_encrypted": dp.protect_note_text("Shopping"),
        "content_encrypted": stored,
    }
    hydrated = dp.hydrate_note_record(record)
    assert hydrated["title_encrypted"] == "Shopping"
    assert hydrated["content_encrypted"] == "buy milk"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_notes_encryption.py -v`
Expected: FAIL (`ImportError: cannot import name 'protect_note_text'`)

- [ ] **Step 3: Implement (append to `backend/data_protection.py`)**

```python
def protect_note_text(text: str | None) -> str | None:
    """Encrypt note text (title/body/checklist) when a key is configured, else plaintext.

    Mirrors ``protect_chat_content`` / ``protect_task_notes``: graceful in dev
    (no key -> plaintext) while the ``enc::`` prefix lets ``decrypt_takeaway``
    transparently restore on read.
    """

    if text is None:
        return None

    cipher = get_takeaway_cipher()
    if cipher is None:
        return text

    token = cipher.encrypt(text.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def hydrate_note_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a note record with encrypted text fields decrypted for the UI."""

    hydrated = dict(record)
    if "title_encrypted" in record:
        hydrated["title_encrypted"] = decrypt_takeaway(record.get("title_encrypted"))
    if "content_encrypted" in record:
        hydrated["content_encrypted"] = decrypt_takeaway(
            record.get("content_encrypted")
        )
    if "text_encrypted" in record:
        hydrated["text_encrypted"] = decrypt_takeaway(record.get("text_encrypted"))
    return hydrated
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_notes_encryption.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/data_protection.py tests/test_notes_encryption.py
git commit -m "feat(notes): field-level encryption + hydrate helpers"
```

---

### Task 4: rate_limit + config — notes limiter

**Files:**
- Modify: `backend/config.py:51-52` (add notes settings after the tasks ones)
- Modify: `backend/rate_limit.py` (mirror the tasks limiter)

- [ ] **Step 1: Add config settings**

In `backend/config.py`, after the `tasks_rate_limit_window_seconds` line, add:

```python
    notes_rate_limit_requests: int = 120
    notes_rate_limit_window_seconds: int = 60
```

- [ ] **Step 2: Add the limiter global**

In `backend/rate_limit.py`, after `_tasks_rate_limiter: RateLimiter | None = None`, add:

```python
_notes_rate_limiter: RateLimiter | None = None
```

- [ ] **Step 3: Add the enforce function**

In `backend/rate_limit.py`, after `enforce_tasks_rate_limit`, add:

```python
def enforce_notes_rate_limit(user_id: str) -> None:
    """Apply a generous per-user limit to note mutations (mirrors tasks)."""

    global _notes_rate_limiter
    settings = get_settings()
    if _notes_rate_limiter is None:
        _notes_rate_limiter = _create_rate_limiter(
            max_requests=settings.notes_rate_limit_requests,
            window_seconds=settings.notes_rate_limit_window_seconds,
        )
    _notes_rate_limiter.enforce(f"notes:{user_id}")
```

- [ ] **Step 4: Reset it in `reset_rate_limiters`**

Replace the body of `reset_rate_limiters` with:

```python
def reset_rate_limiters() -> None:
    """Reset cached rate limiter instances for isolated tests."""

    global _ai_rate_limiter, _auth_rate_limiter, _tasks_rate_limiter
    global _notes_rate_limiter
    _ai_rate_limiter = None
    _auth_rate_limiter = None
    _tasks_rate_limiter = None
    _notes_rate_limiter = None
```

- [ ] **Step 5: Verify nothing broke**

Run: `python3 -m pytest tests/ -q -k "rate or config" && python3 -m ruff check backend`
Expected: pass; "All checks passed!"

- [ ] **Step 6: Commit**

```bash
git add backend/config.py backend/rate_limit.py
git commit -m "feat(notes): per-user rate limiter"
```

---

### Task 5: notes_schemas — request models

**Files:**
- Create: `backend/notes_schemas.py`
- Test: `tests/test_notes_schemas.py`

- [ ] **Step 1: Write the failing test**

```python
"""Validation tests for Notes request schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.notes_schemas import (
    CreateNoteRequest,
    LabelCreateRequest,
    UpdateNoteRequest,
)


def test_create_note_defaults():
    req = CreateNoteRequest(title="Hello")
    assert req.type == "text"
    assert req.color == "default"
    assert req.labels == []


def test_create_note_rejects_bad_type():
    with pytest.raises(ValidationError):
        CreateNoteRequest(title="x", type="audio")


def test_update_note_all_optional():
    req = UpdateNoteRequest()
    assert req.model_dump(exclude_unset=True) == {}


def test_label_name_required():
    with pytest.raises(ValidationError):
        LabelCreateRequest(name="")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_notes_schemas.py -v`
Expected: FAIL (`ModuleNotFoundError: backend.notes_schemas`)

- [ ] **Step 3: Implement**

```python
"""Pydantic v2 schemas for the Notes app."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_TYPE_PATTERN = "^(text|list)$"


class CreateNoteRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, max_length=500)
    content: str | None = Field(default=None, max_length=20000)
    type: str = Field(default="text", pattern=_TYPE_PATTERN)
    color: str = Field(default="default", max_length=40)
    background: str | None = Field(default=None, max_length=40)
    labels: list[str] = Field(default_factory=list)
    reminder_at: datetime | None = None


class UpdateNoteRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, max_length=500)
    content: str | None = Field(default=None, max_length=20000)
    type: str | None = Field(default=None, pattern=_TYPE_PATTERN)
    color: str | None = Field(default=None, max_length=40)
    background: str | None = Field(default=None, max_length=40)
    labels: list[str] | None = None
    reminder_at: datetime | None = None


class MoveNoteRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    position: float


class PinRequest(BaseModel):
    pinned: bool


class ArchiveRequest(BaseModel):
    archived: bool


class LabelCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=50)


class CreateNoteItemRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str | None = Field(default=None, max_length=20000)
    checked: bool = False
    parent_id: str | None = None


class UpdateNoteItemRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str | None = Field(default=None, max_length=20000)
    checked: bool | None = None


class MoveNoteItemRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    position: float | None = None
    parent_id: str | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_notes_schemas.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/notes_schemas.py tests/test_notes_schemas.py
git commit -m "feat(notes): Pydantic request schemas"
```

---

### Task 6: notes_controller — scaffold + notes CRUD + lazy purge

**Files:**
- Create: `backend/notes_controller.py`
- Test: `tests/test_notes_controller.py`

This task creates the controller with the lists/read/create/update/delete-restore
core. Later tasks append more handlers to the same class.

- [ ] **Step 1: Write the failing test**

```python
"""Integration tests for the Notes controller."""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from litestar.status_codes import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
)
from litestar.testing import TestClient

from backend.app import app


@dataclass
class FakeResp:
    data: list[dict] | None = None


@pytest.fixture()
def client():
    with TestClient(app=app, base_url="http://testserver.local") as tc:
        tc.cookies.set("nexus-access-token", "fake-token")
        yield tc


@pytest.fixture(autouse=True)
def _inject_auth(monkeypatch):
    from backend import auth as auth_mod
    from backend.rate_limit import reset_rate_limiters

    reset_rate_limiters()

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            scope.setdefault("state", {})["user_id"] = "user-123"
            scope["state"]["access_token"] = "fake-token"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)
    yield
    reset_rate_limiters()


def _chain(result):
    """Return a MagicMock PostgREST builder whose .execute() returns result."""
    builder = MagicMock()
    builder.execute.return_value = result
    for method in (
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "lt",
        "is_",
        "order",
        "maybe_single",
    ):
        getattr(builder, method).return_value = builder
    return builder


def test_list_notes_runs_purge_then_selects(client):
    purge = _chain(FakeResp(data=[]))
    select = _chain(FakeResp(data=[{"id": "n1", "title_encrypted": "Hi"}]))
    db = MagicMock()
    db.from_.side_effect = [purge, select]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.get("/api/notes")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["id"] == "n1"
    # purge issued a delete filtered by deleted_at < cutoff
    purge.delete.assert_called()
    purge.lt.assert_any_call("deleted_at", purge.lt.call_args_list[0].args[1])


def test_create_note(client):
    positions = _chain(FakeResp(data=[{"position": 2.0}]))
    insert = _chain(FakeResp(data=[{"id": "n2", "title_encrypted": "T", "type": "text"}]))
    db = MagicMock()
    db.from_.side_effect = [positions, insert]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes", json={"title": "T", "content": "body"})
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["id"] == "n2"


def test_soft_delete_sets_deleted_at(client):
    builder = _chain(FakeResp(data=[{"id": "n1"}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.delete("/api/notes/n1")
    assert res.status_code == HTTP_204_NO_CONTENT
    # the update set deleted_at (soft delete), not a hard delete
    builder.update.assert_called()


def test_restore_clears_deleted_at(client):
    builder = _chain(FakeResp(data=[{"id": "n1", "deleted_at": None}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/restore")
    assert res.status_code == HTTP_200_OK
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_notes_controller.py -v`
Expected: FAIL (route 404 / module import error)

- [ ] **Step 3: Implement the controller scaffold + these handlers**

```python
"""REST endpoints for the Notes app."""

from __future__ import annotations

import logging
from datetime import datetime

from litestar import Controller, Request, delete, get, patch, post
from litestar.exceptions import HTTPException

try:
    from .config import get_settings
    from .data_protection import hydrate_note_record, protect_note_text
    from .notes_schemas import (
        ArchiveRequest,
        CreateNoteItemRequest,
        CreateNoteRequest,
        LabelCreateRequest,
        MoveNoteItemRequest,
        MoveNoteRequest,
        PinRequest,
        UpdateNoteItemRequest,
        UpdateNoteRequest,
    )
    from .notes_service import (
        is_valid_background,
        is_valid_color,
        next_position,
        purge_cutoff,
    )
    from .rate_limit import enforce_notes_rate_limit
    from .services import create_supabase_user_client, run_blocking
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from data_protection import hydrate_note_record, protect_note_text
    from notes_schemas import (
        ArchiveRequest,
        CreateNoteItemRequest,
        CreateNoteRequest,
        LabelCreateRequest,
        MoveNoteItemRequest,
        MoveNoteRequest,
        PinRequest,
        UpdateNoteItemRequest,
        UpdateNoteRequest,
    )
    from notes_service import (
        is_valid_background,
        is_valid_color,
        next_position,
        purge_cutoff,
    )
    from rate_limit import enforce_notes_rate_limit
    from services import create_supabase_user_client, run_blocking

logger = logging.getLogger(__name__)

MAX_LABELS = 50


def _require_auth(request: Request) -> tuple[str, str]:
    settings = get_settings()
    access_token = request.cookies.get(settings.access_cookie_name)
    user_id = getattr(request.state, "user_id", None)
    if not access_token or not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id, access_token


def _db(access_token: str):
    return create_supabase_user_client(access_token)


def _validate_palette(color: str | None, background: str | None) -> None:
    if color is not None and not is_valid_color(color):
        raise HTTPException(status_code=400, detail="Unknown color")
    if not is_valid_background(background):
        raise HTTPException(status_code=400, detail="Unknown background")


class NotesController(Controller):
    """Authenticated note, label, and checklist-item endpoints."""

    path = "/api/notes"

    # ---- Notes: read + create ---------------------------------------
    @get("")
    async def list_notes(
        self,
        request: Request,
        archived: bool = False,
        trashed: bool = False,
        label: str | None = None,
        type: str | None = None,
    ) -> list[dict]:
        user_id, access_token = _require_auth(request)
        db = _db(access_token)

        # Lazy 7-day Trash purge: hard-delete the caller's expired rows first.
        await run_blocking(
            db.from_("nexus_notes")
            .delete()
            .eq("user_id", user_id)
            .lt("deleted_at", purge_cutoff(datetime.now().astimezone()))
            .execute
        )

        query = db.from_("nexus_notes").select("*").eq("user_id", user_id)
        query = query.eq("archived", archived)
        if trashed:
            query = query.not_.is_("deleted_at", "null")
        else:
            query = query.is_("deleted_at", "null")
        if type is not None:
            query = query.eq("type", type)
        resp = await run_blocking(query.order("position").execute)
        notes = [hydrate_note_record(r) for r in (resp.data or [])]

        if label:
            links = await run_blocking(
                db.from_("nexus_note_label_links")
                .select("note_id")
                .eq("label_id", label)
                .execute
            )
            allowed = {r["note_id"] for r in (links.data or [])}
            notes = [n for n in notes if n["id"] in allowed]
        return notes

    @post("", status_code=201)
    async def create_note(self, data: CreateNoteRequest, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        _validate_palette(data.color, data.background)
        db = _db(access_token)
        existing = await run_blocking(
            db.from_("nexus_notes").select("position").eq("user_id", user_id).execute
        )
        positions = [r.get("position", 0.0) for r in (existing.data or [])]
        row = {
            "user_id": user_id,
            "title_encrypted": protect_note_text(data.title),
            "content_encrypted": protect_note_text(data.content),
            "type": data.type,
            "color": data.color,
            "background": data.background,
            "position": next_position(positions),
            "reminder_at": data.reminder_at.isoformat() if data.reminder_at else None,
        }
        resp = await run_blocking(db.from_("nexus_notes").insert(row).execute)
        return hydrate_note_record((resp.data or [{}])[0])

    # ---- Notes: update / soft-delete / restore ----------------------
    @patch("/{note_id:str}")
    async def update_note(
        self, note_id: str, data: UpdateNoteRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        _validate_palette(data.color, data.background)
        fields = data.model_dump(exclude_unset=True)
        patch_data: dict = {}
        if "title" in fields:
            patch_data["title_encrypted"] = protect_note_text(data.title)
        if "content" in fields:
            patch_data["content_encrypted"] = protect_note_text(data.content)
        for key in ("type", "color", "background"):
            if key in fields and fields[key] is not None:
                patch_data[key] = fields[key]
        if "reminder_at" in fields:
            patch_data["reminder_at"] = (
                data.reminder_at.isoformat() if data.reminder_at else None
            )
        patch_data["updated_at"] = datetime.now().astimezone().isoformat()
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_notes")
            .update(patch_data)
            .eq("id", note_id)
            .eq("user_id", user_id)
            .execute
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Note not found")
        return hydrate_note_record(resp.data[0])

    @delete("/{note_id:str}", status_code=204)
    async def soft_delete_note(self, note_id: str, request: Request) -> None:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        await run_blocking(
            _db(access_token)
            .from_("nexus_notes")
            .update({"deleted_at": datetime.now().astimezone().isoformat()})
            .eq("id", note_id)
            .eq("user_id", user_id)
            .execute
        )

    @post("/{note_id:str}/restore")
    async def restore_note(self, note_id: str, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_notes")
            .update({"deleted_at": None})
            .eq("id", note_id)
            .eq("user_id", user_id)
            .execute
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Note not found")
        return hydrate_note_record(resp.data[0])
```

- [ ] **Step 4: Register the controller in `backend/app.py`**

Add to the `try`/`except` import blocks (mirror the `TasksController` lines):

```python
    from .notes_controller import NotesController
```
```python
    from notes_controller import NotesController
```

Add `NotesController,` to the `route_handlers=[ ... ]` list (after `TasksController,`).

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m pytest tests/test_notes_controller.py -v`
Expected: PASS (4 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/notes_controller.py backend/app.py tests/test_notes_controller.py
git commit -m "feat(notes): controller scaffold — notes CRUD + lazy purge + soft-delete/restore"
```

---

### Task 7: Pin / archive / move / copy handlers

**Files:**
- Modify: `backend/notes_controller.py` (append handlers to `NotesController`)
- Test: `tests/test_notes_controller.py` (append)

- [ ] **Step 1: Write the failing tests (append)**

```python
def test_pin_note(client):
    builder = _chain(FakeResp(data=[{"id": "n1", "pinned": True}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/pin", json={"pinned": True})
    assert res.status_code == HTTP_200_OK
    assert res.json()["pinned"] is True


def test_archive_note(client):
    builder = _chain(FakeResp(data=[{"id": "n1", "archived": True}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/archive", json={"archived": True})
    assert res.status_code == HTTP_200_OK
    assert res.json()["archived"] is True


def test_move_note_persists_position(client):
    builder = _chain(FakeResp(data=[{"id": "n1", "position": 1.5}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/move", json={"position": 1.5})
    assert res.status_code == HTTP_200_OK
    builder.update.assert_called()


def test_copy_note_duplicates_source(client):
    source = {
        "id": "n1",
        "user_id": "user-123",
        "title_encrypted": "T",
        "content_encrypted": "B",
        "type": "text",
        "color": "Coral",
        "background": None,
        "reminder_at": None,
    }
    fetch = _chain(FakeResp(data=source))  # maybe_single -> dict
    positions = _chain(FakeResp(data=[{"position": 3.0}]))
    insert = _chain(FakeResp(data=[{**source, "id": "n2"}]))
    db = MagicMock()
    db.from_.side_effect = [fetch, positions, insert]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/copy")
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["id"] == "n2"
    insert.insert.assert_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_notes_controller.py -k "pin or archive or move or copy" -v`
Expected: FAIL (routes 404/405)

- [ ] **Step 3: Implement (append these handlers inside `NotesController`)**

```python
    # ---- Notes: pin / archive / move / copy -------------------------
    @post("/{note_id:str}/pin")
    async def pin_note(
        self, note_id: str, data: PinRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_notes")
            .update({"pinned": data.pinned})
            .eq("id", note_id)
            .eq("user_id", user_id)
            .execute
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Note not found")
        return hydrate_note_record(resp.data[0])

    @post("/{note_id:str}/archive")
    async def archive_note(
        self, note_id: str, data: ArchiveRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_notes")
            .update({"archived": data.archived})
            .eq("id", note_id)
            .eq("user_id", user_id)
            .execute
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Note not found")
        return hydrate_note_record(resp.data[0])

    @post("/{note_id:str}/move")
    async def move_note(
        self, note_id: str, data: MoveNoteRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_notes")
            .update({"position": data.position})
            .eq("id", note_id)
            .eq("user_id", user_id)
            .execute
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Note not found")
        return hydrate_note_record(resp.data[0])

    @post("/{note_id:str}/copy", status_code=201)
    async def copy_note(self, note_id: str, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        db = _db(access_token)
        current = await run_blocking(
            db.from_("nexus_notes")
            .select("*")
            .eq("id", note_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute
        )
        if not current or not current.data:
            raise HTTPException(status_code=404, detail="Note not found")
        src = current.data
        existing = await run_blocking(
            db.from_("nexus_notes").select("position").eq("user_id", user_id).execute
        )
        positions = [r.get("position", 0.0) for r in (existing.data or [])]
        row = {
            "user_id": user_id,
            "title_encrypted": src.get("title_encrypted"),
            "content_encrypted": src.get("content_encrypted"),
            "type": src.get("type", "text"),
            "color": src.get("color", "default"),
            "background": src.get("background"),
            "position": next_position(positions),
            "reminder_at": src.get("reminder_at"),
        }
        resp = await run_blocking(db.from_("nexus_notes").insert(row).execute)
        return hydrate_note_record((resp.data or [{}])[0])
```

> Note: `copy` duplicates the note's scalar fields. Copying its checklist items +
> label links is a deliberate v1 simplification (a fresh copy starts empty of items);
> revisit if users expect full deep-copy.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_notes_controller.py -k "pin or archive or move or copy" -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/notes_controller.py tests/test_notes_controller.py
git commit -m "feat(notes): pin/archive/move/copy handlers"
```

---

### Task 8: Label management (50-cap + unique)

**Files:**
- Modify: `backend/notes_controller.py` (append handlers)
- Test: `tests/test_notes_controller.py` (append)

- [ ] **Step 1: Write the failing tests (append)**

```python
from litestar.status_codes import HTTP_409_CONFLICT  # add to existing imports


def test_list_labels(client):
    builder = _chain(FakeResp(data=[{"id": "l1", "name": "work"}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.get("/api/notes/labels")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["name"] == "work"


def test_create_label(client):
    count = _chain(FakeResp(data=[{"id": "l1"}]))  # 1 existing, under cap
    insert = _chain(FakeResp(data=[{"id": "l2", "name": "home"}]))
    db = MagicMock()
    db.from_.side_effect = [count, insert]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/labels", json={"name": "home"})
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["name"] == "home"


def test_create_label_rejected_at_cap(client):
    count = _chain(FakeResp(data=[{"id": f"l{i}"} for i in range(50)]))
    db = MagicMock()
    db.from_.return_value = count
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/labels", json={"name": "over"})
    assert res.status_code == HTTP_409_CONFLICT


def test_delete_label(client):
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=[]))
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.delete("/api/notes/labels/l1")
    assert res.status_code == HTTP_204_NO_CONTENT
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_notes_controller.py -k "label" -v`
Expected: FAIL (routes 404)

- [ ] **Step 3: Implement (append inside `NotesController`)**

```python
    # ---- Labels -----------------------------------------------------
    @get("/labels")
    async def list_labels(self, request: Request) -> list[dict]:
        user_id, access_token = _require_auth(request)
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_note_labels")
            .select("*")
            .eq("user_id", user_id)
            .order("name")
            .execute
        )
        return resp.data or []

    @post("/labels", status_code=201)
    async def create_label(
        self, data: LabelCreateRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        db = _db(access_token)
        existing = await run_blocking(
            db.from_("nexus_note_labels").select("id").eq("user_id", user_id).execute
        )
        if len(existing.data or []) >= MAX_LABELS:
            raise HTTPException(
                status_code=409, detail=f"Label limit reached ({MAX_LABELS})"
            )
        resp = await run_blocking(
            db.from_("nexus_note_labels")
            .insert({"user_id": user_id, "name": data.name})
            .execute
        )
        return (resp.data or [{}])[0]

    @delete("/labels/{label_id:str}", status_code=204)
    async def delete_label(self, label_id: str, request: Request) -> None:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        await run_blocking(
            _db(access_token)
            .from_("nexus_note_labels")
            .delete()
            .eq("id", label_id)
            .eq("user_id", user_id)
            .execute
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_notes_controller.py -k "label" -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/notes_controller.py tests/test_notes_controller.py
git commit -m "feat(notes): label management with 50-cap + unique name"
```

---

### Task 9: Checklist item endpoints

**Files:**
- Modify: `backend/notes_controller.py` (append handlers)
- Test: `tests/test_notes_controller.py` (append)

- [ ] **Step 1: Write the failing tests (append)**

```python
def test_list_items(client):
    builder = _chain(FakeResp(data=[{"id": "i1", "text_encrypted": "milk", "checked": False}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.get("/api/notes/n1/items")
    assert res.status_code == HTTP_200_OK
    assert res.json()[0]["text_encrypted"] == "milk"


def test_add_item(client):
    positions = _chain(FakeResp(data=[{"position": 1.0}]))
    insert = _chain(FakeResp(data=[{"id": "i2", "text_encrypted": "eggs", "checked": False}]))
    db = MagicMock()
    db.from_.side_effect = [positions, insert]
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/n1/items", json={"text": "eggs"})
    assert res.status_code == HTTP_201_CREATED
    assert res.json()["text_encrypted"] == "eggs"


def test_update_item_check(client):
    builder = _chain(FakeResp(data=[{"id": "i1", "checked": True}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.patch("/api/notes/items/i1", json={"checked": True})
    assert res.status_code == HTTP_200_OK
    assert res.json()["checked"] is True


def test_move_item(client):
    builder = _chain(FakeResp(data=[{"id": "i1", "position": 2.5}]))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/notes/items/i1/move", json={"position": 2.5})
    assert res.status_code == HTTP_200_OK
    builder.update.assert_called()


def test_delete_item(client):
    db = MagicMock()
    db.from_.return_value = _chain(FakeResp(data=[]))
    with patch("backend.notes_controller.create_supabase_user_client", return_value=db):
        res = client.delete("/api/notes/items/i1")
    assert res.status_code == HTTP_204_NO_CONTENT
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_notes_controller.py -k "item" -v`
Expected: FAIL (routes 404)

- [ ] **Step 3: Implement (append inside `NotesController`)**

```python
    # ---- Checklist items --------------------------------------------
    @get("/{note_id:str}/items")
    async def list_items(self, note_id: str, request: Request) -> list[dict]:
        user_id, access_token = _require_auth(request)
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_note_items")
            .select("*")
            .eq("user_id", user_id)
            .eq("note_id", note_id)
            .order("position")
            .execute
        )
        return [hydrate_note_record(r) for r in (resp.data or [])]

    @post("/{note_id:str}/items", status_code=201)
    async def add_item(
        self, note_id: str, data: CreateNoteItemRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        db = _db(access_token)
        existing = await run_blocking(
            db.from_("nexus_note_items")
            .select("position")
            .eq("user_id", user_id)
            .eq("note_id", note_id)
            .execute
        )
        positions = [r.get("position", 0.0) for r in (existing.data or [])]
        row = {
            "user_id": user_id,
            "note_id": note_id,
            "parent_id": data.parent_id,
            "text_encrypted": protect_note_text(data.text),
            "checked": data.checked,
            "position": next_position(positions),
        }
        resp = await run_blocking(db.from_("nexus_note_items").insert(row).execute)
        return hydrate_note_record((resp.data or [{}])[0])

    @patch("/items/{item_id:str}")
    async def update_item(
        self, item_id: str, data: UpdateNoteItemRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        fields = data.model_dump(exclude_unset=True)
        patch_data: dict = {}
        if "text" in fields:
            patch_data["text_encrypted"] = protect_note_text(data.text)
        if "checked" in fields and data.checked is not None:
            patch_data["checked"] = data.checked
        patch_data["updated_at"] = datetime.now().astimezone().isoformat()
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_note_items")
            .update(patch_data)
            .eq("id", item_id)
            .eq("user_id", user_id)
            .execute
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Item not found")
        return hydrate_note_record(resp.data[0])

    @post("/items/{item_id:str}/move")
    async def move_item(
        self, item_id: str, data: MoveNoteItemRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        patch_data = data.model_dump(exclude_unset=True)
        if not patch_data:
            raise HTTPException(status_code=400, detail="No fields to move")
        resp = await run_blocking(
            _db(access_token)
            .from_("nexus_note_items")
            .update(patch_data)
            .eq("id", item_id)
            .eq("user_id", user_id)
            .execute
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Item not found")
        return hydrate_note_record(resp.data[0])

    @delete("/items/{item_id:str}", status_code=204)
    async def delete_item(self, item_id: str, request: Request) -> None:
        user_id, access_token = _require_auth(request)
        enforce_notes_rate_limit(user_id)
        await run_blocking(
            _db(access_token)
            .from_("nexus_note_items")
            .delete()
            .eq("id", item_id)
            .eq("user_id", user_id)
            .execute
        )
```

- [ ] **Step 2 caveat:** the item routes (`/items/{id}`) and note routes
  (`/{note_id}/items`) must not collide. Litestar matches the static `items` segment
  before the `{note_id:str}` param, so `/api/notes/items/i1` resolves to the item
  handlers — correct. Verify in Step 4 that all item tests pass.

- [ ] **Step 3 (cont.) Run tests to verify they pass**

Run: `python3 -m pytest tests/test_notes_controller.py -k "item" -v`
Expected: PASS (5 passed)

- [ ] **Step 4: Commit**

```bash
git add backend/notes_controller.py tests/test_notes_controller.py
git commit -m "feat(notes): checklist item endpoints"
```

---

### Task 10: Full backend quality gates

**Files:** none (verification)

- [ ] **Step 1: Run the whole backend suite + lint + format**

Run: `python3 -m pytest -q && python3 -m ruff check backend tests && python3 -m ruff format --check backend tests`
Expected: all tests pass; "All checks passed!"; "N files already formatted".

- [ ] **Step 2: If ruff format reports changes, apply and re-verify**

Run: `python3 -m ruff format backend tests && python3 -m ruff check backend tests`
Expected: clean.

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A && git commit -m "chore(notes): satisfy backend gates"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §3 model → T1; §2 encryption → T3; rate limit → T4; §4 endpoints
  → list/create/update/delete/restore (T6), pin/archive/move/copy (T7), labels (T8),
  items (T9); lazy purge (§1.1 #2) → T6 `list_notes`; palette validation (§4) → T2+T6;
  label cap (§4) → T8. Search/reminders are Phase 3 (separate plan); frontend is
  Phase 2.
- **Naming:** all tables `nexus_*`; encrypted columns `*_encrypted`; helpers
  `protect_note_text`/`hydrate_note_record`/`next_position`/`purge_cutoff`/
  `is_valid_color`/`is_valid_background`/`enforce_notes_rate_limit` are used
  identically across tasks.
- **Verification points for the implementer:**
  1. `_chain` includes `lt`, `is_`, `not_` chainable mocks; `not_.is_` is accessed as an
     attribute chain — if a test needs `not_`, add it to the `_chain` method list (the
     trashed-filter path in `list_notes` uses `query.not_.is_(...)`; the default path
     uses `query.is_(...)`). The provided tests exercise the default (non-trashed) path.
  2. `copy` is a shallow duplicate (scalar fields only) by design — noted in T7.
  3. Applying the migration to remote Supabase is a deploy step after this plan, not a
     test dependency.
```
