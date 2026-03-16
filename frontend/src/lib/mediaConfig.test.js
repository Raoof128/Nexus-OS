import { describe, expect, it } from 'vitest'
import { getStatusNav } from './mediaConfig'

describe('getStatusNav', () => {
  it('returns prev and next for a middle status', () => {
    const nav = getStatusNav('book', 'Reading')
    expect(nav).toEqual({
      flow: ['To Read', 'Reading', 'Finished'],
      currentIndex: 1,
      prev: 'To Read',
      next: 'Finished',
    })
  })

  it('returns null prev for first status', () => {
    const nav = getStatusNav('book', 'To Read')
    expect(nav.prev).toBeNull()
    expect(nav.next).toBe('Reading')
    expect(nav.currentIndex).toBe(0)
  })

  it('returns null next for last status', () => {
    const nav = getStatusNav('anime', 'Finished')
    expect(nav.prev).toBe('Watching')
    expect(nav.next).toBeNull()
    expect(nav.currentIndex).toBe(2)
  })

  it('handles unknown status gracefully', () => {
    const nav = getStatusNav('book', 'Nonexistent')
    expect(nav.currentIndex).toBe(-1)
    expect(nav.prev).toBeNull()
    expect(nav.next).toBeNull()
  })

  it('handles unknown media type gracefully', () => {
    const nav = getStatusNav('podcast', 'Playing')
    expect(nav.flow).toEqual([])
    expect(nav.currentIndex).toBe(-1)
  })

  it('works for movie type', () => {
    const nav = getStatusNav('movie', 'Watching')
    expect(nav).toEqual({
      flow: ['To Watch', 'Watching', 'Finished'],
      currentIndex: 1,
      prev: 'To Watch',
      next: 'Finished',
    })
  })
})
