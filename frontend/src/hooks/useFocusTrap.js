import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
const TEXT_ENTRY =
  'input:not(:disabled):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea:not(:disabled)'

// Windows 7 caption buttons (minimise/maximise/close) are not part of a
// dialog's Tab sequence; Escape already closes the dialog.
const isCaption = (el) => !!el.closest('.title-bar-controls')

// Initial focus follows the Win7 dialog rule: an explicit [data-autofocus]
// target wins; otherwise the first text field (forms), otherwise the default
// command button (message boxes), otherwise the first non-caption control.
function initialTarget(container) {
  const explicit = container.querySelector('[data-autofocus]')
  if (explicit) return explicit
  const field = [...container.querySelectorAll(TEXT_ENTRY)].find((el) => !isCaption(el))
  if (field) return field
  const def = container.querySelector('button.default:not(:disabled)')
  if (def) return def
  const all = [...container.querySelectorAll(FOCUSABLE)]
  return all.find((el) => !isCaption(el)) || all[0] || null
}

export function useFocusTrap(isActive) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const previouslyFocused = document.activeElement

    initialTarget(container)?.focus()

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const all = [...container.querySelectorAll(FOCUSABLE)]
      const focusable = all.filter((el) => !isCaption(el))
      const cycle = focusable.length > 0 ? focusable : all
      if (cycle.length === 0) return
      const first = cycle[0]
      const last = cycle[cycle.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !cycle.includes(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !cycle.includes(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    container.setAttribute('tabindex', '-1')
    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      // Restore focus only if the previously-focused element is still in the
      // document — the host may have unmounted it while the trap was open.
      // Also leave focus alone if something outside the trap already took it
      // (e.g. the Start menu launched an app and its window focused itself).
      const current = document.activeElement
      const focusMovedElsewhere =
        current && current !== document.body && !container.contains(current)
      if (
        !focusMovedElsewhere &&
        previouslyFocused &&
        typeof previouslyFocused.focus === 'function' &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus()
      }
    }
  }, [isActive])

  return containerRef
}
