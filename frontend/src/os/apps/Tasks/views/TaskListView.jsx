import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import { useTaskItems, useTaskMutations } from '../hooks/useTasks'
import { useTaskReminders } from '../hooks/useTaskReminders'
import TaskRow from '../components/TaskRow'
import TaskEditor from '../components/TaskEditor'
import QuickAddBar from '../components/QuickAddBar'
import { groupVisibleTasks } from '../lib/taskGrouping'

function positionBetween(previous, next, fallback) {
  if (previous && next) return ((previous.position || 0) + (next.position || 0)) / 2
  if (previous) return (previous.position || 0) + 1
  if (next) return (next.position || 0) - 1
  return fallback?.position || 1
}

export default function TaskListView({
  listId,
  listName,
  sortMode,
  onSortModeChange,
  starredActive,
  rootRef,
}) {
  const { data: items = [], isLoading } = useTaskItems(listId, true)
  const { createTask, updateTask, moveTask, deleteTask } = useTaskMutations(listId, true)
  const [editing, setEditing] = useState(null) // null | 'new' | { mode, parent } | task
  const [showCompleted, setShowCompleted] = useState(true)
  const [focusedTaskId, setFocusedTaskId] = useState(null)

  useTaskReminders(items)

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
  const handleAdd = ({ title, due, due_at, due_timezone, all_day }) =>
    createTask.mutate({ title, due, due_at, due_timezone, all_day })
  const handleSave = (payload) => {
    if (editing && editing !== 'new' && editing.mode !== 'new-subtask') {
      updateTask.mutate({ id: editing.id, patch: payload })
    } else {
      createTask.mutate({
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
        onAddSubtask={(parent) => setEditing({ mode: 'new-subtask', parent })}
        onMoveDown={(item) => moveWithin(item, siblings, 'down')}
        onMoveUp={(item) => moveWithin(item, siblings, 'up')}
        onToggle={handleToggle}
        onStar={handleStar}
        onEdit={setEditing}
        onDelete={handleDelete}
      />
    )
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-3 sm:px-4">
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
            <QuickAddBar onAdd={handleAdd} disabled={!listId} />
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
        ) : parents.length === 0 && completed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <ListChecks size={28} className="opacity-40" />
            <p className="text-sm">
              {starredActive ? 'No starred tasks in this list.' : 'No tasks yet.'}
            </p>
          </div>
        ) : (
          <ul role="list" onFocusCapture={(e) => {
            const li = e.target.closest('[data-task-id]')
            if (li) setFocusedTaskId(li.getAttribute('data-task-id'))
          }}>
            <AnimatePresence initial={false}>
              {parents.map((p) => (
                <div key={p.id}>
                  {renderRow(p, 0, parents)}
                  {(childrenByParent[p.id] || []).map((c) =>
                    renderRow(c, 1, childrenByParent[p.id] || []),
                  )}
                </div>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {completed.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              aria-expanded={showCompleted}
              className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
            >
              {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Completed ({completed.length})
            </button>
            {showCompleted && (
              <ul role="list" className="mt-1">
                <AnimatePresence initial={false}>
                  {completed.map((t) => renderRow(t, 0, completed))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
