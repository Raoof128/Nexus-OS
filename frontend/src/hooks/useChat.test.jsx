import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reset: vi.fn(),
  mutateAsync: vi.fn(),
  queryClient: {
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(() => []),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
  useQuery: () => ({ data: [], isPending: false }),
  // Deliberately return a new mutation object each render, as React Query may.
  // The stable methods are the safe effect dependencies.
  useMutation: () => ({
    reset: mocks.reset,
    mutateAsync: mocks.mutateAsync,
    isPending: false,
    error: null,
  }),
}))

vi.mock('../lib/apiClient', () => ({ apiFetch: vi.fn() }))

import { useChatMessages } from './useChat'

describe('useChatMessages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resets send state only when the session id changes', () => {
    const { rerender } = renderHook(({ sessionId }) => useChatMessages('user-1', sessionId), {
      initialProps: { sessionId: 'session-1' },
    })

    expect(mocks.reset).toHaveBeenCalledTimes(1)
    rerender({ sessionId: 'session-1' })
    expect(mocks.reset).toHaveBeenCalledTimes(1)

    rerender({ sessionId: 'session-2' })
    expect(mocks.reset).toHaveBeenCalledTimes(2)
  })
})
