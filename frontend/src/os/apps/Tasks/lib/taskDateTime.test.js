import { describe, expect, it } from 'vitest'
import {
  formatDateTimeInTimeZone,
  formatLocalDateTimeWithOffset,
  getBrowserTimeZone,
  getSupportedTimeZones,
  localDateTimeFromParts,
  timeValueInTimeZone,
} from './taskDateTime'

describe('task date-time helpers', () => {
  it('formats local datetime with an explicit timezone offset', () => {
    const date = new Date(2026, 5, 16, 17, 30, 0, 0)
    expect(formatLocalDateTimeWithOffset(date)).toMatch(
      /^2026-06-16T17:30:00[+-]\d{2}:\d{2}$/,
    )
  })

  it('builds a local Date from date and time input parts', () => {
    const date = localDateTimeFromParts('2026-06-16', '17:30')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(5)
    expect(date.getDate()).toBe(16)
    expect(date.getHours()).toBe(17)
    expect(date.getMinutes()).toBe(30)
  })

  it('formats date and clock parts in a selected IANA timezone', () => {
    expect(formatDateTimeInTimeZone('2026-06-16', '17:30', 'UTC')).toBe(
      '2026-06-16T17:30:00+00:00',
    )
  })

  it('lists the browser timezone for the selector', () => {
    expect(getSupportedTimeZones()).toContain(getBrowserTimeZone())
  })

  it('extracts a clock value in the selected timezone', () => {
    expect(timeValueInTimeZone('2026-03-07T14:00:00+00:00', 'America/New_York')).toBe(
      '09:00',
    )
  })
})
