/* Registers the Nexus OS service worker and brokers the PWA install prompt.
 *
 * Kept deliberately framework-free so it can be called once from main.jsx at
 * boot. The install prompt is captured here and re-exposed through a tiny
 * event/getter API that React components (InstallPrompt) subscribe to.
 */

const SW_URL = '/sw.js'

// ── Install prompt brokering ────────────────────────────────────────────────
// `beforeinstallprompt` fires once, early, often before React mounts. We stash
// the event so the UI can trigger it later, and notify subscribers of changes.
let deferredPrompt = null
const listeners = new Set()

function emit() {
  for (const fn of listeners) {
    try {
      fn(deferredPrompt)
    } catch {
      // a misbehaving listener must not break the others
    }
  }
}

export function onInstallAvailabilityChange(fn) {
  listeners.add(fn)
  // Replay current state immediately so late subscribers aren't stuck waiting.
  fn(deferredPrompt)
  return () => listeners.delete(fn)
}

export function canInstall() {
  return deferredPrompt !== null
}

export async function promptInstall() {
  if (!deferredPrompt) return null
  const event = deferredPrompt
  // The prompt can only be used once; clear it before awaiting the choice.
  deferredPrompt = null
  emit()
  event.prompt()
  try {
    const choice = await event.userChoice
    return choice?.outcome ?? null
  } catch {
    return null
  }
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    // iOS Safari
    window.navigator.standalone === true
  )
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
export function registerServiceWorker() {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (event) => {
    // Stop Chrome's mini-infobar; we surface our own cyberpunk prompt instead.
    event.preventDefault()
    deferredPrompt = event
    emit()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })

  // Service workers need a secure context. Skip in dev unless explicitly served
  // over https/localhost, and never break the app if registration fails.
  if (!('serviceWorker' in navigator)) return
  if (!window.isSecureContext) return
  // Vite dev server doesn't emit /sw.js from /public until build; registering in
  // dev is harmless but pointless and can cache stale modules. Gate to prod.
  if (import.meta.env?.DEV) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL).catch(() => {
      // Offline support is progressive enhancement — failure is non-fatal.
    })
  })
}
