import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Mock aionSupabase before importing the hook
vi.mock('../../lib/aionSupabase', () => ({
  aionSupabase: {
    auth: {
      getSession: vi.fn(),
      signInAnonymously: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}))

import { useAionAuth } from '../useAionAuth'
import { aionSupabase } from '../../lib/aionSupabase'

const mockSession = { access_token: 'tok_abc', user: { id: 'user-1', is_anonymous: true } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAionAuth', () => {
  it('starts in loading state', () => {
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    aionSupabase.auth.signInAnonymously.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const { result } = renderHook(() => useAionAuth())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.session).toBeNull()
  })

  it('reuses existing session without signing in again', async () => {
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null })

    const { result } = renderHook(() => useAionAuth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.session).toEqual(mockSession)
    expect(aionSupabase.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('calls signInAnonymously when no session exists', async () => {
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    aionSupabase.auth.signInAnonymously.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const { result } = renderHook(() => useAionAuth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(aionSupabase.auth.signInAnonymously).toHaveBeenCalledOnce()
    expect(result.current.session).toEqual(mockSession)
  })

  it('sets error if signInAnonymously fails', async () => {
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    aionSupabase.auth.signInAnonymously.mockResolvedValue({
      data: { session: null },
      error: { message: 'Network error' },
    })

    const { result } = renderHook(() => useAionAuth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Network error')
    expect(result.current.session).toBeNull()
  })

  it('subscribes to onAuthStateChange and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null })
    aionSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    })

    const { unmount } = renderHook(() => useAionAuth())
    await waitFor(() => {}) // let effect run
    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
