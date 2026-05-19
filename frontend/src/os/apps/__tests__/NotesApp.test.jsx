import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import NotesApp from '../NotesApp'

describe('NotesApp', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders a textarea for editing', () => {
    render(<NotesApp windowId="notes-abc" />)
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('saves content to localStorage on change', async () => {
    vi.useFakeTimers()
    render(<NotesApp windowId="notes-abc" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hello world' } })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(localStorage.getItem('nexus-os:note-notes-abc')).toContain('Hello world')
    vi.useRealTimers()
  })

  it('restores content from localStorage on mount', async () => {
    localStorage.setItem('nexus-os:note-notes-abc', JSON.stringify({ content: 'Saved note' }))
    render(<NotesApp windowId="notes-abc" />)
    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('Saved note')
    })
  })

  it('toggles between edit and preview mode', () => {
    render(<NotesApp windowId="notes-abc" />)
    const previewBtn = screen.getByText('Preview')
    fireEvent.click(previewBtn)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Edit')).toBeDefined()
  })
})
