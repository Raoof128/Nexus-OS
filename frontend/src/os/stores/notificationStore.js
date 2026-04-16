import { create } from 'zustand'
import { nanoid } from 'nanoid'

export const useNotificationStore = create((set, get) => ({
  notifications: [], // { id, title, message, type, timestamp, read }

  addNotification: ({ title, message, type = 'info' }) => {
    const id = nanoid(8)
    set((state) => ({
      notifications: [
        { id, title, message, type, timestamp: Date.now(), read: false },
        ...state.notifications,
      ].slice(0, 50),
    }))
    // Auto-dismiss toast after 5 seconds
    setTimeout(() => {
      get().dismissToast(id)
    }, 5000)
    return id
  },

  dismissToast: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }))
  },

  clearAll: () => set({ notifications: [] }),
}))
