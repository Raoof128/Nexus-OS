import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion as Motion, Reorder } from 'framer-motion'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import { useTaskItems, useTaskMutations } from '../hooks/useTasks'
import { useTaskReminders } from '../hooks/useTaskReminders'
import { between } from '../lib/position'
import TaskRow from '../components/TaskRow'
import TaskEditor from '../components/TaskEditor'
import QuickAddBar from '../components/QuickAddBar'
import { groupVisibleTasks } from '../lib/taskGrouping'
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
        <Reorder.Item
          key={task.id}
          value={task}
          role="listitem"
          onDragEnd={() => handleDragEnd(task)}
        >
          {renderRow(task, 0)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}

function positionBetween(previous, next, fallback) {
  if (previous && next) return ((previous.position || 0) + (next.position || 0)) / 2
  if (previous) return (previous.position || 0) + 1
  if (next) return (next.position || 0) - 1
  return fallback?.position || 1
}

export default function TaskListView({
  listId,
  listName,
  lists = [],
  sortMode,
  onSortModeChange,
  starredActive,
  rootRef,
  userId,
}) {
  const { data: items = [], isLoading, error, refetch } = useTaskItems(listId, true)
  const { createTask, updateTask, moveTask, deleteTask, clearCompleted } = useTaskMutations(
    listId,
    true,
  )
  const [editing, setEditing] = useState(null) // null | 'new' | { mode, parent } | task
  const [showCompleted, setShowCompleted] = useState(true)
  const [focusedTaskId, setFocusedTaskId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useTaskReminders(items, userId)

  const visible = useMemo(
    () => (starredActive ? items.filter((t) => t.starred) : items),
    [items, starredActive],
  )

  const { parents, childrenByParent, completed } = useMemo(
    () => groupVisibleTasks(visible, sortMode),
    [visible, sortMode],
  )

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
  const handleDelete = (task) => deleteTask.mutate(task.id)
  const handleAdd = ({ title, due, due_at, due_timezone, all_day }) =>
    createTask.mutateAsync({ title, due, due_at, due_timezone, all_day })
  const handleSave = async (payload) => {
    if (editing && editing !== 'new' && editing.mode !== 'new-subtask') {
      await updateTask.mutateAsync({ id: editing.id, patch: payload })
    } else {
      await createTask.mutateAsync({
        ...payload,
        parent_id: editing?.mode === 'new-subtask' ? editing.parent.id : undefined,
      })
    }
    setEditing(null)
  }

  const moveWithin = (task, siblings, direction) => {
    if (sortMode !== 'myorder') return
    const index = siblings.findIndex((item) => item.id === task.id)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return
    const reordered = [...siblings]
    const [item] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, item)
    const previous = reordered[targetIndex - 1] || null
    const next = reordered[targetIndex + 1] || null
    moveTask.mutate({
      id: task.id,
      body: { position: positionBetween(previous, next, task) },
    })
  }

  const renderRow = (task, depth, siblings = []) => {
    const index = siblings.findIndex((item) => item.id === task.id)
    const canReorder = sortMode === 'myorder' && index !== -1
    return (
      <TaskRow
        key={task.id}
        task={task}
        depth={depth}
        canMoveDown={canReorder && index < siblings.length - 1}
        canMoveUp={canReorder && index > 0}
        lists={lists}
        onAddSubtask={(parent) => setEditing({ mode: 'new-subtask', parent })}
        onMoveDown={(item) => moveWithin(item, siblings, 'down')}
        onMoveUp={(item) => moveWithin(item, siblings, 'up')}
        onMoveToList={(targetListId) =>
          moveTask.mutate({ id: task.id, body: { list_id: targetListId } })
        }
        onToggle={handleToggle}
        onStar={handleStar}
        onEdit={setEditing}
        onDelete={handleDelete}
      />
    )
  }

  const renderListItem = (task, depth, siblings) => (
    <Motion.li key={task.id} layout>
      {renderRow(task, depth, siblings)}
    </Motion.li>
  )

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-3 @sm:px-4">
        <h2 className="heading-display flex min-w-0 items-center gap-2 truncate text-base text-white">
          {starredActive ? 'Starred' : listName || 'Tasks'}
        </h2>
        <label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
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
            <QuickAddBar onAdd={handleAdd} disabled={!listId || createTask.isPending} />
          </div>
        )}

        <AnimatePresence initial={false}>
          {editing && (
            <div className="mb-3">
              <TaskEditor
                initial={editing === 'new' || editing.mode === 'new-subtask' ? null : editing}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-center text-sm text-red-100"
          >
            <p>{error.message || 'Unable to load tasks.'}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg border border-red-300/30 px-3 py-2 text-xs hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
            >
              Retry
            </button>
          </div>
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
            {sortMode === 'myorder' ? (
              <ReorderableTasks
                key={parents.map((parent) => `${parent.id}:${parent.position}`).join(',')}
                tasks={parents}
                renderRow={(task) => (
                  <>
                    {renderRow(task, 0, parents)}
                    {(childrenByParent[task.id] || []).length > 0 && (
                      <ul role="list">
                        {(childrenByParent[task.id] || []).map((child) =>
                          renderListItem(child, 1, childrenByParent[task.id] || []),
                        )}
                      </ul>
                    )}
                  </>
                )}
                onPersist={(id, position) => moveTask.mutate({ id, body: { position } })}
              />
            ) : (
              <ul role="list">
                <AnimatePresence initial={false}>
                  {parents.flatMap((parent) => [
                    renderListItem(parent, 0, parents),
                    ...(childrenByParent[parent.id] || []).map((child) =>
                      renderListItem(child, 1, childrenByParent[parent.id] || []),
                    ),
                  ])}
                </AnimatePresence>
              </ul>
            )}
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
                  {completed.map((task) => renderListItem(task, 0, completed))}
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
