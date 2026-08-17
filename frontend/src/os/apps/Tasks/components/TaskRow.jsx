import { memo } from 'react'
import { motion as Motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Pencil,
  Repeat2,
  Star,
  Trash2,
} from 'lucide-react'
import { DURATION } from '../../../../lib/motion'
import { labelForRRule } from '../lib/recurrence'
import TaskMenu from './TaskMenu'

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
  else label = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (task.due_at && !task.all_day) {
    label += ` · ${when.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: task.due_timezone || undefined,
    })}`
  }
  return { label, overdue: diffDays < 0 }
}

function TaskRow({
  task,
  depth = 0,
  canMoveDown = false,
  canMoveUp = false,
  lists = [],
  onAddSubtask,
  onMoveDown,
  onMoveUp,
  onMoveToList,
  onToggle,
  onStar,
  onEdit,
  onDelete,
}) {
  const completed = task.status === 'completed'
  const due = formatDue(task)
  const isSub = depth === 1

  return (
    <Motion.div
      layout
      data-task-id={task.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: DURATION.fast }}
      className={`group flex flex-wrap items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-white/[0.08] hover:bg-white/[0.03] @lg:flex-nowrap ${
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
          className={`w-full truncate text-sm transition-colors ${
            completed ? 'text-muted-foreground line-through' : 'text-white/90'
          }`}
        >
          {task.title}
        </span>
        {(due || task.recurrence) && (
          <span className="mt-0.5 flex items-center gap-2 text-[11px]">
            {due && (
              <span
                className={due.overdue && !completed ? 'text-red-400' : 'text-muted-foreground'}
              >
                {due.label}
              </span>
            )}
            {task.recurrence && (
              <span className="flex items-center gap-1 text-primary/70">
                <Repeat2 size={11} /> {labelForRRule(task.recurrence)}
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
        className={`shrink-0 rounded p-1 transition-colors focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-focus-within:opacity-100 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:opacity-100 ${
          task.starred
            ? 'text-primary'
            : 'text-white/25 opacity-0 hover:text-primary/80 group-hover:opacity-100'
        }`}
      >
        <Star size={15} fill={task.starred ? 'currentColor' : 'none'} />
      </button>

      <div className="mt-1 hidden basis-full items-center justify-end gap-1 pl-8 group-hover:flex group-focus-within:flex pointer-coarse:flex @lg:contents @lg:mt-0 @lg:basis-auto @lg:pl-0">
        {!completed && !isSub && (
          <button
            type="button"
            aria-label={`Add subtask to "${task.title}"`}
            onClick={() => onAddSubtask(task)}
            className="shrink-0 rounded p-1 text-white/25 opacity-0 transition-colors hover:text-primary/80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:opacity-100"
          >
            <CornerDownRight size={14} />
          </button>
        )}

        {!completed && (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
            <button
              type="button"
              aria-label={`Move "${task.title}" up`}
              disabled={!canMoveUp}
              onClick={() => onMoveUp(task)}
              className="rounded p-0.5 text-white/25 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 pointer-coarse:min-h-11 pointer-coarse:min-w-11 disabled:opacity-25 disabled:hover:text-white/25"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              aria-label={`Move "${task.title}" down`}
              disabled={!canMoveDown}
              onClick={() => onMoveDown(task)}
              className="rounded p-0.5 text-white/25 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 pointer-coarse:min-h-11 pointer-coarse:min-w-11 disabled:opacity-25 disabled:hover:text-white/25"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}

        {onMoveToList && lists.length > 0 && (
          <TaskMenu task={task} lists={lists} onMoveToList={onMoveToList} />
        )}

        <button
          type="button"
          aria-label={`Edit "${task.title}"`}
          onClick={() => onEdit(task)}
          className="shrink-0 rounded p-1 text-white/25 opacity-0 transition-colors hover:text-white/80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:opacity-100"
        >
          <Pencil size={14} />
        </button>

        <button
          type="button"
          aria-label={`Delete "${task.title}"`}
          onClick={() => onDelete(task)}
          className="shrink-0 rounded p-1 text-white/25 opacity-0 transition-colors hover:text-red-400 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </Motion.div>
  )
}

export default memo(TaskRow)
