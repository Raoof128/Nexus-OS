import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import RecurrencePicker from './RecurrencePicker'
import {
  formatLocalDate,
  formatLocalDateTimeWithOffset,
  formatLocalTime,
  getBrowserTimeZone,
  getTaskDueDate,
  hasTimedDueDate,
  localDateTimeFromParts,
} from '../lib/taskDateTime'

// Inline create/edit form. `initial` is a task object (edit) or null (create).
// Emits a payload shaped for CreateTaskRequest / UpdateTaskRequest.
export default function TaskEditor({ initial, parentTitle, saving = false, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')
  const initialNotes = initial?.notes_encrypted || initial?.notes || ''
  const [notes, setNotes] = useState(initialNotes)
  const initialInstant = initial && hasTimedDueDate(initial) ? getTaskDueDate(initial) : null
  const initialDate = initialInstant ? formatLocalDate(initialInstant) : initial?.due || ''
  const initialTime = initialInstant ? formatLocalTime(initialInstant) : ''
  const [due, setDue] = useState(initialDate)
  const [time, setTime] = useState(initialTime)
  const [recurrence, setRecurrence] = useState(initial?.recurrence || null)
  const titleRef = useRef(null)
  const uid = useId()
  const localDue = localDateTimeFromParts(due, time)
  const scheduleChanged = !initial || due !== initialDate || time !== initialTime
  const repeatZone = (!scheduleChanged && initial?.due_timezone) || getBrowserTimeZone()
  const invalidTime =
    localDue && (formatLocalDate(localDue) !== due || formatLocalTime(localDue) !== time)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const buildPayload = () => {
    const trimmed = title.trim()
    if (!trimmed || invalidTime) return null
    const payload = {
      title: trimmed,
      notes: notes.trim() || null,
      recurrence: recurrence || null,
    }
    // Preserve the original instant when editing an unrelated field, including
    // tasks created in a different time zone and ambiguous times when clocks roll back.
    if (scheduleChanged) {
      payload.due = due || null
      payload.due_at = localDue ? formatLocalDateTimeWithOffset(localDue) : null
      payload.due_timezone = localDue ? repeatZone : null
      payload.all_day = !localDue
    } else if (localDue && !initial.due_timezone) {
      // Saving an old timed task can attach the displayed time zone without
      // changing the previously stored instant.
      payload.due_timezone = repeatZone
    }
    // Leave untouched notes out of an edit. The API returns null for a note it
    // cannot decrypt, so re-sending the blank field would erase the stored one.
    if (initial && notes === initialNotes) delete payload.notes
    return payload
  }

  const save = () => {
    const payload = buildPayload()
    if (payload && !saving) onSave(payload)
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
    <div className="w7-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="w7-subheading min-w-0 wrap-anywhere">
          {initial ? 'Edit task' : parentTitle ? 'New subtask' : 'New task'}
        </span>
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
        {parentTitle && <p className="wrap-anywhere text-muted-foreground">Under {parentTitle}</p>}
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
            maxLength={500}
            className="pointer-coarse:min-h-11"
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
            maxLength={20000}
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
              onChange={(e) => {
                setDue(e.target.value)
                if (!e.target.value) {
                  setTime('')
                  setRecurrence(null)
                }
              }}
              aria-label="Due date"
              className="max-w-full pointer-coarse:min-h-11"
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
              aria-invalid={invalidTime || undefined}
              className="max-w-full pointer-coarse:min-h-11"
              title={due ? 'Set a due time' : 'Pick a due date first'}
            />
          </div>
          <RecurrencePicker value={recurrence} onChange={setRecurrence} disabled={!due} />
        </div>
        {invalidTime ? (
          <p role="alert" className="w7-error">
            That time doesn’t exist on this date. Choose another time.
          </p>
        ) : (
          due && (
            <p className="text-muted-foreground">
              {time
                ? `Repeating times use ${repeatZone}.`
                : 'Date-only reminders appear at 9:00 AM local time.'}
            </p>
          )
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted px-3 py-2">
        <button
          type="button"
          onClick={save}
          disabled={!title.trim() || invalidTime || saving}
          className="w7-btn default pointer-coarse:min-h-11"
        >
          {saving ? 'Saving…' : initial ? 'Save' : parentTitle ? 'Add subtask' : 'Add task'}
        </button>
        <button type="button" onClick={onCancel} className="w7-btn pointer-coarse:min-h-11">
          Cancel
        </button>
      </div>
    </div>
  )
}
