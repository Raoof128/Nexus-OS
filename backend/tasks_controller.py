"""REST endpoints for the Tasks app."""

from __future__ import annotations

import logging

from litestar import Controller, Request, delete, get, patch, post
from litestar.exceptions import HTTPException

try:
    from .config import get_settings
    from .data_protection import hydrate_task_record, protect_task_notes
    from .rate_limit import enforce_tasks_rate_limit
    from .services import create_supabase_user_client, run_blocking
    from .tasks_schemas import (
        CreateTaskRequest,
        MoveTaskRequest,
        TaskListCreateRequest,
        TaskListUpdateRequest,
        UpdateTaskRequest,
    )
    from .tasks_service import next_occurrence, next_position
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from data_protection import hydrate_task_record, protect_task_notes
    from rate_limit import enforce_tasks_rate_limit
    from services import create_supabase_user_client, run_blocking
    from tasks_schemas import (
        CreateTaskRequest,
        MoveTaskRequest,
        TaskListCreateRequest,
        TaskListUpdateRequest,
        UpdateTaskRequest,
    )
    from tasks_service import next_occurrence, next_position

logger = logging.getLogger(__name__)


def _require_auth(request: Request) -> tuple[str, str]:
    settings = get_settings()
    access_token = request.cookies.get(settings.access_cookie_name)
    user_id = getattr(request.state, "user_id", None)
    if not access_token or not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id, access_token


def _db(access_token: str):
    return create_supabase_user_client(access_token)


class TasksController(Controller):
    """Authenticated task-list and task endpoints."""

    path = "/api/tasks"

    # ---- Lists -------------------------------------------------------
    @get("/lists")
    async def list_lists(self, request: Request) -> list[dict]:
        user_id, access_token = _require_auth(request)
        builder = (
            _db(access_token)
            .from_("nexus_task_lists")
            .select("*")
            .eq("user_id", user_id)
            .order("position")
        )
        resp = await run_blocking(builder.execute)
        return resp.data or []

    @post("/lists", status_code=201)
    async def create_list(self, data: TaskListCreateRequest, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_tasks_rate_limit(user_id)
        db = _db(access_token)
        existing = await run_blocking(
            db.from_("nexus_task_lists")
            .select("position")
            .eq("user_id", user_id)
            .execute
        )
        positions = [r.get("position", 0.0) for r in (existing.data or [])]  # lists
        row = {
            "user_id": user_id,
            "name": data.name,
            "position": next_position(positions),
        }
        resp = await run_blocking(db.from_("nexus_task_lists").insert(row).execute)
        return (resp.data or [{}])[0]

    @patch("/lists/{list_id:str}")
    async def update_list(
        self, list_id: str, data: TaskListUpdateRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_tasks_rate_limit(user_id)
        patch_data = data.model_dump(exclude_none=True)
        if not patch_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        builder = (
            _db(access_token)
            .from_("nexus_task_lists")
            .update(patch_data)
            .eq("id", list_id)
            .eq("user_id", user_id)
        )
        resp = await run_blocking(builder.execute)
        if not resp.data:
            raise HTTPException(status_code=404, detail="List not found")
        return resp.data[0]

    @delete("/lists/{list_id:str}", status_code=204)
    async def delete_list(self, list_id: str, request: Request) -> None:
        user_id, access_token = _require_auth(request)
        enforce_tasks_rate_limit(user_id)
        builder = (
            _db(access_token)
            .from_("nexus_task_lists")
            .delete()
            .eq("id", list_id)
            .eq("user_id", user_id)
        )
        await run_blocking(builder.execute)

    # ---- Tasks: read + create ---------------------------------------
    @get("/lists/{list_id:str}/items")
    async def list_items(
        self, list_id: str, request: Request, showCompleted: bool = True
    ) -> list[dict]:
        user_id, access_token = _require_auth(request)
        query = (
            _db(access_token)
            .from_("nexus_tasks")
            .select("*")
            .eq("user_id", user_id)
            .eq("list_id", list_id)
        )
        if not showCompleted:
            query = query.eq("status", "needsAction")
        resp = await run_blocking(query.order("position").execute)
        return [hydrate_task_record(r) for r in (resp.data or [])]

    @post("/lists/{list_id:str}/items", status_code=201)
    async def create_item(
        self, list_id: str, data: CreateTaskRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_tasks_rate_limit(user_id)
        db = _db(access_token)

        # Enforce single subtask level: a parent must not itself be a subtask.
        if data.parent_id:
            parent = await run_blocking(
                db.from_("nexus_tasks")
                .select("parent_id")
                .eq("id", data.parent_id)
                .eq("user_id", user_id)
                .maybe_single()
                .execute
            )
            if not parent or not parent.data:
                raise HTTPException(status_code=404, detail="Parent task not found")
            if parent.data.get("parent_id"):
                raise HTTPException(
                    status_code=409,
                    detail="Subtasks cannot be nested deeper than one level",
                )

        existing = await run_blocking(
            db.from_("nexus_tasks")
            .select("position")
            .eq("user_id", user_id)
            .eq("list_id", list_id)
            .execute
        )
        positions = [r.get("position", 0.0) for r in (existing.data or [])]
        row = {
            "user_id": user_id,
            "list_id": list_id,
            "parent_id": data.parent_id,
            "title": data.title,
            "notes_encrypted": protect_task_notes(data.notes),
            "status": data.status,
            "due": data.due.isoformat() if data.due else None,
            "due_at": data.due_at.isoformat() if data.due_at else None,
            "all_day": data.all_day,
            "starred": data.starred,
            "recurrence": data.recurrence,
            "position": next_position(positions),
        }
        resp = await run_blocking(db.from_("nexus_tasks").insert(row).execute)
        return hydrate_task_record((resp.data or [{}])[0])

    # ---- Tasks: update (with recurrence regen) ----------------------
    @patch("/items/{task_id:str}")
    async def update_item(
        self, task_id: str, data: UpdateTaskRequest, request: Request
    ) -> dict:
        from datetime import date as _date
        from datetime import datetime as _datetime

        user_id, access_token = _require_auth(request)
        enforce_tasks_rate_limit(user_id)
        db = _db(access_token)

        current = await run_blocking(
            db.from_("nexus_tasks")
            .select("*")
            .eq("id", task_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute
        )
        if not current or not current.data:
            raise HTTPException(status_code=404, detail="Task not found")
        existing = current.data

        patch_data: dict = {}
        fields = data.model_dump(exclude_unset=True)
        if "title" in fields and fields["title"] is not None:
            patch_data["title"] = data.title
        if "notes" in fields:
            patch_data["notes_encrypted"] = protect_task_notes(data.notes)
        if "due" in fields:
            patch_data["due"] = data.due.isoformat() if data.due else None
        if "due_at" in fields:
            patch_data["due_at"] = data.due_at.isoformat() if data.due_at else None
        if "all_day" in fields and data.all_day is not None:
            patch_data["all_day"] = data.all_day
        if "starred" in fields and data.starred is not None:
            patch_data["starred"] = data.starred
        if "recurrence" in fields:
            patch_data["recurrence"] = data.recurrence
        if "status" in fields and data.status is not None:
            patch_data["status"] = data.status
            patch_data["completed_at"] = (
                _datetime.now().astimezone().isoformat()
                if data.status == "completed"
                else None
            )

        updated = await run_blocking(
            db.from_("nexus_tasks")
            .update(patch_data)
            .eq("id", task_id)
            .eq("user_id", user_id)
            .execute
        )

        # Recurrence regen: on completion of a recurring task, spawn the next
        # occurrence anchored on the SCHEDULED due date (not completion time).
        becoming_completed = patch_data.get("status") == "completed"
        recurrence = existing.get("recurrence")
        if becoming_completed and recurrence:
            anchor_raw = existing.get("due_at") or existing.get("due")
            anchor = None
            if isinstance(anchor_raw, str):
                try:
                    anchor = (
                        _datetime.fromisoformat(anchor_raw)
                        if "T" in anchor_raw
                        else _date.fromisoformat(anchor_raw)
                    )
                except ValueError:
                    anchor = None
            nxt = next_occurrence(recurrence, anchor)
            if nxt is not None:
                positions = await run_blocking(
                    db.from_("nexus_tasks")
                    .select("position")
                    .eq("user_id", user_id)
                    .eq("list_id", existing["list_id"])
                    .execute
                )
                pos_list = [r.get("position", 0.0) for r in (positions.data or [])]
                is_dt = isinstance(nxt, _datetime)
                await run_blocking(
                    db.from_("nexus_tasks")
                    .insert(
                        {
                            "user_id": user_id,
                            "list_id": existing["list_id"],
                            "parent_id": existing.get("parent_id"),
                            "title": existing["title"],
                            "notes_encrypted": existing.get("notes_encrypted"),
                            "status": "needsAction",
                            "due": (nxt.date() if is_dt else nxt).isoformat(),
                            "due_at": nxt.isoformat() if is_dt else None,
                            "all_day": existing.get("all_day", True),
                            "starred": existing.get("starred", False),
                            "recurrence": recurrence,
                            "position": next_position(pos_list),
                        }
                    )
                    .execute
                )

        return hydrate_task_record((updated.data or [existing])[0])

    # ---- Tasks: move + delete ---------------------------------------
    @post("/items/{task_id:str}/move")
    async def move_item(
        self, task_id: str, data: MoveTaskRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_tasks_rate_limit(user_id)
        db = _db(access_token)
        current = await run_blocking(
            db.from_("nexus_tasks")
            .select("*")
            .eq("id", task_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute
        )
        if not current or not current.data:
            raise HTTPException(status_code=404, detail="Task not found")
        existing = current.data

        # Google parity: recurring tasks cannot move between lists.
        if (
            data.list_id
            and data.list_id != existing["list_id"]
            and existing.get("recurrence")
        ):
            raise HTTPException(
                status_code=409,
                detail="Recurring tasks cannot be moved between lists",
            )

        # Single subtask level: cannot re-parent under a task that is a subtask.
        if data.parent_id:
            parent = await run_blocking(
                db.from_("nexus_tasks")
                .select("parent_id")
                .eq("id", data.parent_id)
                .eq("user_id", user_id)
                .maybe_single()
                .execute
            )
            if parent and parent.data and parent.data.get("parent_id"):
                raise HTTPException(
                    status_code=409,
                    detail="Subtasks cannot be nested deeper than one level",
                )

        # exclude_unset (not exclude_none) so an explicit parent_id=null clears the
        # parent (outdent), while fields absent from the request stay untouched.
        patch_data = data.model_dump(exclude_unset=True)
        if not patch_data:
            raise HTTPException(status_code=400, detail="No fields to move")
        resp = await run_blocking(
            db.from_("nexus_tasks")
            .update(patch_data)
            .eq("id", task_id)
            .eq("user_id", user_id)
            .execute
        )
        return hydrate_task_record((resp.data or [existing])[0])

    @delete("/items/{task_id:str}", status_code=204)
    async def delete_item(self, task_id: str, request: Request) -> None:
        user_id, access_token = _require_auth(request)
        enforce_tasks_rate_limit(user_id)
        await run_blocking(
            _db(access_token)
            .from_("nexus_tasks")
            .delete()
            .eq("id", task_id)
            .eq("user_id", user_id)
            .execute
        )
