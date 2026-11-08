import { useEffect, useRef } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useNotificationStore } from '../../../stores/notificationStore'
import { useWindowStore } from '../../../stores/windowStore'
import { fetchTaskItems, fetchTaskLists, taskItemsKey, taskListsKey } from './useTasks'

const FIRED_KEY = 'nexus-os:tasks:reminders-fired'
const CHECK_INTERVAL_MS = 60 * 1000
// Server polling for the desktop service. Paused in background tabs by React Query.
const POLL_INTERVAL_MS = 60 * 1000
const STALE_MS = 30 * 1000
const NO_LISTS = []

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
    const when = t.due_at ? new Date(t.due_at) : t.due ? new Date(`${t.due}T00:00:00`) : null
    if (!when) return false
    return when.getTime() <= now.getTime()
  })
}

// One reminder pass over the tasks of every list. Fired ids are read from storage
// on each pass, so two tabs of the same browser cannot notify twice for one task.
// Do Not Disturb is applied by the notification store (logged, no toast); under it
// the taskbar does not flash either.
export function fireDueReminders(tasks, now = new Date()) {
  const fired = loadFired()
  const due = dueTasksToNotify(tasks, now, fired)
  if (due.length === 0) return 0
  const { addNotification, doNotDisturb } = useNotificationStore.getState()
  for (const t of due) {
    addNotification({ title: 'Task due', message: t.title, type: 'warning' })
    fired[t.id] = Date.now()
  }
  saveFired(fired)
  // A background Tasks window flashes its taskbar button, as on Windows 7.
  if (!doNotDisturb) useWindowStore.getState().requestAttention?.('tasks')
  return due.length
}

// Desktop-level reminder service. Mount it once, while signed in and unlocked.
// It watches every list (not only the open one) and works with the Tasks window
// closed. Its queries share the cache keys used by the Tasks window.
export function useTaskReminders() {
  const { data: lists = NO_LISTS } = useQuery({
    queryKey: taskListsKey,
    queryFn: fetchTaskLists,
    staleTime: STALE_MS,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

  const itemQueries = useQueries({
    queries: lists.map((list) => ({
      queryKey: taskItemsKey(list.id, true),
      queryFn: () => fetchTaskItems(list.id, true),
      staleTime: STALE_MS,
      refetchInterval: POLL_INTERVAL_MS,
      refetchIntervalInBackground: false,
    })),
  })

  // A new fetch result (or a list appearing or disappearing) re-checks at once,
  // instead of waiting for the next interval tick.
  const dataStamp = itemQueries.map((q) => q.dataUpdatedAt).join(',')
  const tasksRef = useRef([])

  useEffect(() => {
    tasksRef.current = itemQueries.flatMap((q) => q.data ?? [])
  })

  useEffect(() => {
    fireDueReminders(tasksRef.current)
  }, [dataStamp])

  useEffect(() => {
    const id = setInterval(() => fireDueReminders(tasksRef.current), CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])
}
