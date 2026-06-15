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

  it('handles empty input', () => {
    const r = parseQuickAdd('   ')
    expect(r.title).toBe('')
    expect(r.due).toBeNull()
  })
})
