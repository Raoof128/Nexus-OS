import { useEffect, useRef } from 'react'

// Text field for naming an item (rename, or a new folder/file). It takes focus on
// mount and selects the base name only, so typing replaces "report" and keeps ".pdf".
export default function NameInput({
  label,
  value,
  selectLength,
  invalid = false,
  onChange,
  onEnter,
  onEscape,
  onBlur,
  className = 'min-w-0 flex-1',
}) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(0, selectLength ?? el.value.length)
    // Select once, on mount: later keystrokes must not reset the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter?.()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onEscape?.()
        }
      }}
      onBlur={onBlur}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={className}
    />
  )
}
