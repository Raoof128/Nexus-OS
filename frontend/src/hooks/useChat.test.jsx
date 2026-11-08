import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reset: vi.fn(),
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  queryState: {},
  mutationOptions: [],
  queryClient: {
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(() => []),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
  useQuery: () => ({
    data: [],
    isPending: false,
    error: null,
    refetch: mocks.refetch,
    ...mocks.queryState,
  }),
  // Deliberately return a new mutation object each render, as React Query may.
  // The stable methods are the safe effect dependencies.
  useMutation: (options) => {
    mocks.mutationOptions.push(options)
    return {
      reset: mocks.reset,
      mutateAsync: mocks.mutateAsync,
      isPending: false,
      error: null,
    }
  },
}))

vi.mock('../lib/apiClient', () => ({ apiFetch: vi.fn() }))

import { useChatMessages, useChatSessions } from './useChat'

describe('useChatMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryState = {}
    mocks.mutationOptions = []
  })

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

  it('returns the history load error and a refetch, separate from the send error', () => {
    const boom = new Error('History unavailable')
    mocks.queryState = { error: boom }
    const { result } = renderHook(() => useChatMessages('user-1', 'session-1'))
    expect(result.current.loadError).toBe(boom)
    expect(result.current.error).toBeNull()
    expect(result.current.refetch).toBe(mocks.refetch)
  })

  it('rolls back only the failed optimistic message, keeping concurrent updates', async () => {
    const { result } = renderHook(() => useChatMessages('user-1', 'session-1'))
    expect(result.current).toBeTruthy()
    const send = mocks.mutationOptions[0]

    const context = await send.onMutate('Hi there')
    const addOptimistic = mocks.queryClient.setQueryData.mock.calls.at(-1)[1]
    const withOptimistic = addOptimistic([{ id: 'a', role: 'assistant', content: 'Old' }])
    expect(withOptimistic.map((m) => m.content)).toEqual(['Old', 'Hi there'])

    // Another update lands while the send is in flight; a whole-list snapshot
    // restore would discard it.
    const concurrent = [
      { id: 'a', role: 'assistant', content: 'Old' },
      { id: context.optimisticId, role: 'user', content: 'Hi there' },
      { id: 'b', role: 'assistant', content: 'Reply from another tab' },
    ]
    send.onError(new Error('503'), 'Hi there', context)
    const rollback = mocks.queryClient.setQueryData.mock.calls.at(-1)[1]
    expect(rollback(concurrent).map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('useChatSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryState = {}
  })

  it('returns the session list load error and a refetch', () => {
    const boom = new Error('Database unavailable')
    mocks.queryState = { error: boom }
    const { result } = renderHook(() => useChatSessions('user-1'))
    expect(result.current.loadError).toBe(boom)
    expect(result.current.refetch).toBe(mocks.refetch)
  })

  it('reports no load error on success', () => {
    const { result } = renderHook(() => useChatSessions('user-1'))
    expect(result.current.loadError).toBeNull()
  })
})
