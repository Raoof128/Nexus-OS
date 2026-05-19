import { create } from 'zustand'

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
        }
      }
      newFiles[parentPath] = {
        ...parent,
        children: parent.children.filter((c) => c !== name),
      }
      return { files: newFiles }
    })
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
