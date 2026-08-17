import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { writeBlob, deleteBlob } from '../../lib/opfsDrive'

const STORAGE_KEY = 'nexus-os:filesystem'
const SCHEMA_VERSION = 1
const SAVE_DEBOUNCE_MS = 500

const DEFAULT_FILES = {
  '/': { type: 'folder', name: '/', children: ['documents', 'downloads'] },
  '/documents': { type: 'folder', name: 'documents', children: [] },
  '/downloads': { type: 'folder', name: 'downloads', children: [] },
}

function buildPath(parentPath, name) {
  return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
}

function storageKeyForUser(userId) {
  return `${STORAGE_KEY}:${encodeURIComponent(userId)}`
}

function isValidEntryName(name) {
  return (
    typeof name === 'string' &&
    name === name.trim() &&
    name.length > 0 &&
    name.length <= 255 &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\')
  )
}

function availableName(children, requestedName) {
  if (!children.includes(requestedName)) return requestedName
  const dot = requestedName.lastIndexOf('.')
  const stem = dot > 0 ? requestedName.slice(0, dot) : requestedName
  const ext = dot > 0 ? requestedName.slice(dot) : ''
  let i = 1
  while (children.includes(`${stem} (${i})${ext}`)) i++
  return `${stem} (${i})${ext}`
}

function createDefaultFiles() {
  return Object.fromEntries(
    Object.entries(DEFAULT_FILES).map(([path, entry]) => [
      path,
      entry.type === 'folder' ? { ...entry, children: [...entry.children] } : { ...entry },
    ]),
  )
}

export const useFileSystemStore = create((set, get) => ({
  files: createDefaultFiles(),
  currentPath: '/',
  storageUserId: null,

  navigateTo: (path) => {
    const { files } = get()
    if (files[path] && files[path].type === 'folder') {
      set({ currentPath: path })
    }
  },

  createFile: (parentPath, name, content = '') => {
    const parent = get().files[parentPath]
    const filePath = buildPath(parentPath, name)
    if (
      !parent ||
      parent.type !== 'folder' ||
      !isValidEntryName(name) ||
      parent.children.includes(name) ||
      get().files[filePath]
    ) {
      return false
    }
    set((state) => {
      const currentParent = state.files[parentPath]
      if (
        !currentParent ||
        currentParent.type !== 'folder' ||
        currentParent.children.includes(name) ||
        state.files[filePath]
      ) {
        return state
      }
      return {
        files: {
          ...state.files,
          [parentPath]: { ...currentParent, children: [...currentParent.children, name] },
          [filePath]: { type: 'file', name, content, createdAt: Date.now(), updatedAt: Date.now() },
        },
      }
    })
    return true
  },

  createFolder: (parentPath, name) => {
    const parent = get().files[parentPath]
    const folderPath = buildPath(parentPath, name)
    if (
      !parent ||
      parent.type !== 'folder' ||
      !isValidEntryName(name) ||
      parent.children.includes(name) ||
      get().files[folderPath]
    ) {
      return false
    }
    set((state) => {
      const currentParent = state.files[parentPath]
      if (
        !currentParent ||
        currentParent.type !== 'folder' ||
        currentParent.children.includes(name) ||
        state.files[folderPath]
      ) {
        return state
      }
      return {
        files: {
          ...state.files,
          [parentPath]: { ...currentParent, children: [...currentParent.children, name] },
          [folderPath]: { type: 'folder', name, children: [] },
        },
      }
    })
    return true
  },

  updateFileContent: (filePath, content) => {
    set((state) => {
      const file = state.files[filePath]
      if (!file || file.type !== 'file') return state
      return {
        files: {
          ...state.files,
          [filePath]: { ...file, content, updatedAt: Date.now() },
        },
      }
    })
  },

  deleteEntry: (parentPath, name) => {
    set((state) => {
      const parent = state.files[parentPath]
      if (!parent) return state
      const entryPath = buildPath(parentPath, name)
      // Remove the entry AND all descendant keys
      const newFiles = {}
      for (const [k, v] of Object.entries(state.files)) {
        if (k !== entryPath && !k.startsWith(entryPath + '/')) {
          newFiles[k] = v
        } else if (v.blobId) {
          // Reclaim any OPFS blobs owned by the removed subtree so they don't
          // leak storage after their tree node is gone. Fire-and-forget — the
          // tree is the source of truth, an orphaned blob is harmless if it slips.
          deleteBlob(v.blobId)
        }
      }
      newFiles[parentPath] = {
        ...parent,
        children: parent.children.filter((c) => c !== name),
      }
      return { files: newFiles }
    })
  },

  // Import a real File/Blob from disk into the current OPFS-backed drive. The
  // bytes live in OPFS (keyed by an opaque blobId); the tree node holds only
  // metadata. Returns the new file path, or null if the write failed (e.g.
  // OPFS unsupported) so the caller can surface an error instead of a ghost.
  importFile: async (parentPath, file) => {
    const parent = get().files[parentPath]
    if (!parent || parent.type !== 'folder') return null

    // De-dupe the name within the folder ("photo.png" → "photo (1).png").
    const requestedName = file.name || `import-${Date.now()}`
    if (!isValidEntryName(requestedName)) return null
    let name = availableName(parent.children, requestedName)

    const blobId = nanoid(16)
    const ok = await writeBlob(blobId, file)
    if (!ok) return null

    let filePath = null
    let committed = false
    set((state) => {
      const p = state.files[parentPath]
      if (!p || p.type !== 'folder') return state

      // Another import may have completed while this blob was being written.
      // Resolve the final name against the current tree so neither file nor blob
      // is silently overwritten or orphaned.
      name = availableName(p.children, requestedName)
      filePath = buildPath(parentPath, name)
      committed = true
      return {
        files: {
          ...state.files,
          [parentPath]: { ...p, children: [...p.children, name] },
          [filePath]: {
            type: 'file',
            name,
            blobId,
            size: file.size ?? 0,
            mime: file.type || 'application/octet-stream',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      }
    })
    if (!committed) {
      await deleteBlob(blobId)
      return null
    }
    return filePath
  },

  renameEntry: (parentPath, oldName, newName) => {
    const parent = get().files[parentPath]
    const oldPath = buildPath(parentPath, oldName)
    const newPath = buildPath(parentPath, newName)
    if (
      !parent ||
      parent.type !== 'folder' ||
      !get().files[oldPath] ||
      !isValidEntryName(newName) ||
      newName === oldName ||
      parent.children.includes(newName) ||
      get().files[newPath]
    ) {
      return false
    }
    set((state) => {
      const currentParent = state.files[parentPath]
      if (!currentParent || currentParent.type !== 'folder' || state.files[newPath]) return state
      const entry = state.files[oldPath]
      if (!entry) return state
      // Remap the entry key AND all descendant keys
      const newFiles = {}
      for (const [k, v] of Object.entries(state.files)) {
        if (k === oldPath) {
          newFiles[newPath] = { ...v, name: newName }
        } else if (k.startsWith(oldPath + '/')) {
          const newKey = newPath + k.slice(oldPath.length)
          newFiles[newKey] = v
        } else {
          newFiles[k] = v
        }
      }
      newFiles[parentPath] = {
        ...currentParent,
        children: currentParent.children.map((c) => (c === oldName ? newName : c)),
      }
      return { files: newFiles }
    })
    return true
  },

  hydrateFileSystem: (userId) => {
    if (typeof userId !== 'string' || !userId) {
      set({ files: createDefaultFiles(), currentPath: '/', storageUserId: null })
      return
    }
    try {
      const raw = localStorage.getItem(storageKeyForUser(userId))
      if (!raw) {
        set({ files: createDefaultFiles(), currentPath: '/', storageUserId: userId })
        return
      }
      const saved = JSON.parse(raw)
      if (!saved || saved.schemaVersion !== SCHEMA_VERSION) {
        set({ files: createDefaultFiles(), currentPath: '/', storageUserId: userId })
        return
      }
      if (saved.files) {
        set({ files: saved.files, currentPath: saved.currentPath || '/', storageUserId: userId })
      } else {
        set({ files: createDefaultFiles(), currentPath: '/', storageUserId: userId })
      }
    } catch {
      // Corrupt data must not leave another account's in-memory tree visible.
      set({ files: createDefaultFiles(), currentPath: '/', storageUserId: userId })
    }
  },

  resetPrivateState: () =>
    set({ files: createDefaultFiles(), currentPath: '/', storageUserId: null }),
}))

// Debounced persistence — only save when `files` actually changes
let fsSaveTimeout = null
let lastSavedFiles = null
useFileSystemStore.subscribe((state) => {
  if (!state.storageUserId) {
    if (fsSaveTimeout) clearTimeout(fsSaveTimeout)
    fsSaveTimeout = null
    lastSavedFiles = null
    return
  }
  if (state.files === lastSavedFiles) return
  if (fsSaveTimeout) clearTimeout(fsSaveTimeout)
  fsSaveTimeout = setTimeout(() => {
    lastSavedFiles = state.files
    try {
      localStorage.setItem(
        storageKeyForUser(state.storageUserId),
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          files: state.files,
          currentPath: state.currentPath,
        }),
      )
    } catch {
      // Storage full — silently ignore
    }
  }, SAVE_DEBOUNCE_MS)
})
