import { useEffect, useRef } from 'react'

export function useFocusTrap(isActive) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const previouslyFocused = document.activeElement

    // Focus first focusable element
    const firstFocusable = container.querySelector(focusableSelector)
    firstFocusable?.focus()

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const focusable = [...container.querySelectorAll(focusableSelector)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
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
      if (
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
