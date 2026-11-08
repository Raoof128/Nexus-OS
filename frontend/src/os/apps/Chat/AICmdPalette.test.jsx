import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
