import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/aionSupabase', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(),
  }
  return {
    aionSupabase: {
      from: vi.fn(() => mockChain),
    },
    __mockChain: mockChain,
  }
})

import { useAionReader } from '../useAionReader'
import { aionSupabase, __mockChain } from '../../lib/aionSupabase'

const sampleVerses = [
  { verse: 1, content: 'The LORD is my shepherd; I shall not want.', book_name: 'Psalms' },
  { verse: 2, content: 'He makes me lie down in green pastures.', book_name: 'Psalms' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAionReader', () => {
  it('starts in loading state when bookId and chapter are provided', () => {
    __mockChain.order.mockResolvedValue({ data: sampleVerses, error: null })
    const { result } = renderHook(() => useAionReader('PSA', 23))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.verses).toEqual([])
  })

  it('returns verses on successful fetch', async () => {
    __mockChain.order.mockResolvedValue({ data: sampleVerses, error: null })
    const { result } = renderHook(() => useAionReader('PSA', 23))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.verses).toEqual(sampleVerses)
    expect(result.current.error).toBeNull()
  })

  it('queries bible_verses with correct bookId and chapter', async () => {
    __mockChain.order.mockResolvedValue({ data: [], error: null })
    renderHook(() => useAionReader('PSA', 23))
    await waitFor(() => {})
    expect(aionSupabase.from).toHaveBeenCalledWith('bible_verses')
    expect(__mockChain.eq).toHaveBeenCalledWith('book_id', 'PSA')
    expect(__mockChain.eq).toHaveBeenCalledWith('chapter', 23)
  })

  it('sets error on fetch failure', async () => {
    __mockChain.order.mockResolvedValue({ data: null, error: { message: 'Access denied' } })
    const { result } = renderHook(() => useAionReader('PSA', 23))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Access denied')
    expect(result.current.verses).toEqual([])
  })

  it('returns empty and does not fetch when bookId is null', () => {
    const { result } = renderHook(() => useAionReader(null, null))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.verses).toEqual([])
    expect(aionSupabase.from).not.toHaveBeenCalled()
  })
})
