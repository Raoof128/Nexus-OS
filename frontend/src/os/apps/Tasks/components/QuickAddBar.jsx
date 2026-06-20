import { useState } from 'react'
import { Plus } from 'lucide-react'
import { parseQuickAdd } from '../lib/quickAddParse'

// Single-line quick add. Parses a natural-language due date out of the typed
// title ("Pay rent tomorrow") and emits { title, due }.
export default function QuickAddBar({ onAdd, disabled }) {
  const [value, setValue] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const parsed = parseQuickAdd(value)
    if (!parsed.title) return
    onAdd(parsed)
    setValue('')
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 focus-within:border-primary/50">
        <Plus size={16} className="shrink-0 text-primary/70" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          aria-label="Add a task"
          placeholder="Add a task — try “Pay rent tomorrow”"
          className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-40"
      >
        Add
      </button>
    </form>
  )
}
