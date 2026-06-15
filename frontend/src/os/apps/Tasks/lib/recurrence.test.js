import { describe, expect, it } from 'vitest'
import { buildRRule, labelForRRule, RECURRENCE_PRESETS } from './recurrence'

describe('recurrence helpers', () => {
  it('builds daily', () => {
    expect(buildRRule('daily')).toBe('FREQ=DAILY')
  })
  it('builds weekly', () => {
    expect(buildRRule('weekly')).toBe('FREQ=WEEKLY')
  })
  it('returns null for none', () => {
    expect(buildRRule('none')).toBeNull()
  })
  it('labels a known rule', () => {
    expect(labelForRRule('FREQ=DAILY')).toBe('Daily')
  })
  it('labels null as Does not repeat', () => {
    expect(labelForRRule(null)).toBe('Does not repeat')
  })
  it('labels an unknown rule as Custom', () => {
    expect(labelForRRule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Custom')
  })
  it('exposes presets including custom', () => {
    expect(RECURRENCE_PRESETS.map((p) => p.value)).toContain('custom')
  })
})
