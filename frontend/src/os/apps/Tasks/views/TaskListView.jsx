import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, Reorder } from 'framer-motion'
import { ChevronDown, ChevronRight, ListChecks, Plus } from 'lucide-react'
import { useTaskItems, useTaskMutations } from '../hooks/useTasks'
import { between } from '../lib/position'
import { formatLocalDate, getTaskDueDate, hasTimedDueDate } from '../lib/taskDateTime'
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
      const da = getTaskDueDate(a)?.getTime() ?? Infinity
      const db = getTaskDueDate(b)?.getTime() ?? Infinity
      if (da === db) return (a.position || 0) - (b.position || 0)
      return da < db ? -1 : 1
    })
  } else if (mode === 'title') {
    copy.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }),
    )
  } else {
    copy.sort((a, b) => (a.position || 0) - (b.position || 0))
  }
  return copy
}

function dateGroups(tasks, now) {
  const groups = { Past: [], Today: [], Upcoming: [], 'No date': [] }
  const today = formatLocalDate(now)
  for (const task of tasks) {
    const due = getTaskDueDate(task)
    const day = due && formatLocalDate(due)
    if (!day) groups['No date'].push(task)
    else if (day < today || (hasTimedDueDate(task) && due < now)) groups.Past.push(task)
    else if (day === today) groups.Today.push(task)
    else groups.Upcoming.push(task)
  }
  return Object.entries(groups).filter(([, tasks]) => tasks.length)
}

function taskOrigin(task, starredActive) {
  return starredActive ? { taskListId: task.list_id } : {}
}

export default function TaskListView({
  listId,
  listName,
  lists = [],
  sortMode = 'myorder',
  onSortModeChange,
  starredActive,
  collectionQuery,
  rootRef,
  leading = null,
}) {
  const listQuery = useTaskItems(starredActive ? null : listId, true)
  const { data: items = [], isLoading, isError, refetch } = collectionQuery ?? listQuery
  const { createTask, updateTask, moveTask, deleteTask, clearCompleted } = useTaskMutations(
    listId,
    true,
  )
  const [editing, setEditing] = useState(null) // An existing task, or a new task draft.
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
    const activeIds = new Set(active.map((task) => task.id))
    const byParent = Object.create(null)
    const topLevel = []
    for (const task of active) {
      if (!starredActive && activeIds.has(task.parent_id)) {
        ;(byParent[task.parent_id] ||= []).push(task)
      } else {
        topLevel.push(task)
      }
    }
    for (const key of Object.keys(byParent)) byParent[key] = sortTasks(byParent[key], sortMode)
    return {
      parents: sortTasks(topLevel, sortMode),
      childrenByParent: byParent,
      completed: sortTasks(done, sortMode),
    }
  }, [visible, sortMode, starredActive])
  const canReorder =
    !starredActive && sortMode === 'myorder' && !parents.some((task) => task.parent_id)

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
          ...taskOrigin(task, starredActive),
          patch: { status: task.status === 'completed' ? 'needsAction' : 'completed' },
        })
      } else if (e.key === 's' && !e.metaKey && !e.ctrlKey && !isTyping(e.target) && task) {
        e.preventDefault()
        updateTask.mutate({
          id: task.id,
          ...taskOrigin(task, starredActive),
          patch: { starred: !task.starred },
        })
      } else if (
        canReorder &&
        (e.metaKey || e.ctrlKey) &&
        e.key === ']' &&
        task &&
        !task.parent_id
      ) {
        // Indent: become a subtask of the nearest top-level task above.
        e.preventDefault()
        const tops = items.filter((t) => !t.parent_id && t.status === 'needsAction')
        const idx = tops.findIndex((t) => t.id === task.id)
        const above = idx > 0 ? tops[idx - 1] : null
        if (above) moveTask.mutate({ id: task.id, body: { parent_id: above.id } })
      } else if (
        !starredActive &&
        (e.metaKey || e.ctrlKey) &&
        e.key === '[' &&
        task &&
        task.parent_id
      ) {
        // Outdent: clear the parent (explicit null honored by exclude_unset).
        e.preventDefault()
        moveTask.mutate({ id: task.id, body: { parent_id: null } })
      } else if (
        canReorder &&
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
  }, [rootRef, items, focusedTaskId, updateTask, moveTask, starredActive, canReorder])

  const handleToggle = (task) =>
    updateTask.mutate({
      id: task.id,
      ...taskOrigin(task, starredActive),
      patch: { status: task.status === 'completed' ? 'needsAction' : 'completed' },
    })
  const handleStar = (task) =>
    updateTask.mutate({
      id: task.id,
      ...taskOrigin(task, starredActive),
      patch: { starred: !task.starred },
    })
  const subtaskCount = (task) => items.filter((t) => t.parent_id === task.id).length
  const hasNotes = (task) => Boolean(task.notes_encrypted || task.notes)
  const removeTask = (task) =>
    deleteTask.mutate(starredActive ? { id: task.id, ...taskOrigin(task, true) } : task.id)
  // A plain task deletes at once. A parent (which takes its subtasks with it) or a
  // task with notes (which cannot be recovered) asks first.
  const handleDelete = (task) => {
    if (subtaskCount(task) > 0 || hasNotes(task)) setPendingDelete(task)
    else removeTask(task)
  }
  const handleAdd = (payload) => createTask.mutate(payload)
  const handleSave = (payload) => {
    const onSuccess = () => setEditing((current) => (current === editing ? null : current))
    if (editing?.id) {
      updateTask.mutate(
        { id: editing.id, ...taskOrigin(editing, starredActive), patch: payload },
        { onSuccess },
      )
    } else {
      createTask.mutate(
        { ...payload, ...(editing?.parent_id && { parent_id: editing.parent_id }) },
        { onSuccess },
      )
    }
  }

  // `inReorder` rows sit inside a drag-reorder <li>, so they render as <div>.
  const renderRow = (task, depth, inReorder = false) => (
    <TaskRow
      key={task.id}
      task={task}
      depth={depth}
      asListItem={!inReorder}
      lists={lists}
      listLabel={starredActive ? lists.find((list) => list.id === task.list_id)?.name : undefined}
      hasSubtasks={subtaskCount(task) > 0}
      onMoveToList={(targetListId) =>
        moveTask.mutate({
          id: task.id,
          ...taskOrigin(task, starredActive),
          body: { list_id: targetListId },
        })
      }
      onToggle={handleToggle}
      onStar={handleStar}
      onEdit={setEditing}
      onDelete={handleDelete}
      onAddSubtask={
        !starredActive && task.status === 'needsAction' && !task.parent_id && !task.recurrence
          ? () => setEditing({ parent_id: task.id, parentTitle: task.title })
          : undefined
      }
    />
  )
  const renderBranch = (task) => (
    <>
      {renderRow(task, 0, true)}
      {childrenByParent[task.id]?.length > 0 && (
        <ul role="list">{childrenByParent[task.id].map((child) => renderRow(child, 1))}</ul>
      )}
    </>
  )
  const renderBranches = (tasks) => (
    <ul role="list" className="divide-y divide-border/60">
      {tasks.map((task) => (
        <li key={task.id}>{renderBranch(task)}</li>
      ))}
    </ul>
  )

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="w7-commandbar shrink-0 flex-wrap justify-between gap-x-3 gap-y-1 px-3 py-2">
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
            className="pointer-coarse:min-h-11"
          >
            {!starredActive && <option value="myorder">My order</option>}
            <option value="date">Date</option>
            <option value="title">Title</option>
          </select>
        </label>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-3"
        data-task-scroll
      >
        {saveError && (
          <p role="alert" className="w7-error mb-3 wrap-anywhere">
            Couldn't save the change. {saveError}
          </p>
        )}
        {!starredActive && (
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
            <QuickAddBar onAdd={handleAdd} disabled={!listId} />
            <button
              type="button"
              onClick={() => setEditing({})}
              className="w7-toolbtn pointer-coarse:min-h-11"
            >
              <Plus size={14} aria-hidden="true" />
              Add with details
            </button>
          </div>
        )}

        {editing && (
          <div className="mb-3">
            <TaskEditor
              key={editing.id || editing.parent_id || 'new'}
              initial={editing.id ? editing : null}
              parentTitle={editing.parentTitle}
              saving={Boolean(createTask.isPending || updateTask.isPending)}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}

        {isError && items.length > 0 && (
          <div role="status" className="w7-infobar mb-2 flex-wrap">
            Some tasks couldn’t refresh.
            <button type="button" className="w7-btn" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        )}

        {isLoading && items.length === 0 ? (
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
                {starredActive
                  ? 'Couldn’t load starred tasks.'
                  : "Couldn't load tasks for this list."}
              </p>
              <button type="button" onClick={() => refetch()} className="w7-btn">
                Try again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <ListChecks size={28} className="text-[#3d5a80] opacity-60" aria-hidden="true" />
              <p>{starredActive ? 'No starred tasks yet.' : 'No tasks yet. Add one above.'}</p>
            </div>
          )
        ) : (
          <div
            onFocusCapture={(e) => {
              const li = e.target.closest('[data-task-id]')
              if (li) setFocusedTaskId(li.getAttribute('data-task-id'))
            }}
          >
            {canReorder ? (
              <ReorderableTasks
                tasks={parents}
                renderRow={renderBranch}
                onPersist={(id, position) => moveTask.mutate({ id, body: { position } })}
              />
            ) : sortMode === 'date' ? (
              dateGroups(parents, new Date()).map(([label, tasks]) => (
                <section key={label} className="mb-3">
                  <h3 className="w7-subheading border-b border-border bg-w7-pane px-2 py-1.5">
                    {label}
                  </h3>
                  {renderBranches(tasks)}
                </section>
              ))
            ) : (
              renderBranches(parents)
            )}
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
              {!starredActive && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="w7-toolbtn w7-toolbtn--danger pointer-coarse:min-h-11"
                >
                  Clear completed
                </button>
              )}
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
          removeTask(pendingDelete)
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
