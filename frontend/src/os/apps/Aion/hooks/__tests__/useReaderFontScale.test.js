import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReaderFontScale, FONT_SCALE_LEVELS } from '../useReaderFontScale'

const STORAGE_KEY = 'aion.reader.fontScale'

describe('useReaderFontScale', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to the "M" level', () => {
    const { result } = renderHook(() => useReaderFontScale())
    expect(result.current.level.label).toBe('M')
    expect(result.current.canDecrease).toBe(true)
    expect(result.current.canIncrease).toBe(true)
  })

  it('increase moves to a larger level and persists it', () => {
    const { result } = renderHook(() => useReaderFontScale())
    act(() => result.current.increase())
    expect(result.current.level.label).toBe('L')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('2')
  })

  it('decrease moves to a smaller level', () => {
    const { result } = renderHook(() => useReaderFontScale())
    act(() => result.current.decrease())
    expect(result.current.level.label).toBe('S')
  })

  it('clamps at the maximum level', () => {
    const { result } = renderHook(() => useReaderFontScale())
    act(() => {
      for (let i = 0; i < 10; i++) result.current.increase()
    })
    expect(result.current.index).toBe(FONT_SCALE_LEVELS.length - 1)
    expect(result.current.canIncrease).toBe(false)
  })

  it('clamps at the minimum level', () => {
    const { result } = renderHook(() => useReaderFontScale())
    act(() => {
      for (let i = 0; i < 10; i++) result.current.decrease()
    })
    expect(result.current.index).toBe(0)
    expect(result.current.canDecrease).toBe(false)
  })

  it('restores a persisted level on mount', () => {
    localStorage.setItem(STORAGE_KEY, '3')
    const { result } = renderHook(() => useReaderFontScale())
    expect(result.current.index).toBe(3)
    expect(result.current.level.label).toBe('XL')
  })

  it('ignores an out-of-range persisted value', () => {
    localStorage.setItem(STORAGE_KEY, '99')
    const { result } = renderHook(() => useReaderFontScale())
    expect(result.current.level.label).toBe('M')
  })

  it('every level has a positive size and line height', () => {
    for (const lvl of FONT_SCALE_LEVELS) {
      expect(lvl.size).toBeGreaterThan(0)
      expect(lvl.lineHeight).toBeGreaterThan(0)
      expect(typeof lvl.label).toBe('string')
    }
  })
})
