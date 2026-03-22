import { describe, expect, it, vi } from 'vitest'

// useMedia.js imports realtimeClient at module level; mock it so Supabase's
// createClient doesn't throw "supabaseUrl is required" in the test environment.
vi.mock('../lib/realtimeClient', () => ({
  realtimeClient: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
    realtime: { setAuth: vi.fn() },
  },
}))

import { handleRealtimeDelete } from '../hooks/useMedia'

describe('handleRealtimeDelete', () => {
  const existingItems = [
    { id: '1', title: 'Dune', type: 'book', status: 'Reading' },
    { id: '2', title: '1984', type: 'book', status: 'To Read' },
  ]

  it('removes item on DELETE', () => {
    const result = handleRealtimeDelete(existingItems, {
      eventType: 'DELETE',
      new: {},
      old: { id: '1' },
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('returns oldData if old item has no id', () => {
    const result = handleRealtimeDelete(existingItems, {
      eventType: 'DELETE',
      new: {},
      old: {},
    })
    expect(result).toBe(existingItems)
  })

  it('returns oldData if item not found', () => {
    const result = handleRealtimeDelete(existingItems, {
      eventType: 'DELETE',
      new: {},
      old: { id: '999' },
    })
    expect(result).toHaveLength(2)
  })
})
