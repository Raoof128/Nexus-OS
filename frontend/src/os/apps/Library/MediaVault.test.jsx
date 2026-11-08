import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, within } from '@testing-library/react'
import MediaVault from './MediaVault'

const items = [
  {
    id: 'a',
    type: 'book',
    title: 'Neuromancer',
    creator: 'William Gibson',
    genre: 'Sci-fi',
    status: 'Reading',
    rating: 4,
  },
  {
    id: 'b',
    type: 'book',
    title: 'Snow Crash',
    creator: 'Neal Stephenson',
    genre: 'Sci-fi',
    status: 'Reading',
    rating: null,
  },
  {
    id: 'c',
    type: 'book',
    title: 'Dune',
    creator: 'Frank Herbert',
    genre: 'Sci-fi',
    status: 'To Read',
    rating: null,
  },
]

function renderVault(props = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onUpdate: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onBack: vi.fn(),
  }
  const utils = render(
    <MediaVault items={items} mediaType="book" filterStatus={null} {...handlers} {...props} />,
  )
  return { ...utils, ...handlers }
}

describe('MediaVault list semantics', () => {
  it('exposes a table with column headers and one row per item', () => {
    renderVault()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(5)
    expect(within(table).getAllByRole('row')).toHaveLength(items.length + 1)
  })

  it('marks the selected row with aria-selected', () => {
    renderVault({ selectedId: 'b' })
    const rows = screen.getAllByRole('row').filter((row) => row.hasAttribute('data-vault-row'))
    const selected = rows.filter((row) => row.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].textContent).toContain('Snow Crash')
  })

  it('uses roving tabindex: one row is in the Tab sequence', () => {
    renderVault({ selectedId: 'b' })
    const rows = Array.from(document.querySelectorAll('[data-vault-row]'))
    expect(rows.filter((row) => row.tabIndex === 0)).toHaveLength(1)
    expect(rows[1].tabIndex).toBe(0)
  })
})

describe('MediaVault keyboard row navigation', () => {
  it('opens the focused row with Enter and Space', () => {
    const { onSelect } = renderVault()
    const rows = document.querySelectorAll('[data-vault-row]')
    fireEvent.keyDown(rows[0], { key: 'Enter' })
    fireEvent.keyDown(rows[2], { key: ' ' })
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith(items[2])
  })

  it('moves focus between rows with ArrowDown, ArrowUp, Home and End', () => {
    renderVault()
    const rows = document.querySelectorAll('[data-vault-row]')
    act(() => rows[0].focus())
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1], { key: 'End' })
    expect(document.activeElement).toBe(rows[2])
    fireEvent.keyDown(rows[2], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1], { key: 'Home' })
    expect(document.activeElement).toBe(rows[0])
  })

  it('does not treat keys pressed on a row button as row keys', () => {
    const { onSelect } = renderVault()
    const editButton = screen.getAllByRole('button', { name: 'Edit' })[0]
    fireEvent.keyDown(editButton, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('MediaVault status arrows', () => {
  it('keeps unavailable status arrows visible but disabled', () => {
    renderVault()
    const backFromFirst = screen.getAllByRole('button', { name: 'No earlier status' })
    expect(backFromFirst.length).toBeGreaterThan(0)
    backFromFirst.forEach((button) => {
      expect(button.disabled).toBe(true)
      expect(button.className).not.toMatch(/invisible/)
    })
  })
})

describe('MediaVault search', () => {
  it('uses a search input and explains an empty result', () => {
    renderVault()
    const search = screen.getByRole('searchbox', { name: 'Search vault' })
    expect(search.getAttribute('type')).toBe('search')
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText(/No items match/)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Clear search' })).not.toBeNull()
  })
})
