import { useEffect, useId, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { X } from 'lucide-react'
import { DURATION } from '../../../../lib/motion'
import RecurrencePicker from './RecurrencePicker'

// Inline create/edit form. `initial` is a task object (edit) or null (create).
// Emits a payload shaped for CreateTaskRequest / UpdateTaskRequest.
export default function TaskEditor({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')
  const initialNotes = initial?.notes_encrypted || initial?.notes || ''
  const [notes, setNotes] = useState(initialNotes)
  const [due, setDue] = useState(initial?.due || '')
  const [time, setTime] = useState(
    initial?.due_at && !initial?.all_day ? new Date(initial.due_at).toTimeString().slice(0, 5) : '',
  )
  const [recurrence, setRecurrence] = useState(initial?.recurrence || null)
  const titleRef = useRef(null)
  const uid = useId()

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const buildPayload = () => {
    const trimmed = title.trim()
    if (!trimmed) return null
    const allDay = !time
    const dueAt = due && time ? `${due}T${time}:00` : null
    const payload = {
      title: trimmed,
      notes: notes.trim() || null,
      due: due || null,
      due_at: dueAt,
      all_day: allDay,
      recurrence: recurrence || null,
    }
    // Leave untouched notes out of an edit. The API returns null for a note it
    // cannot decrypt, so re-sending the blank field would erase the stored one.
    if (initial && notes === initialNotes) delete payload.notes
    return payload
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
      className="w7-card overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="w7-subheading">{initial ? 'Edit task' : 'New task'}</span>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onCancel}
          className="w7-toolbtn h-6 w-6 px-0 pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-title`}>Title</label>
          <input
            id={`${uid}-title`}
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onTitleKeyDown}
            placeholder="Task title"
            aria-label="Task title"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-notes`}>Details</label>
          <textarea
            id={`${uid}-notes`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Details"
            aria-label="Details"
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-due`}>Due date</label>
            <input
              id={`${uid}-due`}
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="Due date"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-time`}>Time</label>
            <input
              id={`${uid}-time`}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!due}
              aria-label="Due time"
              title={due ? 'Set a due time' : 'Pick a due date first'}
            />
          </div>
          <RecurrencePicker value={recurrence} onChange={setRecurrence} />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border bg-muted px-3 py-2">
        <button type="button" onClick={save} disabled={!title.trim()} className="w7-btn default">
          {initial ? 'Save' : 'Add task'}
        </button>
        <button type="button" onClick={onCancel} className="w7-btn">
          Cancel
        </button>
      </div>
    </Motion.div>
  )
}
