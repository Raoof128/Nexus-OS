import { useState } from 'react'
import { parseQuickAdd } from '../lib/quickAddParse'

// Single-line quick add. Parses a natural-language due date and optional time out
// of the typed title ("Pay rent tomorrow", "Call mom at 5pm") and emits
// The originating time zone travels with timed reminders.
export default function QuickAddBar({ onAdd, disabled }) {
  const [value, setValue] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const parsed = parseQuickAdd(value)
    if (!parsed.title) return
    onAdd({
      title: parsed.title,
      due: parsed.due,
      due_at: parsed.due_at,
      due_timezone: parsed.due_timezone,
      all_day: parsed.all_day,
    })
    setValue('')
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-[1_1_230px] items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-label="Add a task"
        placeholder="Add a task"
        title="Try “Pay rent tomorrow” or “Call Alex at 5pm”"
        maxLength={500}
        className="min-w-0 flex-1 pointer-coarse:min-h-11"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="w7-btn pointer-coarse:min-h-11"
      >
        Add
      </button>
    </form>
  )
}
