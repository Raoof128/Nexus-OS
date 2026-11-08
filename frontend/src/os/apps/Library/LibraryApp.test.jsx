import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ useMedia: vi.fn() }))

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../../../hooks/useMedia', () => ({
  useMedia: (...args) => mocks.useMedia(...args),
}))

import LibraryApp from './LibraryApp'

const book = {
  id: 'b1',
  type: 'book',
  title: 'Piranesi',
  creator: 'Susanna Clarke',
  genre: 'Fantasy',
  status: 'To Read',
  rating: null,
}

function mediaState(overrides = {}) {
  return {
    items: [book],
    loading: false,
    error: null,
    refreshing: false,
    refetch: vi.fn(),
    addMedia: vi.fn(),
    updateMedia: vi.fn().mockResolvedValue({ ...book, status: 'Reading' }),
    deleteMedia: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
}

describe('LibraryApp failed writes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('keeps the board on screen and names the failed status move', async () => {
    mocks.useMedia.mockReturnValue(
      mediaState({ updateMedia: vi.fn().mockRejectedValue(new Error('Internal error')) }),
    )
    render(<LibraryApp />)

    fireEvent.click(screen.getByRole('button', { name: 'Move to Reading' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The status couldn’t be changed.')
    expect(screen.getByRole('region', { name: /To Read column/ })).toBeTruthy()
    expect(screen.queryByText(/couldn.t be loaded/)).toBeNull()
  })

  it('dismisses the action error', async () => {
    mocks.useMedia.mockReturnValue(
      mediaState({ updateMedia: vi.fn().mockRejectedValue(new Error('down')) }),
    )
    render(<LibraryApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Move to Reading' }))
    const alert = await screen.findByRole('alert')
    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows no alert when the write succeeds', async () => {
    mocks.useMedia.mockReturnValue(mediaState())
    render(<LibraryApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Move to Reading' }))
    await Promise.resolve()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('LibraryApp load errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('retries the list in place instead of reloading the page', () => {
    const refetch = vi.fn()
    mocks.useMedia.mockReturnValue(
      mediaState({ items: [], error: 'Database unavailable', refetch }),
    )
    render(<LibraryApp />)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Database unavailable')
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the last loaded list when a refresh fails', () => {
    const refetch = vi.fn()
    mocks.useMedia.mockReturnValue(mediaState({ error: 'Timeout', refetch }))
    render(<LibraryApp />)

    expect(screen.getByRole('region', { name: /To Read column/ })).toBeTruthy()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Couldn’t refresh your media.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
