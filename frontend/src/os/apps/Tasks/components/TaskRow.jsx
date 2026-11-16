import { memo, useId } from 'react'
import { motion as Motion } from 'framer-motion'
import { CalendarDays, Pencil, Repeat2, Star, Trash2 } from 'lucide-react'
import { DURATION } from '../../../../lib/motion'
import { labelForRRule } from '../lib/recurrence'
import { getTaskDueDate, hasTimedDueDate } from '../lib/taskDateTime'
import TaskMenu from './TaskMenu'

function formatDue(task) {
  const when = getTaskDueDate(task)
  if (!when) return null
  const timed = hasTimedDueDate(task)

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

  if (timed) {
    label += ` · ${when.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })}`
  }
  return { label, overdue: timed ? when.getTime() < Date.now() : diffDays < 0 }
}

function TaskRow({
  task,
  depth = 0,
  lists = [],
  listLabel,
  onMoveToList,
  hasSubtasks = false,
  onToggle,
  onStar,
  onEdit,
  onDelete,
  onAddSubtask,
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
      className={`w7-item group flex min-w-0 items-start gap-1 px-1.5 py-2 @md:gap-2 ${
        isSub ? 'ml-4 border-l-border @md:ml-6' : ''
      }`}
    >
      {/* 7.css checkbox: the input is the real control, stretched over the
          label so touch gets a 44px hit area; the label draws the box. */}
      <span className="relative inline-flex size-6 shrink-0 items-center justify-center pointer-coarse:size-11">
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

      {/* Below @md this title button is the only edit path (the pencil is hidden),
          so it describes the action without changing its name (the task title). */}
      <button
        type="button"
        onClick={() => onEdit(task)}
        title="Edit task"
        aria-description="Opens the task editor"
        className="flex min-h-6 min-w-0 flex-1 flex-col items-start justify-center gap-1 rounded py-1 text-left pointer-coarse:min-h-11"
      >
        <span
          className={`line-clamp-2 max-w-full text-[12px] wrap-anywhere ${
            completed ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {task.title}
        </span>
        {(due || task.recurrence || listLabel) && (
          <span className="flex max-w-full min-w-0 flex-wrap items-center gap-1">
            {due && (
              <span
                className={`w7-badge max-w-full min-w-0 ${due.overdue && !completed ? 'text-destructive' : ''}`}
              >
                <CalendarDays size={11} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{due.label}</span>
              </span>
            )}
            {task.recurrence && (
              <span className="w7-badge max-w-full min-w-0">
                <Repeat2 size={11} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{labelForRRule(task.recurrence)}</span>
              </span>
            )}
            {listLabel && (
              <span className="max-w-full truncate text-muted-foreground">{listLabel}</span>
            )}
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label={task.starred ? `Unstar "${task.title}"` : `Star "${task.title}"`}
        aria-pressed={task.starred}
        onClick={() => onStar(task)}
        className={`w7-toolbtn size-6 shrink-0 px-0 pointer-coarse:size-11 ${
          task.starred ? 'text-amber-600' : 'text-muted-foreground'
        }`}
      >
        <Star size={15} fill={task.starred ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label={`Edit "${task.title}"`}
        onClick={() => onEdit(task)}
        className="w7-toolbtn hidden size-6 shrink-0 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 @md:pointer-fine:inline-flex"
      >
        <Pencil size={14} aria-hidden="true" />
      </button>

      {onMoveToList && lists.length > 0 && (
        <TaskMenu
          task={task}
          lists={lists}
          onMoveToList={onMoveToList}
          onAddSubtask={onAddSubtask}
          onDelete={() => onDelete(task)}
          hasSubtasks={hasSubtasks}
        />
      )}

      <button
        type="button"
        aria-label={`Delete "${task.title}"`}
        onClick={() => onDelete(task)}
        className="w7-toolbtn w7-toolbtn--danger hidden size-6 shrink-0 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 @md:pointer-fine:inline-flex"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </Root>
  )
}

export default memo(TaskRow)
