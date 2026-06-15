import { useEffect } from 'react'
import { useNotificationStore } from '../../../stores/notificationStore'

const FIRED_KEY = 'nexus-os:tasks:reminders-fired'
const CHECK_INTERVAL_MS = 60 * 1000

function loadFired() {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveFired(map) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(map))
  } catch {
    // storage full — ignore
  }
}

// Pure selector (unit-tested): tasks due now-or-earlier, still actionable, and
// not already notified. `now` is a Date; `fired` is { [taskId]: timestamp }.
// Dates are parsed as local time (no trailing Z) so reminders fire in the user's
// timezone, not UTC.
export function dueTasksToNotify(tasks, now, fired) {
  return (tasks || []).filter((t) => {
    if (t.status !== 'needsAction') return false
    if (fired[t.id]) return false
    const when = t.due_at
      ? new Date(t.due_at)
      : t.due
        ? new Date(`${t.due}T00:00:00`)
        : null
    if (!when) return false
    return when.getTime() <= now.getTime()
  })
}

export function useTaskReminders(tasks) {
  const addNotification = useNotificationStore((s) => s.addNotification)

  useEffect(() => {
    if (!tasks || tasks.length === 0) return undefined

    const tick = () => {
      const fired = loadFired()
      const due = dueTasksToNotify(tasks, new Date(), fired)
      if (due.length === 0) return
      for (const t of due) {
        addNotification({ title: 'Task due', message: t.title, type: 'warning' })
        fired[t.id] = Date.now()
      }
      saveFired(fired)
    }

    tick()
    const id = setInterval(tick, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [tasks, addNotification])
}
