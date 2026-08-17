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
MAX_LABEL_NAME_LENGTH = 50


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


def _normalize_label_names(labels: list[str] | None) -> list[str]:
    """Normalize user-provided label names while preserving first-seen order."""

    names: list[str] = []
    seen: set[str] = set()
    for raw in labels or []:
        name = raw.strip().lstrip("#").strip()
        if not name:
            continue
        if len(name) > MAX_LABEL_NAME_LENGTH:
            raise HTTPException(status_code=400, detail="Label name too long")
        key = name.casefold()
        if key not in seen:
            seen.add(key)
            names.append(name)
    return names


async def _labels_for_notes(db, user_id: str, notes: list[dict]) -> list[dict]:
    if not notes:
        return notes
    links_resp = await run_blocking(
        db.from_("nexus_note_label_links").select("note_id,label_id").execute
    )
    labels_resp = await run_blocking(
        db.from_("nexus_note_labels")
        .select("id,name")
        .eq("user_id", user_id)
        .order("name")
        .execute
    )
    label_names = {row["id"]: row["name"] for row in (labels_resp.data or [])}
    note_ids = {note["id"] for note in notes}
    labels_by_note: dict[str, list[dict]] = {note_id: [] for note_id in note_ids}
    for link in links_resp.data or []:
        note_id = link.get("note_id")
        label_id = link.get("label_id")
        if note_id in labels_by_note and label_id in label_names:
            labels_by_note[note_id].append(
                {"id": label_id, "name": label_names[label_id]}
            )
    for note in notes:
        note["labels"] = sorted(
            labels_by_note.get(note["id"], []),
            key=lambda row: row["name"].casefold(),
        )
    return notes


async def _ensure_labels(db, user_id: str, names: list[str]) -> list[dict]:
    if not names:
        return []
    existing_resp = await run_blocking(
        db.from_("nexus_note_labels").select("*").eq("user_id", user_id).execute
    )
    existing = existing_resp.data or []
    by_key = {row["name"].casefold(): row for row in existing}
    missing = [name for name in names if name.casefold() not in by_key]
    if len(existing) + len(missing) > MAX_LABELS:
        raise HTTPException(
            status_code=409, detail=f"Label limit reached ({MAX_LABELS})"
        )
    for name in missing:
        inserted = await run_blocking(
            db.from_("nexus_note_labels")
            .insert({"user_id": user_id, "name": name})
            .execute
        )
        row = (inserted.data or [{}])[0]
        if row.get("id"):
            by_key[name.casefold()] = row
    return [by_key[name.casefold()] for name in names if name.casefold() in by_key]


async def _sync_note_labels(
    db, user_id: str, note_id: str, labels: list[str] | None
) -> list[dict]:
    names = _normalize_label_names(labels)
    rows = await _ensure_labels(db, user_id, names)
    await run_blocking(
        db.from_("nexus_note_label_links").delete().eq("note_id", note_id).execute
    )
    if rows:
        await run_blocking(
            db.from_("nexus_note_label_links")
            .insert([{"note_id": note_id, "label_id": row["id"]} for row in rows])
            .execute
        )
    return [{"id": row["id"], "name": row["name"]} for row in rows]


class NotesController(Controller):
    """Authenticated note, label, and checklist-item endpoints."""

    path = "/notes"

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
        notes = await _labels_for_notes(db, user_id, notes)

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
        await run_blocking(enforce_notes_rate_limit, user_id)
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
        created = hydrate_note_record((resp.data or [{}])[0])
        created["labels"] = await _sync_note_labels(
            db, user_id, created["id"], data.labels
        )
        return created

    # ---- Notes: update / soft-delete / restore ----------------------
    @patch("/{note_id:str}")
    async def update_note(
        self, note_id: str, data: UpdateNoteRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_notes_rate_limit, user_id)
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
        updated = hydrate_note_record(resp.data[0])
        if "labels" in fields and data.labels is not None:
            updated["labels"] = await _sync_note_labels(
                _db(access_token), user_id, note_id, data.labels
            )
        else:
            updated = (await _labels_for_notes(_db(access_token), user_id, [updated]))[
                0
            ]
        return updated

    @delete("/{note_id:str}", status_code=204)
    async def soft_delete_note(self, note_id: str, request: Request) -> None:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_notes_rate_limit, user_id)
        await run_blocking(
            _db(access_token)
            .from_("nexus_notes")
            .update({"deleted_at": datetime.now().astimezone().isoformat()})
            .eq("id", note_id)
            .eq("user_id", user_id)
            .execute
        )

    @post("/{note_id:str}/restore", status_code=200)
    async def restore_note(self, note_id: str, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_notes_rate_limit, user_id)
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

    # ---- Notes: pin / archive / move / copy -------------------------
    @post("/{note_id:str}/pin", status_code=200)
    async def pin_note(self, note_id: str, data: PinRequest, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_notes_rate_limit, user_id)
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

    @post("/{note_id:str}/archive", status_code=200)
    async def archive_note(
        self, note_id: str, data: ArchiveRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_notes_rate_limit, user_id)
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

    @post("/{note_id:str}/move", status_code=200)
    async def move_note(
        self, note_id: str, data: MoveNoteRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_notes_rate_limit, user_id)
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
        await run_blocking(enforce_notes_rate_limit, user_id)
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
        source_labels = await _labels_for_notes(
            db, user_id, [hydrate_note_record(dict(src))]
        )
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
        copied = hydrate_note_record((resp.data or [{}])[0])
        copied["labels"] = await _sync_note_labels(
            db,
            user_id,
            copied["id"],
            [label["name"] for label in source_labels[0].get("labels", [])],
        )
        return copied

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
    async def create_label(self, data: LabelCreateRequest, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_notes_rate_limit, user_id)
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
        await run_blocking(enforce_notes_rate_limit, user_id)
        await run_blocking(
            _db(access_token)
            .from_("nexus_note_labels")
            .delete()
            .eq("id", label_id)
            .eq("user_id", user_id)
            .execute
        )

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
        await run_blocking(enforce_notes_rate_limit, user_id)
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
        await run_blocking(enforce_notes_rate_limit, user_id)
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

    @post("/items/{item_id:str}/move", status_code=200)
    async def move_item(
        self, item_id: str, data: MoveNoteItemRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_notes_rate_limit, user_id)
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
        await run_blocking(enforce_notes_rate_limit, user_id)
        await run_blocking(
            _db(access_token)
            .from_("nexus_note_items")
            .delete()
            .eq("id", item_id)
            .eq("user_id", user_id)
            .execute
        )
