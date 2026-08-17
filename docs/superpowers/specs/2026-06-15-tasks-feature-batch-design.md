# Tasks Feature Batch — Design Doc

**Date:** 2026-06-15
**Builds on:** `2026-06-15-tasks-app-design.md` (the Tasks app)
**Status:** Approved for planning

Close the remaining Google-Tasks parity gaps in the existing Nexus OS Tasks app:
drag-and-drop reordering, move-to-another-list, bulk clear-completed, the remaining
move keyboard shortcuts, and recurrence/due-time visibility polish.

---

## 1. Scope (locked)

1. **Drag-and-drop reordering** — tasks within a list (top-level + subtasks within a
   parent) and lists in the rail, via **framer-motion `Reorder`** (already a dep; no
   new dependency).
2. **Move task to another list** — per-row menu; recurring tasks excluded (Google
   parity; backend already returns 409).
3. **Clear completed (bulk)** — new backend endpoint + confirmed UI action.
4. **Move up/down shortcuts** — `⌘/Ctrl+↑/↓` and `+Shift` to top/bottom.
5. **Recurrence + due-time visibility** — show the real cadence label and due time on
   rows; clearer "Add time" + repeat controls in the editor. Frontend-only.

**Out of scope:** Drive attachments, Google Calendar sync, native Gmail sidebar,
true offline cache (require external integrations); global cross-list Starred view
(deferred — not selected).

---

## 2. Shared building block — position math

New pure module `frontend/src/os/apps/Tasks/lib/position.js`:

```
between(prevPos, nextPos) -> float
```

- Both neighbours present → `(prev + next) / 2`.
- Only `next` (dropped at top) → `next - 1`.
- Only `prev` (dropped at bottom) → `prev + 1`.
- Neither (empty list) → `1`.

`position` is a `double precision` float, so midpoints avoid any full re-indexing.
Reused by drag reorder, keyboard move, and move-to-list. Fully unit-tested.

---

## 3. Drag-and-drop (framer-motion Reorder)

- **Tasks:** in `TaskListView`, render top-level `needsAction` rows inside a
  `Reorder.Group axis="y"`; each row is a `Reorder.Item value={task}`. Each parent's
  subtasks render in their own nested `Reorder.Group`. Local order is held in state
  for smooth dragging; on `onDragEnd` of an item, compute its new position from the
  neighbours in the new order via `between()` and persist with
  `moveTask({ id, body: { position } })`.
- **Lists:** `ListSidebar` wraps the list buttons in a `Reorder.Group`; on drop,
  persist with `renameList`-style PATCH → `updateList({ id, body: { position } })`
  (a `reorderList` mutation added to `useTasks`).
- **Mutations:** `moveTask` gains an optimistic cache reorder with rollback on error
  (currently it only invalidates on settle).
- **Accessibility:** drag is additive — keyboard move (§5) remains the a11y path.
  Drag handles get `aria-label`; `Reorder.Item` keeps rows as list items.

---

## 4. Move task to another list

- Per-row kebab (`MoreVertical`) opens a small menu with **Move to list ▸** listing
  the other lists (from `lists` passed down by `TasksApp`).
- Selecting a target calls `moveTask({ id, body: { list_id } })`.
- Recurring tasks: the menu item is disabled with a tooltip ("Recurring tasks stay in
  their list"); backend still enforces 409 as the source of truth.
- Menu is focus-trapped and Escape-closable; built on the existing patterns.

---

## 5. Clear completed (bulk)

- **Backend:** `POST /api/tasks/lists/{list_id}/clear-completed` on `TasksController`.
  Deletes rows where `user_id = caller AND list_id = {id} AND status = 'completed'`
  via the RLS-scoped PostgREST client; rate-limited via `enforce_tasks_rate_limit`;
  returns `{"deleted": <n>}`.
- **Frontend:** a "Clear completed" button in the Completed-section header, guarded by
  the existing `components/ui/ConfirmDialog.jsx`. New `clearCompleted` mutation in
  `useTasks` — optimistic removal of completed rows with rollback on error,
  invalidate on settle.
- **Test:** backend test asserts the delete is filtered to the caller's completed rows
  in that list only (RLS + eq filters); never touches other statuses/lists/users.

---

## 6. Move up/down shortcuts

Extend the window-scoped key handler in `TaskListView` (already hosts Space / s /
⌘] / ⌘[):

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl + ↑` / `↓` | move focused task up / down among its siblings |
| `⌘/Ctrl + Shift + ↑` / `↓` | move focused task to top / bottom of its sibling group |

Each computes the target position via `between()` against the sibling order and
persists with `moveTask({ id, body: { position } })`. Siblings = same `parent_id`
within the list. No-ops at the boundary.

---

## 7. Recurrence + due-time visibility (frontend polish)

- **Row (`TaskRow`):** replace the generic "repeats" pill with the real cadence —
  `labelForRRule(task.recurrence)` (e.g. "Daily", "Weekly", "Custom"). Confirm the
  due **time** renders on the chip when `due_at && !all_day` (logic already present).
- **Editor (`TaskEditor`):** make the time control obvious — an "Add time" affordance
  next to the date that reveals/enables the time input; show the current repeat value
  on a labelled control. No schema or backend change.

---

## 8. Files

**Backend (modify):**
- `backend/tasks_controller.py` — add `clear_completed` handler.
- `tests/test_tasks_controller.py` — clear-completed test.

**Frontend (create):**
- `os/apps/Tasks/lib/position.js` + `position.test.js`
- `os/apps/Tasks/components/TaskMenu.jsx` (kebab + move-to-list)

**Frontend (modify):**
- `hooks/useTasks.js` — `reorderList`, `clearCompleted`, optimistic `moveTask`.
- `views/TaskListView.jsx` — Reorder groups, clear-completed button, up/down shortcuts, pass `lists`.
- `components/ListSidebar.jsx` — Reorder group for lists.
- `components/TaskRow.jsx` — cadence label, kebab menu, drag affordance.
- `components/TaskEditor.jsx` — clearer time + repeat controls.
- `TasksApp.jsx` — pass `lists` to `TaskListView`.

---

## 9. Error handling

- All reorder/move/clear mutations are optimistic with rollback (`onError` restores
  the previous cache snapshot) and invalidate on settle.
- Move-to-list on a recurring task is prevented in the UI and enforced (409) server-side.
- Clear-completed is confirmation-gated.

---

## 10. Testing & quality gates

- Backend: `pytest` incl. new clear-completed test.
- Frontend: `vitest` incl. `position.between()` edge cases; existing suites stay green.
- `ruff` + `eslint` clean; production build OK. No new function ships without a test.

---

## 11. Resolved decisions

- **Drag tech:** framer-motion `Reorder` (no new dependency).
- **Global Starred view:** deferred (not selected).
- **Recurrence:** already implemented; this batch only improves its UI visibility +
  surfaces due time.
- **Branch:** continues on `feat/tasks-app` (PR #3), keeping all Tasks work together.
