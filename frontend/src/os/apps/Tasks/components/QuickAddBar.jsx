import { useState } from 'react'
import { Plus } from 'lucide-react'
import { parseQuickAdd } from '../lib/quickAddParse'

// Single-line quick add. Parses a natural-language due date out of the typed
// title ("Pay rent tomorrow") and emits { title, due }.
export default function QuickAddBar({ onAdd, disabled }) {
  const [value, setValue] = useState('')
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const parsed = parseQuickAdd(value)
    if (!parsed.title) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      await onAdd(parsed)
      setValue('')
    } catch (error) {
      setSubmitError(error?.message || 'Unable to add task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 focus-within:border-primary/50">
        <Plus size={16} className="shrink-0 text-primary/70" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled || submitting}
          aria-label="Add a task"
          placeholder="Add a task — try “Pay rent tomorrow”"
          className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || submitting || !value.trim()}
        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-40"
      >
        {submitting ? 'Adding…' : 'Add'}
      </button>
      {submitError ? (
        <p role="alert" className="w-full rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {submitError}
        </p>
      ) : null}
    </form>
  )
}
