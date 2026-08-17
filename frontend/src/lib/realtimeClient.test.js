import { describe, expect, it, vi } from 'vitest'

// Mock @supabase/supabase-js before importing
vi.stubEnv('VITE_SUPABASE_URL', 'https://example.com')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { verifyOtp: mocks.verifyOtp },
    realtime: { setAuth: vi.fn() },
  })),
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
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        realtime: expect.objectContaining({
          params: expect.objectContaining({ eventsPerSecond: 10 }),
        }),
      }),
    )
  })

  it('removes only this Supabase project legacy auth keys', async () => {
    const { clearLegacyRealtimeAuthStorage } = await import('./realtimeClient')
    const storage = {
      removeItem: vi.fn(),
    }

    clearLegacyRealtimeAuthStorage(storage)

    expect(storage.removeItem.mock.calls).toEqual([
      ['sb-example-auth-token'],
      ['sb-example-auth-token-user'],
      ['sb-example-auth-token-code-verifier'],
    ])
  })

  it('exchanges recovery tokens on a disposable non-persistent client', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const { verifyRecoveryOtp } = await import('./realtimeClient')

    await verifyRecoveryOtp('recovery-hash')

    expect(createClient).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'recovery-hash',
      type: 'recovery',
    })
  })
})
