import { useEffect, useRef } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ownsLocalState, watchOwner } from '../../../../lib/localOwner'
import { useNotificationStore } from '../../../stores/notificationStore'
import { useWindowStore } from '../../../stores/windowStore'
import { fetchTaskItems, fetchTaskLists, taskItemsKey, taskListsKey } from './useTasks'
import {
  claimDueReminders,
  getTaskReminder,
  isReminderDue,
  readReminderLedger,
} from '../lib/taskReminderSchedule'

const REFRESH_INTERVAL = 60_000
const REMINDER_LOCK = 'nexus-os:task-reminder-delivery'
const NO_LISTS = []

const itemData = (results) => results.map((query) => query.data)
const itemQuery = (id) => ({
  queryKey: taskItemsKey(id, true),
  queryFn: () => fetchTaskItems(id, true),
})

export function useTaskReminders() {
  const client = useQueryClient()
  const { data: lists = NO_LISTS } = useQuery({
    queryKey: taskListsKey,
    queryFn: fetchTaskLists,
    staleTime: 30_000,
    refetchInterval: REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
  })
  const items = useQueries({
    queries: lists.map(({ id }) => ({
      ...itemQuery(id),
      staleTime: 30_000,
      refetchInterval: REFRESH_INTERVAL,
      refetchIntervalInBackground: false,
    })),
    combine: itemData,
  })

  const wake = useRef(null)
  const claims = useRef(Object.create(null))

  useEffect(() => {
    let timer
    let running = false
    let runAgain = false
    let stopped = false
    const canDeliver = () => !stopped && !document.hidden && ownsLocalState()
    const remindersFor = (id) =>
      (client.getQueryData(taskItemsKey(id, true)) ?? []).map(getTaskReminder).filter(Boolean)

    function deliver(reminders) {
      if (!canDeliver()) return
      const notifications = claimDueReminders(reminders, Date.now(), claims.current)
      const { addNotification, doNotDisturb, panelOpen } = useNotificationStore.getState()
      for (const notification of notifications) {
        addNotification({ ...notification, silent: notification.silent || panelOpen })
      }
      if (!doNotDisturb && !panelOpen && notifications.some((n) => !n.silent)) {
        useWindowStore.getState().requestAttention?.('tasks')
      }
    }

    async function check() {
      clearTimeout(timer)
      if (!canDeliver()) return
      if (running) {
        runAgain = true
        return
      }
      running = true
      try {
        const now = Date.now()
        const ledger = readReminderLedger(claims.current)
        const dueLists = lists.filter(({ id }) =>
          remindersFor(id).some((reminder) => isReminderDue(reminder, now, ledger)),
        )
        if (dueLists.length) {
          // Validate an about-to-fire schedule with the server. Another tab or
          // device may have completed, deleted, or rescheduled the task.
          const results = await Promise.allSettled(
            dueLists.map(({ id }) =>
              client.fetchQuery({ ...itemQuery(id), staleTime: 0, retry: false }),
            ),
          )
          const freshLists = dueLists.filter((_, i) => results[i].status === 'fulfilled')
          const claim = () => {
            // An optimistic edit or deletion may have landed while waiting.
            const current = new Set((client.getQueryData(taskListsKey) ?? []).map(({ id }) => id))
            deliver(
              freshLists.filter(({ id }) => current.has(id)).flatMap(({ id }) => remindersFor(id)),
            )
          }
          if (canDeliver()) {
            if (navigator.locks?.request) await navigator.locks.request(REMINDER_LOCK, claim)
            else claim()
          }
        }
      } finally {
        running = false
        if (canDeliver()) {
          const now = Date.now()
          const ledger = readReminderLedger(claims.current)
          const next = lists
            .flatMap(({ id }) => remindersFor(id))
            .reduce((delay, reminder) => {
              const remaining = reminder.scheduledAt - now
              return remaining > 0 && remaining < delay ? remaining : delay
            }, REFRESH_INTERVAL)
          const pending =
            runAgain &&
            lists.some(({ id }) =>
              remindersFor(id).some((reminder) => isReminderDue(reminder, now, ledger)),
            )
          runAgain = false
          // Normal checks wake at the next deadline. Get back to the timer
          // after errors rather than recursively retrying failed network work.
          timer = setTimeout(wakeCheck, pending ? Math.min(next, 1000) : next)
        }
      }
    }

    const wakeCheck = () => {
      void check().catch(() => {})
    }
    const stopWatchingOwner = watchOwner(() => {
      stopped = true
      clearTimeout(timer)
    })
    wake.current = wakeCheck
    wakeCheck()

    window.addEventListener('focus', wakeCheck)
    window.addEventListener('pageshow', wakeCheck)
    window.addEventListener('online', wakeCheck)
    document.addEventListener('visibilitychange', wakeCheck)
    return () => {
      stopped = true
      clearTimeout(timer)
      stopWatchingOwner()
      wake.current = null
      window.removeEventListener('focus', wakeCheck)
      window.removeEventListener('pageshow', wakeCheck)
      window.removeEventListener('online', wakeCheck)
      document.removeEventListener('visibilitychange', wakeCheck)
    }
  }, [client, lists])

  useEffect(() => {
    wake.current?.()
  }, [items])
}
