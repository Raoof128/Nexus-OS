import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatEmailDate, getProviderBadge, PROVIDER_CONFIG } from './emailConfig'

// ── formatEmailDate ───────────────────────────────────────────────────────────

describe('formatEmailDate', () => {
  let realNow

  beforeEach(() => {
    realNow = Date.now
  })

  afterEach(() => {
    Date.now = realNow
    vi.useRealTimers()
  })

  const freezeAt = (isoNow) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(isoNow))
  }

  it('returns "now" for timestamps less than 1 minute ago', () => {
    freezeAt('2026-05-31T12:00:30Z')
    expect(formatEmailDate('2026-05-31T12:00:00Z')).toBe('now')
  })

  it('returns minutes e.g. "5m" for timestamps 1–59 minutes ago', () => {
    freezeAt('2026-05-31T12:05:00Z')
    expect(formatEmailDate('2026-05-31T12:00:00Z')).toBe('5m')
  })

  it('returns hours e.g. "2h" for timestamps 1–23 hours ago', () => {
    freezeAt('2026-05-31T14:00:00Z')
    expect(formatEmailDate('2026-05-31T12:00:00Z')).toBe('2h')
  })

  it('returns days e.g. "3d" for timestamps 1–6 days ago', () => {
    freezeAt('2026-06-03T12:00:00Z')
    expect(formatEmailDate('2026-05-31T12:00:00Z')).toBe('3d')
  })

  it('returns a localised date string for timestamps more than 6 days ago', () => {
    freezeAt('2026-06-30T12:00:00Z')
    const result = formatEmailDate('2026-05-31T12:00:00Z')
    // en-AU locale → "31 May" or similar
    expect(result).toMatch(/\d+\s+\w+|\w+\s+\d+/)
    expect(result).not.toMatch(/^\d+[mhd]$/)
  })

  it('boundary: exactly 59 minutes ago is still minutes', () => {
    freezeAt('2026-05-31T12:59:00Z')
    expect(formatEmailDate('2026-05-31T12:00:00Z')).toBe('59m')
  })

  it('boundary: exactly 23 hours ago is still hours', () => {
    freezeAt('2026-05-31T11:00:00Z')
    expect(formatEmailDate('2026-05-30T12:00:00Z')).toBe('23h')
  })
})

// ── getProviderBadge ──────────────────────────────────────────────────────────

describe('getProviderBadge', () => {
  it('returns the google config for "google"', () => {
    expect(getProviderBadge('google')).toBe(PROVIDER_CONFIG.google)
  })

  it('returns the microsoft config for "microsoft"', () => {
    expect(getProviderBadge('microsoft')).toBe(PROVIDER_CONFIG.microsoft)
  })

  it('falls back to google config for unknown providers', () => {
    expect(getProviderBadge('yahoo')).toBe(PROVIDER_CONFIG.google)
    expect(getProviderBadge(undefined)).toBe(PROVIDER_CONFIG.google)
    expect(getProviderBadge('')).toBe(PROVIDER_CONFIG.google)
  })

  it('returned config has required display fields', () => {
    const badge = getProviderBadge('google')
    expect(badge).toHaveProperty('label')
    expect(badge).toHaveProperty('color')
    expect(badge).toHaveProperty('bgColor')
    expect(badge).toHaveProperty('textColor')
  })
})
