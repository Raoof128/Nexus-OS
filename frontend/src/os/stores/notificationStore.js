import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { setAppBadge } from '../../lib/appBadge'
import { ownsLocalState } from '../../lib/localOwner'

const STORAGE_KEY = 'nexus-os:notifications'
const SCHEMA_VERSION = 1
const SAVE_DEBOUNCE_MS = 400
const MAX_NOTIFICATIONS = 50
const TOAST_TIMEOUT_MS = 5000
export const MAX_TOASTS = 3

function storageKeyForUser(userId) {
  return `${STORAGE_KEY}:${encodeURIComponent(userId)}`
}

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
  storageUserId: null,

  addNotification: ({ title, message, type = 'info', timestamp = Date.now(), silent = false }) => {
    const id = nanoid(8)
    const toastDismissed = silent || get().doNotDisturb
    const toastUntil = Date.now() + TOAST_TIMEOUT_MS
    const notification = {
      id,
      title,
      message,
      type,
      timestamp,
      read: false,
      toastDismissed,
      toastUntil,
    }
    set((state) => {
      let slots = toastDismissed ? MAX_TOASTS : MAX_TOASTS - 1
      const existing = state.notifications.map((n) => {
        if (n.read || n.toastDismissed) return n
        // Older entries stay in history without queuing more popups when one closes.
        return slots-- > 0 ? n : { ...n, toastDismissed: true }
      })
      return { notifications: [notification, ...existing].slice(0, MAX_NOTIFICATIONS) }
    })
    // Auto-hide the toast WITHOUT marking it read, so it persists in the centre.
    if (!toastDismissed) {
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

  expireToasts: () =>
    set((state) => {
      const now = Date.now()
      if (!state.notifications.some((n) => !n.toastDismissed && n.toastUntil <= now)) return state
      return {
        notifications: state.notifications.map((n) =>
          !n.toastDismissed && n.toastUntil <= now ? { ...n, toastDismissed: true } : n,
        ),
      }
    }),

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

  hydrateNotifications: (userId) => {
    if (typeof userId !== 'string' || !userId) {
      set({ notifications: [], panelOpen: false, doNotDisturb: false, storageUserId: null })
      return
    }
    try {
      const raw = localStorage.getItem(storageKeyForUser(userId))
      if (!raw) {
        set({ notifications: [], panelOpen: false, doNotDisturb: false, storageUserId: userId })
        return
      }
      const saved = JSON.parse(raw)
      if (!saved || saved.schemaVersion !== SCHEMA_VERSION) {
        set({ notifications: [], panelOpen: false, doNotDisturb: false, storageUserId: userId })
        return
      }
      set({
        // Restored items are never re-toasted — they live in the centre only.
        notifications: Array.isArray(saved.notifications)
          ? saved.notifications.map((n) => ({ ...n, toastDismissed: true }))
          : [],
        doNotDisturb: Boolean(saved.doNotDisturb),
        panelOpen: false,
        storageUserId: userId,
      })
    } catch {
      // Corrupt data must not leave another account's notifications visible.
      set({ notifications: [], panelOpen: false, doNotDisturb: false, storageUserId: userId })
    }
  },

  resetPrivateState: () =>
    set({ notifications: [], panelOpen: false, doNotDisturb: false, storageUserId: null }),
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
  if (!state.storageUserId) {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = null
    lastNotifications = null
    lastDnd = null
    return
  }
  if (state.notifications === lastNotifications && state.doNotDisturb === lastDnd) return
  lastNotifications = state.notifications
  lastDnd = state.doNotDisturb
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    if (!ownsLocalState()) return
    try {
      localStorage.setItem(
        storageKeyForUser(state.storageUserId),
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
