// Pure keyboard helpers for the Task Manager tabs, the application list and
// the menu bar. Kept free of React so they can be unit tested directly.

export function wrapIndex(index, length) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

// Left/Right wrap, Home/End jump to the ends (WAI-ARIA tabs pattern).
export function tabKeyTarget(key, currentId, ids) {
  if (!ids.length) return null
  const current = ids.indexOf(currentId)
  switch (key) {
    case 'ArrowRight':
      return ids[wrapIndex(current + 1, ids.length)]
    case 'ArrowLeft':
      return ids[wrapIndex(current - 1, ids.length)]
    case 'Home':
      return ids[0]
    case 'End':
      return ids[ids.length - 1]
    default:
      return null
  }
}

// Ctrl+Tab goes forward and Ctrl+Shift+Tab goes back, both wrapping.
export function ctrlTabTarget(event, currentId, ids) {
  if (!ids.length || !event.ctrlKey || event.altKey || event.key !== 'Tab') return null
  const current = ids.indexOf(currentId)
  return ids[wrapIndex(current + (event.shiftKey ? -1 : 1), ids.length)]
}

// List rows clamp at the ends rather than wrapping.
export function listKeyTarget(key, index, length) {
  if (length <= 0) return null
  switch (key) {
    case 'ArrowDown':
      return Math.min(index + 1, length - 1)
    case 'ArrowUp':
      return Math.max(index - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return length - 1
    default:
      return null
  }
}
