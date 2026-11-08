import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const { mockUseAionReader } = vi.hoisted(() => ({
  mockUseAionReader: vi.fn(),
}))

vi.mock('../hooks/useAionReader', () => ({ useAionReader: mockUseAionReader }))

import AionReader from '../views/AionReader'

const JOHN_1 = [
  {
    verse: 1,
    content: 'In the beginning was the Word, and the Word was with God, and the Word was God.',
  },
  { verse: 2, content: 'He was with God in the beginning.' },
]

function renderChapter() {
  return render(<AionReader view={{ bookId: 'JHN', chapter: 1 }} onNavigate={() => {}} />)
}

describe('AionReader chapter view', () => {
  beforeEach(() => {
    localStorage.clear()
    mockUseAionReader.mockReturnValue({
      verses: JOHN_1,
      isLoading: false,
      error: null,
      refetch: () => {},
    })
  })

  it('keeps the first word contiguous when the drop cap and verse number are split out', () => {
    const { container } = renderChapter()
    const verseButton = screen.getByRole('button', { name: /^Verse 1: In the beginning/ })
    // The drop cap letter, the verse number and the rest of the word must not be
    // separated by the superscript: the visible text reads "1In the beginning".
    const text = verseButton.textContent.replace(/\s+/g, ' ')
    expect(text).toContain('In the beginning was the Word')
    expect(text).not.toMatch(/I\s*\d\s*n the beginning/)
    // The drop cap is a single floated element holding the verse number and "I".
    const dropCap = container.querySelector('.float-left')
    expect(dropCap).not.toBeNull()
    expect(dropCap.textContent).toBe('1I')
    expect(dropCap.nextSibling?.textContent).toMatch(/^n the beginning/)
  })

  it('gives the verse button a full accessible name that reads the first word whole', () => {
    renderChapter()
    expect(
      screen.getByRole('button', {
        name: 'Verse 1: In the beginning was the Word, and the Word was with God, and the Word was God.',
      }),
    ).toBeDefined()
  })

  it('names the reading progress meter and exposes its value', () => {
    renderChapter()
    const meter = screen.getByRole('progressbar', { name: 'Reading progress' })
    expect(meter.getAttribute('aria-valuenow')).toBe('100')
    expect(meter.getAttribute('aria-valuetext')).toBe('100% read')
    // Visible value is shown next to the bar (hidden from AT: the meter already announces it).
    expect(screen.getByText('100%', { selector: 'span' }).getAttribute('aria-hidden')).toBe('true')
  })

  it('groups the text size controls under an accessible name', () => {
    renderChapter()
    const group = screen.getByRole('group', { name: 'Text size' })
    expect(group.contains(screen.getByRole('button', { name: 'Decrease text size' }))).toBe(true)
    expect(group.contains(screen.getByRole('button', { name: 'Increase text size' }))).toBe(true)
  })

  it('announces the text size by name when it changes', () => {
    renderChapter()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Text size: Medium')
    fireEvent.click(screen.getByRole('button', { name: 'Increase text size' }))
    expect(status.textContent).toBe('Text size: Large')
  })
})
