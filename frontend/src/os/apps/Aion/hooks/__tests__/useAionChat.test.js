import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAionChat } from '../useAionChat'

const mockSession = { access_token: 'tok_abc' }

function makeSseStream(events) {
  // Build SSE text from array of {event, data} objects
  const text = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')
  const encoder = new TextEncoder()
  const chunks = [encoder.encode(text)]
  let i = 0
  return {
    getReader: () => ({
      read: vi.fn(() => {
        if (i < chunks.length) return Promise.resolve({ done: false, value: chunks[i++] })
        return Promise.resolve({ done: true, value: undefined })
      }),
    }),
  }
}

beforeEach(() => {
  vi.stubGlobal('VITE_AION_SUPABASE_URL', 'https://test.supabase.co')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAionChat', () => {
  it('starts with empty messages and not streaming', () => {
    const { result } = renderHook(() => useAionChat(mockSession))
    expect(result.current.messages).toEqual([])
    expect(result.current.isStreaming).toBe(false)
  })

  it('appends user message and empty assistant message on sendMessage', async () => {
    const stream = makeSseStream([{ event: 'done', data: {} }])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream }),
    )

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })

    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'Hello' })
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant' })
  })

  it('accumulates streamed text into the assistant message', async () => {
    const stream = makeSseStream([
      { event: 'text', data: { content: 'Hi ' } },
      { event: 'text', data: { content: 'there!' } },
      { event: 'done', data: {} },
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }))

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })

    expect(result.current.messages[1].content).toBe('Hi there!')
  })

  it('attaches verses to the correct assistant message', async () => {
    const verses = [{ id: 1, book_name: 'Psalms', chapter: 23, verse: 1, content: 'The LORD...' }]
    const stream = makeSseStream([
      { event: 'text', data: { content: 'A verse:' } },
      { event: 'verses', data: { verses } },
      { event: 'done', data: {} },
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }))

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Psalms 23', null)
    })

    expect(result.current.messages[1].verses).toEqual(verses)
  })

  it('ignores malformed SSE data without crashing', async () => {
    const encoder = new TextEncoder()
    const badChunk = encoder.encode('event: text\ndata: NOT_JSON\n\n')
    const stream = {
      getReader: () => ({
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: badChunk })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      }),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }))

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })

    // Should not throw; assistant message content stays empty
    expect(result.current.messages[1].content).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('sets error when fetch returns non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Rate limited' }),
      }),
    )

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })

    expect(result.current.error).toBe('Rate limited')
  })

  it('reset clears messages and error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'fail' }) }),
    )

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })
    expect(result.current.error).toBe('fail')

    act(() => result.current.reset())
    expect(result.current.messages).toEqual([])
    expect(result.current.error).toBeNull()
  })
})
