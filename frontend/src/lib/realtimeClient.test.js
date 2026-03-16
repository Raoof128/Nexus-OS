import { describe, expect, it, vi } from 'vitest'

// Mock @supabase/supabase-js before importing
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ realtime: { setAuth: vi.fn() } })),
}))

describe('realtimeClient', () => {
  it('exports a supabase client instance', async () => {
    const { realtimeClient } = await import('./realtimeClient')
    expect(realtimeClient).toBeDefined()
    expect(realtimeClient.realtime).toBeDefined()
  })

  it('calls createClient with env vars', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    expect(createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        realtime: expect.objectContaining({
          params: expect.objectContaining({ eventsPerSecond: 10 }),
        }),
      })
    )
  })
})
