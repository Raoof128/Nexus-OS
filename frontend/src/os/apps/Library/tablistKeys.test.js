import { describe, expect, it } from 'vitest'
import { getTabKeyTarget } from './tablistKeys'

describe('getTabKeyTarget', () => {
  it('moves right and left with wrap-around', () => {
    expect(getTabKeyTarget({ key: 'ArrowRight', index: 0, count: 4 })).toBe(1)
    expect(getTabKeyTarget({ key: 'ArrowRight', index: 3, count: 4 })).toBe(0)
    expect(getTabKeyTarget({ key: 'ArrowLeft', index: 2, count: 4 })).toBe(1)
    expect(getTabKeyTarget({ key: 'ArrowLeft', index: 0, count: 4 })).toBe(3)
  })

  it('jumps to the first and last tab with Home and End', () => {
    expect(getTabKeyTarget({ key: 'Home', index: 2, count: 4 })).toBe(0)
    expect(getTabKeyTarget({ key: 'End', index: 1, count: 4 })).toBe(3)
  })

  it('cycles with Ctrl+Tab and Ctrl+Shift+Tab only', () => {
    expect(getTabKeyTarget({ key: 'Tab', index: 3, count: 4, ctrlKey: true })).toBe(0)
    expect(getTabKeyTarget({ key: 'Tab', index: 0, count: 4, ctrlKey: true, shiftKey: true })).toBe(
      3,
    )
    expect(getTabKeyTarget({ key: 'Tab', index: 0, count: 4 })).toBeNull()
  })

  it('ignores other keys and empty lists', () => {
    expect(getTabKeyTarget({ key: 'a', index: 0, count: 4 })).toBeNull()
    expect(getTabKeyTarget({ key: 'ArrowRight', index: 0, count: 0 })).toBeNull()
  })
})
