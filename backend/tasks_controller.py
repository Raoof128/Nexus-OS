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
    from .tasks_service import (
        next_occurrence,
        next_position,
        recurrence_for_next_instance,
    )
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
    from tasks_service import (
        next_occurrence,
        next_position,
        recurrence_for_next_instance,
    )

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
        await run_blocking(enforce_tasks_rate_limit, user_id)
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
        await run_blocking(enforce_tasks_rate_limit, user_id)
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
        await run_blocking(enforce_tasks_rate_limit, user_id)
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
        await run_blocking(enforce_tasks_rate_limit, user_id)
        db = _db(access_token)

        # Enforce single subtask level: a parent must not itself be a subtask.
        if data.parent_id:
            parent = await run_blocking(
                db.from_("nexus_tasks")
                .select("parent_id,list_id")
                .eq("id", data.parent_id)
                .eq("user_id", user_id)
                .maybe_single()
                .execute
            )
            if not parent or not parent.data:
                raise HTTPException(status_code=404, detail="Parent task not found")
            if parent.data.get("list_id") != list_id:
                raise HTTPException(
                    status_code=409,
                    detail="Subtasks must stay in the same list as their parent",
                )
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
            "due_timezone": data.due_timezone if data.due_at else None,
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
        await run_blocking(enforce_tasks_rate_limit, user_id)
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
        if "due_timezone" in fields:
            patch_data["due_timezone"] = data.due_timezone
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
        if not patch_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Recurrence regen is a read/compute/write flow, so its completion and
        # successor insert must cross the database boundary as one transaction.
        # The RPC locks the source row and uses generated_from_task_id uniqueness
        # to make racing completion requests idempotent.
        becoming_completed = (
            patch_data.get("status") == "completed"
            and existing.get("status") != "completed"
        )
        recurrence = patch_data.get("recurrence", existing.get("recurrence"))
        if becoming_completed and recurrence:
            effective_due_at = patch_data.get("due_at", existing.get("due_at"))
            effective_due = patch_data.get("due", existing.get("due"))
            effective_timezone = patch_data.get(
                "due_timezone",
                existing.get("due_timezone"),
            )
            anchor_raw = effective_due_at or effective_due
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
            nxt = next_occurrence(recurrence, anchor, effective_timezone)
            if nxt is not None:
                next_recurrence = recurrence_for_next_instance(recurrence)
                is_dt = isinstance(nxt, _datetime)
                completed = await run_blocking(
                    db.rpc(
                        "complete_recurring_task",
                        {
                            "p_task_id": task_id,
                            "p_patch": patch_data,
                            "p_next_due": (nxt.date() if is_dt else nxt).isoformat(),
                            "p_next_due_at": nxt.isoformat() if is_dt else None,
                            "p_next_due_timezone": (
                                effective_timezone if is_dt else None
                            ),
                            "p_next_recurrence": next_recurrence,
                            "p_expected_due": existing.get("due"),
                            "p_expected_due_at": existing.get("due_at"),
                            "p_expected_due_timezone": existing.get("due_timezone"),
                            "p_expected_recurrence": recurrence,
                        },
                    ).execute
                )
                return hydrate_task_record((completed.data or [existing])[0])

        update_builder = (
            db.from_("nexus_tasks")
            .update(patch_data)
            .eq("id", task_id)
            .eq("user_id", user_id)
        )
        expected_updated_at = existing.get("updated_at")
        if expected_updated_at:
            # Prevent a stale read from overwriting a completion/reschedule that
            # committed while this request was waiting on the row lock.
            update_builder = update_builder.eq("updated_at", expected_updated_at)
        updated = await run_blocking(update_builder.execute)
        if expected_updated_at and not (updated.data or []):
            raise HTTPException(
                status_code=409,
                detail="Task changed during update; retry with fresh data",
            )

        return hydrate_task_record((updated.data or [existing])[0])

    # ---- Tasks: move + delete ---------------------------------------
    @post("/items/{task_id:str}/move")
    async def move_item(
        self, task_id: str, data: MoveTaskRequest, request: Request
    ) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)
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
        patch_data = data.model_dump(exclude_unset=True)
        if not patch_data:
            raise HTTPException(status_code=400, detail="No fields to move")
        target_list_id = patch_data.get("list_id", existing["list_id"])

        # Google parity: recurring tasks cannot move between lists.
        if target_list_id != existing["list_id"] and existing.get("recurrence"):
            raise HTTPException(
                status_code=409,
                detail="Recurring tasks cannot be moved between lists",
            )

        if target_list_id != existing["list_id"]:
            if existing.get("parent_id") and "parent_id" not in patch_data:
                raise HTTPException(
                    status_code=409,
                    detail="Moving a subtask to another list requires re-parenting",
                )
            children = await run_blocking(
                db.from_("nexus_tasks")
                .select("id")
                .eq("user_id", user_id)
                .eq("parent_id", task_id)
                .execute
            )
            if children and children.data:
                raise HTTPException(
                    status_code=409,
                    detail="Tasks with subtasks cannot be moved between lists",
                )

        # Single subtask level: cannot re-parent under a task that is a subtask.
        if data.parent_id:
            if data.parent_id == task_id:
                raise HTTPException(status_code=409, detail="Task cannot parent itself")
            parent = await run_blocking(
                db.from_("nexus_tasks")
                .select("parent_id,list_id")
                .eq("id", data.parent_id)
                .eq("user_id", user_id)
                .maybe_single()
                .execute
            )
            if not parent or not parent.data:
                raise HTTPException(status_code=404, detail="Parent task not found")
            if parent.data.get("list_id") != target_list_id:
                raise HTTPException(
                    status_code=409,
                    detail="Subtasks must stay in the same list as their parent",
                )
            if parent.data.get("parent_id"):
                raise HTTPException(
                    status_code=409,
                    detail="Subtasks cannot be nested deeper than one level",
                )

        # exclude_unset (not exclude_none) so an explicit parent_id=null clears the
        # parent (outdent), while fields absent from the request stay untouched.
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
        await run_blocking(enforce_tasks_rate_limit, user_id)
        await run_blocking(
            _db(access_token)
            .from_("nexus_tasks")
            .delete()
            .eq("id", task_id)
            .eq("user_id", user_id)
            .execute
        )

    @post("/lists/{list_id:str}/clear-completed", status_code=200)
    async def clear_completed(self, list_id: str, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)
        builder = (
            _db(access_token)
            .from_("nexus_tasks")
            .delete()
            .eq("user_id", user_id)
            .eq("list_id", list_id)
            .eq("status", "completed")
        )
        resp = await run_blocking(builder.execute)
        return {"deleted": len(resp.data or [])}
