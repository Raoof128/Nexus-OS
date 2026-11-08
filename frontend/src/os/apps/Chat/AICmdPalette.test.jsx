import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AICmdPalette from './AICmdPalette'

const mocks = vi.hoisted(() => ({ suggest: vi.fn(), resetSuggest: vi.fn() }))

vi.mock('../../../hooks/useSuggest', () => ({
  useSuggest: () => ({
    suggest: mocks.suggest,
    suggestError: null,
    suggesting: false,
    resetSuggest: mocks.resetSuggest,
  }),
}))

describe('AICmdPalette window chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // cmdk scrolls the selected item into view; jsdom does not implement it.
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('shows the title bar to assistive tech with a Close control', () => {
    const onOpenChange = vi.fn()
    render(<AICmdPalette open onOpenChange={onOpenChange} mediaType="book" />)
    const title = document.querySelector('.title-bar .title-bar-text')
    expect(title.textContent).toBe('Ask AI')
    expect(title.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('the Close button closes through the same path as Escape and resets state', () => {
    const onOpenChange = vi.fn()
    render(<AICmdPalette open onOpenChange={onOpenChange} mediaType="book" />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(mocks.resetSuggest).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

const LIST_A = {
  source: 'gemini',
  suggestions: [
    {
      title: 'The Dispossessed',
      creator: 'Ursula K. Le Guin',
      genre: 'Science fiction',
      year: '1974',
      pitch: 'An ambiguous utopia.',
    },
  ],
}
const LIST_B = {
  source: 'gemini',
  suggestions: [
    {
      title: 'Solaris',
      creator: 'Stanislaw Lem',
      genre: 'Science fiction',
      year: '1961',
      pitch: 'A living ocean.',
    },
  ],
}

describe('AICmdPalette suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('clears "Added to archive" when a new suggestion list replaces the old one', async () => {
    mocks.suggest.mockResolvedValueOnce(LIST_A).mockResolvedValueOnce(LIST_B)
    const onAdd = vi.fn().mockResolvedValue({})
    render(<AICmdPalette open onOpenChange={vi.fn()} mediaType="book" onAdd={onAdd} />)

    fireEvent.click(screen.getByRole('option', { name: /Suggest Book/ }))
    await screen.findByText('The Dispossessed')
    fireEvent.click(screen.getByRole('button', { name: 'To Read' }))
    await screen.findByText('Added to archive')

    fireEvent.click(screen.getByRole('option', { name: /Suggest Book/ }))
    await screen.findByText('Solaris')
    expect(screen.queryByText('Added to archive')).toBeNull()
    expect(screen.getByRole('button', { name: 'To Read' })).toBeTruthy()
  })

  it('reports a failed quick-add under the suggestion that failed', async () => {
    mocks.suggest.mockResolvedValueOnce(LIST_A)
    const onAdd = vi.fn().mockRejectedValue(new Error('Database unavailable'))
    render(<AICmdPalette open onOpenChange={vi.fn()} mediaType="book" onAdd={onAdd} />)

    fireEvent.click(screen.getByRole('option', { name: /Suggest Book/ }))
    await screen.findByText('The Dispossessed')
    fireEvent.click(screen.getByRole('button', { name: 'To Read' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The Dispossessed')
    expect(screen.queryByText('Added to archive')).toBeNull()
  })

  it('handles a failed suggest request without an unhandled rejection', async () => {
    mocks.suggest.mockRejectedValueOnce(new Error('AI is unavailable'))
    render(<AICmdPalette open onOpenChange={vi.fn()} mediaType="book" onAdd={vi.fn()} />)

    fireEvent.click(screen.getByRole('option', { name: /Suggest Book/ }))
    await waitFor(() => expect(mocks.suggest).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('The Dispossessed')).toBeNull()
  })
})
