import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, Reorder } from 'framer-motion'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import { useTaskItems, useTaskMutations } from '../hooks/useTasks'
import { between } from '../lib/position'
import TaskRow from '../components/TaskRow'
import TaskEditor from '../components/TaskEditor'
import QuickAddBar from '../components/QuickAddBar'
import ConfirmDialog from '../../../../components/ui/ConfirmDialog'

// Drag-reorderable top-level task group. Row data always comes from the current
// `tasks` prop, so a title, star or due edit shows at once without remounting the row.
// The local id order only matters while dragging. It is adopted from the server
// order whenever that order changes while idle, including a reorder made in another
// tab or on another device with the same ids. A server change that lands mid-drag
// waits until the drop, so the dragged row does not jump.
function ReorderableTasks({ tasks, renderRow, onPersist }) {
  const serverIds = tasks.map((t) => t.id)
  const serverKey = serverIds.join(',')
  const [sync, setSync] = useState(() => ({
    seen: serverKey,
    orderIds: serverIds,
    dragging: false,
  }))

  // Adopt the server order during render (React's "adjust state when a prop
  // changes" pattern), so the first paint already shows the new order.
  let current = sync
  if (sync.seen !== serverKey && !sync.dragging) {
    current = { seen: serverKey, orderIds: serverIds, dragging: false }
    setSync(current)
  }

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const known = new Set(current.orderIds)
  const order = [
    ...current.orderIds.filter((id) => byId.has(id)).map((id) => byId.get(id)),
    ...tasks.filter((t) => !known.has(t.id)),
  ]

  const handleDragStart = () => setSync((s) => ({ ...s, dragging: true }))
  const handleReorder = (next) => setSync((s) => ({ ...s, orderIds: next.map((t) => t.id) }))

  const handleDragEnd = (task) => {
    setSync((s) => ({ ...s, dragging: false }))
    const idx = order.findIndex((t) => t.id === task.id)
    if (idx === -1) return
    const prev = order[idx - 1]?.position ?? null
    const next = order[idx + 1]?.position ?? null
    onPersist(task.id, between(prev, next))
  }

  return (
    <Reorder.Group axis="y" values={order} onReorder={handleReorder} as="ul" role="list">
      {order.map((task) => (
        <Reorder.Item
          key={task.id}
          value={task}
          onDragStart={handleDragStart}
          onDragEnd={() => handleDragEnd(task)}
        >
          {renderRow(task, 0)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}

function deleteMessage(task, subtasks) {
  if (!task) return ''
  const parts = [`Delete "${task.title}"`]
  if (subtasks > 0) parts.push(` and its ${subtasks} ${subtasks === 1 ? 'subtask' : 'subtasks'}`)
  let message = `${parts.join('')}?`
  if (task.notes_encrypted || task.notes) message += ' Its notes will be deleted too.'
  return message
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
  leading = null,
}) {
  const { data: items = [], isLoading, isError, refetch } = useTaskItems(listId, true)
  const { createTask, updateTask, moveTask, deleteTask, clearCompleted } = useTaskMutations(
    listId,
    true,
  )
  const [editing, setEditing] = useState(null) // null | 'new' | task
  const [showCompleted, setShowCompleted] = useState(true)
  const [focusedTaskId, setFocusedTaskId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  // Row deletes that lose work (subtasks, notes) wait for confirmation here.
  const [pendingDelete, setPendingDelete] = useState(null)
  // Failed saves roll back optimistically; say why (e.g. an unsupported custom
  // repeat rule is a 400, a subtask moved across lists is a 409).
  const saveError = [createTask, updateTask, moveTask, deleteTask, clearCompleted].find(
    (mutation) => mutation?.isError,
  )?.error?.message

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
    // Keys pressed inside an open row menu belong to the menu, not the list.
    const isTyping = (t) =>
      t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable ||
        Boolean(t.closest?.('[role="menu"]')))
    // Space on a focused button (edit, star, delete, the row menu) activates that
    // button; it must not also toggle the task. The checkbox handles Space natively.
    const isActivatable = (t) => Boolean(t?.closest?.('button, a[href], select'))
    const find = (id) => items.find((t) => t.id === id)
    const onKey = (e) => {
      const task = focusedTaskId ? find(focusedTaskId) : null
      if (e.key === ' ' && !isTyping(e.target) && !isActivatable(e.target) && task) {
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
            (t) => (t.parent_id || null) === (task.parent_id || null) && t.status === 'needsAction',
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
  const handleStar = (task) => updateTask.mutate({ id: task.id, patch: { starred: !task.starred } })
  const subtaskCount = (task) => items.filter((t) => t.parent_id === task.id).length
  const hasNotes = (task) => Boolean(task.notes_encrypted || task.notes)
  // A plain task deletes at once. A parent (which takes its subtasks with it) or a
  // task with notes (which cannot be recovered) asks first.
  const handleDelete = (task) => {
    if (subtaskCount(task) > 0 || hasNotes(task)) setPendingDelete(task)
    else deleteTask.mutate(task.id)
  }
  const handleAdd = ({ title, due, due_at, all_day }) =>
    createTask.mutate({ title, due, due_at: due_at ?? null, all_day: all_day ?? true })
  const handleSave = (payload) => {
    if (editing && editing !== 'new') {
      updateTask.mutate({ id: editing.id, patch: payload })
    } else {
      createTask.mutate(payload)
    }
    setEditing(null)
  }

  // `inReorder` rows sit inside a drag-reorder <li>, so they render as <div>.
  const renderRow = (task, depth, inReorder = false) => (
    <TaskRow
      key={task.id}
      task={task}
      depth={depth}
      asListItem={!inReorder}
      lists={lists}
      hasSubtasks={subtaskCount(task) > 0}
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
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 pt-3 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {leading}
          <h2 className="w7-heading min-w-0 truncate">
            {starredActive ? 'Starred' : listName || 'Tasks'}
          </h2>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-muted-foreground">
          Sort by
          <select
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value)}
            aria-label="Sort tasks"
          >
            <option value="myorder">My order</option>
            <option value="date">Date</option>
          </select>
        </label>
      </header>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {saveError && (
          <p role="alert" className="w7-error mb-3">
            Couldn't save the change. {saveError}
          </p>
        )}
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
          <div
            role="status"
            className="flex flex-col items-center gap-2 py-8 text-muted-foreground"
          >
            <div className="flex w-48 flex-col gap-2">
              <div role="progressbar" aria-label="Loading tasks" className="marquee" />
              <p className="text-center text-[12px]">Loading tasks…</p>
            </div>
          </div>
        ) : parents.length === 0 && completed.length === 0 ? (
          isError ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p role="alert" className="w7-error">
                Couldn't load tasks for this list.
              </p>
              <button type="button" onClick={() => refetch()} className="w7-btn">
                Try again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <ListChecks size={28} className="text-[#3d5a80] opacity-60" aria-hidden="true" />
              <p>
                {starredActive ? 'No starred tasks in this list.' : 'No tasks yet. Add one above.'}
              </p>
            </div>
          )
        ) : (
          <div
            onFocusCapture={(e) => {
              const li = e.target.closest('[data-task-id]')
              if (li) setFocusedTaskId(li.getAttribute('data-task-id'))
            }}
          >
            <ReorderableTasks
              tasks={parents}
              renderRow={(t) => {
                const children = childrenByParent[t.id] || []
                return (
                  <>
                    {renderRow(t, 0, true)}
                    {children.length > 0 && (
                      <ul role="list">{children.map((c) => renderRow(c, 1))}</ul>
                    )}
                  </>
                )
              }}
              onPersist={(id, position) => moveTask.mutate({ id, body: { position } })}
            />
          </div>
        )}

        {completed.length > 0 && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-1">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                aria-expanded={showCompleted}
                className="w7-toolbtn"
              >
                {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Completed ({completed.length})
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="w7-toolbtn w7-toolbtn--danger"
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
        id="task-delete"
        open={Boolean(pendingDelete)}
        title="Delete task?"
        message={deleteMessage(pendingDelete, pendingDelete ? subtaskCount(pendingDelete) : 0)}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          deleteTask.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear completed?"
        message="This permanently deletes all completed tasks in this list. Open subtasks of a completed task are kept and moved to the top level."
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
