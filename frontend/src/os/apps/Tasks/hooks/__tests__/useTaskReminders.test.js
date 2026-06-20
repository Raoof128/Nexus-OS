import { describe, expect, it, beforeEach } from 'vitest'
import { dueTasksToNotify } from '../useTaskReminders'

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
    const tasks = [
      { id: 'a', title: 'Overdue', due: '2026-06-14', status: 'needsAction' },
    ]
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

  it('honors timezone offsets in due_at', () => {
    const tasks = [
      {
        id: 'a',
        title: 'Offset due',
        due_at: '2026-06-15T10:30:00+10:00',
        status: 'needsAction',
      },
      {
        id: 'b',
        title: 'Offset future',
        due_at: '2026-06-15T10:32:00+10:00',
        status: 'needsAction',
      },
    ]
    const result = dueTasksToNotify(tasks, new Date('2026-06-15T00:31:00Z'), {})
    expect(result.map((t) => t.id)).toEqual(['a'])
  })

  it('ignores tasks without a due date', () => {
    const tasks = [{ id: 'a', title: 'No date', status: 'needsAction' }]
    expect(dueTasksToNotify(tasks, now, {})).toEqual([])
  })
})
