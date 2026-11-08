import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'

import NotesApp from '../NotesApp'
import {
  addNote,
  createNote,
  getNote,
  listNotes,
  PENDING_KEY,
  WINDOWS_KEY,
} from '../Notes/noteStore'
import { useWindowStore } from '../../stores/windowStore'

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

// The note a window shows, as the app recorded it.
function linkedNoteId(windowId) {
  return JSON.parse(localStorage.getItem(WINDOWS_KEY) ?? '{}')[windowId] ?? null
}

function storedContent(windowId) {
  return getNote(linkedNoteId(windowId))?.content
}

// Opens a Notes window the way the window manager does and returns its id.
function openNotesWindow() {
  useWindowStore.getState().openApp('notes')
  const windows = Object.values(useWindowStore.getState().windows).filter(
    (w) => w.appId === 'notes',
  )
  return windows[windows.length - 1].windowId
}

function openFileOpen() {
  pickItem(openMenu('file'), /^Open/)
  return screen.getByRole('dialog', { name: 'Open' })
}

describe('NotesApp', () => {
  beforeEach(() => {
    localStorage.clear()
    useWindowStore.setState({ windows: {}, zStack: [], activeWindowId: null })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders a textarea for editing', () => {
    render(<NotesApp windowId="notes-abc" />)
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('saves content to storage on change', async () => {
    vi.useFakeTimers()
    render(<NotesApp windowId="notes-abc" />)
    fireEvent.change(editor(), { target: { value: 'Hello world' } })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(storedContent('notes-abc')).toBe('Hello world')
  })

  it('restores the most recent note on mount', async () => {
    addNote({ content: 'Saved note' })
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
    expect(document.activeElement).toBe(within(fileMenu).getByRole('button', { name: /New/ }))

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
    expect(storedContent('notes-abc')).toBe('saved now')
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

  it('shows the note name in the status bar', () => {
    render(<NotesApp windowId="notes-abc" />)
    fireEvent.change(editor(), { target: { value: '\nDinner ideas\nPasta' } })
    expect(screen.getByTitle('Dinner ideas')).toBeDefined()
  })

  it('Help > About Notes lists the shortcuts', () => {
    render(<NotesApp windowId="notes-abc" />)
    pickItem(openMenu('help'), /About Notes/)
    const dialog = screen.getByRole('dialog', { name: 'About Notes' })
    expect(within(dialog).getByText('Insert the time and date')).toBeDefined()
  })

  it('a note survives its window closing: the next Notes window shows it', () => {
    const first = openNotesWindow()
    const { unmount } = render(<NotesApp windowId={first} />)
    fireEvent.change(editor(), { target: { value: 'Keep me\nthis line' } })
    fireEvent.keyDown(editor(), { key: 's', ctrlKey: true })
    unmount()
    useWindowStore.getState().closeWindow(first)

    const second = openNotesWindow()
    render(<NotesApp windowId={second} />)
    expect(editor().value).toBe('Keep me\nthis line')
    expect(listNotes()).toHaveLength(1)
  })

  it('a new window opens the newest note no other window shows, then a blank note', () => {
    addNote({ content: 'First' })
    addNote({ content: 'Second' })
    const values = () =>
      screen.getAllByRole('textbox', { name: 'Note editor' }).map((ta) => ta.value)

    render(<NotesApp windowId={openNotesWindow()} />)
    expect(values()).toEqual(['Second'])

    render(<NotesApp windowId={openNotesWindow()} />)
    expect(values()).toEqual(['Second', 'First'])

    render(<NotesApp windowId={openNotesWindow()} />)
    expect(values()).toEqual(['Second', 'First', ''])
    expect(listNotes()).toHaveLength(3)
  })

  it('a share target note is the one the next Notes window opens', () => {
    createNote({ title: 'Hi', content: 'Hello' })
    const w = openNotesWindow()
    render(<NotesApp windowId={w} />)
    expect(editor().value).toBe('Hi\n\nHello')
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('File > Open… lists saved notes, and double-click switches this window to one', () => {
    addNote({ content: 'First note' })
    addNote({ content: 'Second note' })
    const w1 = openNotesWindow()
    render(<NotesApp windowId={w1} />)
    expect(editor().value).toBe('Second note')

    const dialog = openFileOpen()
    const listbox = within(dialog).getByRole('listbox', { name: 'Saved notes' })
    expect(within(listbox).getAllByRole('option')).toHaveLength(2)
    fireEvent.doubleClick(within(listbox).getByRole('option', { name: /First note/ }))

    expect(screen.queryByRole('dialog', { name: 'Open' })).toBeNull()
    expect(editor().value).toBe('First note')
    expect(linkedNoteId(w1)).toBe(listNotes().find((n) => n.title === 'First note').id)
  })

  it('File > Open… on a note another window shows switches to that window', () => {
    addNote({ content: 'Other' })
    addNote({ content: 'Mine' })
    const w1 = openNotesWindow()
    render(<NotesApp windowId={w1} />)
    const w2 = openNotesWindow()
    render(<NotesApp windowId={w2} />)
    const [editorOne, editorTwo] = screen.getAllByRole('textbox', { name: 'Note editor' })
    expect(editorOne.value).toBe('Mine')
    expect(editorTwo.value).toBe('Other')

    // Window one asks for "Other", which window two already shows.
    pickItem(openMenu('file'), /^Open/)
    const list = screen.getByRole('listbox', { name: 'Saved notes' })
    fireEvent.doubleClick(within(list).getByRole('option', { name: /Other/ }))

    expect(useWindowStore.getState().activeWindowId).toBe(w2)
    expect(editorOne.value).toBe('Mine')
    expect(linkedNoteId(w1)).not.toBe(linkedNoteId(w2))
  })

  it('Delete in File > Open… asks first, and Cancel keeps the note', async () => {
    addNote({ content: 'Old draft' })
    addNote({ content: 'Current' })
    render(<NotesApp windowId={openNotesWindow()} />)

    const dialog = openFileOpen()
    const option = within(dialog).getByRole('option', { name: /Old draft/ })
    fireEvent.click(option)
    fireEvent.keyDown(option, { key: 'Delete' })

    const confirm = screen.getByRole('alertdialog', { name: 'Delete note' })
    expect(within(confirm).getByRole('button', { name: 'Cancel' }).className).toContain('default')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(listNotes().map((n) => n.title)).toContain('Old draft')
  })

  it('confirming Delete removes the note from the list and storage', async () => {
    addNote({ content: 'Old draft' })
    addNote({ content: 'Current' })
    render(<NotesApp windowId={openNotesWindow()} />)

    const dialog = openFileOpen()
    const option = within(dialog).getByRole('option', { name: /Old draft/ })
    fireEvent.click(option)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Delete note' })).getByRole('button', {
        name: 'Delete',
      }),
    )

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(listNotes().map((n) => n.title)).toEqual(['Current'])
    expect(within(dialog).queryByRole('option', { name: /Old draft/ })).toBeNull()
  })

  it('deleting the note this window shows leaves the window on a fresh blank note', async () => {
    const only = addNote({ content: 'Only note' })
    const w = openNotesWindow()
    render(<NotesApp windowId={w} />)
    expect(editor().value).toBe('Only note')

    const dialog = openFileOpen()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Delete note' })).getByRole('button', {
        name: 'Delete',
      }),
    )

    await waitFor(() => expect(editor().value).toBe(''))
    expect(linkedNoteId(w)).not.toBe(only.id)
    expect(getNote(only.id)).toBeNull()
    expect(listNotes()).toHaveLength(1)
  })

  it('File > New starts a blank note and keeps the previous one', () => {
    const w = openNotesWindow()
    render(<NotesApp windowId={w} />)
    fireEvent.change(editor(), { target: { value: 'First words' } })
    fireEvent.keyDown(editor(), { key: 's', ctrlKey: true })
    const firstId = linkedNoteId(w)

    pickItem(openMenu('file'), /^New/)
    expect(editor().value).toBe('')
    expect(linkedNoteId(w)).not.toBe(firstId)
    expect(getNote(firstId).content).toBe('First words')
    expect(listNotes()).toHaveLength(2)
  })

  it('migrates legacy per-window notes once and drops the old keys', () => {
    localStorage.setItem('nexus-os:note-notes-old1', JSON.stringify({ content: 'Legacy one' }))
    localStorage.setItem('nexus-os:note-notes-old2', JSON.stringify({ content: '' }))
    localStorage.setItem('nexus-os:notes:strayBody12', JSON.stringify({ content: 'orphan' }))

    render(<NotesApp windowId="notes-old1" />)

    expect(editor().value).toBe('Legacy one')
    expect(localStorage.getItem('nexus-os:note-notes-old1')).toBeNull()
    expect(localStorage.getItem('nexus-os:note-notes-old2')).toBeNull()
    expect(localStorage.getItem('nexus-os:notes:strayBody12')).toBeNull()
    expect(listNotes().map((n) => n.title)).toEqual(['Legacy one'])
  })

  it('says so when a save cannot be written', () => {
    vi.useFakeTimers()
    render(<NotesApp windowId={openNotesWindow()} />)
    const quota = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    fireEvent.change(editor(), { target: { value: 'cannot save' } })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByRole('status').textContent).toBe('Couldn’t save. Storage is full.')
    quota.mockRestore()
  })
})
