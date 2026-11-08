import { memo, useId } from 'react'
import { motion as Motion } from 'framer-motion'
import { Pencil, Repeat2, Star, Trash2 } from 'lucide-react'
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
    })}`
  }
  return { label, overdue: diffDays < 0 }
}

function TaskRow({
  task,
  depth = 0,
  lists = [],
  onMoveToList,
  onToggle,
  onStar,
  onEdit,
  onDelete,
  asListItem = true,
}) {
  const completed = task.status === 'completed'
  const due = formatDue(task)
  const isSub = depth === 1
  const checkId = useId()
  // Inside a drag-reorder item (already an <li>) the row is a <div>; the
  // standalone rows in the Completed list are the list items themselves.
  const Root = asListItem ? Motion.li : Motion.div

  return (
    <Root
      layout
      data-task-id={task.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: DURATION.fast }}
      className={`w7-item group flex items-center gap-2 px-2 py-1 ${isSub ? 'ml-7' : ''}`}
    >
      {/* 7.css checkbox: the input is the real control, stretched over the
          label so touch gets a 44px hit area; the label draws the box. */}
      <span className="relative inline-flex size-[14px] shrink-0 items-center justify-center pointer-coarse:size-11">
        <input
          id={checkId}
          type="checkbox"
          checked={completed}
          onChange={() => onToggle(task)}
          aria-label={`Complete "${task.title}"`}
          className="absolute inset-0 m-0 size-full cursor-pointer"
        />
        <label htmlFor={checkId} className="pointer-events-none before:m-0" />
      </span>

      <button
        type="button"
        onClick={() => onEdit(task)}
        className="flex min-w-0 flex-1 flex-col items-start rounded text-left"
      >
        <span
          className={`max-w-full truncate text-[12px] ${
            completed ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {task.title}
        </span>
        {(due || task.recurrence) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            {due && (
              <span className={`w7-badge ${due.overdue && !completed ? 'text-destructive' : ''}`}>
                {due.label}
              </span>
            )}
            {task.recurrence && (
              <span className="w7-badge">
                <Repeat2 size={11} aria-hidden="true" />
                {labelForRRule(task.recurrence)}
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
        className={`w7-toolbtn h-6 w-6 px-0 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100 focus-visible:opacity-100 ${
          task.starred
            ? 'text-amber-600'
            : 'text-muted-foreground opacity-0 group-hover:opacity-100'
        }`}
      >
        <Star size={15} fill={task.starred ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label={`Edit "${task.title}"`}
        onClick={() => onEdit(task)}
        className="w7-toolbtn h-6 w-6 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100"
      >
        <Pencil size={14} aria-hidden="true" />
      </button>

      {onMoveToList && lists.length > 0 && (
        <TaskMenu task={task} lists={lists} onMoveToList={onMoveToList} />
      )}

      <button
        type="button"
        aria-label={`Delete "${task.title}"`}
        onClick={() => onDelete(task)}
        className="w7-toolbtn w7-toolbtn--danger h-6 w-6 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </Root>
  )
}

export default memo(TaskRow)
