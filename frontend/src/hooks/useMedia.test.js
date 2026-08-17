import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOptions: null,
  queryClient: {
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(() => []),
    setQueryData: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
  useQuery: (options) => {
    mocks.queryOptions = options
    return { data: [], isPending: false, error: null, refetch: vi.fn() }
  },
  useMutation: () => ({ mutateAsync: vi.fn(), error: null }),
}))
vi.mock('../lib/apiClient', () => ({ apiFetch: vi.fn() }))

import { createOptimisticMediaId, replaceOptimisticMedia, useMedia } from './useMedia'

describe('media optimistic creates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses a unique id per mutation and replaces only the matching placeholder', () => {
    const firstId = createOptimisticMediaId()
    const secondId = createOptimisticMediaId()
    expect(firstId).not.toBe(secondId)

    const cached = [
      { id: firstId, title: 'First optimistic' },
      { id: secondId, title: 'Second optimistic' },
    ]
    expect(replaceOptimisticMedia(cached, secondId, { id: 'server-2', title: 'Second' })).toEqual([
      { id: firstId, title: 'First optimistic' },
      { id: 'server-2', title: 'Second' },
    ])
  })

  it('uses bounded foreground API refresh without a browser Realtime token', () => {
    renderHook(() => useMedia({ user: { id: 'user-1' } }, 'book'))

    expect(mocks.queryOptions).toMatchObject({
      enabled: true,
      staleTime: 60_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    })
  })
})
