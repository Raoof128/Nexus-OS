import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'

import NotesApp from '../NotesApp'

const NOTE_KEY = 'nexus-os:note-notes-abc'
const PREFS_KEY = 'nexus-os:notes-prefs'

function editor() {
  return screen.getByRole('textbox', { name: 'Note editor' })
}

// Top-level menu titles carry data-menu-id; items are found inside the open menu.
function title(id) {
  return document.querySelector(`[role="menuitem"][data-menu-id="${id}"]`)
}

function openMenu(id) {
  fireEvent.click(title(id))
  return screen.getByRole('menu')
}

function pickItem(menu, name) {
  fireEvent.click(within(menu).getByRole('button', { name }))
}

describe('NotesApp', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a textarea for editing', () => {
    render(<NotesApp windowId="notes-abc" />)
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('saves content to localStorage on change', async () => {
    vi.useFakeTimers()
    render(<NotesApp windowId="notes-abc" />)
    fireEvent.change(editor(), { target: { value: 'Hello world' } })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(localStorage.getItem(NOTE_KEY)).toContain('Hello world')
  })

  it('restores content from localStorage on mount', async () => {
    localStorage.setItem(NOTE_KEY, JSON.stringify({ content: 'Saved note' }))
    render(<NotesApp windowId="notes-abc" />)
    await waitFor(() => {
      expect(editor().value).toBe('Saved note')
    })
  })

  it('shows a menu bar with File, Edit, Format, View and Help', () => {
    render(<NotesApp windowId="notes-abc" />)
    const bar = screen.getByRole('menubar', { name: 'Menu bar' })
    const titles = within(bar)
      .getAllByRole('menuitem')
      .map((li) => li.textContent)
    expect(titles).toEqual(['File', 'Edit', 'Format', 'View', 'Help'])
  })

  it('opens a menu on click and closes it with Escape', () => {
    render(<NotesApp windowId="notes-abc" />)
    const menu = openMenu('file')
    expect(within(menu).getByRole('button', { name: /Save/ })).toBeDefined()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('menus open and move from the keyboard, and Escape returns focus to the title', () => {
    render(<NotesApp windowId="notes-abc" />)
    title('file').focus()
    fireEvent.keyDown(title('file'), { key: 'ArrowDown' })
    const fileMenu = screen.getByRole('menu', { name: 'File' })
    expect(document.activeElement).toBe(within(fileMenu).getByRole('button', { name: /Save/ }))

    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' })
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeDefined()
    expect(screen.queryByRole('menu', { name: 'File' })).toBeNull()

    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(title('edit'))
  })

  it('Enter and Space on a menu item are not swallowed, so the button can activate', () => {
    render(<NotesApp windowId="notes-abc" />)
    title('format').focus()
    fireEvent.keyDown(title('format'), { key: 'Enter' })
    const item = within(screen.getByRole('menu', { name: 'Format' })).getByRole('button', {
      name: /Word wrap/,
    })
    item.focus()
    // fireEvent returns false only when the default action was prevented.
    expect(fireEvent.keyDown(item, { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(item, { key: ' ' })).toBe(true)
  })

  it('View > Markdown preview renders the note, and View > Edit goes back', async () => {
    render(<NotesApp windowId="notes-abc" />)
    fireEvent.change(editor(), { target: { value: '# Heading' } })
    pickItem(openMenu('view'), /Markdown preview/)
    expect(screen.queryByRole('textbox', { name: 'Note editor' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeDefined()

    pickItem(openMenu('view'), /^Edit/)
    expect(editor()).toBeDefined()
  })

  it('F5 inserts the time and date at the caret and stops the browser reload', () => {
    render(<NotesApp windowId="notes-abc" />)
    const ta = editor()
    fireEvent.change(ta, { target: { value: 'Start  end' } })
    ta.setSelectionRange(6, 6)
    const notPrevented = fireEvent.keyDown(ta, { key: 'F5' })
    expect(notPrevented).toBe(false)
    expect(ta.value).toMatch(/^Start \d{1,2}:\d{2} (AM|PM) \d{1,2}\/\d{1,2}\/\d{4} end$/)
  })

  it('Ctrl+F opens Find and Find next selects the next match', () => {
    render(<NotesApp windowId="notes-abc" />)
    const ta = editor()
    fireEvent.change(ta, { target: { value: 'alpha beta alpha' } })
    fireEvent.keyDown(ta, { key: 'f', ctrlKey: true })

    const dialog = screen.getByRole('dialog', { name: 'Find' })
    const input = within(dialog).getByRole('textbox', { name: 'Find what:' })
    fireEvent.change(input, { target: { value: 'alpha' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find next' }))
    expect([ta.selectionStart, ta.selectionEnd]).toEqual([0, 5])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Find next' }))
    expect([ta.selectionStart, ta.selectionEnd]).toEqual([11, 16])
  })

  it('Find says so when the text is not in the note', () => {
    render(<NotesApp windowId="notes-abc" />)
    const ta = editor()
    fireEvent.change(ta, { target: { value: 'alpha' } })
    fireEvent.keyDown(ta, { key: 'f', ctrlKey: true })
    const dialog = screen.getByRole('dialog', { name: 'Find' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Find what:' }), {
      target: { value: 'gamma' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find next' }))
    expect(within(dialog).getByRole('status').textContent).toBe('Cannot find "gamma"')
  })

  it('Format > Monospace font toggles the font and remembers the choice', () => {
    render(<NotesApp windowId="notes-abc" />)
    expect(editor().className).not.toContain('font-mono')

    const item = within(openMenu('format')).getByRole('button', { name: /Monospace font/ })
    expect(item.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(item)

    expect(editor().className).toContain('font-mono')
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)).monospace).toBe(true)
  })

  it('Format > Word wrap turns wrapping off on the note', () => {
    render(<NotesApp windowId="notes-abc" />)
    expect(editor().getAttribute('wrap')).toBe('soft')
    pickItem(openMenu('format'), /Word wrap/)
    expect(editor().getAttribute('wrap')).toBe('off')
  })

  it('Ctrl+S saves straight away, without waiting for the pause', () => {
    vi.useFakeTimers()
    render(<NotesApp windowId="notes-abc" />)
    const ta = editor()
    fireEvent.change(ta, { target: { value: 'saved now' } })
    fireEvent.keyDown(ta, { key: 's', ctrlKey: true })
    expect(localStorage.getItem(NOTE_KEY)).toContain('saved now')
  })

  it('reports the save state in the status bar', () => {
    vi.useFakeTimers()
    render(<NotesApp windowId="notes-abc" />)
    fireEvent.change(editor(), { target: { value: 'typing' } })
    expect(screen.getByRole('status').textContent).toBe('Saving…')
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByRole('status').textContent).toBe('Saved')
  })

  it('Help > About Notes lists the shortcuts', () => {
    render(<NotesApp windowId="notes-abc" />)
    pickItem(openMenu('help'), /About Notes/)
    const dialog = screen.getByRole('dialog', { name: 'About Notes' })
    expect(within(dialog).getByText('Insert the time and date')).toBeDefined()
  })
})
