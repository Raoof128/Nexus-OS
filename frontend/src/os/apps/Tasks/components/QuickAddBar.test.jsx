import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuickAddBar from './QuickAddBar'

function addTask(text) {
  const onAdd = vi.fn()
  render(<QuickAddBar onAdd={onAdd} />)
  const input = screen.getByRole('textbox', { name: 'Add a task' })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  return onAdd
}

describe('QuickAddBar time handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Monday 2026-06-15 10:00 local
    vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('keeps "at 5pm" as a timed due date and strips it from the title', () => {
    const onAdd = addTask('Call mom at 5pm')
    expect(onAdd).toHaveBeenCalledTimes(1)
    const payload = onAdd.mock.calls[0][0]
    expect(payload.title).toBe('Call mom')
    expect(payload.due).toBe('2026-06-15')
    expect(payload.all_day).toBe(false)
    expect(payload.due_at).toMatch(/^2026-06-15T17:00:00[+-]\d{2}:\d{2}$/)
  })

  it('keeps "at 17:30" as a timed due date', () => {
    const onAdd = addTask('Pick up parcel at 17:30')
    const payload = onAdd.mock.calls[0][0]
    expect(payload.title).toBe('Pick up parcel')
    expect(payload.all_day).toBe(false)
    expect(payload.due_at).toMatch(/^2026-06-15T17:30:00[+-]\d{2}:\d{2}$/)
  })

  it('keeps "tomorrow at 9am" as tomorrow at 09:00', () => {
    const onAdd = addTask('Dentist tomorrow at 9am')
    const payload = onAdd.mock.calls[0][0]
    expect(payload.title).toBe('Dentist')
    expect(payload.due).toBe('2026-06-16')
    expect(payload.all_day).toBe(false)
    expect(payload.due_at).toMatch(/^2026-06-16T09:00:00[+-]\d{2}:\d{2}$/)
  })

  it('sends only fields the create endpoint accepts (no due_timezone)', () => {
    const onAdd = addTask('Call mom at 5pm')
    expect(Object.keys(onAdd.mock.calls[0][0]).sort()).toEqual(
      ['all_day', 'due', 'due_at', 'title'].sort(),
    )
  })

  it('sends an all-day task with a null due_at when no time is typed', () => {
    const onAdd = addTask('Pay rent tomorrow')
    expect(onAdd.mock.calls[0][0]).toEqual({
      title: 'Pay rent',
      due: '2026-06-16',
      due_at: null,
      all_day: true,
    })
  })
})
