import { describe, expect, it } from 'vitest'
import { handleRealtimeEvent } from '../hooks/useMedia'

describe('handleRealtimeEvent', () => {
  const existingItems = [
    { id: '1', title: 'Dune', type: 'book', status: 'Reading' },
    { id: '2', title: '1984', type: 'book', status: 'To Read' },
  ]

  it('prepends new item on INSERT', () => {
    const newItem = { id: '3', title: 'Foundation', type: 'book', status: 'To Read' }
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'INSERT',
      new: newItem,
      old: {},
    })
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(newItem)
  })

  it('replaces matching item on UPDATE', () => {
    const updated = { ...existingItems[0], status: 'Finished' }
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'UPDATE',
      new: updated,
      old: existingItems[0],
    })
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('Finished')
  })

  it('skips UPDATE when data is identical (deduplication)', () => {
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'UPDATE',
      new: existingItems[0],
      old: existingItems[0],
    })
    // Returns the same reference when nothing changed
    expect(result).toBe(existingItems)
  })

  it('removes item on DELETE', () => {
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'DELETE',
      new: {},
      old: { id: '1' },
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('skips INSERT if item already exists (deduplication)', () => {
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'INSERT',
      new: existingItems[0],
      old: {},
    })
    expect(result).toHaveLength(2)
  })

  it('returns oldData for unknown event types', () => {
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'UNKNOWN',
      new: {},
      old: {},
    })
    expect(result).toBe(existingItems)
  })
})
