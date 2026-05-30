import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-in for OPFS so we can exercise importFile/deleteEntry blob
// cleanup without a real Origin Private File System (absent in jsdom).
const blobs = new Map()
vi.mock('../../../lib/opfsDrive', () => ({
  writeBlob: vi.fn(async (id, blob) => {
    blobs.set(id, blob)
    return true
  }),
  deleteBlob: vi.fn(async (id) => {
    blobs.delete(id)
    return true
  }),
}))

import { useFileSystemStore } from '../fileSystemStore'
import { writeBlob, deleteBlob } from '../../../lib/opfsDrive'

const resetTree = () =>
  useFileSystemStore.setState({
    files: {
      '/': { type: 'folder', name: '/', children: ['documents'] },
      '/documents': { type: 'folder', name: 'documents', children: [] },
    },
    currentPath: '/',
  })

function fakeFile(name, content = 'data', type = 'text/plain') {
  return { name, size: content.length, type, /* Blob-ish */ _content: content }
}

describe('fileSystemStore — OPFS import', () => {
  beforeEach(() => {
    blobs.clear()
    vi.clearAllMocks()
    resetTree()
  })

  it('imports a file: writes a blob and adds a referencing tree node', async () => {
    const path = await useFileSystemStore.getState().importFile('/documents', fakeFile('a.txt'))
    expect(path).toBe('/documents/a.txt')
    expect(writeBlob).toHaveBeenCalledTimes(1)
    const node = useFileSystemStore.getState().files['/documents/a.txt']
    expect(node.type).toBe('file')
    expect(node.blobId).toBeTruthy()
    expect(node.mime).toBe('text/plain')
    expect(useFileSystemStore.getState().files['/documents'].children).toContain('a.txt')
    // The blob actually landed in our fake OPFS under the node's id.
    expect(blobs.has(node.blobId)).toBe(true)
  })

  it('de-dupes a colliding file name', async () => {
    await useFileSystemStore.getState().importFile('/documents', fakeFile('a.txt'))
    const path2 = await useFileSystemStore.getState().importFile('/documents', fakeFile('a.txt'))
    expect(path2).toBe('/documents/a (1).txt')
    expect(useFileSystemStore.getState().files['/documents'].children).toEqual([
      'a.txt',
      'a (1).txt',
    ])
  })

  it('returns null and adds nothing when the blob write fails', async () => {
    writeBlob.mockResolvedValueOnce(false)
    const path = await useFileSystemStore.getState().importFile('/documents', fakeFile('b.txt'))
    expect(path).toBeNull()
    expect(useFileSystemStore.getState().files['/documents/b.txt']).toBeUndefined()
    expect(useFileSystemStore.getState().files['/documents'].children).not.toContain('b.txt')
  })

  it('deleting an imported file reclaims its OPFS blob', async () => {
    await useFileSystemStore.getState().importFile('/documents', fakeFile('c.txt'))
    const node = useFileSystemStore.getState().files['/documents/c.txt']
    useFileSystemStore.getState().deleteEntry('/documents', 'c.txt')
    expect(deleteBlob).toHaveBeenCalledWith(node.blobId)
    expect(useFileSystemStore.getState().files['/documents/c.txt']).toBeUndefined()
  })

  it('deleting a folder reclaims blobs of files inside it', async () => {
    useFileSystemStore.getState().createFolder('/documents', 'sub')
    await useFileSystemStore.getState().importFile('/documents/sub', fakeFile('d.txt'))
    const node = useFileSystemStore.getState().files['/documents/sub/d.txt']
    useFileSystemStore.getState().deleteEntry('/documents', 'sub')
    expect(deleteBlob).toHaveBeenCalledWith(node.blobId)
    expect(useFileSystemStore.getState().files['/documents/sub']).toBeUndefined()
  })

  it('rejects import into a non-folder path', async () => {
    const path = await useFileSystemStore.getState().importFile('/nonexistent', fakeFile('e.txt'))
    expect(path).toBeNull()
  })
})
