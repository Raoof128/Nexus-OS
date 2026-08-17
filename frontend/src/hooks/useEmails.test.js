import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/apiClient', () => ({
  apiFetch: vi.fn(),
}))

import { buildEmailsPath, mapEmailPages } from './useEmails'

describe('email infinite-query helpers', () => {
  it('builds a cookie-authenticated path with active filters and a composite cursor', () => {
    const cursor = {
      provider_date: '2026-08-17T00:00:00+00:00',
      id: '00000000-0000-0000-0000-000000000123',
    }

    expect(
      buildEmailsPath({
        folder: 'starred',
        accountId: 'account-1',
        searchTerm: ' quarterly report ',
        cursor,
      }),
    ).toBe(
      '/api/email/messages?folder=starred&limit=50&account_id=account-1&' +
        'search=quarterly+report&cursor_date=2026-08-17T00%3A00%3A00%2B00%3A00&' +
        'cursor_id=00000000-0000-0000-0000-000000000123',
    )
  })

  it('updates items on later pages without discarding cursors', () => {
    const data = {
      pages: [
        { items: [{ id: 'first' }], next_cursor: { id: 'first' } },
        { items: [{ id: 'later', is_read: false }], next_cursor: null },
      ],
      pageParams: [null, { id: 'first' }],
    }

    const updated = mapEmailPages(data, (items) =>
      items.map((email) => (email.id === 'later' ? { ...email, is_read: true } : email)),
    )
    expect(updated.pages[1].items[0].is_read).toBe(true)
    expect(updated.pages[0].next_cursor).toEqual({ id: 'first' })
    expect(updated.pageParams).toEqual(data.pageParams)
  })
})
