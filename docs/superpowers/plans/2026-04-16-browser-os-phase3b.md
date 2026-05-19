# Nexus Browser OS — Phase 3b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the final 2 apps — Terminal (API command interface) and File Manager (virtual filesystem) — completing all 8 OS apps.

**Architecture:** Both apps are frontend-only. Terminal runs predefined commands against existing API endpoints. File Manager uses a localStorage-based virtual filesystem with folder navigation and file CRUD. No backend changes.

**Tech Stack:** React 19, Zustand (existing), Tailwind CSS v4, Lucide React

---

## File Map

### New files

| File                                                       | Responsibility                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `frontend/src/os/apps/TerminalApp.jsx`                     | Terminal with command parser, history, output rendering               |
| `frontend/src/os/apps/FileManagerApp.jsx`                  | Virtual filesystem with folder tree, file list, viewer                |
| `frontend/src/os/stores/fileSystemStore.js`                | VFS state — folders, files, CRUD operations, localStorage persistence |
| `frontend/src/os/apps/__tests__/TerminalApp.test.jsx`      | Terminal tests                                                        |
| `frontend/src/os/stores/__tests__/fileSystemStore.test.js` | VFS store tests                                                       |

### Modified files

| File                                    | Change                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| `frontend/src/os/stores/appRegistry.js` | Swap PlaceholderApp for TerminalApp and FileManagerApp |

---

## Task 1: Terminal App

**Files:**

- Create: `frontend/src/os/apps/TerminalApp.jsx`
- Create: `frontend/src/os/apps/__tests__/TerminalApp.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/apps/__tests__/TerminalApp.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { email: 'dev@example.com', id: 'user-123' } },
  }),
}))

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) =>
    selector({
      windows: { media: { appId: 'media' }, chat: { appId: 'chat' } },
      zStack: ['media', 'chat'],
    }),
}))

import TerminalApp from '../TerminalApp'

describe('TerminalApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders input prompt', () => {
    render(<TerminalApp windowId="term-1" />)
    expect(screen.getByPlaceholderText('type a command...')).toBeDefined()
  })

  it('shows welcome message on mount', () => {
    render(<TerminalApp windowId="term-1" />)
    expect(screen.getByText(/Nexus Terminal/)).toBeDefined()
  })

  it('executes help command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    fireEvent.change(input, { target: { value: 'help' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText(/Available commands/)).toBeDefined()
  })

  it('executes whoami command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    fireEvent.change(input, { target: { value: 'whoami' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText(/dev@example.com/)).toBeDefined()
  })

  it('executes clear command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    // Run a command first
    fireEvent.change(input, { target: { value: 'whoami' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Clear
    fireEvent.change(input, { target: { value: 'clear' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Welcome message should be gone
    expect(screen.queryByText(/dev@example.com/)).toBeNull()
  })

  it('shows error for unknown command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    fireEvent.change(input, { target: { value: 'foobar' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText(/command not found: foobar/)).toBeDefined()
  })

  it('navigates command history with arrow keys', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    fireEvent.change(input, { target: { value: 'whoami' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'help' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Press up twice
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('help')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('whoami')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/apps/__tests__/TerminalApp.test.jsx
```

- [ ] **Step 3: Create the Terminal app**

Create `frontend/src/os/apps/TerminalApp.jsx`:

```jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useWindowStore } from '../stores/windowStore'

const API_URL = import.meta.env.VITE_API_URL

const WELCOME = [
  { type: 'system', text: '╔══════════════════════════════════════╗' },
  { type: 'system', text: '║  Nexus Terminal v1.0                 ║' },
  { type: 'system', text: '║  Type "help" for available commands   ║' },
  { type: 'system', text: '╚══════════════════════════════════════╝' },
  { type: 'info', text: '' },
]

function formatTimestamp() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function buildCommands({ session, windows, zStack }) {
  const user = session?.user

  return {
    help: {
      description: 'Show available commands',
      run: () => ({
        type: 'info',
        text: `Available commands:\n${Object.entries(buildCommands({ session, windows, zStack }))
          .map(([name, cmd]) => `  ${name.padEnd(14)} ${cmd.description}`)
          .join('\n')}`,
      }),
    },
    whoami: {
      description: 'Show current user info',
      run: () => ({
        type: 'info',
        text: `email:    ${user?.email || '—'}\nid:       ${user?.id || '—'}\nprovider: ${user?.app_metadata?.provider || 'email'}`,
      }),
    },
    clear: {
      description: 'Clear terminal output',
      run: () => ({ type: 'clear' }),
    },
    date: {
      description: 'Show current date and time',
      run: () => ({ type: 'info', text: new Date().toString() }),
    },
    uptime: {
      description: 'Show page uptime',
      run: () => {
        const ms = performance.now()
        const secs = Math.floor(ms / 1000)
        const mins = Math.floor(secs / 60)
        const hrs = Math.floor(mins / 60)
        return { type: 'info', text: `up ${hrs}h ${mins % 60}m ${secs % 60}s` }
      },
    },
    windows: {
      description: 'List open windows',
      run: () => {
        const lines = zStack
          .map((id) => {
            const w = windows[id]
            return w ? `  ${w.windowId.padEnd(20)} ${w.title.padEnd(16)} [${w.state}]` : null
          })
          .filter(Boolean)
        return { type: 'info', text: lines.length > 0 ? lines.join('\n') : 'No windows open' }
      },
    },
    echo: {
      description: 'Echo text back',
      run: (args) => ({ type: 'info', text: args || '' }),
    },
    healthz: {
      description: 'Check API health',
      run: async () => {
        try {
          const start = performance.now()
          const res = await fetch(`${API_URL}/healthz`, { signal: AbortSignal.timeout(5000) })
          const latency = Math.round(performance.now() - start)
          if (res.ok) {
            return { type: 'success', text: `API is online (${latency}ms)` }
          }
          return { type: 'error', text: `API returned ${res.status} (${latency}ms)` }
        } catch (err) {
          return { type: 'error', text: `API unreachable: ${err.message}` }
        }
      },
    },
    neofetch: {
      description: 'Show system info',
      run: () => ({
        type: 'info',
        text: [
          `  ╔═══╗`,
          `  ║ N ║   nexus-os@1.0.0`,
          `  ╚═══╝   ──────────────`,
          `          OS: Nexus Browser OS`,
          `          Shell: nexus-terminal`,
          `          Resolution: ${window.innerWidth}x${window.innerHeight}`,
          `          Browser: ${navigator.userAgent.split(' ').pop()}`,
          `          Memory: ${performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : '—'}`,
          `          Windows: ${Object.keys(windows).length}`,
          `          User: ${user?.email || '—'}`,
        ].join('\n'),
      }),
    },
  }
}

export default function TerminalApp({ windowId }) {
  const { session } = useAuth()
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)

  const [lines, setLines] = useState(WELCOME)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)

  const commands = buildCommands({ session, windows, zStack })

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  // Focus input on click anywhere
  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const executeCommand = useCallback(
    async (raw) => {
      const trimmed = raw.trim()
      if (!trimmed) return

      // Add command to output
      setLines((prev) => [...prev, { type: 'command', text: trimmed }])
      setHistory((prev) => [...prev, trimmed])
      setHistoryIdx(-1)
      setInput('')

      const [cmdName, ...argParts] = trimmed.split(/\s+/)
      const args = argParts.join(' ')
      const cmd = commands[cmdName.toLowerCase()]

      if (!cmd) {
        setLines((prev) => [...prev, { type: 'error', text: `command not found: ${cmdName}` }])
        return
      }

      const result = await cmd.run(args)

      if (result.type === 'clear') {
        setLines([])
        return
      }

      setLines((prev) => [...prev, result])
    },
    [commands],
  )

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        executeCommand(input)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (history.length === 0) return
        const newIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1)
        setHistoryIdx(newIdx)
        setInput(history[newIdx])
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (historyIdx === -1) return
        const newIdx = historyIdx + 1
        if (newIdx >= history.length) {
          setHistoryIdx(-1)
          setInput('')
        } else {
          setHistoryIdx(newIdx)
          setInput(history[newIdx])
        }
      }
    },
    [input, history, historyIdx, executeCommand],
  )

  const lineColors = {
    command: 'text-primary',
    info: 'text-white/70',
    success: 'text-green-400',
    error: 'text-red-400',
    system: 'text-cyan-400/60',
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-[#0a0a0a] font-mono text-xs"
      onClick={handleContainerClick}
    >
      {/* Output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-0.5">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            {line.type === 'command' && (
              <span className="mr-2 text-primary/60 select-none">{formatTimestamp()} $</span>
            )}
            <pre
              className={`whitespace-pre-wrap break-all ${lineColors[line.type] || 'text-white/70'}`}
            >
              {line.text}
            </pre>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.04] bg-black/40 px-3 py-2">
        <span className="text-primary/60 select-none">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="type a command..."
          autoFocus
          className="flex-1 bg-transparent text-white/80 placeholder-muted-foreground/30 focus:outline-none caret-primary"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/apps/__tests__/TerminalApp.test.jsx
```

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/apps/TerminalApp.jsx frontend/src/os/apps/__tests__/TerminalApp.test.jsx
git commit -m "feat: add Terminal app with command parser, history, and API commands"
```

---

## Task 2: File System Store

**Files:**

- Create: `frontend/src/os/stores/fileSystemStore.js`
- Create: `frontend/src/os/stores/__tests__/fileSystemStore.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/stores/__tests__/fileSystemStore.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/fileSystemStore.test.js
```

- [ ] **Step 3: Create the file system store**

Create `frontend/src/os/stores/fileSystemStore.js`:

```js
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
      const { [entryPath]: removed, ...restFiles } = state.files
      return {
        files: {
          ...restFiles,
          [parentPath]: {
            ...parent,
            children: parent.children.filter((c) => c !== name),
          },
        },
      }
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
      const { [oldPath]: removed, ...restFiles } = state.files
      return {
        files: {
          ...restFiles,
          [parentPath]: {
            ...parent,
            children: parent.children.map((c) => (c === oldName ? newName : c)),
          },
          [newPath]: { ...entry, name: newName },
        },
      }
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
      // Corrupt data
    }
  },
}))

// Debounced persistence
let fsSaveTimeout = null
useFileSystemStore.subscribe((state) => {
  if (fsSaveTimeout) clearTimeout(fsSaveTimeout)
  fsSaveTimeout = setTimeout(() => {
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
      // Storage full
    }
  }, SAVE_DEBOUNCE_MS)
})
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/fileSystemStore.test.js
```

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/stores/fileSystemStore.js frontend/src/os/stores/__tests__/fileSystemStore.test.js
git commit -m "feat: add virtual filesystem store with CRUD, persistence, and hydration"
```

---

## Task 3: File Manager App

**Files:**

- Create: `frontend/src/os/apps/FileManagerApp.jsx`

- [ ] **Step 1: Create the File Manager app**

Create `frontend/src/os/apps/FileManagerApp.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  Home,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { useFileSystemStore } from '../stores/fileSystemStore'

function NewEntryDialog({ type, onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const label = type === 'file' ? 'File name' : 'Folder name'

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSubmit(name.trim())
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={label}
        autoFocus
        className="flex-1 bg-transparent font-mono text-[11px] text-white/80 placeholder-muted-foreground/30 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => name.trim() && onSubmit(name.trim())}
        className="text-primary hover:text-white"
      >
        <FilePlus size={12} />
      </button>
      <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-white">
        <X size={12} />
      </button>
    </div>
  )
}

function FileViewer({ file, onClose }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.04] bg-black/20 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <File size={12} className="text-primary" />
          <span className="heading-ui text-[10px] font-semibold text-white/80">{file.name}</span>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-white">
          <X size={12} />
        </button>
      </div>
      <pre className="flex-1 overflow-auto custom-scrollbar p-4 font-mono text-xs leading-relaxed text-white/70 whitespace-pre-wrap">
        {file.content || '(empty file)'}
      </pre>
    </div>
  )
}

export default function FileManagerApp() {
  const files = useFileSystemStore((s) => s.files)
  const currentPath = useFileSystemStore((s) => s.currentPath)
  const navigateTo = useFileSystemStore((s) => s.navigateTo)
  const createFile = useFileSystemStore((s) => s.createFile)
  const createFolder = useFileSystemStore((s) => s.createFolder)
  const deleteEntry = useFileSystemStore((s) => s.deleteEntry)
  const renameEntry = useFileSystemStore((s) => s.renameEntry)
  const hydrateFileSystem = useFileSystemStore((s) => s.hydrateFileSystem)

  const [creating, setCreating] = useState(null) // 'file' | 'folder' | null
  const [viewingFile, setViewingFile] = useState(null)
  const [renamingEntry, setRenamingEntry] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    hydrateFileSystem()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentFolder = files[currentPath]
  const children = currentFolder?.children || []

  const parentPath =
    currentPath === '/' ? null : currentPath.split('/').slice(0, -1).join('/') || '/'

  const handleCreate = useCallback(
    (name) => {
      if (creating === 'file') {
        createFile(currentPath, name, '')
      } else {
        createFolder(currentPath, name)
      }
      setCreating(null)
    },
    [creating, currentPath, createFile, createFolder],
  )

  const handleDelete = useCallback(
    (name) => {
      deleteEntry(currentPath, name)
    },
    [currentPath, deleteEntry],
  )

  const handleRenameStart = useCallback((name) => {
    setRenamingEntry(name)
    setRenameValue(name)
  }, [])

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue !== renamingEntry) {
      renameEntry(currentPath, renamingEntry, renameValue.trim())
    }
    setRenamingEntry(null)
  }, [currentPath, renamingEntry, renameValue, renameEntry])

  const buildPath = (name) => (currentPath === '/' ? `/${name}` : `${currentPath}/${name}`)

  if (viewingFile) {
    const fileData = files[viewingFile]
    if (fileData) {
      return <FileViewer file={fileData} onClose={() => setViewingFile(null)} />
    }
    setViewingFile(null)
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.04] bg-black/20 px-3 py-1.5">
        <div className="flex items-center gap-1">
          {parentPath !== null && (
            <button
              type="button"
              onClick={() => navigateTo(parentPath)}
              className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.03] hover:text-white"
              aria-label="Go up"
            >
              <ArrowLeft size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.03] hover:text-white"
            aria-label="Go home"
          >
            <Home size={12} />
          </button>
          <span className="ml-2 font-mono text-[10px] text-primary/60">{currentPath}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCreating('folder')}
            className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary"
            title="New folder"
          >
            <FolderPlus size={12} />
          </button>
          <button
            type="button"
            onClick={() => setCreating('file')}
            className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary"
            title="New file"
          >
            <FilePlus size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {creating && (
          <div className="mb-2">
            <NewEntryDialog
              type={creating}
              onSubmit={handleCreate}
              onCancel={() => setCreating(null)}
            />
          </div>
        )}

        {children.length === 0 && !creating && (
          <div className="flex h-32 items-center justify-center">
            <p className="font-mono text-[10px] text-muted-foreground/50">EMPTY_DIRECTORY</p>
          </div>
        )}

        {children.map((name) => {
          const entryPath = buildPath(name)
          const entry = files[entryPath]
          if (!entry) return null

          const isFolder = entry.type === 'folder'
          const Icon = isFolder ? Folder : File

          return (
            <div
              key={name}
              className="group flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
            >
              {renamingEntry === name ? (
                <div className="flex flex-1 items-center gap-2">
                  <Icon
                    size={14}
                    className={isFolder ? 'text-primary/60' : 'text-muted-foreground'}
                  />
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit()
                      if (e.key === 'Escape') setRenamingEntry(null)
                    }}
                    onBlur={handleRenameSubmit}
                    autoFocus
                    className="flex-1 bg-transparent font-mono text-[11px] text-white/80 focus:outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (isFolder) navigateTo(entryPath)
                    else setViewingFile(entryPath)
                  }}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <Icon
                    size={14}
                    className={isFolder ? 'text-primary/60' : 'text-muted-foreground'}
                  />
                  <span className="font-mono text-[11px] text-white/80">{name}</span>
                  {!isFolder && entry.updatedAt && (
                    <span className="ml-auto font-mono text-[9px] text-muted-foreground/40">
                      {new Date(entry.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </button>
              )}

              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handleRenameStart(name)}
                  className="rounded p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary"
                  title="Rename"
                >
                  <Pencil size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(name)}
                  className="rounded p-1 text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Status bar */}
      <div className="shrink-0 border-t border-white/[0.04] bg-black/20 px-3 py-1">
        <span className="font-mono text-[9px] text-muted-foreground/50">
          {children.length} item{children.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/apps/FileManagerApp.jsx
git commit -m "feat: add File Manager app with virtual filesystem, folder navigation, and file viewer"
```

---

## Task 4: Wire into registry + final test + push

**Files:**

- Modify: `frontend/src/os/stores/appRegistry.js`

- [ ] **Step 1: Update app registry**

In `frontend/src/os/stores/appRegistry.js`:

1. Add lazy imports:

```js
const TerminalApp = lazy(() => import('../apps/TerminalApp'))
const FileManagerApp = lazy(() => import('../apps/FileManagerApp'))
```

2. Update entries:

- `terminal`: change `component: PlaceholderApp` to `component: TerminalApp`
- `files`: change `component: PlaceholderApp` to `component: FileManagerApp`

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test
```

- [ ] **Step 3: Run build + lint**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build && npm run lint
```

- [ ] **Step 4: Fix any issues**

- [ ] **Step 5: Commit and push**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add -A && git commit -m "feat: wire Terminal and File Manager into registry — all 8 apps complete"
git push nexus-os codex/bootstrap
```

---

## Summary

| Task      | What it builds                                                   | Est. time   |
| --------- | ---------------------------------------------------------------- | ----------- |
| 1         | Terminal app (command parser, history, 9 commands) + tests       | 20 min      |
| 2         | File system store (VFS CRUD, persistence) + tests                | 15 min      |
| 3         | File Manager app (folder nav, file viewer, create/rename/delete) | 20 min      |
| 4         | Registry wiring + integration test + push                        | 10 min      |
| **Total** |                                                                  | **~65 min** |
