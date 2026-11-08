// Taskbar height shared by the window store and the shell components.
// The CSS token --w7-taskbar-h (index.css) is the source of truth: 40px, and
// 48px on (pointer: coarse) so touch task buttons reach 44px.
//
// Kept in its own module (not windowStore.js) so components can import the
// fallback and reader without depending on the store's mocked exports.

// Fallback when the token is unavailable (no stylesheet, non-browser).
export const TASKBAR_HEIGHT = 40

// The taskbar height the CSS currently declares, or the fallback when the token
// is missing. Reads the DOM only; no side effects.
export function readTaskbarHeight() {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return TASKBAR_HEIGHT
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--w7-taskbar-h')
  return parseFloat(raw) || TASKBAR_HEIGHT
}
