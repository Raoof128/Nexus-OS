import { memo } from 'react'
import { motion as Motion } from 'framer-motion'
import { Check, Pencil, Repeat2, Star, Trash2 } from 'lucide-react'
import { DURATION } from '../../../../lib/motion'

function formatDue(task) {
  const raw = task.due_at || task.due
  if (!raw) return null
  const when = task.due_at ? new Date(task.due_at) : new Date(`${task.due}T00:00:00`)
  if (Number.isNaN(when.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDay = new Date(when)
  dueDay.setHours(0, 0, 0, 0)
  const diffDays = Math.round((dueDay - today) / 86_400_000)

  let label
  if (diffDays === 0) label = 'Today'
  else if (diffDays === 1) label = 'Tomorrow'
  else if (diffDays === -1) label = 'Yesterday'
  else
    label = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (task.due_at && !task.all_day) {
    label += ` · ${when.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })}`
  }
  return { label, overdue: diffDays < 0 }
}

function TaskRow({ task, depth = 0, onToggle, onStar, onEdit, onDelete }) {
  const completed = task.status === 'completed'
  const due = formatDue(task)
  const isSub = depth === 1

  return (
    <Motion.li
      layout
      data-task-id={task.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: DURATION.fast }}
      className={`group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-white/[0.08] hover:bg-white/[0.03] ${
        isSub ? 'ml-7' : ''
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={completed ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
        onClick={() => onToggle(task)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
          completed
            ? 'border-primary bg-primary text-black shadow-[0_0_10px_color-mix(in_srgb,var(--color-primary)_55%,transparent)]'
            : 'border-white/30 text-transparent hover:border-primary/80'
        }`}
      >
        <Check size={12} strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={() => onEdit(task)}
        className="flex min-w-0 flex-1 flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
      >
        <span
          className={`truncate text-sm transition-colors ${
            completed ? 'text-muted-foreground line-through' : 'text-white/90'
          }`}
        >
          {task.title}
        </span>
        {(due || task.recurrence) && (
          <span className="mt-0.5 flex items-center gap-2 text-[11px]">
            {due && (
              <span
                className={
                  due.overdue && !completed ? 'text-red-400' : 'text-muted-foreground'
                }
              >
                {due.label}
              </span>
            )}
            {task.recurrence && (
              <span className="flex items-center gap-1 text-primary/70">
                <Repeat2 size={11} /> repeats
              </span>
            )}
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label={task.starred ? `Unstar "${task.title}"` : `Star "${task.title}"`}
        aria-pressed={task.starred}
        onClick={() => onStar(task)}
        className={`shrink-0 rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
          task.starred
            ? 'text-primary'
            : 'text-white/25 opacity-0 hover:text-primary/80 group-hover:opacity-100'
        }`}
      >
        <Star size={15} fill={task.starred ? 'currentColor' : 'none'} />
      </button>

      <button
        type="button"
        aria-label={`Edit "${task.title}"`}
        onClick={() => onEdit(task)}
        className="shrink-0 rounded p-1 text-white/25 opacity-0 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-hover:opacity-100"
      >
        <Pencil size={14} />
      </button>

      <button
        type="button"
        aria-label={`Delete "${task.title}"`}
        onClick={() => onDelete(task)}
        className="shrink-0 rounded p-1 text-white/25 opacity-0 transition-colors hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </Motion.li>
  )
}

export default memo(TaskRow)
