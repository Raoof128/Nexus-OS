import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { dueTasksToNotify, useTaskReminders } from '../useTaskReminders'
import { useNotificationStore } from '../../../../stores/notificationStore'
import { useWindowStore } from '../../../../stores/windowStore'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('../../../../../lib/apiClient', () => ({ apiFetch: (...args) => apiFetch(...args) }))

describe('dueTasksToNotify', () => {
  beforeEach(() => localStorage.clear())

  const now = new Date('2026-06-15T10:00:00')

  it('returns overdue, not-yet-notified tasks', () => {
    const tasks = [
      { id: 'a', title: 'Overdue', due: '2026-06-14', status: 'needsAction' },
      { id: 'b', title: 'Future', due: '2026-06-20', status: 'needsAction' },
      { id: 'c', title: 'Done', due: '2026-06-14', status: 'completed' },
    ]
    const result = dueTasksToNotify(tasks, now, {})
    expect(result.map((t) => t.id)).toEqual(['a'])
  })

  it('skips tasks already notified', () => {
    const tasks = [{ id: 'a', title: 'Overdue', due: '2026-06-14', status: 'needsAction' }]
    const result = dueTasksToNotify(tasks, now, { a: now.getTime() })
    expect(result).toEqual([])
  })

  it('uses due_at when present', () => {
    const tasks = [
      { id: 'a', title: 'Timed', due_at: '2026-06-15T09:00:00', status: 'needsAction' },
      { id: 'b', title: 'Later', due_at: '2026-06-15T11:00:00', status: 'needsAction' },
    ]
    const result = dueTasksToNotify(tasks, now, {})
    expect(result.map((t) => t.id)).toEqual(['a'])
  })

  it('ignores tasks without a due date', () => {
    const tasks = [{ id: 'a', title: 'No date', status: 'needsAction' }]
    expect(dueTasksToNotify(tasks, now, {})).toEqual([])
  })
})

// ── Desktop-level service ─────────────────────────────────────────────────────

const FIRED_KEY = 'nexus-os:tasks:reminders-fired'
const MINUTE = 60 * 1000

const LISTS = [
  { id: 'home', name: 'Home', position: 1 },
  { id: 'work', name: 'Work', position: 2 },
]

// Server state, mutable per test. `home` is the list the user has open in the
// Tasks window in these tests; `work` is never opened. Both must still fire.
let server
let addNotification
let requestAttention
let originalAddNotification
let originalRequestAttention

function serverRespond(path) {
  if (path === '/api/tasks/lists') return Promise.resolve(LISTS)
  const match = /^\/api\/tasks\/lists\/([^/]+)\/items/.exec(path)
  if (match) return Promise.resolve(server.items[match[1]] ?? [])
  return Promise.reject(new Error(`unexpected ${path}`))
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  return ({ children }) => createElement(QueryClientProvider, { client }, children)
}

// Let React Query's batched notifications and the pending fetch promises settle.
// Each round lets one query stage finish (lists, then items), so run a few.
async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

// Fire the interval timers due within `ms`, then let the refetches land.
async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  await settle()
}

function mountService() {
  return renderHook(() => useTaskReminders(), { wrapper: makeWrapper() })
}

describe('useTaskReminders (desktop service)', () => {
  beforeEach(() => {
    // Only the interval timer and Date are faked. React Query and React schedule their
    // work with real setTimeout/setImmediate, which fake timers would stall.
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'Date'],
      now: new Date('2026-06-15T10:00:00'),
    })
    localStorage.clear()
    apiFetch.mockReset()
    apiFetch.mockImplementation(serverRespond)
    server = {
      items: {
        home: [
          {
            id: 'h1',
            title: 'Pay rent',
            due_at: '2026-06-15T09:00:00',
            status: 'needsAction',
          },
        ],
        work: [
          { id: 'w1', title: 'Ship report', due: '2026-06-15', status: 'needsAction' },
          { id: 'w2', title: 'Already done', due: '2026-06-14', status: 'completed' },
        ],
      },
    }
    originalAddNotification = useNotificationStore.getState().addNotification
    originalRequestAttention = useWindowStore.getState().requestAttention
    addNotification = vi.fn()
    requestAttention = vi.fn()
    useNotificationStore.setState({ addNotification, doNotDisturb: false })
    useWindowStore.setState({ requestAttention })
  })

  afterEach(() => {
    useNotificationStore.setState({ addNotification: originalAddNotification })
    useWindowStore.setState({ requestAttention: originalRequestAttention })
    vi.useRealTimers()
  })

  const firedTitles = () => addNotification.mock.calls.map(([n]) => n.message)

  it('fires for a task in a list that is not open, with the Tasks window closed', async () => {
    // No Tasks window exists in the window store; only the desktop service runs.
    expect(Object.keys(useWindowStore.getState().windows)).not.toContain('tasks')

    mountService()
    await settle()

    expect(firedTitles()).toEqual(expect.arrayContaining(['Pay rent', 'Ship report']))
    expect(addNotification).toHaveBeenCalledWith({
      title: 'Task due',
      message: 'Ship report',
      type: 'warning',
    })
    // Due reminders flash the taskbar button of a Tasks window only if one is open.
    expect(requestAttention).toHaveBeenCalledWith('tasks')
  })

  it('does not double-fire across repeated checks', async () => {
    mountService()
    await settle()
    expect(addNotification).toHaveBeenCalledTimes(2)

    await advance(5 * MINUTE)
    await advance(5 * MINUTE)

    expect(addNotification).toHaveBeenCalledTimes(2)
    const fired = JSON.parse(localStorage.getItem(FIRED_KEY))
    expect(Object.keys(fired).sort()).toEqual(['h1', 'w1'])
  })

  it('does not re-fire after a remount when the fired map is already stored', async () => {
    const first = mountService()
    await settle()
    expect(addNotification).toHaveBeenCalledTimes(2)
    first.unmount()

    mountService()
    await settle()
    await advance(2 * MINUTE)

    expect(addNotification).toHaveBeenCalledTimes(2)
  })

  it('never fires for completed tasks', async () => {
    mountService()
    await settle()
    await advance(10 * MINUTE)

    expect(firedTitles()).not.toContain('Already done')
    expect(JSON.parse(localStorage.getItem(FIRED_KEY))).not.toHaveProperty('w2')
  })

  it('fires a task that becomes due while the desktop stays unlocked', async () => {
    server.items.work = [
      { id: 'w3', title: 'Later today', due_at: '2026-06-15T10:02:00', status: 'needsAction' },
    ]
    mountService()
    await settle()
    expect(firedTitles()).toEqual(['Pay rent'])

    await advance(MINUTE)
    expect(firedTitles()).toEqual(['Pay rent'])

    await advance(MINUTE)
    expect(firedTitles()).toEqual(['Pay rent', 'Later today'])
  })

  it('stops polling and firing once the service unmounts (lock or sign-out)', async () => {
    const { unmount } = mountService()
    await settle()
    expect(addNotification).toHaveBeenCalledTimes(2)
    const fetchesBeforeUnmount = apiFetch.mock.calls.length

    unmount()
    server.items.work = [
      { id: 'w4', title: 'Added after lock', due: '2026-06-15', status: 'needsAction' },
    ]
    await advance(10 * MINUTE)

    expect(apiFetch.mock.calls.length).toBe(fetchesBeforeUnmount)
    expect(addNotification).toHaveBeenCalledTimes(2)
    expect(firedTitles()).not.toContain('Added after lock')
  })

  it('still logs reminders under Do Not Disturb but does not flash the taskbar', async () => {
    useNotificationStore.setState({ doNotDisturb: true })
    mountService()
    await settle()

    expect(addNotification).toHaveBeenCalledTimes(2)
    expect(requestAttention).not.toHaveBeenCalled()
  })

  it('stays silent when no list has due tasks', async () => {
    server.items = { home: [], work: [] }
    mountService()
    await settle()
    await advance(5 * MINUTE)

    expect(addNotification).not.toHaveBeenCalled()
    expect(requestAttention).not.toHaveBeenCalled()
  })
})

// Mounting the component is what Desktop does; it must render nothing and not throw.
describe('TaskReminders component', () => {
  it('renders nothing', async () => {
    const { default: TaskReminders } = await import('../../components/TaskReminders')
    const { container } = render(createElement(TaskReminders), { wrapper: makeWrapper() })
    expect(container.innerHTML).toBe('')
  })
})
