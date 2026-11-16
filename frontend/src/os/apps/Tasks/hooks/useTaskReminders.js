import { useEffect, useRef } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useNotificationStore } from '../../../stores/notificationStore'
import { useWindowStore } from '../../../stores/windowStore'
import { fetchTaskItems, fetchTaskLists, taskItemsKey, taskListsKey } from './useTasks'
import { getTaskReminderTime } from '../lib/taskDateTime'

const FIRED_KEY = 'nexus-os:tasks:reminders-fired'
const CHECK_INTERVAL_MS = 60 * 1000
// Server polling for the desktop service. Paused in background tabs by React Query.
const POLL_INTERVAL_MS = 60 * 1000
const STALE_MS = 30 * 1000
const NO_LISTS = []
const combineItems = (results) => results.flatMap((result) => result.data ?? [])

function loadFired() {
  try {
    const fired = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}')
    return fired && typeof fired === 'object' && !Array.isArray(fired) ? fired : {}
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

function pendingReminderTime(task, fired) {
  if (
    task.status !== 'needsAction' ||
    typeof task.id !== 'string' ||
    task.id.startsWith('optimistic-') ||
    task.pendingSchedule
  ) {
    return null
  }
  const when = getTaskReminderTime(task)
  if (when === null) return null
  const previous = Object.hasOwn(fired, task.id) ? fired[task.id] : null
  // Legacy entries stored the time the notification fired. New entries store
  // the scheduled time, so moving a task can arm a new reminder.
  if (typeof previous === 'number' ? when <= previous : when === previous?.scheduledAt) {
    return null
  }
  return when
}

export function dueTasksToNotify(tasks, now, fired) {
  return (tasks || []).filter((t) => {
    const when = pendingReminderTime(t, fired)
    return when !== null && when <= now.getTime()
  })
}

// Read storage on each pass to pick up notifications from other desktop tabs.
// Do Not Disturb is applied by the notification store (logged, no toast); under it
// the taskbar does not flash either.
export function fireDueReminders(tasks, now = new Date(), memory = Object.create(null)) {
  const fired = Object.assign(Object.create(null), memory, loadFired())
  const { addNotification, doNotDisturb } = useNotificationStore.getState()
  let count = 0
  let changed = false
  for (const task of tasks) {
    const previous = fired[task.id]
    const when = getTaskReminderTime(task)
    const shouldMigrate =
      task.status === 'needsAction' &&
      !task.pendingSchedule &&
      typeof previous === 'number' &&
      when !== null &&
      when <= previous
    const pending = pendingReminderTime(task, fired)
    const shouldNotify = pending !== null && pending <= now.getTime()
    if (!shouldMigrate && !shouldNotify) continue

    if (shouldNotify) {
      addNotification({ title: 'Task due', message: task.title, type: 'warning' })
      count += 1
    }
    const entry = { scheduledAt: when }
    fired[task.id] = entry
    memory[task.id] = entry
    changed = true
  }
  if (changed) saveFired(fired)
  // A background Tasks window flashes its taskbar button, as on Windows 7.
  if (count && !doNotDisturb) useWindowStore.getState().requestAttention?.('tasks')
  return count
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

  const tasks = useQueries({
    queries: lists.map((list) => ({
      queryKey: taskItemsKey(list.id, true),
      queryFn: () => fetchTaskItems(list.id, true),
      staleTime: STALE_MS,
      refetchInterval: POLL_INTERVAL_MS,
      refetchIntervalInBackground: false,
    })),
    combine: combineItems,
  })

  const tasksRef = useRef([])
  const memory = useRef(Object.create(null))
  const wake = useRef(null)

  useEffect(() => {
    let timeout
    const check = () => {
      clearTimeout(timeout)
      const now = new Date()
      const tasks = tasksRef.current
      fireDueReminders(tasks, now, memory.current)
      const fired = Object.assign(Object.create(null), memory.current, loadFired())
      let nextDelay = CHECK_INTERVAL_MS
      for (const task of tasks) {
        const next = pendingReminderTime(task, fired)
        if (next !== null && next > now.getTime()) {
          nextDelay = Math.min(nextDelay, next - now.getTime())
        }
      }
      timeout = setTimeout(check, nextDelay)
    }
    const resume = () => {
      if (!document.hidden) check()
    }
    wake.current = check
    check()
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      clearTimeout(timeout)
      wake.current = null
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [])

  useEffect(() => {
    tasksRef.current = tasks
    wake.current?.()
  }, [tasks])
}
