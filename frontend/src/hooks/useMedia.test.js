import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const cache = new Map()
  return {
    cache,
    queryOptions: null,
    mutationOptions: [],
    queryState: { data: [], isPending: false, error: null, isFetching: false },
    queryClient: {
      cancelQueries: vi.fn(async () => {}),
      getQueryData: vi.fn((key) => cache.get(JSON.stringify(key))),
      setQueryData: vi.fn((key, updater) => {
        const k = JSON.stringify(key)
        const next = typeof updater === 'function' ? updater(cache.get(k)) : updater
        cache.set(k, next)
        return next
      }),
    },
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
  useQuery: (options) => {
    mocks.queryOptions = options
    return { ...mocks.queryState, refetch: vi.fn() }
  },
  useMutation: (options) => {
    mocks.mutationOptions.push(options)
    return { mutateAsync: vi.fn(), error: { message: 'Mutation failed' } }
  },
}))
vi.mock('../lib/apiClient', () => ({ apiFetch: vi.fn() }))

import { createOptimisticMediaId, replaceOptimisticMedia, useMedia } from './useMedia'

const KEY = JSON.stringify(['media', 'user-1', 'book'])

// Mutation options are created in this order inside useMedia.
const ADD = 0
const UPDATE = 1
const DELETE = 2

function renderMedia() {
  mocks.mutationOptions = []
  return renderHook(() => useMedia({ user: { id: 'user-1' } }, 'book')).result.current
}

describe('media optimistic creates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cache.clear()
  })

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
    renderMedia()

    expect(mocks.queryOptions).toMatchObject({
      enabled: true,
      staleTime: 60_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    })
  })
})

describe('useMedia error reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cache.clear()
    mocks.queryState = { data: [], isPending: false, error: null, isFetching: false }
  })

  it('returns only the list load error, not a failed write', () => {
    const result = renderMedia()
    expect(result.error).toBeNull()
  })

  it('reports the list load error when the query itself fails', () => {
    mocks.queryState = {
      data: undefined,
      isPending: false,
      error: { message: 'Database unavailable' },
      isFetching: false,
    }
    const result = renderMedia()
    expect(result.error).toBe('Database unavailable')
    expect(result.items).toEqual([])
  })
})

describe('useMedia rollbacks touch only the affected entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cache.clear()
  })

  it('reverts only the fields a failed update changed', async () => {
    mocks.cache.set(KEY, [
      { id: 'a', title: 'Alpha', status: 'To Read', rating: 3 },
      { id: 'b', title: 'Beta', status: 'To Read', rating: null },
    ])
    renderMedia()
    const update = mocks.mutationOptions[UPDATE]

    const context = await update.onMutate({ mediaId: 'a', data: { status: 'Reading' } })
    // A concurrent change to another field of the same entry lands meanwhile.
    mocks.cache.set(
      KEY,
      mocks.cache.get(KEY).map((i) => (i.id === 'a' ? { ...i, rating: 5 } : i)),
    )
    update.onError(new Error('boom'), { mediaId: 'a', data: { status: 'Reading' } }, context)

    expect(mocks.cache.get(KEY)).toEqual([
      { id: 'a', title: 'Alpha', status: 'To Read', rating: 5 },
      { id: 'b', title: 'Beta', status: 'To Read', rating: null },
    ])
  })

  it('re-inserts a failed delete at its original position', async () => {
    mocks.cache.set(KEY, [
      { id: 'a', title: 'Alpha' },
      { id: 'b', title: 'Beta' },
      { id: 'c', title: 'Gamma' },
    ])
    renderMedia()
    const remove = mocks.mutationOptions[DELETE]

    const context = await remove.onMutate('b')
    expect(mocks.cache.get(KEY).map((i) => i.id)).toEqual(['a', 'c'])
    remove.onError(new Error('boom'), 'b', context)

    expect(mocks.cache.get(KEY)).toEqual([
      { id: 'a', title: 'Alpha' },
      { id: 'b', title: 'Beta' },
      { id: 'c', title: 'Gamma' },
    ])
  })

  it('removes only the optimistic create when the POST fails', async () => {
    mocks.cache.set(KEY, [{ id: 'a', title: 'Alpha' }])
    renderMedia()
    const add = mocks.mutationOptions[ADD]

    const context = await add.onMutate({ title: 'New' })
    expect(mocks.cache.get(KEY)).toHaveLength(2)
    add.onError(new Error('boom'), { title: 'New' }, context)

    expect(mocks.cache.get(KEY)).toEqual([{ id: 'a', title: 'Alpha' }])
  })
})
