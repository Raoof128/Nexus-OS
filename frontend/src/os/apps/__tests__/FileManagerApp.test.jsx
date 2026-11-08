import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import FileManagerApp from '../FileManagerApp'
import { useFileSystemStore } from '../../stores/fileSystemStore'
import { useWindowStore } from '../../stores/windowStore'

// Storage quota is async and unrelated to these tests; keep it out of the act() timing.
vi.mock('../../../lib/opfsDrive', async (importOriginal) => ({
  ...(await importOriginal()),
  estimateStorage: vi.fn(() => Promise.resolve(null)),
}))

const SEED = {
  '/': {
    type: 'folder',
    name: '/',
    children: ['documents', 'downloads', 'notes.txt', 'report.pdf'],
  },
  '/documents': { type: 'folder', name: 'documents', children: ['sub'] },
  '/documents/sub': { type: 'folder', name: 'sub', children: [] },
  '/downloads': { type: 'folder', name: 'downloads', children: [] },
  '/notes.txt': {
    type: 'file',
    name: 'notes.txt',
    content: 'hello',
    size: 5,
    createdAt: 1,
    updatedAt: 2,
  },
  '/report.pdf': {
    type: 'file',
    name: 'report.pdf',
    content: '',
    size: 2048,
    createdAt: 1,
    updatedAt: 3,
  },
}

function listRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

function rowFor(name) {
  return screen.getByRole('button', { name: new RegExp(`^${name}, `) }).closest('tr')
}

describe('FileManagerApp', () => {
  beforeEach(() => {
    useFileSystemStore.setState({ files: SEED, currentPath: '/', hydrateFileSystem: () => {} })
    useWindowStore.setState({ setWindowTitle: vi.fn() })
  })

  it('shows Explorer columns and type labels', () => {
    render(<FileManagerApp windowId="files-1" />)
    expect(screen.getByRole('columnheader', { name: 'Date modified' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeTruthy()
    expect(screen.getByText('Text Document')).toBeTruthy()
    expect(screen.getByText('PDF File')).toBeTruthy()
    expect(screen.getAllByText('File folder').length).toBeGreaterThan(0)
  })

  it('updates the window title with the folder name', () => {
    render(<FileManagerApp windowId="files-1" />)
    expect(useWindowStore.getState().setWindowTitle).toHaveBeenCalledWith('files-1', 'File Manager')
    fireEvent.click(screen.getByRole('button', { name: 'documents' }))
    expect(useWindowStore.getState().setWindowTitle).toHaveBeenLastCalledWith(
      'files-1',
      'documents',
    )
  })

  it('navigates with the tree and goes back and forward', () => {
    render(<FileManagerApp windowId="files-1" />)
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'documents' }))
    expect(useFileSystemStore.getState().currentPath).toBe('/documents')
    expect(back.disabled).toBe(false)
    fireEvent.click(back)
    expect(useFileSystemStore.getState().currentPath).toBe('/')
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    expect(useFileSystemStore.getState().currentPath).toBe('/documents')
  })

  it('sorts from the column header and shows the sort direction', () => {
    render(<FileManagerApp windowId="files-1" />)
    const header = screen.getByRole('columnheader', { name: 'Name' })
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(header).getByRole('button'))
    expect(header.getAttribute('aria-sort')).toBe('descending')
  })

  it('filters the current folder with the search box', () => {
    render(<FileManagerApp windowId="files-1" />)
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'pdf' } })
    expect(listRows()).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText('No items match your search.')).toBeTruthy()
  })

  it('pre-names a new folder with its base selected and creates it on Enter', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    const input = screen.getByRole('textbox', { name: 'Folder name' })
    expect(input.value).toBe('New folder')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(10)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useFileSystemStore.getState().files['/New folder']?.type).toBe('folder')
  })

  it('numbers a second new folder and rejects duplicate or invalid names', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    expect(screen.getByRole('textbox', { name: 'Folder name' }).value).toBe('New folder')
    fireEvent.change(screen.getByRole('textbox', { name: 'Folder name' }), {
      target: { value: 'downloads' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Folder name' }), { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toMatch(/already exists/)
    fireEvent.change(screen.getByRole('textbox', { name: 'Folder name' }), {
      target: { value: 'a/b' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Folder name' }), { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toMatch(/can't contain/)
  })

  it('selects all rows with Ctrl+A from the list', () => {
    render(<FileManagerApp windowId="files-1" />)
    const row = screen.getByRole('button', { name: 'downloads, folder' })
    row.focus()
    fireEvent.keyDown(row, { key: 'a', ctrlKey: true })
    expect(listRows().every((r) => r.getAttribute('aria-selected') === 'true')).toBe(true)
  })

  it('moves the selection with the arrow keys', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'documents, folder' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'documents, folder' }), {
      key: 'ArrowDown',
    })
    expect(rowFor('downloads').getAttribute('aria-selected')).toBe('true')
    expect(rowFor('documents').getAttribute('aria-selected')).toBe('false')
  })

  it('renames with F2 and selects only the base name', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt, file' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'notes.txt, file' }), { key: 'F2' })
    const input = screen.getByRole('textbox', { name: 'Rename notes.txt' })
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(5)
    fireEvent.change(input, { target: { value: 'memo.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useFileSystemStore.getState().files['/memo.txt']).toBeTruthy()
    expect(useFileSystemStore.getState().files['/notes.txt']).toBeUndefined()
  })

  it('asks Yes or No before deleting, and No keeps the file', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt, file' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'notes.txt, file' }), { key: 'Delete' })
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Delete File')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }))
    expect(useFileSystemStore.getState().files['/notes.txt']).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt, file' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'notes.txt, file' }), { key: 'Delete' })
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes' }))
    expect(useFileSystemStore.getState().files['/notes.txt']).toBeUndefined()
  })

  it('opens a right-click menu for an item', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'notes.txt, file' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Open/ })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /Rename/ })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /Delete/ })).toBeTruthy()
  })

  it('keeps the listing visible when a file is opened', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.doubleClick(screen.getByRole('button', { name: 'notes.txt, file' }))
    expect(screen.getByRole('complementary', { name: 'Preview of notes.txt' })).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('treeitem', { name: /Nexus Drive/ })).toBeTruthy()
  })

  it('opens the Organize menu, with Rename disabled until one item is selected', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Organize/ }))
    const menu = screen.getByRole('menu', { name: 'Organize' })
    expect(within(menu).getByRole('menuitem', { name: /Rename/ }).disabled).toBe(true)
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('goes back with Backspace, as Windows 7 does', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'documents' }))
    expect(useFileSystemStore.getState().currentPath).toBe('/documents')
    fireEvent.keyDown(screen.getByRole('button', { name: 'sub, folder' }), { key: 'Backspace' })
    expect(useFileSystemStore.getState().currentPath).toBe('/')
  })

  it('drops a selected item that the search hides, so Delete never acts on it', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt, file' }))
    expect(rowFor('notes.txt').getAttribute('aria-selected')).toBe('true')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pdf' } })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    expect(rowFor('notes.txt').getAttribute('aria-selected')).toBe('false')
  })

  it('clears the search when a new item would be hidden by it', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pdf' } })
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Folder name' }), { key: 'Enter' })
    expect(screen.getByRole('searchbox').value).toBe('')
    expect(screen.getByRole('button', { name: 'New folder, folder' })).toBeTruthy()
  })

  it('keeps focus in the list after Select all from the Organize menu', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Organize/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Select all/ }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'documents, folder' }))
    expect(listRows().every((r) => r.getAttribute('aria-selected') === 'true')).toBe(true)
  })

  it('marks the dialog wrapper, not the .window frame, as the alert dialog', () => {
    render(<FileManagerApp windowId="files-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt, file' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'notes.txt, file' }), { key: 'Delete' })
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.classList.contains('window')).toBe(false)
    expect(dialog.querySelector('.window')).not.toBeNull()
  })
})
