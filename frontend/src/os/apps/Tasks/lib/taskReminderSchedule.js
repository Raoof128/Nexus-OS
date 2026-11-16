import { getTaskReminderTime, hasTimedDueDate } from './taskDateTime'

export const REMINDER_STORAGE_KEY = 'nexus-os:tasks:reminders-fired'
const VERSION = 2
const MINUTE = 60_000
const POPUP_WINDOW = 90_000
const CATCH_UP_WINDOW = 24 * 60 * MINUTE
// Keep recently handled occurrences beyond the catch-up window, including
// across local clock or time zone changes.
const CLAIM_RETENTION = 7 * CATCH_UP_WINDOW

export function getTaskReminder(task) {
  if (
    task.status !== 'needsAction' ||
    typeof task.id !== 'string' ||
    task.id.startsWith('optimistic-') ||
    task.pendingSchedule
  ) {
    return null
  }
  const scheduledAt = getTaskReminderTime(task)
  if (scheduledAt === null) return null
  // A date-only task is the same occurrence when the user travels. Its local
  // delivery time changes with the device's time zone.
  const occurrence = hasTimedDueDate(task) ? scheduledAt : task.due
  return { task, scheduledAt, key: JSON.stringify([task.id, occurrence]) }
}

function plainRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function readReminderLedger(memory) {
  let saved = {}
  try {
    saved = plainRecord(JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || '{}'))
  } catch {
    // Keep claims from this session when browser storage is unavailable.
  }
  if (saved.version !== VERSION) return { legacy: saved, claims: { ...memory } }
  const { version: _version, claims, ...legacy } = saved
  return { legacy, claims: { ...memory, ...plainRecord(claims) } }
}

export function hasReminderClaim(reminder, ledger) {
  if (Object.hasOwn(ledger.claims, reminder.key)) return true
  if (!Object.hasOwn(ledger.legacy, reminder.task.id)) return false
  const previous = ledger.legacy[reminder.task.id]
  // The earliest version recorded delivery time rather than scheduled time.
  return typeof previous === 'number'
    ? reminder.scheduledAt <= previous
    : reminder.scheduledAt === previous?.scheduledAt
}

export function isReminderDue(reminder, now, ledger) {
  const delay = now - reminder.scheduledAt
  return delay >= 0 && delay <= CATCH_UP_WINDOW && !hasReminderClaim(reminder, ledger)
}

export function claimDueReminders(reminders, now, memory) {
  const ledger = readReminderLedger(memory)
  const notifications = []
  // A move between lists can briefly expose the same task in both query results.
  for (const reminder of reminders) {
    if (!isReminderDue(reminder, now, ledger)) continue
    ledger.claims[reminder.key] = memory[reminder.key] = now
    // Already-open tabs from the previous release still look up by task id.
    if (reminder.task.id !== 'version' && reminder.task.id !== 'claims') {
      Object.defineProperty(ledger.legacy, reminder.task.id, {
        value: { scheduledAt: reminder.scheduledAt },
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    notifications.push({
      title: now - reminder.scheduledAt > POPUP_WINDOW ? 'Missed task reminder' : 'Task due',
      message: reminder.task.title,
      type: 'warning',
      timestamp: reminder.scheduledAt,
      silent: now - reminder.scheduledAt > POPUP_WINDOW,
    })
  }
  if (notifications.length) {
    const recent = ([, claimedAt]) =>
      typeof claimedAt === 'number' && now - claimedAt <= CLAIM_RETENTION
    for (const entry of Object.entries(memory)) {
      if (!recent(entry)) delete memory[entry[0]]
    }
    try {
      localStorage.setItem(
        REMINDER_STORAGE_KEY,
        JSON.stringify({
          ...Object.fromEntries(
            Object.entries(ledger.legacy).filter(([, stamp]) => {
              const time = typeof stamp === 'number' ? stamp : stamp?.scheduledAt
              return typeof time === 'number' && now - time <= CLAIM_RETENTION
            }),
          ),
          version: VERSION,
          claims: Object.fromEntries(Object.entries(ledger.claims).filter(recent)),
        }),
      )
    } catch {
      // The in-memory claim still prevents repeats in this tab.
    }
  }
  return notifications
}
