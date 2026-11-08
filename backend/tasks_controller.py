"""REST endpoints for the Tasks app.

Every handler is authenticated. ``SupabaseAuthMiddleware`` validates the access
token (Bearer header or HttpOnly cookie) and stores it on ``request.state``; the
handlers read it from there so both transports behave the same. A PostgREST
client bound to that token is provided per request and closed when the request
finishes, so row-level security applies to every query.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from datetime import date, datetime
from typing import Any

from litestar import Controller, Request, delete, get, patch, post
from litestar.di import NamedDependency, Provide
from litestar.exceptions import HTTPException
from litestar.params import FromPath, FromQuery, JSONBody
from postgrest import SyncPostgrestClient
from postgrest.exceptions import APIError

try:
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

# PostgreSQL SQLSTATE codes surfaced by PostgREST as APIError.code.
_FK_VIOLATION = "23503"
_INVALID_TEXT_REPRESENTATION = "22P02"

# Columns that the completion transition writes; kept apart from other edits so
# the guarded transition never blocks a title or other field change.
_COMPLETION_FIELDS = ("status", "completed_at")


def _require_auth(request: Request) -> tuple[str, str]:
    """Return ``(user_id, access_token)`` as validated by the auth middleware.

    Reads ``request.state`` rather than the cookie, so a Bearer-only request that
    the middleware accepted is not rejected here.
    """

    user_id = getattr(request.state, "user_id", None)
    access_token = getattr(request.state, "access_token", None)
    if not user_id or not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id, access_token


async def _provide_db(request: Request) -> AsyncGenerator[SyncPostgrestClient, None]:
    """Yield a per-request PostgREST client and close its HTTP session afterwards."""

    _, access_token = _require_auth(request)
    client = create_supabase_user_client(access_token)
    try:
        yield client
    finally:
        client.aclose()


async def _run(builder: Any) -> Any:
    """Execute a PostgREST builder off the event loop; errors propagate unchanged."""

    return await run_blocking(builder.execute)


async def _execute(builder: Any) -> Any:
    """Execute a builder and map well-known database errors to client errors.

    A foreign-key violation means a referenced list or parent is missing or not
    visible to the caller; a malformed id fails the uuid cast. Both are answered
    with a fixed message so PostgREST's text never reaches the client. Anything
    else is re-raised so Sentry records the original exception.
    """

    try:
        return await _run(builder)
    except APIError as exc:
        if exc.code == _FK_VIOLATION:
            raise HTTPException(
                status_code=404, detail="List or parent task not found"
            ) from exc
        if exc.code == _INVALID_TEXT_REPRESENTATION:
            raise HTTPException(status_code=400, detail="Invalid id") from exc
        raise


async def _next_position_for(builder: Any) -> float:
    """Return the position after the largest one selected by ``builder``.

    ``builder`` must be filtered to one list, ordered by position descending and
    limited to one row, so the lookup uses the position index instead of reading
    every sibling.
    """

    resp = await _execute(builder)
    return next_position([r.get("position", 0.0) for r in (resp.data or [])])


async def _load_task(db: SyncPostgrestClient, user_id: str, task_id: str) -> dict:
    resp = await _execute(
        db.from_("nexus_tasks")
        .select("*")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .maybe_single()
    )
    if not resp or not resp.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return resp.data


async def _validate_parent(
    db: SyncPostgrestClient, user_id: str, parent_id: str, list_id: str
) -> None:
    """Enforce the subtask rules for a parent that will hold a task in ``list_id``.

    Subtasks are single-level, and a subtask lives in its parent's list.
    """

    resp = await _execute(
        db.from_("nexus_tasks")
        .select("id,parent_id,list_id")
        .eq("id", parent_id)
        .eq("user_id", user_id)
        .maybe_single()
    )
    if not resp or not resp.data:
        raise HTTPException(status_code=404, detail="Parent task not found")
    parent = resp.data
    if parent.get("parent_id"):
        raise HTTPException(
            status_code=409,
            detail="Subtasks cannot be nested deeper than one level",
        )
    if parent.get("list_id") != list_id:
        raise HTTPException(
            status_code=409,
            detail="Subtasks must be in the same list as their parent",
        )


async def _has_subtasks(db: SyncPostgrestClient, user_id: str, task_id: str) -> bool:
    resp = await _execute(
        db.from_("nexus_tasks")
        .select("id")
        .eq("parent_id", task_id)
        .eq("user_id", user_id)
        .limit(1)
    )
    return bool(resp.data)


def _parse_anchor(task: dict) -> date | datetime | None:
    """Return the scheduled due date or time that recurrence is anchored on."""

    raw = task.get("due_at") or task.get("due")
    if not isinstance(raw, str):
        return None
    try:
        return datetime.fromisoformat(raw) if "T" in raw else date.fromisoformat(raw)
    except ValueError:
        logger.warning(
            "Recurrence anchor unparseable for task %s; next occurrence skipped",
            task.get("id"),
        )
        return None


async def _spawn_next_occurrence(
    db: SyncPostgrestClient, user_id: str, task: dict, recurrence: str
) -> None:
    """Insert the next occurrence of a recurring task.

    Anchored on the scheduled due date, never the completion time. Database errors
    propagate as raw ``APIError`` so the caller can undo the completion.
    """

    task_id = task.get("id")
    # The rule is evaluated off the event loop; next_occurrence is CPU-bound.
    nxt = await run_blocking(next_occurrence, recurrence, _parse_anchor(task))
    if nxt is None:
        logger.warning("No next occurrence computed for recurring task %s", task_id)
        return

    list_id = task["list_id"]
    positions = await _run(
        db.from_("nexus_tasks")
        .select("position")
        .eq("user_id", user_id)
        .eq("list_id", list_id)
        .order("position", desc=True)
        .limit(1)
    )
    next_pos = next_position([r.get("position", 0.0) for r in (positions.data or [])])

    is_dt = isinstance(nxt, datetime)
    await _run(
        db.from_("nexus_tasks").insert(
            {
                "user_id": user_id,
                "list_id": list_id,
                "parent_id": task.get("parent_id"),
                "title": task["title"],
                "notes_encrypted": task.get("notes_encrypted"),
                "status": "needsAction",
                "due": (nxt.date() if is_dt else nxt).isoformat(),
                "due_at": nxt.isoformat() if is_dt else None,
                "all_day": task.get("all_day", True),
                "starred": task.get("starred", False),
                "recurrence": recurrence,
                "position": next_pos,
            }
        )
    )


async def _restore_completion(
    db: SyncPostgrestClient, user_id: str, task_id: str, before: dict
) -> None:
    """Undo a completion whose next occurrence was definitively rejected.

    Called only after PostgREST returned an error, so the spawn did not commit.
    Restoring the previous status lets a retry of the completion spawn exactly one
    occurrence. Best effort: a failure here is logged and the original error wins.
    """

    try:
        await _run(
            db.from_("nexus_tasks")
            .update(
                {
                    "status": before.get("status", "needsAction"),
                    "completed_at": before.get("completed_at"),
                }
            )
            .eq("id", task_id)
            .eq("user_id", user_id)
        )
    except Exception:
        logger.exception("Could not restore completion of task %s", task_id)


class TasksController(Controller):
    """Authenticated task-list and task endpoints."""

    path = "/api/tasks"
    dependencies = {"db": Provide(_provide_db)}

    # ---- Lists -------------------------------------------------------
    @get("/lists")
    async def list_lists(
        self, db: NamedDependency[SyncPostgrestClient], request: Request
    ) -> list[dict[str, Any]]:
        user_id, _ = _require_auth(request)
        builder = (
            db.from_("nexus_task_lists")
            .select("*")
            .eq("user_id", user_id)
            .order("position")
            .order("id")
        )
        resp = await _execute(builder)
        return resp.data or []

    @post("/lists", status_code=201)
    async def create_list(
        self,
        data: JSONBody[TaskListCreateRequest],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
    ) -> dict[str, Any]:
        user_id, _ = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)
        position = await _next_position_for(
            db.from_("nexus_task_lists")
            .select("position")
            .eq("user_id", user_id)
            .order("position", desc=True)
            .limit(1)
        )
        row = {"user_id": user_id, "name": data.name, "position": position}
        resp = await _execute(db.from_("nexus_task_lists").insert(row))
        return (resp.data or [{}])[0]

    @patch("/lists/{list_id:str}")
    async def update_list(
        self,
        list_id: FromPath[str],
        data: JSONBody[TaskListUpdateRequest],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
    ) -> dict[str, Any]:
        user_id, _ = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)
        patch_data = data.model_dump(exclude_none=True)
        if not patch_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        resp = await _execute(
            db.from_("nexus_task_lists")
            .update(patch_data)
            .eq("id", list_id)
            .eq("user_id", user_id)
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="List not found")
        return resp.data[0]

    @delete("/lists/{list_id:str}", status_code=204)
    async def delete_list(
        self,
        list_id: FromPath[str],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
    ) -> None:
        user_id, _ = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)
        await _execute(
            db.from_("nexus_task_lists")
            .delete()
            .eq("id", list_id)
            .eq("user_id", user_id)
        )

    # ---- Tasks: read + create ---------------------------------------
    @get("/lists/{list_id:str}/items")
    async def list_items(
        self,
        list_id: FromPath[str],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
        showCompleted: FromQuery[bool] = True,
    ) -> list[dict[str, Any]]:
        user_id, _ = _require_auth(request)
        query = (
            db.from_("nexus_tasks")
            .select("*")
            .eq("user_id", user_id)
            .eq("list_id", list_id)
        )
        if not showCompleted:
            query = query.eq("status", "needsAction")
        resp = await _execute(query.order("position").order("id"))
        return [hydrate_task_record(r) for r in (resp.data or [])]

    @post("/lists/{list_id:str}/items", status_code=201)
    async def create_item(
        self,
        list_id: FromPath[str],
        data: JSONBody[CreateTaskRequest],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
    ) -> dict[str, Any]:
        user_id, _ = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)

        if data.parent_id:
            await _validate_parent(db, user_id, data.parent_id, list_id)

        position = await _next_position_for(
            db.from_("nexus_tasks")
            .select("position")
            .eq("user_id", user_id)
            .eq("list_id", list_id)
            .order("position", desc=True)
            .limit(1)
        )
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
            "position": position,
        }
        resp = await _execute(db.from_("nexus_tasks").insert(row))
        return hydrate_task_record((resp.data or [{}])[0])

    # ---- Tasks: update (with recurrence regen) ----------------------
    @patch("/items/{task_id:str}")
    async def update_item(
        self,
        task_id: FromPath[str],
        data: JSONBody[UpdateTaskRequest],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
    ) -> dict[str, Any]:
        user_id, _ = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)
        existing = await _load_task(db, user_id, task_id)

        patch_data: dict[str, Any] = {}
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
                datetime.now().astimezone().isoformat()
                if data.status == "completed"
                else None
            )

        # Only a completion is a guarded transition; every other status change
        # (including uncompleting) is an ordinary field write. Non-completion fields
        # are written first, so a failed write leaves the task untouched and no
        # recurrence occurrence is lost to a completion that committed alone.
        completes = patch_data.get("status") == "completed"
        other_fields = {
            k: v
            for k, v in patch_data.items()
            if not (completes and k in _COMPLETION_FIELDS)
        }
        row: dict[str, Any] | None = None
        if other_fields:
            resp = await _execute(
                db.from_("nexus_tasks")
                .update(other_fields)
                .eq("id", task_id)
                .eq("user_id", user_id)
            )
            if not resp.data:
                # Deleted between the read and the write. Never report stale data.
                raise HTTPException(status_code=404, detail="Task not found")
            row = resp.data[0]

        # Completion is a guarded transition: only a write that moves the row from
        # a non-completed status returns a row. A repeat PATCH, or a concurrent
        # completion that lost the race, gets no rows and therefore spawns nothing.
        transitioned = False
        if completes:
            transition = await _execute(
                db.from_("nexus_tasks")
                .update({k: patch_data[k] for k in _COMPLETION_FIELDS})
                .eq("id", task_id)
                .eq("user_id", user_id)
                .neq("status", "completed")
            )
            transitioned = bool(transition.data)
            if transitioned:
                row = transition.data[0]

        if row is None:
            row = await _load_task(db, user_id, task_id)

        recurrence = existing.get("recurrence")
        if transitioned and recurrence:
            try:
                await _spawn_next_occurrence(db, user_id, existing, recurrence)
            except APIError:
                await _restore_completion(db, user_id, task_id, existing)
                raise

        return hydrate_task_record(row)

    # ---- Tasks: move + delete ---------------------------------------
    @post("/items/{task_id:str}/move")
    async def move_item(
        self,
        task_id: FromPath[str],
        data: JSONBody[MoveTaskRequest],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
    ) -> dict[str, Any]:
        user_id, _ = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)

        if data.parent_id is not None and data.parent_id == task_id:
            raise HTTPException(
                status_code=409, detail="A task cannot be its own parent"
            )

        # exclude_unset (not exclude_none) so an explicit parent_id=null clears the
        # parent (outdent), while fields absent from the request stay untouched.
        fields = data.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to move")
        # list_id and position are NOT NULL columns; only parent_id may be cleared.
        if ("list_id" in fields and data.list_id is None) or (
            "position" in fields and data.position is None
        ):
            raise HTTPException(
                status_code=400, detail="list_id and position cannot be null"
            )

        existing = await _load_task(db, user_id, task_id)

        list_changes = data.list_id is not None and data.list_id != existing["list_id"]
        # Google parity: recurring tasks cannot move between lists.
        if list_changes and existing.get("recurrence"):
            raise HTTPException(
                status_code=409,
                detail="Recurring tasks cannot be moved between lists",
            )

        effective_list = data.list_id or existing["list_id"]
        effective_parent = (
            data.parent_id if "parent_id" in fields else existing.get("parent_id")
        )
        if effective_parent:
            await _validate_parent(db, user_id, effective_parent, effective_list)
        # A task with subtasks cannot become a subtask (that would be depth 2) and
        # cannot leave its list, which would strand the children.
        if (effective_parent or list_changes) and await _has_subtasks(
            db, user_id, task_id
        ):
            raise HTTPException(
                status_code=409,
                detail="A task with subtasks cannot become a subtask or change lists",
            )

        resp = await _execute(
            db.from_("nexus_tasks")
            .update(fields)
            .eq("id", task_id)
            .eq("user_id", user_id)
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Task not found")
        return hydrate_task_record(resp.data[0])

    @delete("/items/{task_id:str}", status_code=204)
    async def delete_item(
        self,
        task_id: FromPath[str],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
    ) -> None:
        user_id, _ = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)
        await _execute(
            db.from_("nexus_tasks").delete().eq("id", task_id).eq("user_id", user_id)
        )

    @post("/lists/{list_id:str}/clear-completed", status_code=200)
    async def clear_completed(
        self,
        list_id: FromPath[str],
        db: NamedDependency[SyncPostgrestClient],
        request: Request,
    ) -> dict[str, int]:
        user_id, _ = _require_auth(request)
        await run_blocking(enforce_tasks_rate_limit, user_id)

        completed = await _execute(
            db.from_("nexus_tasks")
            .select("id")
            .eq("user_id", user_id)
            .eq("list_id", list_id)
            .eq("status", "completed")
        )
        completed_ids = [r["id"] for r in (completed.data or []) if r.get("id")]
        if completed_ids:
            # parent_id is ON DELETE CASCADE, so an open subtask of a completed
            # parent would be deleted with it. Promote those subtasks to top level
            # first. This runs before the delete, so a failure here aborts the
            # operation with nothing deleted. Children in other lists are included.
            await _execute(
                db.from_("nexus_tasks")
                .update({"parent_id": None})
                .eq("user_id", user_id)
                .eq("status", "needsAction")
                .in_("parent_id", completed_ids)
            )

        resp = await _execute(
            db.from_("nexus_tasks")
            .delete()
            .eq("user_id", user_id)
            .eq("list_id", list_id)
            .eq("status", "completed")
        )
        return {"deleted": len(resp.data or [])}
