/**
 * Keyboard model for a WAI-ARIA tablist (automatic activation).
 *
 * Returns the index of the tab that should receive focus and selection for a
 * key press, or null when the key is not a tab-navigation key.
 *
 * - ArrowRight / ArrowLeft move one tab and wrap at the ends.
 * - Home / End jump to the first / last tab.
 * - Ctrl+Tab / Ctrl+Shift+Tab cycle forwards / backwards. Browsers may keep
 *   these for their own tab switching, so this is a best-effort shortcut.
 */
export function getTabKeyTarget({ key, index, count, ctrlKey = false, shiftKey = false }) {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count
    case 'ArrowLeft':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    case 'Tab':
      if (!ctrlKey) return null
      return (index + (shiftKey ? -1 : 1) + count) % count
    default:
      return null
  }
}
