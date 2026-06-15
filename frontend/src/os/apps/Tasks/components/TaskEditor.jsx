import { useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { X } from 'lucide-react'
import { DURATION } from '../../../../lib/motion'
import RecurrencePicker from './RecurrencePicker'

// Inline create/edit form. `initial` is a task object (edit) or null (create).
// Emits a payload shaped for CreateTaskRequest / UpdateTaskRequest.
export default function TaskEditor({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [notes, setNotes] = useState(initial?.notes_encrypted || initial?.notes || '')
  const [due, setDue] = useState(initial?.due || '')
  const [time, setTime] = useState(
    initial?.due_at && !initial?.all_day
      ? new Date(initial.due_at).toTimeString().slice(0, 5)
      : '',
  )
  const [recurrence, setRecurrence] = useState(initial?.recurrence || null)
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const buildPayload = () => {
    const trimmed = title.trim()
    if (!trimmed) return null
    const allDay = !time
    const dueAt = due && time ? `${due}T${time}:00` : null
    return {
      title: trimmed,
      notes: notes.trim() || null,
      due: due || null,
      due_at: dueAt,
      all_day: allDay,
      recurrence: recurrence || null,
    }
  }

  const save = () => {
    const payload = buildPayload()
    if (payload) onSave(payload)
  }

  const onTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <Motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: DURATION.fast }}
      className="glass-panel overflow-hidden rounded-xl border border-primary/20 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="heading-ui text-xs uppercase tracking-wider text-primary/80">
          {initial ? 'Edit task' : 'New task'}
        </span>
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          className="rounded p-1 text-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <X size={14} />
        </button>
      </div>

      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onTitleKeyDown}
        placeholder="Task title"
        aria-label="Task title"
        className="mt-2 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      />

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Details"
        aria-label="Details"
        rows={2}
        className="mt-2 w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      />

      <div className="mt-2 flex flex-wrap gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Due date
          </label>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Due date"
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Time
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={!due}
            aria-label="Due time"
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40"
          />
        </div>
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-40"
        >
          {initial ? 'Save' : 'Add task'}
        </button>
      </div>
    </Motion.div>
  )
}
