import { useState } from 'react'
import { parseQuickAdd } from '../lib/quickAddParse'

// Single-line quick add. Parses a natural-language due date and optional time out
// of the typed title ("Pay rent tomorrow", "Call mom at 5pm") and emits
// { title, due, due_at, all_day }. `due_timezone` is parsed but not sent: the
// create endpoint does not accept it.
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
      all_day: parsed.all_day,
    })
    setValue('')
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-label="Add a task"
        placeholder="Add a task, e.g. “Pay rent tomorrow”"
        className="min-w-0 flex-1"
      />
      <button type="submit" disabled={disabled || !value.trim()} className="w7-btn">
        Add
      </button>
    </form>
  )
}
