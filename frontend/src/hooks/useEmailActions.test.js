import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_API_URL', 'https://api.example.com')
vi.mock('../lib/realtimeClient', () => ({ realtimeClient: {} }))

import {
  createOutboundEmailSender,
  removeEmailFromCache,
  restoreEmailEntry,
  snapshotEmailEntry,
  updateEmailInCache,
} from './useEmailActions'

describe('createOutboundEmailSender', () => {
  it('reuses a key after an ambiguous failure and rotates it after success', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request timed out'))
      .mockResolvedValueOnce({ id: 'sent-1' })
      .mockResolvedValueOnce({ id: 'sent-2' })
    const send = createOutboundEmailSender(request)
    const payload = { account_id: 'a1', to: ['to@example.com'], body_html: 'Hi' }

    await expect(send('send', '/api/email/send', payload)).rejects.toThrow('timed out')
    await expect(send('send', '/api/email/send', payload)).resolves.toEqual({ id: 'sent-1' })
    await expect(send('send', '/api/email/send', payload)).resolves.toEqual({ id: 'sent-2' })

    const keys = request.mock.calls.map((call) => call[1].headers['Idempotency-Key'])
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[1])
  })

  it('uses a new key when the payload changes after a failure', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline'))
    const send = createOutboundEmailSender(request)

    await expect(send('send', '/api/email/send', { body_html: 'one' })).rejects.toThrow()
    await expect(send('send', '/api/email/send', { body_html: 'two' })).rejects.toThrow()

    const first = request.mock.calls[0][1].headers['Idempotency-Key']
    const second = request.mock.calls[1][1].headers['Idempotency-Key']
    expect(second).not.toBe(first)
  })

  it('updates and removes a message on a later infinite-query page', () => {
    const cached = {
      pages: [
        { items: [{ id: 'first', is_read: false }], next_cursor: { id: 'first' } },
        { items: [{ id: 'later', is_read: false }], next_cursor: null },
      ],
      pageParams: [null, { id: 'first' }],
    }

    const updated = updateEmailInCache(cached, 'later', (email) => ({
      ...email,
      is_read: true,
    }))
    expect(updated.pages[1].items[0].is_read).toBe(true)
    expect(updated.pages[0].items[0].is_read).toBe(false)

    const removed = removeEmailFromCache(updated, 'later')
    expect(removed.pages[1].items).toEqual([])
    expect(removed.pageParams).toEqual(cached.pageParams)
  })
})

describe('rolling back one message', () => {
  const cache = () => ({
    pages: [
      {
        items: [
          { id: 'a', is_read: false, is_starred: false },
          { id: 'b', is_read: false, is_starred: false },
        ],
        next_cursor: { id: 'b' },
      },
      { items: [{ id: 'c', is_read: false, is_starred: false }], next_cursor: null },
    ],
    pageParams: [null, { id: 'b' }],
  })

  it('reverts only the changed field and keeps a concurrent success', () => {
    const before = cache()
    const entry = snapshotEmailEntry(before, 'b')
    // Optimistic read on b, then a star on a is confirmed by the server.
    let data = updateEmailInCache(before, 'b', (email) => ({ ...email, is_read: true }))
    data = updateEmailInCache(data, 'a', (email) => ({ ...email, is_starred: true }))

    // b's read fails: only b's read flag goes back.
    data = restoreEmailEntry(data, entry, ['is_read'])

    expect(data.pages[0].items[1]).toMatchObject({ id: 'b', is_read: false })
    expect(data.pages[0].items[0]).toMatchObject({ id: 'a', is_starred: true })
    expect(data.pageParams).toEqual(before.pageParams)
  })

  it('puts a removed message back at its original position', () => {
    const before = cache()
    const entry = snapshotEmailEntry(before, 'a')
    const data = restoreEmailEntry(removeEmailFromCache(before, 'a'), entry)
    expect(data.pages[0].items.map((email) => email.id)).toEqual(['a', 'b'])
    expect(data.pages[1].items.map((email) => email.id)).toEqual(['c'])
  })

  it('finds a message on a later page and restores it there', () => {
    const before = cache()
    const entry = snapshotEmailEntry(before, 'c')
    expect(entry).toMatchObject({ pageIndex: 1, index: 0 })
    const data = restoreEmailEntry(removeEmailFromCache(before, 'c'), entry)
    expect(data.pages[1].items.map((email) => email.id)).toEqual(['c'])
  })

  it('does nothing for a message that was not in the query', () => {
    const data = cache()
    expect(snapshotEmailEntry(data, 'missing')).toBeNull()
    expect(restoreEmailEntry(data, null, ['is_read'])).toBe(data)
  })
})
