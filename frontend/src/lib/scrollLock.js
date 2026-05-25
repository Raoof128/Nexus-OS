// Reference-counted scroll lock so nested dialogs don't clobber each other.
// Each opener calls `lockScroll()` → returns an `unlock` function.
// Body scroll is only restored when the last lock is released.

let lockCount = 0

export function lockScroll() {
  lockCount++
  if (lockCount === 1) {
    document.body.style.overflow = 'hidden'
  }
  return function unlock() {
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      document.body.style.overflow = ''
    }
  }
}
