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

export const useFileSystemStore = create((set, get) => ({
  files: { ...DEFAULT_FILES },
  currentPath: '/',

  navigateTo: (path) => {
    const { files } = get()
    if (files[path] && files[path].type === 'folder') {
      set({ currentPath: path })
    }
  },

  createFile: (parentPath, name, content = '') => {
    set((state) => {
      const parent = state.files[parentPath]
      if (!parent || parent.type !== 'folder') return state
      const filePath = buildPath(parentPath, name)
      return {
        files: {
          ...state.files,
          [parentPath]: { ...parent, children: [...parent.children, name] },
          [filePath]: { type: 'file', name, content, createdAt: Date.now(), updatedAt: Date.now() },
        },
      }
    })
  },

  createFolder: (parentPath, name) => {
    set((state) => {
      const parent = state.files[parentPath]
      if (!parent || parent.type !== 'folder') return state
      const folderPath = buildPath(parentPath, name)
      return {
        files: {
          ...state.files,
          [parentPath]: { ...parent, children: [...parent.children, name] },
          [folderPath]: { type: 'folder', name, children: [] },
        },
      }
    })
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
    let name = file.name || `import-${Date.now()}`
    if (parent.children.includes(name)) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let i = 1
      while (parent.children.includes(`${stem} (${i})${ext}`)) i++
      name = `${stem} (${i})${ext}`
    }

    const blobId = nanoid(16)
    const ok = await writeBlob(blobId, file)
    if (!ok) return null

    const filePath = buildPath(parentPath, name)
    set((state) => {
      const p = state.files[parentPath]
      if (!p || p.type !== 'folder') return state
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
    return filePath
  },

  renameEntry: (parentPath, oldName, newName) => {
    set((state) => {
      const parent = state.files[parentPath]
      if (!parent) return state
      const oldPath = buildPath(parentPath, oldName)
      const newPath = buildPath(parentPath, newName)
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
        ...parent,
        children: parent.children.map((c) => (c === oldName ? newName : c)),
      }
      return { files: newFiles }
    })
  },

  hydrateFileSystem: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved || saved.schemaVersion !== SCHEMA_VERSION) return
      if (saved.files) {
        set({ files: saved.files, currentPath: saved.currentPath || '/' })
      }
    } catch {
      // Corrupt data — leave defaults in place
    }
  },
}))

// Debounced persistence — only save when `files` actually changes
let fsSaveTimeout = null
let lastSavedFiles = null
useFileSystemStore.subscribe((state) => {
  if (state.files === lastSavedFiles) return
  if (fsSaveTimeout) clearTimeout(fsSaveTimeout)
  fsSaveTimeout = setTimeout(() => {
    lastSavedFiles = state.files
    try {
      localStorage.setItem(
        STORAGE_KEY,
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
