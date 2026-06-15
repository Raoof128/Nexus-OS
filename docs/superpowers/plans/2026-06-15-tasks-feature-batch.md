# Tasks Feature Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Google-Tasks parity gaps in the Nexus OS Tasks app: drag-and-drop reordering, move-to-another-list, bulk clear-completed, move up/down shortcuts, and recurrence/due-time visibility.

**Architecture:** A shared `position.between()` float-midpoint helper backs all reordering (drag, keyboard, move-to-list) with no re-indexing; drag uses framer-motion `Reorder` (existing dep); a new `clear-completed` endpoint deletes completed rows RLS-scoped; mutations are optimistic with rollback.

**Tech Stack:** React 19 + framer-motion `Reorder` + TanStack Query; Litestar + PostgREST; Vitest + pytest.

**Spec:** `docs/superpowers/specs/2026-06-15-tasks-feature-batch-design.md`
**Branch:** `feat/tasks-app` (continues PR #3)

---

## File Structure

**Backend (modify):** `backend/tasks_controller.py` (+`clear_completed`), `tests/test_tasks_controller.py`
**Frontend (create):** `os/apps/Tasks/lib/position.js` (+test), `os/apps/Tasks/components/TaskMenu.jsx`
**Frontend (modify):** `hooks/useTasks.js`, `views/TaskListView.jsx`, `components/ListSidebar.jsx`, `components/TaskRow.jsx`, `components/TaskEditor.jsx`, `TasksApp.jsx`

---

### Task 1: Position helper

**Files:**
- Create: `frontend/src/os/apps/Tasks/lib/position.js`
- Test: `frontend/src/os/apps/Tasks/lib/position.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, expect, it } from 'vitest'
import { between } from './position'

describe('between', () => {
  it('midpoint of two neighbours', () => {
    expect(between(1, 2)).toBe(1.5)
  })
  it('dropped at top (only next)', () => {
    expect(between(null, 1)).toBe(0)
  })
  it('dropped at bottom (only prev)', () => {
    expect(between(2, null)).toBe(3)
  })
  it('empty list', () => {
    expect(between(null, null)).toBe(1)
  })
  it('handles undefined like null', () => {
    expect(between(undefined, undefined)).toBe(1)
    expect(between(undefined, 4)).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run "src/os/apps/Tasks/lib/position"`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

```javascript
// Float-midpoint ordering: returns a position strictly between two neighbours
// so reordering never requires re-indexing the whole list.
export function between(prevPos, nextPos) {
  const prev = prevPos ?? null
  const next = nextPos ?? null
  if (prev !== null && next !== null) return (prev + next) / 2
  if (prev === null && next !== null) return next - 1
  if (prev !== null && next === null) return prev + 1
  return 1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run "src/os/apps/Tasks/lib/position"`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Tasks/lib/position.js frontend/src/os/apps/Tasks/lib/position.test.js
git commit -m "feat(tasks): position.between() ordering helper"
```

---

### Task 2: Clear-completed endpoint

**Files:**
- Modify: `backend/tasks_controller.py` (add method inside `TasksController`, after `delete_item`)
- Test: `tests/test_tasks_controller.py` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_tasks_controller.py`:

```python
def test_clear_completed_deletes_only_completed(client):
    deleted = [{"id": "t1"}, {"id": "t2"}]
    builder = _chain(FakeResp(data=deleted))
    db = MagicMock()
    db.from_.return_value = builder
    with patch("backend.tasks_controller.create_supabase_user_client", return_value=db):
        res = client.post("/api/tasks/lists/l1/clear-completed")
    assert res.status_code == HTTP_200_OK
    assert res.json()["deleted"] == 2
    # the delete must be filtered to status=completed
    builder.eq.assert_any_call("status", "completed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_tasks_controller.py -k clear_completed -v`
Expected: FAIL (route 404)

- [ ] **Step 3: Implement the handler**

Add inside `TasksController` (after `delete_item`):

```python
    @post("/lists/{list_id:str}/clear-completed")
    async def clear_completed(self, list_id: str, request: Request) -> dict:
        user_id, access_token = _require_auth(request)
        enforce_tasks_rate_limit(user_id)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_tasks_controller.py -k clear_completed -v`
Expected: PASS

- [ ] **Step 5: Run full controller suite + lint**

Run: `python3 -m pytest tests/test_tasks_controller.py -q && python3 -m ruff check backend`
Expected: all pass, "All checks passed!"

- [ ] **Step 6: Commit**

```bash
git add backend/tasks_controller.py tests/test_tasks_controller.py
git commit -m "feat(tasks): clear-completed bulk endpoint"
```

---

### Task 3: useTasks — reorderList, clearCompleted, optimistic moveTask

**Files:**
- Modify: `frontend/src/os/apps/Tasks/hooks/useTasks.js`

- [ ] **Step 1: Add `reorderList` to the list mutations**

In `useTaskMutations`, after the `deleteList` mutation, add:

```javascript
  const reorderList = useMutation({
    mutationFn: ({ id, position }) =>
      apiFetch(`/api/tasks/lists/${id}`, { method: 'PATCH', body: { position } }),
    onSettled: () => qc.invalidateQueries({ queryKey: listsKey }),
  })
```

- [ ] **Step 2: Make `moveTask` optimistic with rollback**

Replace the existing `moveTask` mutation with:

```javascript
  const moveTask = useMutation({
    mutationFn: ({ id, body }) =>
      apiFetch(`/api/tasks/items/${id}/move`, { method: 'POST', body }),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, ...body } : t)),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
```

- [ ] **Step 3: Add `clearCompleted` mutation**

After `deleteTask`, add:

```javascript
  const clearCompleted = useMutation({
    mutationFn: () =>
      apiFetch(`/api/tasks/lists/${listId}/clear-completed`, { method: 'POST' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old = []) => old.filter((t) => t.status !== 'completed'))
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
```

- [ ] **Step 4: Export the new mutations**

Update the `return { ... }` of `useTaskMutations` to include `reorderList` and `clearCompleted`:

```javascript
  return {
    createList,
    renameList,
    deleteList,
    reorderList,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
    clearCompleted,
  }
```

- [ ] **Step 5: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/os/apps/Tasks/hooks/useTasks.js
git commit -m "feat(tasks): reorderList + clearCompleted mutations, optimistic moveTask"
```

---

### Task 4: Drag-and-drop tasks (framer-motion Reorder)

**Files:**
- Modify: `frontend/src/os/apps/Tasks/views/TaskListView.jsx`

**Approach:** A keyed child component holds the drag order in local state (re-initialised from server data via `key`, avoiding a state-sync effect). `onReorder` updates local order for smooth dragging; `Reorder.Item`'s `onDragEnd` persists the dragged item's new position via `between()`.

- [ ] **Step 1: Add the reorderable list component**

At the top of `TaskListView.jsx`, add imports:

```javascript
import { AnimatePresence, Reorder } from 'framer-motion'
import { between } from '../lib/position'
```
(replace the existing `import { AnimatePresence } from 'framer-motion'` line.)

Add this component in the same file, above `TaskListView`:

```javascript
function ReorderableTasks({ tasks, renderRow, onPersist }) {
  const [order, setOrder] = useState(tasks)

  const handleReorder = (newOrder) => setOrder(newOrder)

  const handleDragEnd = (task) => {
    const idx = order.findIndex((t) => t.id === task.id)
    if (idx === -1) return
    const prev = order[idx - 1]?.position ?? null
    const next = order[idx + 1]?.position ?? null
    onPersist(task.id, between(prev, next))
  }

  return (
    <Reorder.Group axis="y" values={order} onReorder={handleReorder} as="ul" role="list">
      {order.map((task) => (
        <Reorder.Item key={task.id} value={task} onDragEnd={() => handleDragEnd(task)}>
          {renderRow(task, 0)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}
```

- [ ] **Step 2: Use it for top-level tasks**

In `TaskListView`, replace the existing top-level `<ul role="list" onFocusCapture=...>...</ul>` block (the one mapping `parents`) with a keyed `ReorderableTasks` plus subtasks rendered under each parent. Replace that block with:

```javascript
          <div
            onFocusCapture={(e) => {
              const li = e.target.closest('[data-task-id]')
              if (li) setFocusedTaskId(li.getAttribute('data-task-id'))
            }}
          >
            <ReorderableTasks
              key={parents.map((p) => p.id).join(',')}
              tasks={parents}
              renderRow={(t) => (
                <>
                  {renderRow(t, 0)}
                  {(childrenByParent[t.id] || []).map((c) => renderRow(c, 1))}
                </>
              )}
              onPersist={(id, position) => moveTask.mutate({ id, body: { position } })}
            />
          </div>
```

> The `key` re-initialises drag order whenever the server set of parents changes,
> so no state-sync effect is needed (avoids the `set-state-in-effect` lint).

- [ ] **Step 3: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean lint, successful build.

- [ ] **Step 4: Manual verify**

Run: `cd frontend && npm run dev`. In a list with 3+ tasks, drag a row to reorder; on drop the order persists (refresh keeps it). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Tasks/views/TaskListView.jsx
git commit -m "feat(tasks): drag-and-drop reordering of tasks"
```

---

### Task 5: Drag-and-drop lists

**Files:**
- Modify: `frontend/src/os/apps/Tasks/components/ListSidebar.jsx`
- Modify: `frontend/src/os/apps/Tasks/TasksApp.jsx` (pass `onReorder`)

- [ ] **Step 1: Pass a reorder handler from TasksApp**

In `TasksApp.jsx`, destructure `reorderList` from `useTaskMutations` and pass it to `ListSidebar`:

```javascript
  const { createList, deleteList, reorderList } = useTaskMutations(activeListId)
```
Add prop to `<ListSidebar ... onReorder={(id, position) => reorderList.mutate({ id, position })} />`.

- [ ] **Step 2: Make the rail reorderable**

In `ListSidebar.jsx`, add import:

```javascript
import { Reorder } from 'framer-motion'
import { between } from '../lib/position'
```

Accept `onReorder` in props. Hold local order keyed by the server list ids and replace the `<ul role="list">…lists.map…</ul>` with a `Reorder.Group`:

```javascript
  const [order, setOrder] = useState(lists)
  // Re-key from server via the wrapper's key prop (see below) — no effect needed.

  const handleDragEnd = (list) => {
    const idx = order.findIndex((l) => l.id === list.id)
    if (idx === -1) return
    const prev = order[idx - 1]?.position ?? null
    const next = order[idx + 1]?.position ?? null
    onReorder(list.id, between(prev, next))
  }
```

Render:

```javascript
        <Reorder.Group axis="y" values={order} onReorder={setOrder} as="ul" role="list" className="flex flex-col gap-0.5">
          {order.map((list) => (
            <Reorder.Item key={list.id} value={list} role="listitem" onDragEnd={() => handleDragEnd(list)} className="group flex items-center">
              {/* keep the existing select button + delete button markup for `list` */}
            </Reorder.Item>
          ))}
        </Reorder.Group>
```

Wrap the whole `ListSidebar` body in a component keyed by `lists.map(l=>l.id).join(',')` (e.g. split the reorder list into a child `<ReorderableLists key=... />`) so `order` re-initialises when lists change — mirroring Task 4's keyed pattern.

- [ ] **Step 3: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Manual verify**

`npm run dev` → drag a list in the rail; order persists after refresh.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Tasks/components/ListSidebar.jsx frontend/src/os/apps/Tasks/TasksApp.jsx
git commit -m "feat(tasks): drag-and-drop reordering of lists"
```

---

### Task 6: Move up/down keyboard shortcuts

**Files:**
- Modify: `frontend/src/os/apps/Tasks/views/TaskListView.jsx` (the keydown effect)

- [ ] **Step 1: Add the shortcuts**

Inside the `onKey` handler (the existing window-scoped effect), after the `⌘+[` branch, add:

```javascript
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && task) {
        e.preventDefault()
        const siblings = items
          .filter((t) => (t.parent_id || null) === (task.parent_id || null) && t.status === 'needsAction')
          .sort((a, b) => (a.position || 0) - (b.position || 0))
        const i = siblings.findIndex((t) => t.id === task.id)
        if (i === -1) return
        const up = e.key === 'ArrowUp'
        if (e.shiftKey) {
          // to top / bottom
          const target = up ? siblings[0] : siblings[siblings.length - 1]
          if (!target || target.id === task.id) return
          const pos = up
            ? between(null, siblings[0].position)
            : between(siblings[siblings.length - 1].position, null)
          moveTask.mutate({ id: task.id, body: { position: pos } })
        } else {
          const swapIdx = up ? i - 1 : i + 1
          if (swapIdx < 0 || swapIdx >= siblings.length) return
          // move across the neighbour: midpoint of neighbour and the one beyond it
          const beyond = up ? siblings[swapIdx - 1] : siblings[swapIdx + 1]
          const pos = up
            ? between(beyond?.position ?? null, siblings[swapIdx].position)
            : between(siblings[swapIdx].position, beyond?.position ?? null)
          moveTask.mutate({ id: task.id, body: { position: pos } })
        }
      }
```

Ensure `between` is imported (added in Task 4 Step 1) and `moveTask` is in scope (it is).

- [ ] **Step 2: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Manual verify**

`npm run dev` → focus a task, press `⌘/Ctrl+↑`/`↓` to move it; `+Shift` jumps to top/bottom.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/os/apps/Tasks/views/TaskListView.jsx
git commit -m "feat(tasks): move up/down + to top/bottom shortcuts"
```

---

### Task 7: Task kebab menu + move-to-list

**Files:**
- Create: `frontend/src/os/apps/Tasks/components/TaskMenu.jsx`
- Modify: `frontend/src/os/apps/Tasks/components/TaskRow.jsx` (render the menu)
- Modify: `frontend/src/os/apps/Tasks/views/TaskListView.jsx` (pass `lists` + move handler)
- Modify: `frontend/src/os/apps/Tasks/TasksApp.jsx` (pass `lists` to view)

- [ ] **Step 1: Create the menu component**

```jsx
import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

// Kebab menu with a "Move to list" section. Recurring tasks can't change list.
export default function TaskMenu({ task, lists, onMoveToList }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const others = lists.filter((l) => l.id !== task.list_id)
  const recurring = Boolean(task.recurrence)

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`More actions for "${task.title}"`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-white/25 opacity-0 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-hover:opacity-100"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="glass-panel absolute right-0 z-20 mt-1 w-44 rounded-lg border border-white/[0.08] p-1 text-sm shadow-xl"
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Move to list
          </p>
          {recurring ? (
            <p className="px-2 py-1 text-[11px] text-white/40" title="Recurring tasks stay in their list">
              Recurring tasks stay in their list
            </p>
          ) : others.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-white/40">No other lists</p>
          ) : (
            others.map((l) => (
              <button
                key={l.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onMoveToList(l.id)
                  setOpen(false)
                }}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-white/80 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                {l.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render the menu in TaskRow**

In `TaskRow.jsx`, add `import TaskMenu from './TaskMenu'`, accept `lists` and `onMoveToList` props, and render `<TaskMenu task={task} lists={lists} onMoveToList={onMoveToList} />` just before the delete button. Update the `memo` comparator is not field-based here (TaskRow uses default memo), so no comparator change needed.

- [ ] **Step 3: Wire props through TaskListView + TasksApp**

In `TasksApp.jsx`, pass `lists={lists}` to `<TaskListView .../>`. In `TaskListView`, accept `lists` prop and pass `lists` + `onMoveToList` into `renderRow`:

```javascript
  const renderRow = (task, depth) => (
    <TaskRow
      key={task.id}
      task={task}
      depth={depth}
      lists={lists}
      onMoveToList={(listIdTarget) => moveTask.mutate({ id: task.id, body: { list_id: listIdTarget } })}
      onToggle={handleToggle}
      onStar={handleStar}
      onEdit={setEditing}
      onDelete={handleDelete}
    />
  )
```

- [ ] **Step 4: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Tasks/components/TaskMenu.jsx frontend/src/os/apps/Tasks/components/TaskRow.jsx frontend/src/os/apps/Tasks/views/TaskListView.jsx frontend/src/os/apps/Tasks/TasksApp.jsx
git commit -m "feat(tasks): per-task menu with move-to-list"
```

---

### Task 8: Clear-completed UI

**Files:**
- Modify: `frontend/src/os/apps/Tasks/views/TaskListView.jsx`

- [ ] **Step 1: Add the button + confirm dialog**

In `TaskListView.jsx`, add imports:

```javascript
import { useState } from 'react' // already imported — ensure present
import ConfirmDialog from '../../../../components/ui/ConfirmDialog'
```

Destructure `clearCompleted` from `useTaskMutations`. Add `const [confirmClear, setConfirmClear] = useState(false)`. In the Completed-section header (next to the "Completed (n)" toggle), add:

```jsx
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="ml-3 rounded px-2 py-0.5 text-[11px] text-white/50 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
            >
              Clear completed
            </button>
```

At the end of the component's returned JSX, add:

```jsx
      <ConfirmDialog
        open={confirmClear}
        title="Clear completed?"
        message="This permanently deletes all completed tasks in this list."
        confirmLabel="Clear"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearCompleted.mutate()
          setConfirmClear(false)
        }}
      />
```

- [ ] **Step 2: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Manual verify**

`npm run dev` → complete a couple tasks, click "Clear completed", confirm → they vanish and stay gone after refresh.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/os/apps/Tasks/views/TaskListView.jsx
git commit -m "feat(tasks): clear-completed UI with confirm"
```

---

### Task 9: Recurrence + due-time visibility

**Files:**
- Modify: `frontend/src/os/apps/Tasks/components/TaskRow.jsx`
- Modify: `frontend/src/os/apps/Tasks/components/TaskEditor.jsx`

- [ ] **Step 1: Show the real cadence on the row**

In `TaskRow.jsx`, add `import { labelForRRule } from '../lib/recurrence'`. Replace the recurrence pill text (`repeats`) with the cadence label:

```jsx
            {task.recurrence && (
              <span className="flex items-center gap-1 text-primary/70">
                <Repeat2 size={11} /> {labelForRRule(task.recurrence)}
              </span>
            )}
```

(The due-time already renders via `formatDue` when `due_at && !all_day` — verify in the manual step.)

- [ ] **Step 2: Make the time control clearer in the editor**

In `TaskEditor.jsx`, change the Time field label from `Time` to `Add time` and add a hint when no date is set. Replace the Time `<label>` text with `Add time` and add `title="Pick a due date first"` to the disabled `<input type="time">`. (Keep the existing date+time wiring untouched.)

- [ ] **Step 3: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Manual verify**

`npm run dev` → set a Daily repeat + a due time on a task; the row shows "Daily" and the time on its chip.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Tasks/components/TaskRow.jsx frontend/src/os/apps/Tasks/components/TaskEditor.jsx
git commit -m "feat(tasks): show cadence label + clearer due-time control"
```

---

### Task 10: Full quality gates

**Files:** none (verification)

- [ ] **Step 1: Backend gates**

Run: `python3 -m ruff check backend tests && python3 -m ruff format --check backend tests && python3 -m pytest -q`
Expected: clean; all tests pass.

- [ ] **Step 2: Frontend gates**

Run: `cd frontend && npm run lint && npm run test -- --run && npm run build`
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "chore(tasks): satisfy gates for feature batch"
```

---

## Self-Review Notes (author)

- **Spec coverage:** position helper (T1), clear-completed backend+UI (T2/T8), hooks (T3),
  drag tasks (T4), drag lists (T5), up/down shortcuts (T6), move-to-list menu (T7),
  recurrence+time visibility (T9), gates (T10). All §1–§10 mapped.
- **Type consistency:** `between(prev, next)` used identically in T1/T4/T5/T6; mutation
  names `reorderList`, `clearCompleted`, optimistic `moveTask` consistent across T3/T4/T5/T7/T8.
- **Verification points for the implementer:**
  1. `Reorder.Item`'s `onDragEnd` fires after the local order settles — read neighbour
     positions from the post-drop `order`, as written. If a drag yields no change, the
     computed position equals a midpoint of unchanged neighbours (harmless).
  2. Nested `Reorder.Group` per parent for subtask reordering is **out of this plan's
     tasks** (top-level reorder only); subtasks still render under parents and reorder
     via keyboard. Add nested groups later if desired.
  3. `ConfirmDialog` import path depth from `views/`: `../../../../components/ui/ConfirmDialog`.
