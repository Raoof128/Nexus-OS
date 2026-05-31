/**
 * PWA Badging API helper. Reflects the unread-notification count on the
 * installed app's icon (macOS dock, Windows taskbar, Android home screen).
 * No-ops gracefully where the API is unavailable (most desktop browser tabs,
 * jsdom, Safari) — the badge is purely cosmetic, so failures are swallowed.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/Badging_API
 */
export function setAppBadge(count) {
  if (typeof navigator === 'undefined') return
  try {
    if (count > 0) {
      if (typeof navigator.setAppBadge === 'function') {
        const p = navigator.setAppBadge(count)
        if (p && typeof p.catch === 'function') p.catch(() => {})
      }
    } else if (typeof navigator.clearAppBadge === 'function') {
      const p = navigator.clearAppBadge()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
  } catch {
    // Some engines throw synchronously without the permission — ignore.
  }
}
