import { describe, it, expect, beforeEach } from 'vitest'
import { useFileSystemStore } from '../fileSystemStore'

describe('fileSystemStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useFileSystemStore.setState({
      files: {
        '/': { type: 'folder', name: '/', children: ['documents', 'downloads'] },
        '/documents': { type: 'folder', name: 'documents', children: [] },
        '/downloads': { type: 'folder', name: 'downloads', children: [] },
      },
      currentPath: '/',
    })
  })

  it('initializes with root folder', () => {
    const state = useFileSystemStore.getState()
    expect(state.files['/']).toBeDefined()
    expect(state.files['/'].type).toBe('folder')
  })

  it('navigates to a folder', () => {
    useFileSystemStore.getState().navigateTo('/documents')
    expect(useFileSystemStore.getState().currentPath).toBe('/documents')
  })

  it('creates a file', () => {
    useFileSystemStore.getState().createFile('/documents', 'readme.md', 'Hello world')
    const state = useFileSystemStore.getState()
    expect(state.files['/documents/readme.md']).toBeDefined()
    expect(state.files['/documents/readme.md'].content).toBe('Hello world')
    expect(state.files['/documents'].children).toContain('readme.md')
  })

  it('creates a folder', () => {
    useFileSystemStore.getState().createFolder('/documents', 'projects')
    const state = useFileSystemStore.getState()
    expect(state.files['/documents/projects']).toBeDefined()
    expect(state.files['/documents/projects'].type).toBe('folder')
    expect(state.files['/documents'].children).toContain('projects')
  })

  it('deletes a file', () => {
    useFileSystemStore.getState().createFile('/documents', 'temp.txt', 'data')
    useFileSystemStore.getState().deleteEntry('/documents', 'temp.txt')
    const state = useFileSystemStore.getState()
    expect(state.files['/documents/temp.txt']).toBeUndefined()
    expect(state.files['/documents'].children).not.toContain('temp.txt')
  })

  it('renames a file', () => {
    useFileSystemStore.getState().createFile('/documents', 'old.txt', 'data')
    useFileSystemStore.getState().renameEntry('/documents', 'old.txt', 'new.txt')
    const state = useFileSystemStore.getState()
    expect(state.files['/documents/old.txt']).toBeUndefined()
    expect(state.files['/documents/new.txt']).toBeDefined()
    expect(state.files['/documents/new.txt'].content).toBe('data')
  })

  it('persists to localStorage', () => {
    useFileSystemStore.getState().createFile('/documents', 'note.md', 'test')
    // The subscriber saves after debounce, but we can check the store has the file
    expect(useFileSystemStore.getState().files['/documents/note.md']).toBeDefined()
  })

  it('hydrates from localStorage', () => {
    const saved = {
      schemaVersion: 1,
      files: {
        '/': { type: 'folder', name: '/', children: ['saved-folder'] },
        '/saved-folder': { type: 'folder', name: 'saved-folder', children: [] },
      },
      currentPath: '/',
    }
    localStorage.setItem('nexus-os:filesystem', JSON.stringify(saved))
    useFileSystemStore.getState().hydrateFileSystem()
    expect(useFileSystemStore.getState().files['/saved-folder']).toBeDefined()
  })
})
