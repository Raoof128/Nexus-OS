// Shell chrome heights shared by the window store and the shell components.
// The CSS tokens in index.css are the source of truth:
//   --w7-taskbar-h   40px, and 48px on (pointer: coarse) so touch task buttons reach 44px.
//   --w7-titlebar-h  30px, and 44px on (pointer: coarse) so caption buttons reach 44px.
//
// Kept in its own module (not windowStore.js) so components can import the
// fallbacks and readers without depending on the store's mocked exports.

// Fallbacks when a token is unavailable (no stylesheet, non-browser, jsdom).
export const TASKBAR_HEIGHT = 40
export const TITLEBAR_HEIGHT = 30

// The live value of a pixel-valued CSS custom property on <html>, or the
// fallback when it is missing or not a positive number. Reads the DOM only.
function readCssPx(name, fallback) {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return fallback
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  return parseFloat(raw) || fallback
}

// The taskbar height the CSS currently declares, or the fallback.
export function readTaskbarHeight() {
  return readCssPx('--w7-taskbar-h', TASKBAR_HEIGHT)
}

// The window title bar height the CSS currently declares, or the fallback.
// Read live (not cached) so a pointer-type change is picked up on the next clamp.
export function readTitlebarHeight() {
  return readCssPx('--w7-titlebar-h', TITLEBAR_HEIGHT)
}
