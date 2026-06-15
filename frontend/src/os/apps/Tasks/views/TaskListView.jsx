import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, Reorder } from 'framer-motion'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import { useTaskItems, useTaskMutations } from '../hooks/useTasks'
import { useTaskReminders } from '../hooks/useTaskReminders'
import { between } from '../lib/position'
import TaskRow from '../components/TaskRow'
import TaskEditor from '../components/TaskEditor'
import QuickAddBar from '../components/QuickAddBar'
import ConfirmDialog from '../../../../components/ui/ConfirmDialog'

// Drag-reorderable top-level task group. Local order is held in state for smooth
// dragging; the `key` (set by the caller from the server id set) re-initialises it
// when the server data changes, so no state-sync effect is needed.
function ReorderableTasks({ tasks, renderRow, onPersist }) {
  const [order, setOrder] = useState(tasks)

  const handleDragEnd = (task) => {
    const idx = order.findIndex((t) => t.id === task.id)
    if (idx === -1) return
    const prev = order[idx - 1]?.position ?? null
    const next = order[idx + 1]?.position ?? null
    onPersist(task.id, between(prev, next))
  }

  return (
    <Reorder.Group axis="y" values={order} onReorder={setOrder} as="ul" role="list">
      {order.map((task) => (
        <Reorder.Item key={task.id} value={task} onDragEnd={() => handleDragEnd(task)}>
          {renderRow(task, 0)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}

function sortTasks(tasks, mode) {
  const copy = [...tasks]
  if (mode === 'date') {
    copy.sort((a, b) => {
      const da = a.due_at || a.due || '9999'
      const db = b.due_at || b.due || '9999'
      if (da === db) return (a.position || 0) - (b.position || 0)
      return da < db ? -1 : 1
    })
  } else {
    copy.sort((a, b) => (a.position || 0) - (b.position || 0))
  }
  return copy
}

export default function TaskListView({
  listId,
  listName,
  lists = [],
  sortMode,
  onSortModeChange,
  starredActive,
  rootRef,
}) {
  const { data: items = [], isLoading } = useTaskItems(listId, true)
  const { createTask, updateTask, moveTask, deleteTask, clearCompleted } =
    useTaskMutations(listId, true)
  const [editing, setEditing] = useState(null) // null | 'new' | task
  const [showCompleted, setShowCompleted] = useState(true)
  const [focusedTaskId, setFocusedTaskId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useTaskReminders(items)

  const visible = useMemo(
    () => (starredActive ? items.filter((t) => t.starred) : items),
    [items, starredActive],
  )

  const { parents, childrenByParent, completed } = useMemo(() => {
    const active = visible.filter((t) => t.status === 'needsAction')
    const done = visible.filter((t) => t.status === 'completed')
    const tops = sortTasks(
      active.filter((t) => !t.parent_id),
      sortMode,
    )
    const byParent = {}
    for (const t of active.filter((t) => t.parent_id)) {
      ;(byParent[t.parent_id] ||= []).push(t)
    }
    for (const key of Object.keys(byParent)) byParent[key] = sortTasks(byParent[key], sortMode)
    return { parents: tops, childrenByParent: byParent, completed: sortTasks(done, sortMode) }
  }, [visible, sortMode])

  // Keyboard shortcuts scoped to the Tasks window (Task 17).
  useEffect(() => {
    const el = rootRef?.current
    if (!el) return undefined
    const isTyping = (t) =>
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const find = (id) => items.find((t) => t.id === id)
    const onKey = (e) => {
      const task = focusedTaskId ? find(focusedTaskId) : null
      if (e.key === ' ' && !isTyping(e.target) && task) {
        e.preventDefault()
        updateTask.mutate({
          id: task.id,
          patch: { status: task.status === 'completed' ? 'needsAction' : 'completed' },
        })
      } else if (e.key === 's' && !e.metaKey && !e.ctrlKey && !isTyping(e.target) && task) {
        e.preventDefault()
        updateTask.mutate({ id: task.id, patch: { starred: !task.starred } })
      } else if ((e.metaKey || e.ctrlKey) && e.key === ']' && task && !task.parent_id) {
        // Indent: become a subtask of the nearest top-level task above.
        e.preventDefault()
        const tops = items.filter((t) => !t.parent_id && t.status === 'needsAction')
        const idx = tops.findIndex((t) => t.id === task.id)
        const above = idx > 0 ? tops[idx - 1] : null
        if (above) moveTask.mutate({ id: task.id, body: { parent_id: above.id } })
      } else if ((e.metaKey || e.ctrlKey) && e.key === '[' && task && task.parent_id) {
        // Outdent: clear the parent (explicit null honored by exclude_unset).
        e.preventDefault()
        moveTask.mutate({ id: task.id, body: { parent_id: null } })
      } else if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        task
      ) {
        e.preventDefault()
        const siblings = items
          .filter(
            (t) =>
              (t.parent_id || null) === (task.parent_id || null) &&
              t.status === 'needsAction',
          )
          .sort((a, b) => (a.position || 0) - (b.position || 0))
        const i = siblings.findIndex((t) => t.id === task.id)
        if (i === -1) return
        const up = e.key === 'ArrowUp'
        if (e.shiftKey) {
          // Jump to top / bottom of the sibling group.
          const target = up ? siblings[0] : siblings[siblings.length - 1]
          if (!target || target.id === task.id) return
          const pos = up
            ? between(null, siblings[0].position)
            : between(siblings[siblings.length - 1].position, null)
          moveTask.mutate({ id: task.id, body: { position: pos } })
        } else {
          const swapIdx = up ? i - 1 : i + 1
          if (swapIdx < 0 || swapIdx >= siblings.length) return
          // Slot the task across its neighbour: midpoint of the neighbour and the
          // sibling just beyond it (or past the end when there is none).
          const beyond = up ? siblings[swapIdx - 1] : siblings[swapIdx + 1]
          const pos = up
            ? between(beyond?.position ?? null, siblings[swapIdx].position)
            : between(siblings[swapIdx].position, beyond?.position ?? null)
          moveTask.mutate({ id: task.id, body: { position: pos } })
        }
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [rootRef, items, focusedTaskId, updateTask, moveTask])

  const handleToggle = (task) =>
    updateTask.mutate({
      id: task.id,
      patch: { status: task.status === 'completed' ? 'needsAction' : 'completed' },
    })
  const handleStar = (task) =>
    updateTask.mutate({ id: task.id, patch: { starred: !task.starred } })
  const handleDelete = (task) => deleteTask.mutate(task.id)
  const handleAdd = ({ title, due }) =>
    createTask.mutate({ title, due, all_day: true })
  const handleSave = (payload) => {
    if (editing && editing !== 'new') {
      updateTask.mutate({ id: editing.id, patch: payload })
    } else {
      createTask.mutate(payload)
    }
    setEditing(null)
  }

  const renderRow = (task, depth) => (
    <TaskRow
      key={task.id}
      task={task}
      depth={depth}
      lists={lists}
      onMoveToList={(targetListId) =>
        moveTask.mutate({ id: task.id, body: { list_id: targetListId } })
      }
      onToggle={handleToggle}
      onStar={handleStar}
      onEdit={setEditing}
      onDelete={handleDelete}
    />
  )

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 className="heading-display flex items-center gap-2 text-base text-white">
          {starredActive ? 'Starred' : listName || 'Tasks'}
        </h2>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Sort
          <select
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value)}
            aria-label="Sort tasks"
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <option value="myorder" className="bg-zinc-900">
              My order
            </option>
            <option value="date" className="bg-zinc-900">
              Date
            </option>
          </select>
        </label>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!starredActive && (
          <div className="mb-3">
            <QuickAddBar onAdd={handleAdd} disabled={!listId} />
          </div>
        )}

        <AnimatePresence initial={false}>
          {editing && (
            <div className="mb-3">
              <TaskEditor
                initial={editing === 'new' ? null : editing}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : parents.length === 0 && completed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <ListChecks size={28} className="opacity-40" />
            <p className="text-sm">
              {starredActive ? 'No starred tasks in this list.' : 'No tasks yet.'}
            </p>
          </div>
        ) : (
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
        )}

        {completed.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                aria-expanded={showCompleted}
                className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
              >
                {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Completed ({completed.length})
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="ml-3 rounded px-2 py-0.5 text-[11px] text-white/50 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
              >
                Clear completed
              </button>
            </div>
            {showCompleted && (
              <ul role="list" className="mt-1">
                <AnimatePresence initial={false}>
                  {completed.map((t) => renderRow(t, 0))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        )}
      </div>

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
    </section>
  )
}
