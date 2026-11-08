import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { parseQuickAdd } from './quickAddParse'

describe('parseQuickAdd', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Monday 2026-06-15 10:00 local
    vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('returns title unchanged when no date words', () => {
    const r = parseQuickAdd('Buy milk')
    expect(r.title).toBe('Buy milk')
    expect(r.due).toBeNull()
    expect(r.due_at).toBeNull()
    expect(r.all_day).toBe(true)
  })

  it('parses "tomorrow" and strips the word', () => {
    const r = parseQuickAdd('Pay rent tomorrow')
    expect(r.title).toBe('Pay rent')
    expect(r.due).toBe('2026-06-16')
  })

  it('parses "today"', () => {
    const r = parseQuickAdd('Call mum today')
    expect(r.title).toBe('Call mum')
    expect(r.due).toBe('2026-06-15')
  })

  it('parses a weekday to the next future occurrence', () => {
    const r = parseQuickAdd('Gym friday')
    expect(r.title).toBe('Gym')
    expect(r.due).toBe('2026-06-19')
  })

  it('parses a same-day weekday to next week (not today)', () => {
    const r = parseQuickAdd('Standup monday')
    expect(r.title).toBe('Standup')
    expect(r.due).toBe('2026-06-22')
  })

  it('parses "in n days"', () => {
    const r = parseQuickAdd('Submit report in 3 days')
    expect(r.title).toBe('Submit report')
    expect(r.due).toBe('2026-06-18')
  })

  it('parses date plus 12-hour time', () => {
    const r = parseQuickAdd('Dentist tomorrow at 5:30pm')
    expect(r.title).toBe('Dentist')
    expect(r.due).toBe('2026-06-16')
    expect(r.due_at).toMatch(/^2026-06-16T17:30:00[+-]\d{2}:\d{2}$/)
    expect(r.due_timezone).toBeTruthy()
    expect(r.all_day).toBe(false)
  })

  it('parses a standalone time as today', () => {
    const r = parseQuickAdd('Call Alex at 14:00')
    expect(r.title).toBe('Call Alex')
    expect(r.due).toBe('2026-06-15')
    expect(r.due_at).toMatch(/^2026-06-15T14:00:00[+-]\d{2}:\d{2}$/)
  })

  it('handles empty input', () => {
    const r = parseQuickAdd('   ')
    expect(r.title).toBe('')
    expect(r.due).toBeNull()
  })
})
