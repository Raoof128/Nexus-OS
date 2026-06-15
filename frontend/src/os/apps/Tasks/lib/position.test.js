import { describe, expect, it } from 'vitest'
import { between } from './position'

describe('between', () => {
  it('midpoint of two neighbours', () => {
    expect(between(1, 2)).toBe(1.5)
  })
  it('dropped at top (only next)', () => {
    expect(between(null, 1)).toBe(0)
  })
  it('dropped at bottom (only prev)', () => {
    expect(between(2, null)).toBe(3)
  })
  it('empty list', () => {
    expect(between(null, null)).toBe(1)
  })
  it('handles undefined like null', () => {
    expect(between(undefined, undefined)).toBe(1)
    expect(between(undefined, 4)).toBe(3)
  })
})
