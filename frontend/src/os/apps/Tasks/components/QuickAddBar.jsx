import { useState } from 'react'
import { parseQuickAdd } from '../lib/quickAddParse'

// Single-line quick add. Parses a natural-language due date out of the typed
// title ("Pay rent tomorrow") and emits { title, due }.
export default function QuickAddBar({ onAdd, disabled }) {
  const [value, setValue] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const parsed = parseQuickAdd(value)
    if (!parsed.title) return
    onAdd({ title: parsed.title, due: parsed.due })
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
