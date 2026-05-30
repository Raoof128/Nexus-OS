import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { setAppBadge } from '../../lib/appBadge'

const STORAGE_KEY = 'nexus-os:notifications'
const SCHEMA_VERSION = 1
const SAVE_DEBOUNCE_MS = 400
const MAX_NOTIFICATIONS = 50
const TOAST_TIMEOUT_MS = 5000

/**
 * Notification model: { id, title, message, type, timestamp, read, toastDismissed }
 *
 * Two independent lifecycle flags — this separation is the whole point of the
 * Stage-2 rework:
 *   - `toastDismissed` controls the transient top-right bubble only.
 *   - `read`           controls the persistent badge + notification centre.
 * A toast can auto-hide after 5s (toastDismissed = true) while the item stays
 * UNREAD in the centre until the user actually views/acknowledges it.
 */
export const useNotificationStore = create((set, get) => ({
  notifications: [],
  panelOpen: false,
  doNotDisturb: false,

  addNotification: ({ title, message, type = 'info' }) => {
    const id = nanoid(8)
    const dnd = get().doNotDisturb
    set((state) => ({
      notifications: [
        {
          id,
          title,
          message,
          type,
          timestamp: Date.now(),
          read: false,
          // Under Do Not Disturb we never surface a toast — the item is logged
          // silently and still counts as unread in the centre + badge.
          toastDismissed: dnd,
        },
        ...state.notifications,
      ].slice(0, MAX_NOTIFICATIONS),
    }))
    // Auto-hide the toast WITHOUT marking it read, so it persists in the centre.
    if (!dnd) {
      setTimeout(() => get().dismissToast(id), TOAST_TIMEOUT_MS)
    }
    return id
  },

  // Hide the toast bubble only — the notification stays unread in the centre.
  dismissToast: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, toastDismissed: true } : n,
      ),
    })),

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.read ? n : { ...n, read: true })),
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),

  toggleDoNotDisturb: () => set((state) => ({ doNotDisturb: !state.doNotDisturb })),

  hydrateNotifications: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved || saved.schemaVersion !== SCHEMA_VERSION) return
      set({
        // Restored items are never re-toasted — they live in the centre only.
        notifications: Array.isArray(saved.notifications)
          ? saved.notifications.map((n) => ({ ...n, toastDismissed: true }))
          : [],
        doNotDisturb: Boolean(saved.doNotDisturb),
      })
    } catch {
      // Corrupt data — keep defaults in place.
    }
  },
}))

// ── Side-effect: keep the PWA app-icon badge in sync with the unread count ──
let lastUnread = -1
useNotificationStore.subscribe((state) => {
  const unread = state.notifications.filter((n) => !n.read).length
  if (unread === lastUnread) return
  lastUnread = unread
  setAppBadge(unread)
})

// ── Debounced persistence of notification history + DND preference ──
let saveTimeout = null
let lastNotifications = null
let lastDnd = null
useNotificationStore.subscribe((state) => {
  if (state.notifications === lastNotifications && state.doNotDisturb === lastDnd) return
  lastNotifications = state.notifications
  lastDnd = state.doNotDisturb
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          notifications: lastNotifications,
          doNotDisturb: lastDnd,
        }),
      )
    } catch {
      // Storage full — silently ignore.
    }
  }, SAVE_DEBOUNCE_MS)
})
