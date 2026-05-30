import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useNotificationStore } from '../notificationStore'

const reset = () =>
  useNotificationStore.setState({ notifications: [], panelOpen: false, doNotDisturb: false })

describe('notificationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds an unread, undismissed notification', () => {
    const id = useNotificationStore.getState().addNotification({ title: 'Hi', message: 'yo' })
    const n = useNotificationStore.getState().notifications[0]
    expect(n.id).toBe(id)
    expect(n.read).toBe(false)
    expect(n.toastDismissed).toBe(false)
  })

  it('auto-dismisses the toast after the timeout WITHOUT marking it read', () => {
    useNotificationStore.getState().addNotification({ title: 'Hi' })
    vi.advanceTimersByTime(5000)
    const n = useNotificationStore.getState().notifications[0]
    // The toast is gone, but the item is still unread in the centre — this is
    // the core Stage-2 invariant: dismiss !== read.
    expect(n.toastDismissed).toBe(true)
    expect(n.read).toBe(false)
  })

  it('dismissToast hides the bubble but keeps it unread', () => {
    const id = useNotificationStore.getState().addNotification({ title: 'Hi' })
    useNotificationStore.getState().dismissToast(id)
    const n = useNotificationStore.getState().notifications[0]
    expect(n.toastDismissed).toBe(true)
    expect(n.read).toBe(false)
  })

  it('markRead / markAllRead flip the read flag', () => {
    const a = useNotificationStore.getState().addNotification({ title: 'A' })
    useNotificationStore.getState().addNotification({ title: 'B' })
    useNotificationStore.getState().markRead(a)
    expect(useNotificationStore.getState().notifications.find((n) => n.id === a).read).toBe(true)
    useNotificationStore.getState().markAllRead()
    expect(useNotificationStore.getState().notifications.every((n) => n.read)).toBe(true)
  })

  it('Do Not Disturb logs notifications silently (no toast) but still unread', () => {
    useNotificationStore.getState().toggleDoNotDisturb()
    useNotificationStore.getState().addNotification({ title: 'Quiet' })
    const n = useNotificationStore.getState().notifications[0]
    expect(n.toastDismissed).toBe(true) // never surfaced as a toast
    expect(n.read).toBe(false) // still counts toward the unread badge
  })

  it('removeNotification and clearAll prune the list', () => {
    const id = useNotificationStore.getState().addNotification({ title: 'A' })
    useNotificationStore.getState().addNotification({ title: 'B' })
    useNotificationStore.getState().removeNotification(id)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    useNotificationStore.getState().clearAll()
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('caps history at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      useNotificationStore.getState().addNotification({ title: `n${i}` })
    }
    expect(useNotificationStore.getState().notifications).toHaveLength(50)
  })

  it('togglePanel flips panel visibility', () => {
    expect(useNotificationStore.getState().panelOpen).toBe(false)
    useNotificationStore.getState().togglePanel()
    expect(useNotificationStore.getState().panelOpen).toBe(true)
    useNotificationStore.getState().togglePanel()
    expect(useNotificationStore.getState().panelOpen).toBe(false)
  })
})
