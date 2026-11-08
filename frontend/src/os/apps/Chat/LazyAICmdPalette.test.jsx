import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LazyAICmdPalette from './LazyAICmdPalette'

vi.mock('../../../hooks/useSuggest', () => ({
  useSuggest: () => ({
    suggest: vi.fn(),
    suggestError: null,
    suggesting: false,
    resetSuggest: vi.fn(),
  }),
}))

const ENTRY_NAME = 'Ask AI (open command palette)'

describe('LazyAICmdPalette entry point', () => {
  beforeEach(() => {
    // cmdk scrolls the selected item into view; jsdom does not implement it.
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('keeps the accessible name', () => {
    render(<LazyAICmdPalette mediaType="book" />)
    expect(screen.getByRole('button', { name: ENTRY_NAME })).toBeTruthy()
  })

  it('floats by default and is a Win7 toolbar element, not a floating push button', () => {
    render(<LazyAICmdPalette mediaType="book" />)
    const button = screen.getByRole('button', { name: ENTRY_NAME })
    expect(button.className).toContain('w7-toolbtn')
    expect(button.className).toContain('fixed')
    expect(button.className).not.toContain('w7-btn')
  })

  it('placement="inline" renders in normal flow for a host command bar', () => {
    render(<LazyAICmdPalette mediaType="book" placement="inline" />)
    const button = screen.getByRole('button', { name: ENTRY_NAME })
    expect(button.className).toContain('w7-toolbtn')
    expect(button.className).not.toContain('fixed')
  })

  it('shows its shortcut as Alt+A, not Ctrl+K, and keeps the label visible on small screens', () => {
    render(<LazyAICmdPalette mediaType="book" />)
    const button = screen.getByRole('button', { name: ENTRY_NAME })
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Alt+A')
    expect(button.querySelector('kbd').textContent).toBe('Alt+A')
    expect(button.textContent).toContain('Ask AI')
    expect(button.querySelector('span').className).not.toMatch(/hidden/)
  })
})

describe('LazyAICmdPalette keyboard ownership', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('leaves Ctrl+K to the OS command palette', () => {
    render(<LazyAICmdPalette mediaType="book" />)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(screen.queryByRole('dialog', { name: 'Ask AI' })).toBeNull()
  })

  it('opens Ask AI with Alt+A', async () => {
    render(<LazyAICmdPalette mediaType="book" />)
    fireEvent.keyDown(document, { key: 'a', code: 'KeyA', altKey: true })
    expect(await screen.findByRole('dialog', { name: 'Ask AI' })).toBeTruthy()
  })

  it('does not open over the OS command palette', () => {
    const palette = document.createElement('div')
    palette.setAttribute('data-testid', 'command-palette')
    document.body.appendChild(palette)
    render(<LazyAICmdPalette mediaType="book" />)
    fireEvent.keyDown(document, { key: 'a', code: 'KeyA', altKey: true })
    expect(screen.queryByRole('dialog', { name: 'Ask AI' })).toBeNull()
    palette.remove()
  })
})

describe('LazyAICmdPalette open on click', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('does not mount the palette on hover or focus, only on open', async () => {
    render(<LazyAICmdPalette mediaType="book" />)
    const button = screen.getByRole('button', { name: ENTRY_NAME })
    fireEvent.mouseEnter(button)
    fireEvent.focus(button)
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByRole('dialog', { name: 'Ask AI' })).toBeNull()
  })

  it('opens on a cold click', async () => {
    render(<LazyAICmdPalette mediaType="book" />)
    fireEvent.click(screen.getByRole('button', { name: ENTRY_NAME }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Ask AI' })).toBeTruthy())
  })

  it('closes on Escape', async () => {
    render(<LazyAICmdPalette mediaType="book" />)
    fireEvent.click(screen.getByRole('button', { name: ENTRY_NAME }))
    await screen.findByRole('dialog', { name: 'Ask AI' })
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ask AI' })).toBeNull())
  })
})
