# Nexus Browser OS — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tab-based SPA with a windowed desktop environment — OS shell, Zustand-managed window manager, taskbar, app launcher, and three existing apps (Media, Email, Chat) rendered inside draggable/resizable windows.

**Architecture:** A new `frontend/src/os/` directory contains the OS kernel (Zustand window store), app registry, and shell components (Desktop, Window, Taskbar, AppLauncher). `App.jsx` delegates post-auth rendering to `<Desktop />`. Existing app components are wrapped in `<Window>` frames with container query migration so they respond to window size, not viewport size. Modals use React portals to escape Framer Motion's `transform` containing block.

**Tech Stack:** React 19, Zustand (new), Framer Motion 12 (existing), Tailwind CSS v4 with `@container` queries, nanoid (new), Lucide React (existing)

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `frontend/src/os/stores/windowStore.js` | Zustand kernel — window state, z-stack, focus, mobile detection |
| `frontend/src/os/stores/appRegistry.js` | Static app manifest definitions (id, icon, singleton, sizes, lazy component) |
| `frontend/src/os/Desktop.jsx` | Root OS component — renders wallpaper, windows, taskbar, launcher |
| `frontend/src/os/components/Window.jsx` | Draggable/resizable window frame with title bar, resize handles, container query wrapper |
| `frontend/src/os/components/Taskbar.jsx` | Bottom bar — launcher button, open app tabs, system tray |
| `frontend/src/os/components/AppLauncher.jsx` | Start menu grid of app icons |
| `frontend/src/os/components/PlaceholderApp.jsx` | "Coming Soon" placeholder for unbuilt apps |
| `frontend/src/os/stores/__tests__/windowStore.test.js` | Unit tests for window store |
| `frontend/src/os/components/__tests__/Window.test.jsx` | Component tests for Window |
| `frontend/src/os/components/__tests__/Taskbar.test.jsx` | Component tests for Taskbar |
| `frontend/src/os/components/__tests__/AppLauncher.test.jsx` | Component tests for AppLauncher |
| `frontend/src/os/components/__tests__/Desktop.test.jsx` | Component tests for Desktop |

### Modified files

| File | Change |
|---|---|
| `frontend/index.html` | Add `<div id="modal-root"></div>` |
| `frontend/package.json` | Add `zustand` and `nanoid` dependencies |
| `frontend/src/App.jsx` | Post-auth render delegates to `<Desktop />` |
| `frontend/src/components/features/KanbanBoard.jsx` | Container query migration (`h-full`, `@md:`, `@lg:`) |
| `frontend/src/components/features/MediaVault.jsx` | Container query migration |
| `frontend/src/components/features/EmailInbox.jsx` | Container query migration |
| `frontend/src/components/features/ChatLayout.jsx` | Container query migration |
| `frontend/src/components/features/MediaDetailModal.jsx` | Portal to `#modal-root` |
| `frontend/src/components/features/EditMediaDialog.jsx` | Portal to `#modal-root` |
| `frontend/src/components/features/AddMediaDialog.jsx` | Portal dialog overlay to `#modal-root` |
| `frontend/src/components/features/ComposeModal.jsx` | Portal to `#modal-root` |
| `frontend/src/components/features/AICmdPalette.jsx` | Portal to `#modal-root` |
| `frontend/vite.config.js` | Add `zustand` to manual chunks |

---

## Task 1: Install dependencies and add modal-root

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/index.html`
- Modify: `frontend/vite.config.js`

- [ ] **Step 1: Install zustand and nanoid**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm install zustand nanoid
```

- [ ] **Step 2: Add modal-root div to index.html**

In `frontend/index.html`, add `<div id="modal-root"></div>` after the existing `<div id="root"></div>`:

```html
    <div id="root"></div>
    <div id="modal-root"></div>
    <script type="module" src="/src/main.jsx"></script>
```

- [ ] **Step 3: Add zustand to Vite manual chunks**

In `frontend/vite.config.js`, add a `state` chunk to the `manualChunks` config:

```js
manualChunks: {
  observability: ['@sentry/react'],
  query: ['@tanstack/react-query'],
  ui: ['framer-motion', 'lucide-react'],
  state: ['zustand'],
},
```

- [ ] **Step 4: Verify build still works**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/package.json frontend/package-lock.json frontend/index.html frontend/vite.config.js
git commit -m "chore: add zustand, nanoid deps and modal-root div for OS shell"
```

---

## Task 2: Window Store (Zustand kernel)

**Files:**
- Create: `frontend/src/os/stores/windowStore.js`
- Create: `frontend/src/os/stores/__tests__/windowStore.test.js`

- [ ] **Step 1: Write failing tests for the window store**

Create `frontend/src/os/stores/__tests__/windowStore.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

// We need to mock appRegistry before importing the store
vi.mock('../appRegistry', () => ({
  APP_REGISTRY: {
    media: {
      id: 'media',
      title: 'Media Vault',
      singleton: true,
      defaultSize: { width: 1000, height: 700 },
      minSize: { width: 600, height: 400 },
    },
    terminal: {
      id: 'terminal',
      title: 'Terminal',
      singleton: false,
      defaultSize: { width: 700, height: 450 },
      minSize: { width: 400, height: 250 },
    },
    chat: {
      id: 'chat',
      title: 'AI Chat',
      singleton: true,
      defaultSize: { width: 800, height: 600 },
      minSize: { width: 400, height: 400 },
    },
  },
}))

// Mock window.innerWidth/innerHeight for bounded defaults
Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true })
Object.defineProperty(window, 'innerHeight', { value: 900, writable: true })

const { useWindowStore } = await import('../windowStore')

describe('windowStore', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: {},
      zStack: [],
      activeWindowId: null,
      isMobile: false,
      launcherOpen: false,
    })
  })

  describe('openApp', () => {
    it('creates a new window for a registered app', () => {
      useWindowStore.getState().openApp('media')
      const state = useWindowStore.getState()
      expect(Object.keys(state.windows)).toHaveLength(1)
      expect(state.windows.media).toBeDefined()
      expect(state.windows.media.appId).toBe('media')
      expect(state.windows.media.title).toBe('Media Vault')
      expect(state.windows.media.state).toBe('normal')
      expect(state.zStack).toEqual(['media'])
      expect(state.activeWindowId).toBe('media')
    })

    it('bounds default size to 80% of viewport', () => {
      window.innerWidth = 800
      window.innerHeight = 600
      useWindowStore.getState().openApp('media')
      const w = useWindowStore.getState().windows.media
      expect(w.size.width).toBe(640)  // 800 * 0.8
      expect(w.size.height).toBe(480) // 600 * 0.8
      window.innerWidth = 1440
      window.innerHeight = 900
    })

    it('focuses existing window for singleton apps', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      expect(useWindowStore.getState().activeWindowId).toBe('chat')
      openApp('media') // should focus, not create new
      expect(Object.keys(useWindowStore.getState().windows)).toHaveLength(2)
      expect(useWindowStore.getState().activeWindowId).toBe('media')
      expect(useWindowStore.getState().zStack[useWindowStore.getState().zStack.length - 1]).toBe('media')
    })

    it('creates multiple windows for non-singleton apps', () => {
      const { openApp } = useWindowStore.getState()
      openApp('terminal')
      openApp('terminal')
      const state = useWindowStore.getState()
      expect(Object.keys(state.windows)).toHaveLength(2)
      expect(state.zStack).toHaveLength(2)
    })

    it('does nothing for unregistered app', () => {
      useWindowStore.getState().openApp('nonexistent')
      expect(Object.keys(useWindowStore.getState().windows)).toHaveLength(0)
    })

    it('restores minimized singleton instead of creating new', () => {
      const store = useWindowStore.getState()
      store.openApp('media')
      store.minimizeWindow('media')
      expect(useWindowStore.getState().windows.media.state).toBe('minimized')
      useWindowStore.getState().openApp('media')
      expect(useWindowStore.getState().windows.media.state).toBe('normal')
      expect(Object.keys(useWindowStore.getState().windows)).toHaveLength(1)
    })
  })

  describe('closeWindow', () => {
    it('removes window and updates zStack', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      useWindowStore.getState().closeWindow('media')
      const state = useWindowStore.getState()
      expect(state.windows.media).toBeUndefined()
      expect(state.zStack).toEqual(['chat'])
    })

    it('sets activeWindowId to next topmost when closing active window', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      expect(useWindowStore.getState().activeWindowId).toBe('chat')
      useWindowStore.getState().closeWindow('chat')
      expect(useWindowStore.getState().activeWindowId).toBe('media')
    })

    it('sets activeWindowId to null when closing last window', () => {
      useWindowStore.getState().openApp('media')
      useWindowStore.getState().closeWindow('media')
      expect(useWindowStore.getState().activeWindowId).toBeNull()
    })
  })

  describe('focusWindow', () => {
    it('moves window to top of zStack', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      useWindowStore.getState().focusWindow('media')
      const state = useWindowStore.getState()
      expect(state.zStack).toEqual(['chat', 'media'])
      expect(state.activeWindowId).toBe('media')
    })

    it('restores minimized window when focused', () => {
      useWindowStore.getState().openApp('media')
      useWindowStore.getState().minimizeWindow('media')
      expect(useWindowStore.getState().windows.media.state).toBe('minimized')
      useWindowStore.getState().focusWindow('media')
      expect(useWindowStore.getState().windows.media.state).toBe('normal')
    })
  })

  describe('minimizeWindow', () => {
    it('sets state to minimized', () => {
      useWindowStore.getState().openApp('media')
      useWindowStore.getState().minimizeWindow('media')
      expect(useWindowStore.getState().windows.media.state).toBe('minimized')
    })

    it('passes focus to next visible window when minimizing active', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      useWindowStore.getState().minimizeWindow('chat')
      expect(useWindowStore.getState().activeWindowId).toBe('media')
    })

    it('sets activeWindowId to null when minimizing only window', () => {
      useWindowStore.getState().openApp('media')
      useWindowStore.getState().minimizeWindow('media')
      expect(useWindowStore.getState().activeWindowId).toBeNull()
    })
  })

  describe('maximizeWindow', () => {
    it('saves restoredRect and sets state to maximized', () => {
      useWindowStore.getState().openApp('media')
      const before = useWindowStore.getState().windows.media
      const prevPos = { ...before.position }
      const prevSize = { ...before.size }
      useWindowStore.getState().maximizeWindow('media')
      const after = useWindowStore.getState().windows.media
      expect(after.state).toBe('maximized')
      expect(after.restoredRect).toEqual({ ...prevPos, ...prevSize })
    })
  })

  describe('restoreWindow', () => {
    it('restores position and size from restoredRect', () => {
      useWindowStore.getState().openApp('media')
      const original = useWindowStore.getState().windows.media
      const origPos = { ...original.position }
      const origSize = { ...original.size }
      useWindowStore.getState().maximizeWindow('media')
      useWindowStore.getState().restoreWindow('media')
      const restored = useWindowStore.getState().windows.media
      expect(restored.state).toBe('normal')
      expect(restored.position).toEqual(origPos)
      expect(restored.size).toEqual(origSize)
    })
  })

  describe('moveWindow', () => {
    it('updates position', () => {
      useWindowStore.getState().openApp('media')
      useWindowStore.getState().moveWindow('media', { x: 100, y: 200 })
      expect(useWindowStore.getState().windows.media.position).toEqual({ x: 100, y: 200 })
    })

    it('clamps position to keep 100px of title bar visible', () => {
      useWindowStore.getState().openApp('media')
      // Try to move far off-screen to the right
      useWindowStore.getState().moveWindow('media', { x: 9999, y: 50 })
      const pos = useWindowStore.getState().windows.media.position
      // x should be clamped so at least 100px remains visible
      expect(pos.x).toBeLessThanOrEqual(window.innerWidth - 100)
    })
  })

  describe('resizeWindow', () => {
    it('updates size', () => {
      useWindowStore.getState().openApp('media')
      useWindowStore.getState().resizeWindow('media', { width: 800, height: 500 })
      expect(useWindowStore.getState().windows.media.size).toEqual({ width: 800, height: 500 })
    })

    it('clamps to minSize', () => {
      useWindowStore.getState().openApp('media')
      useWindowStore.getState().resizeWindow('media', { width: 100, height: 100 })
      const size = useWindowStore.getState().windows.media.size
      expect(size.width).toBe(600) // media minSize.width
      expect(size.height).toBe(400) // media minSize.height
    })
  })

  describe('setMobile', () => {
    it('sets isMobile flag', () => {
      useWindowStore.getState().setMobile(true)
      expect(useWindowStore.getState().isMobile).toBe(true)
      useWindowStore.getState().setMobile(false)
      expect(useWindowStore.getState().isMobile).toBe(false)
    })
  })

  describe('toggleLauncher', () => {
    it('toggles launcherOpen', () => {
      useWindowStore.getState().toggleLauncher()
      expect(useWindowStore.getState().launcherOpen).toBe(true)
      useWindowStore.getState().toggleLauncher()
      expect(useWindowStore.getState().launcherOpen).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/windowStore.test.js
```

Expected: FAIL — module `../windowStore` not found.

- [ ] **Step 3: Create the window store**

Create `frontend/src/os/stores/windowStore.js`:

```js
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { APP_REGISTRY } from './appRegistry'

const TASKBAR_HEIGHT = 48

function boundedSize(defaultSize) {
  return {
    width: Math.min(defaultSize.width, window.innerWidth * 0.8),
    height: Math.min(defaultSize.height, (window.innerHeight - TASKBAR_HEIGHT) * 0.8),
  }
}

function cascadePosition(zStack, size) {
  const offset = (zStack.length % 10) * 30
  return {
    x: Math.min(offset + 60, window.innerWidth - size.width),
    y: Math.min(offset + 40, window.innerHeight - TASKBAR_HEIGHT - size.height),
  }
}

function clampPosition(pos) {
  return {
    x: Math.max(-window.innerWidth + 100, Math.min(pos.x, window.innerWidth - 100)),
    y: Math.max(0, Math.min(pos.y, window.innerHeight - TASKBAR_HEIGHT - 40)),
  }
}

function findNextVisibleWindow(windows, zStack, excludeId) {
  for (let i = zStack.length - 1; i >= 0; i--) {
    const id = zStack[i]
    if (id !== excludeId && windows[id] && windows[id].state !== 'minimized') {
      return id
    }
  }
  return null
}

export const useWindowStore = create((set, get) => ({
  windows: {},
  zStack: [],
  activeWindowId: null,
  isMobile: false,
  launcherOpen: false,

  openApp: (appId) => {
    const manifest = APP_REGISTRY[appId]
    if (!manifest) return

    const { windows, zStack } = get()

    // Singleton check
    if (manifest.singleton) {
      const existing = Object.values(windows).find((w) => w.appId === appId)
      if (existing) {
        get().focusWindow(existing.windowId)
        return
      }
    }

    const windowId = manifest.singleton ? appId : `${appId}-${nanoid(6)}`
    const size = boundedSize(manifest.defaultSize)
    const position = cascadePosition(zStack, size)

    set((state) => ({
      windows: {
        ...state.windows,
        [windowId]: {
          windowId,
          appId,
          title: manifest.title,
          position,
          size,
          minSize: { ...manifest.minSize },
          state: 'normal',
          restoredRect: { ...position, ...size },
        },
      },
      zStack: [...state.zStack, windowId],
      activeWindowId: windowId,
    }))
  },

  closeWindow: (windowId) => {
    set((state) => {
      const { [windowId]: removed, ...rest } = state.windows
      if (!removed) return state
      const newZStack = state.zStack.filter((id) => id !== windowId)
      const newActive =
        state.activeWindowId === windowId
          ? findNextVisibleWindow(rest, newZStack, null)
          : state.activeWindowId
      return {
        windows: rest,
        zStack: newZStack,
        activeWindowId: newActive,
      }
    })
  },

  focusWindow: (windowId) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state

      const newZStack = [...state.zStack.filter((id) => id !== windowId), windowId]

      // Restore if minimized
      if (win.state === 'minimized') {
        return {
          windows: {
            ...state.windows,
            [windowId]: {
              ...win,
              state: 'normal',
              position: { ...win.restoredRect },
              size: { width: win.restoredRect.width, height: win.restoredRect.height },
            },
          },
          zStack: newZStack,
          activeWindowId: windowId,
        }
      }

      return {
        zStack: newZStack,
        activeWindowId: windowId,
      }
    })
  },

  minimizeWindow: (windowId) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state

      const newWindows = {
        ...state.windows,
        [windowId]: { ...win, state: 'minimized' },
      }

      const newActive =
        state.activeWindowId === windowId
          ? findNextVisibleWindow(newWindows, state.zStack, windowId)
          : state.activeWindowId

      return {
        windows: newWindows,
        activeWindowId: newActive,
      }
    })
  },

  maximizeWindow: (windowId) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state

      return {
        windows: {
          ...state.windows,
          [windowId]: {
            ...win,
            state: 'maximized',
            restoredRect: {
              x: win.position.x,
              y: win.position.y,
              width: win.size.width,
              height: win.size.height,
            },
          },
        },
      }
    })
  },

  restoreWindow: (windowId) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state

      return {
        windows: {
          ...state.windows,
          [windowId]: {
            ...win,
            state: 'normal',
            position: { x: win.restoredRect.x, y: win.restoredRect.y },
            size: { width: win.restoredRect.width, height: win.restoredRect.height },
          },
        },
      }
    })
  },

  moveWindow: (windowId, pos) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state
      return {
        windows: {
          ...state.windows,
          [windowId]: { ...win, position: clampPosition(pos) },
        },
      }
    })
  },

  resizeWindow: (windowId, size) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state
      return {
        windows: {
          ...state.windows,
          [windowId]: {
            ...win,
            size: {
              width: Math.max(size.width, win.minSize.width),
              height: Math.max(size.height, win.minSize.height),
            },
          },
        },
      }
    })
  },

  setMobile: (isMobile) => set({ isMobile }),

  toggleLauncher: () => set((state) => ({ launcherOpen: !state.launcherOpen })),
}))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/windowStore.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/stores/windowStore.js frontend/src/os/stores/__tests__/windowStore.test.js
git commit -m "feat: add Zustand window store (OS kernel) with full test coverage"
```

---

## Task 3: App Registry

**Files:**
- Create: `frontend/src/os/stores/appRegistry.js`
- Create: `frontend/src/os/components/PlaceholderApp.jsx`

- [ ] **Step 1: Create the placeholder app component**

Create `frontend/src/os/components/PlaceholderApp.jsx`:

```jsx
import { Construction } from 'lucide-react'

export default function PlaceholderApp({ appId }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
      <Construction size={48} className="text-primary/30" />
      <p className="heading-display text-sm tracking-[0.2em] text-primary/50">
        Coming Soon
      </p>
      <p className="font-mono text-xs text-muted-foreground/50">
        {appId}::init() — awaiting deployment
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Create the app registry**

Create `frontend/src/os/stores/appRegistry.js`:

```js
import { lazy } from 'react'
import {
  Activity,
  BookOpen,
  FolderOpen,
  Mail,
  MessageSquare,
  Settings,
  StickyNote,
  TerminalSquare,
} from 'lucide-react'

// Lazy-load real app components
const MediaApp = lazy(() => import('../../components/features/MediaApp'))
const EmailInbox = lazy(() => import('../../components/features/EmailInbox'))
const ChatLayout = lazy(() => import('../../components/features/ChatLayout'))

// Lazy-load placeholder for unbuilt apps
const PlaceholderApp = lazy(() => import('../components/PlaceholderApp'))

export const APP_REGISTRY = {
  media: {
    id: 'media',
    title: 'Media Vault',
    icon: BookOpen,
    singleton: true,
    defaultSize: { width: 1000, height: 700 },
    minSize: { width: 600, height: 400 },
    component: MediaApp,
  },
  email: {
    id: 'email',
    title: 'Email',
    icon: Mail,
    singleton: true,
    defaultSize: { width: 1000, height: 700 },
    minSize: { width: 500, height: 400 },
    component: EmailInbox,
  },
  chat: {
    id: 'chat',
    title: 'AI Chat',
    icon: MessageSquare,
    singleton: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 400, height: 400 },
    component: ChatLayout,
  },
  terminal: {
    id: 'terminal',
    title: 'Terminal',
    icon: TerminalSquare,
    singleton: false,
    defaultSize: { width: 700, height: 450 },
    minSize: { width: 400, height: 250 },
    component: PlaceholderApp,
  },
  files: {
    id: 'files',
    title: 'File Manager',
    icon: FolderOpen,
    singleton: true,
    defaultSize: { width: 800, height: 550 },
    minSize: { width: 500, height: 350 },
    component: PlaceholderApp,
  },
  settings: {
    id: 'settings',
    title: 'Settings',
    icon: Settings,
    singleton: true,
    defaultSize: { width: 600, height: 500 },
    minSize: { width: 450, height: 400 },
    component: PlaceholderApp,
  },
  sysmon: {
    id: 'sysmon',
    title: 'System Monitor',
    icon: Activity,
    singleton: true,
    defaultSize: { width: 650, height: 450 },
    minSize: { width: 400, height: 300 },
    component: PlaceholderApp,
  },
  notes: {
    id: 'notes',
    title: 'Notes',
    icon: StickyNote,
    singleton: false,
    defaultSize: { width: 600, height: 500 },
    minSize: { width: 350, height: 300 },
    component: PlaceholderApp,
  },
}

/** Ordered list of app IDs for the launcher grid */
export const APP_ORDER = ['media', 'email', 'chat', 'terminal', 'files', 'settings', 'sysmon', 'notes']
```

Note: `MediaApp` doesn't exist yet — it will be created in Task 6 as a wrapper that extracts the media-specific logic from `App.jsx` into its own windowed component. For now, the registry references it so the architecture is correct. The test runner won't load this module until Task 6.

- [ ] **Step 3: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/stores/appRegistry.js frontend/src/os/components/PlaceholderApp.jsx
git commit -m "feat: add app registry with 8 manifests and placeholder component"
```

---

## Task 4: Window Component

**Files:**
- Create: `frontend/src/os/components/Window.jsx`
- Create: `frontend/src/os/components/__tests__/Window.test.jsx`

- [ ] **Step 1: Write failing tests for Window component**

Create `frontend/src/os/components/__tests__/Window.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onPointerDownCapture, style, ...rest }) => (
      <div data-testid="window-frame" onPointerDownCapture={onPointerDownCapture} style={style} {...rest}>
        {children}
      </div>
    ),
  },
  useDragControls: () => ({ start: vi.fn() }),
}))

// Mock the window store
const mockFocusWindow = vi.fn()
const mockCloseWindow = vi.fn()
const mockMinimizeWindow = vi.fn()
const mockMaximizeWindow = vi.fn()
const mockRestoreWindow = vi.fn()

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      activeWindowId: 'test-win',
      isMobile: false,
      focusWindow: mockFocusWindow,
      closeWindow: mockCloseWindow,
      minimizeWindow: mockMinimizeWindow,
      maximizeWindow: mockMaximizeWindow,
      restoreWindow: mockRestoreWindow,
    }
    return selector(state)
  },
}))

import Window from '../Window'

describe('Window', () => {
  const defaultProps = {
    windowId: 'test-win',
    appId: 'media',
    title: 'Media Vault',
    position: { x: 100, y: 50 },
    size: { width: 800, height: 600 },
    minSize: { width: 400, height: 300 },
    state: 'normal',
    restoredRect: { x: 100, y: 50, width: 800, height: 600 },
    zIndex: 101,
    desktopRef: { current: document.createElement('div') },
    children: <div data-testid="app-content">App Content</div>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title bar with app title', () => {
    render(<Window {...defaultProps} />)
    expect(screen.getByText('Media Vault')).toBeDefined()
  })

  it('renders children inside content area', () => {
    render(<Window {...defaultProps} />)
    expect(screen.getByTestId('app-content')).toBeDefined()
  })

  it('renders close, minimize, maximize buttons', () => {
    render(<Window {...defaultProps} />)
    expect(screen.getByLabelText('Close window')).toBeDefined()
    expect(screen.getByLabelText('Minimize window')).toBeDefined()
    expect(screen.getByLabelText('Maximize window')).toBeDefined()
  })

  it('calls closeWindow when close button clicked', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Close window'))
    expect(mockCloseWindow).toHaveBeenCalledWith('test-win')
  })

  it('calls minimizeWindow when minimize button clicked', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Minimize window'))
    expect(mockMinimizeWindow).toHaveBeenCalledWith('test-win')
  })

  it('calls maximizeWindow when maximize button clicked', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Maximize window'))
    expect(mockMaximizeWindow).toHaveBeenCalledWith('test-win')
  })

  it('calls restoreWindow when maximize clicked on maximized window', () => {
    render(<Window {...defaultProps} state="maximized" />)
    fireEvent.click(screen.getByLabelText('Restore window'))
    expect(mockRestoreWindow).toHaveBeenCalledWith('test-win')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/Window.test.jsx
```

Expected: FAIL — `../Window` not found.

- [ ] **Step 3: Create the Window component**

Create `frontend/src/os/components/Window.jsx`:

```jsx
import { memo, useCallback, useRef } from 'react'
import { motion as Motion, useDragControls } from 'framer-motion'
import { Minus, Square, X } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY } from '../stores/appRegistry'

const TITLEBAR_HEIGHT = 36
const TASKBAR_HEIGHT = 48
const RESIZE_HANDLE_SIZE = 8

function ResizeHandle({ direction, windowId, position, size, minSize }) {
  const resizeWindow = useWindowStore((s) => s.resizeWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const startRef = useRef(null)

  const cursorMap = {
    n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize',
  }

  const positionStyles = {
    n: { top: 0, left: RESIZE_HANDLE_SIZE, right: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    s: { bottom: 0, left: RESIZE_HANDLE_SIZE, right: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    e: { right: 0, top: RESIZE_HANDLE_SIZE, bottom: RESIZE_HANDLE_SIZE, width: RESIZE_HANDLE_SIZE },
    w: { left: 0, top: RESIZE_HANDLE_SIZE, bottom: RESIZE_HANDLE_SIZE, width: RESIZE_HANDLE_SIZE },
    ne: { top: 0, right: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    nw: { top: 0, left: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    se: { bottom: 0, right: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    sw: { bottom: 0, left: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
  }

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    startRef.current = { x: e.clientX, y: e.clientY, ...position, ...size }
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
  }, [position, size])

  const handlePointerMove = useCallback((e) => {
    if (!startRef.current) return
    const s = startRef.current
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y

    let newX = s.x, newY = s.y, newW = s.width, newH = s.height
    // Keep variable names as position coords
    newX = position.x
    newY = position.y

    if (direction.includes('e')) newW = Math.max(minSize.width, s.width + dx)
    if (direction.includes('w')) {
      newW = Math.max(minSize.width, s.width - dx)
      newX = s.x + s.width - newW // s.x here is the original position.x
    }
    if (direction.includes('s')) newH = Math.max(minSize.height, s.height + dy)
    if (direction.includes('n')) {
      newH = Math.max(minSize.height, s.height - dy)
      newY = s.y + s.height - newH // s.y here is the original position.y
    }

    resizeWindow(windowId, { width: newW, height: newH })
    if (direction.includes('w') || direction.includes('n')) {
      moveWindow(windowId, { x: newX, y: newY })
    }
  }, [direction, windowId, position, size, minSize, resizeWindow, moveWindow])

  const handlePointerUp = useCallback(() => {
    startRef.current = null
  }, [])

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        cursor: cursorMap[direction],
        zIndex: 10,
        ...positionStyles[direction],
      }}
    />
  )
}

const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function Window({
  windowId,
  appId,
  title,
  position,
  size,
  minSize,
  state: windowState,
  restoredRect,
  zIndex,
  desktopRef,
  children,
}) {
  const dragControls = useDragControls()
  const isFocused = useWindowStore((s) => s.activeWindowId === windowId)
  const isMobile = useWindowStore((s) => s.isMobile)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)

  const isMaximized = windowState === 'maximized'
  const AppIcon = APP_REGISTRY[appId]?.icon

  const handleDragEnd = useCallback((_e, info) => {
    moveWindow(windowId, {
      x: position.x + info.offset.x,
      y: position.y + info.offset.y,
    })
  }, [windowId, position, moveWindow])

  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      restoreWindow(windowId)
    } else {
      maximizeWindow(windowId)
    }
  }, [windowId, isMaximized, restoreWindow, maximizeWindow])

  // Mobile: full-screen mode
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col bg-[#0a0a0a]"
        style={{ paddingBottom: TASKBAR_HEIGHT + 8 }}
      >
        {/* Simplified title bar */}
        <div className="glass-panel flex h-9 items-center justify-between border-b border-cyan-500/10 px-3">
          <div className="flex items-center gap-2">
            {AppIcon && <AppIcon size={12} className="text-primary" />}
            <span className="heading-ui text-[10px] font-semibold text-white/80 truncate">
              {title}
            </span>
          </div>
          <button
            type="button"
            onClick={() => closeWindow(windowId)}
            aria-label="Close window"
            className="rounded-md p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ containerType: 'inline-size' }}>
          {children}
        </div>
      </div>
    )
  }

  // Compute display position/size
  const displayPos = isMaximized ? { x: 0, y: 0 } : position
  const displaySize = isMaximized
    ? { width: window.innerWidth, height: window.innerHeight - TASKBAR_HEIGHT }
    : size

  return (
    <Motion.div
      style={{
        position: 'absolute',
        left: displayPos.x,
        top: displayPos.y,
        width: displaySize.width,
        height: displaySize.height,
        zIndex,
      }}
      drag={!isMaximized}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragConstraints={desktopRef}
      onDragEnd={handleDragEnd}
      onPointerDownCapture={() => focusWindow(windowId)}
      className="flex flex-col rounded-lg overflow-hidden"
    >
      {/* Window border glow */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-lg border transition-all duration-200 ${
          isFocused
            ? 'border-cyan-500/20 shadow-[0_0_20px_rgba(0,255,255,0.1)]'
            : 'border-white/[0.06]'
        }`}
        style={{ zIndex: 20 }}
      />

      {/* Title bar */}
      <div
        onPointerDown={(e) => { if (!isMaximized) dragControls.start(e) }}
        onDoubleClick={toggleMaximize}
        className={`glass-panel flex h-9 shrink-0 cursor-grab items-center justify-between border-b px-3 select-none active:cursor-grabbing ${
          isFocused
            ? 'border-b-cyan-500/15'
            : 'border-b-white/[0.04] opacity-60'
        }`}
        style={{
          borderImage: isFocused
            ? 'linear-gradient(to right, rgba(0,255,255,0.3), transparent 40%, transparent 60%, rgba(243,230,0,0.2)) 1'
            : undefined,
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {AppIcon && <AppIcon size={12} className="shrink-0 text-primary" />}
          <span className="heading-ui truncate text-[10px] font-semibold text-white/80">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => minimizeWindow(windowId)}
            aria-label="Minimize window"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-cyan-500/15 hover:text-cyan-400"
          >
            <Minus size={10} />
          </button>
          <button
            type="button"
            onClick={toggleMaximize}
            aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-cyan-500/15 hover:text-cyan-400"
          >
            <Square size={10} />
          </button>
          <button
            type="button"
            onClick={() => closeWindow(windowId)}
            aria-label="Close window"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-400"
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* Content area — container query context */}
      <div
        className="flex-1 overflow-hidden bg-[#0a0a0a]"
        style={{ containerType: 'inline-size' }}
      >
        {children}
      </div>

      {/* Resize handles (only when not maximized) */}
      {!isMaximized && RESIZE_DIRECTIONS.map((dir) => (
        <ResizeHandle
          key={dir}
          direction={dir}
          windowId={windowId}
          position={position}
          size={size}
          minSize={minSize}
        />
      ))}
    </Motion.div>
  )
}

export default memo(Window)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/Window.test.jsx
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/components/Window.jsx frontend/src/os/components/__tests__/Window.test.jsx
git commit -m "feat: add Window component with drag, resize, maximize, and mobile mode"
```

---

## Task 5: Taskbar and App Launcher

**Files:**
- Create: `frontend/src/os/components/Taskbar.jsx`
- Create: `frontend/src/os/components/AppLauncher.jsx`
- Create: `frontend/src/os/components/__tests__/Taskbar.test.jsx`
- Create: `frontend/src/os/components/__tests__/AppLauncher.test.jsx`

- [ ] **Step 1: Write failing tests for Taskbar**

Create `frontend/src/os/components/__tests__/Taskbar.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockFocusWindow = vi.fn()
const mockToggleLauncher = vi.fn()

let mockWindows = {}
let mockZStack = []
let mockActiveWindowId = null
let mockIsMobile = false

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      windows: mockWindows,
      zStack: mockZStack,
      activeWindowId: mockActiveWindowId,
      isMobile: mockIsMobile,
      focusWindow: mockFocusWindow,
      toggleLauncher: mockToggleLauncher,
    }
    return selector(state)
  },
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: { id: 'media', title: 'Media Vault', icon: () => <span data-testid="icon-media">M</span> },
    chat: { id: 'chat', title: 'AI Chat', icon: () => <span data-testid="icon-chat">C</span> },
  },
}))

import Taskbar from '../Taskbar'

describe('Taskbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWindows = {
      media: { windowId: 'media', appId: 'media', title: 'Media Vault', state: 'normal' },
      chat: { windowId: 'chat', appId: 'chat', title: 'AI Chat', state: 'minimized' },
    }
    mockZStack = ['media', 'chat']
    mockActiveWindowId = 'media'
    mockIsMobile = false
  })

  it('renders launcher button', () => {
    render(<Taskbar />)
    expect(screen.getByLabelText('Open app launcher')).toBeDefined()
  })

  it('renders tabs for each open window', () => {
    render(<Taskbar />)
    expect(screen.getByText('Media Vault')).toBeDefined()
    expect(screen.getByText('AI Chat')).toBeDefined()
  })

  it('calls focusWindow when tab clicked', () => {
    render(<Taskbar />)
    fireEvent.click(screen.getByText('AI Chat'))
    expect(mockFocusWindow).toHaveBeenCalledWith('chat')
  })

  it('calls toggleLauncher when launcher button clicked', () => {
    render(<Taskbar />)
    fireEvent.click(screen.getByLabelText('Open app launcher'))
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('shows clock in system tray', () => {
    render(<Taskbar />)
    // Clock should show current time in HH:MM format
    const timeRegex = /\d{1,2}:\d{2}/
    const tray = screen.getByTestId('system-tray')
    expect(tray.textContent).toMatch(timeRegex)
  })
})
```

- [ ] **Step 2: Write failing tests for AppLauncher**

Create `frontend/src/os/components/__tests__/AppLauncher.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockOpenApp = vi.fn()
const mockToggleLauncher = vi.fn()

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      openApp: mockOpenApp,
      toggleLauncher: mockToggleLauncher,
    }
    return selector(state)
  },
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: { id: 'media', title: 'Media Vault', icon: () => <span>M</span> },
    chat: { id: 'chat', title: 'AI Chat', icon: () => <span>C</span> },
  },
  APP_ORDER: ['media', 'chat'],
}))

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, ...rest }) => <div onClick={onClick} {...rest}>{children}</div>,
  },
}))

import AppLauncher from '../AppLauncher'

describe('AppLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all registered apps', () => {
    render(<AppLauncher />)
    expect(screen.getByText('Media Vault')).toBeDefined()
    expect(screen.getByText('AI Chat')).toBeDefined()
  })

  it('calls openApp and toggleLauncher when app tile clicked', () => {
    render(<AppLauncher />)
    fireEvent.click(screen.getByText('Media Vault'))
    expect(mockOpenApp).toHaveBeenCalledWith('media')
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('closes launcher when backdrop clicked', () => {
    render(<AppLauncher />)
    fireEvent.click(screen.getByTestId('launcher-backdrop'))
    expect(mockToggleLauncher).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/Taskbar.test.jsx src/os/components/__tests__/AppLauncher.test.jsx
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Create Taskbar component**

Create `frontend/src/os/components/Taskbar.jsx`:

```jsx
import { memo, useEffect, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY } from '../stores/appRegistry'

function Clock() {
  const [time, setTime] = useState(() => {
    const now = new Date()
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="heading-ui text-[10px] font-semibold text-white/60">{time}</span>
  )
}

function Taskbar() {
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const isMobile = useWindowStore((s) => s.isMobile)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  // Build ordered list of window entries for tabs
  const windowEntries = zStack
    .map((id) => windows[id])
    .filter(Boolean)

  if (isMobile) {
    // Mobile dock: icon-only
    return (
      <nav
        className="glass-panel fixed inset-x-0 bottom-0 z-[500] flex items-center justify-around border-t border-cyan-500/10 px-2 py-1.5"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="App dock"
      >
        <button
          type="button"
          onClick={toggleLauncher}
          aria-label="Open app launcher"
          className="flex flex-col items-center gap-0.5 rounded-lg p-2 text-muted-foreground transition-colors hover:text-primary"
        >
          <LayoutGrid size={18} />
        </button>
        {windowEntries.map((win) => {
          const manifest = APP_REGISTRY[win.appId]
          const Icon = manifest?.icon
          const isActive = win.windowId === activeWindowId
          return (
            <button
              key={win.windowId}
              type="button"
              onClick={() => focusWindow(win.windowId)}
              aria-label={win.title}
              className={`flex flex-col items-center gap-0.5 rounded-lg p-2 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {Icon && <Icon size={18} />}
              {isActive && (
                <div className="h-1 w-1 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(0,255,255,0.6)]" />
              )}
            </button>
          )
        })}
      </nav>
    )
  }

  // Desktop taskbar
  return (
    <nav
      className="glass-panel fixed inset-x-0 bottom-0 z-[500] flex h-12 items-center border-t border-cyan-500/10 px-3"
      aria-label="Taskbar"
    >
      {/* Top neon accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

      {/* Launcher button */}
      <button
        type="button"
        onClick={toggleLauncher}
        aria-label="Open app launcher"
        className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/20 hover:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.2)]"
      >
        <LayoutGrid size={14} />
      </button>

      {/* Separator */}
      <div className="mr-3 h-5 w-px bg-white/10" />

      {/* Open app tabs */}
      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {windowEntries.map((win) => {
          const manifest = APP_REGISTRY[win.appId]
          const Icon = manifest?.icon
          const isActive = win.windowId === activeWindowId
          const isMinimized = win.state === 'minimized'
          return (
            <button
              key={win.windowId}
              type="button"
              onClick={() => focusWindow(win.windowId)}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 heading-ui text-[10px] font-semibold transition-all ${
                isActive
                  ? 'bg-white/[0.06] text-white'
                  : isMinimized
                    ? 'text-muted-foreground/50 hover:text-muted-foreground'
                    : 'text-muted-foreground hover:bg-white/[0.03] hover:text-white'
              }`}
            >
              {Icon && <Icon size={12} />}
              <span className="max-w-[100px] truncate">{win.title}</span>
              {isActive && (
                <div className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,255,255,0.5)]" />
              )}
            </button>
          )
        })}
      </div>

      {/* System tray */}
      <div className="ml-3 flex items-center gap-3" data-testid="system-tray">
        {/* Connection indicator */}
        <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" title="Connected" />
        <Clock />
      </div>
    </nav>
  )
}

export default memo(Taskbar)
```

- [ ] **Step 5: Create AppLauncher component**

Create `frontend/src/os/components/AppLauncher.jsx`:

```jsx
import { memo } from 'react'
import { motion as Motion } from 'framer-motion'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'

function AppLauncher() {
  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  const handleLaunch = (appId) => {
    openApp(appId)
    toggleLauncher()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="launcher-backdrop"
        className="fixed inset-0 z-[599] bg-black/50 backdrop-blur-sm"
        onClick={toggleLauncher}
      />

      {/* Launcher panel */}
      <Motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="neon-border glass-panel fixed bottom-14 left-1/2 z-[600] w-[90vw] max-w-md -translate-x-1/2 rounded-2xl p-4 shadow-[0_0_60px_rgba(0,255,255,0.05)] sm:bottom-16 sm:p-6"
      >
        {/* Top neon accent */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <p className="mb-4 heading-display text-[10px] tracking-[0.3em] text-primary/50">
          // Applications
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
          {APP_ORDER.map((appId) => {
            const manifest = APP_REGISTRY[appId]
            if (!manifest) return null
            const Icon = manifest.icon
            return (
              <button
                key={appId}
                type="button"
                onClick={() => handleLaunch(appId)}
                className="group flex flex-col items-center gap-2 rounded-xl p-3 transition-all hover:bg-white/[0.04] hover:shadow-[0_0_15px_rgba(0,255,255,0.05)] sm:p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] transition-all group-hover:bg-primary/10 group-hover:ring-primary/20 group-hover:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.15)]">
                  <Icon size={20} className="text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <span className="heading-ui text-[9px] font-semibold text-muted-foreground transition-colors group-hover:text-white sm:text-[10px]">
                  {manifest.title}
                </span>
              </button>
            )
          })}
        </div>
      </Motion.div>
    </>
  )
}

export default memo(AppLauncher)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/Taskbar.test.jsx src/os/components/__tests__/AppLauncher.test.jsx
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/components/Taskbar.jsx frontend/src/os/components/AppLauncher.jsx frontend/src/os/components/__tests__/Taskbar.test.jsx frontend/src/os/components/__tests__/AppLauncher.test.jsx
git commit -m "feat: add Taskbar and AppLauncher components with cyberpunk styling"
```

---

## Task 6: MediaApp wrapper and Desktop component

**Files:**
- Create: `frontend/src/components/features/MediaApp.jsx`
- Create: `frontend/src/os/Desktop.jsx`
- Create: `frontend/src/os/components/__tests__/Desktop.test.jsx`

- [ ] **Step 1: Create MediaApp wrapper**

This component extracts the media-specific state management from `App.jsx` so it can run inside a window. It manages `activeType`, `selectedItemId`, `editItem`, `vaultState`, and renders KanbanBoard/MediaVault/modals.

Create `frontend/src/components/features/MediaApp.jsx`:

```jsx
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useMedia } from '../../hooks/useMedia'
import { MEDIA_TYPES, MEDIA_CONFIG, TYPE_ICONS } from '../../lib/mediaConfig'
import KanbanBoard from './KanbanBoard'
import MediaVault from './MediaVault'
import AddMediaDialog from './AddMediaDialog'
import LazyAICmdPalette from './LazyAICmdPalette'

const MediaDetailModal = lazy(() => import('./MediaDetailModal'))
const EditMediaDialog = lazy(() => import('./EditMediaDialog'))

export default function MediaApp() {
  const { session } = useAuth()
  const [activeType, setActiveType] = useState('book')
  const { items, loading: dataLoading, error, addMedia, updateMedia, deleteMedia } = useMedia(session, activeType)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [vaultState, setVaultState] = useState(null)

  const selectedItem = useMemo(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) ?? null : null),
    [selectedItemId, items],
  )

  const openVault = useCallback((status, type) => {
    setVaultState({ status, type })
  }, [])

  const handleEdit = useCallback((item) => setEditItem(item), [])
  const handleSelect = useCallback((item) => setSelectedItemId(item.id), [])
  const handleCloseDetail = useCallback(() => setSelectedItemId(null), [])
  const handleCloseEdit = useCallback(() => setEditItem(null), [])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Media type tabs — inside the window */}
      <nav className="shrink-0 border-b border-white/[0.04] bg-black/20">
        <div role="tablist" aria-label="Media types" className="flex items-center gap-1 overflow-x-auto px-3 py-1.5">
          {MEDIA_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type]
            const isActive = activeType === type
            return (
              <button
                key={type}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => { setActiveType(type); setVaultState(null) }}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 heading-ui text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={12} />
                {MEDIA_CONFIG[type].label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {dataLoading && items.length === 0 ? (
          <div className="flex h-full items-center justify-center" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div role="alert" className="p-6 text-center font-bold uppercase tracking-widest text-destructive">
            API Error: {error}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {vaultState ? (
              <Motion.div
                key="vault"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.25 }}
              >
                <MediaVault
                  items={items}
                  mediaType={activeType}
                  filterStatus={vaultState.status}
                  onBack={() => setVaultState(null)}
                  onUpdate={updateMedia}
                  onDelete={deleteMedia}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                />
              </Motion.div>
            ) : (
              <Motion.div
                key="overview"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                className="p-3 sm:p-4"
              >
                <KanbanBoard
                  items={items}
                  mediaType={activeType}
                  onUpdate={updateMedia}
                  onDelete={deleteMedia}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                  onHeaderClick={openVault}
                />
              </Motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Modals — portaled to modal-root via the modal components themselves */}
      <Suspense fallback={null}>
        <MediaDetailModal
          item={selectedItem}
          onClose={handleCloseDetail}
          onUpdate={updateMedia}
          onDelete={deleteMedia}
          onEdit={handleEdit}
        />
      </Suspense>
      <Suspense fallback={null}>
        <EditMediaDialog item={editItem} onUpdate={updateMedia} onClose={handleCloseEdit} />
      </Suspense>
      <AddMediaDialog mediaType={activeType} onAdd={addMedia} />
      <LazyAICmdPalette mediaType={activeType} onAdd={addMedia} />
    </div>
  )
}
```

- [ ] **Step 2: Write failing test for Desktop**

Create `frontend/src/os/components/__tests__/Desktop.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let mockWindows = {}
let mockZStack = []
let mockActiveWindowId = null
let mockIsMobile = false
let mockLauncherOpen = false

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      windows: mockWindows,
      zStack: mockZStack,
      activeWindowId: mockActiveWindowId,
      isMobile: mockIsMobile,
      launcherOpen: mockLauncherOpen,
      openApp: vi.fn(),
      setMobile: vi.fn(),
    }
    return selector(state)
  },
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: {
      id: 'media', title: 'Media Vault', singleton: true,
      icon: () => <span>M</span>,
      component: () => <div>Media Content</div>,
    },
  },
}))

vi.mock('../Window', () => ({
  default: ({ children, title }) => <div data-testid={`window-${title}`}>{children}</div>,
}))

vi.mock('../Taskbar', () => ({
  default: () => <div data-testid="taskbar">Taskbar</div>,
}))

vi.mock('../AppLauncher', () => ({
  default: () => <div data-testid="app-launcher">Launcher</div>,
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
}))

import Desktop from '../../Desktop'

describe('Desktop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWindows = {}
    mockZStack = []
    mockActiveWindowId = null
    mockIsMobile = false
    mockLauncherOpen = false
    // Mock matchMedia
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it('renders taskbar', () => {
    render(<Desktop />)
    expect(screen.getByTestId('taskbar')).toBeDefined()
  })

  it('renders wallpaper elements', () => {
    render(<Desktop />)
    const desktop = screen.getByTestId('desktop')
    expect(desktop).toBeDefined()
  })

  it('renders windows for non-minimized entries', () => {
    mockWindows = {
      media: {
        windowId: 'media', appId: 'media', title: 'Media Vault',
        position: { x: 0, y: 0 }, size: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 }, state: 'normal',
        restoredRect: { x: 0, y: 0, width: 800, height: 600 },
      },
    }
    mockZStack = ['media']
    render(<Desktop />)
    expect(screen.getByTestId('window-Media Vault')).toBeDefined()
  })

  it('does not render minimized windows', () => {
    mockWindows = {
      media: {
        windowId: 'media', appId: 'media', title: 'Media Vault',
        position: { x: 0, y: 0 }, size: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 }, state: 'minimized',
        restoredRect: { x: 0, y: 0, width: 800, height: 600 },
      },
    }
    mockZStack = ['media']
    render(<Desktop />)
    expect(screen.queryByTestId('window-Media Vault')).toBeNull()
  })

  it('renders app launcher when launcherOpen is true', () => {
    mockLauncherOpen = true
    render(<Desktop />)
    expect(screen.getByTestId('app-launcher')).toBeDefined()
  })

  it('does not render app launcher when launcherOpen is false', () => {
    mockLauncherOpen = false
    render(<Desktop />)
    expect(screen.queryByTestId('app-launcher')).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/Desktop.test.jsx
```

Expected: FAIL — `../../Desktop` not found.

- [ ] **Step 4: Create Desktop component**

Create `frontend/src/os/Desktop.jsx`:

```jsx
import { Suspense, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useWindowStore } from './stores/windowStore'
import { APP_REGISTRY } from './stores/appRegistry'
import Window from './components/Window'
import Taskbar from './components/Taskbar'
import AppLauncher from './components/AppLauncher'

const Z_INDEX_BASE = 100

export default function Desktop() {
  const desktopRef = useRef(null)
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const launcherOpen = useWindowStore((s) => s.launcherOpen)
  const openApp = useWindowStore((s) => s.openApp)
  const setMobile = useWindowStore((s) => s.setMobile)

  // Mobile detection via matchMedia
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    setMobile(mql.matches)
    const handler = (e) => setMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [setMobile])

  // Auto-open Media Vault on first mount if no windows open
  useEffect(() => {
    if (Object.keys(windows).length === 0) {
      openApp('media')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs only once on mount

  // Build visible (non-minimized) windows ordered by zStack
  const visibleWindows = zStack
    .map((id) => windows[id])
    .filter((w) => w && w.state !== 'minimized')

  return (
    <div
      ref={desktopRef}
      data-testid="desktop"
      className="fixed inset-0 overflow-hidden bg-background"
    >
      {/* Wallpaper layers */}
      <div className="ambient-orbs" />
      <div className="scanlines" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(to_right,hsl(var(--neon-yellow)/0.02)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-yellow)/0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Windows */}
      {visibleWindows.map((win) => {
        const manifest = APP_REGISTRY[win.appId]
        if (!manifest) return null
        const AppComponent = manifest.component
        const zIndex = Z_INDEX_BASE + zStack.indexOf(win.windowId)
        return (
          <Window
            key={win.windowId}
            windowId={win.windowId}
            appId={win.appId}
            title={win.title}
            position={win.position}
            size={win.size}
            minSize={win.minSize}
            state={win.state}
            restoredRect={win.restoredRect}
            zIndex={zIndex}
            desktopRef={desktopRef}
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }
            >
              <AppComponent appId={win.appId} />
            </Suspense>
          </Window>
        )
      })}

      {/* Taskbar */}
      <Taskbar />

      {/* App Launcher overlay */}
      <AnimatePresence>
        {launcherOpen && <AppLauncher />}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/Desktop.test.jsx
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/components/features/MediaApp.jsx frontend/src/os/Desktop.jsx frontend/src/os/components/__tests__/Desktop.test.jsx
git commit -m "feat: add Desktop shell, MediaApp wrapper, and Desktop tests"
```

---

## Task 7: Wire Desktop into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Replace post-auth render with Desktop**

Replace the entire authenticated `return` block (the one starting `return (<div className="flex min-h-screen...`) with a simple Desktop render. Keep the auth loading state, the unauthenticated AuthPanel, and the recovery token handling unchanged.

In `frontend/src/App.jsx`, replace the final `return` block (the one after `if (!session)`) with:

```jsx
  return (
    <>
      <Desktop />
    </>
  )
```

Also add the import at the top of the file:

```js
import Desktop from './os/Desktop'
```

Remove now-unused imports that were only used in the authenticated view:
- Remove: `AnimatePresence, motion as Motion` from framer-motion import (keep if used elsewhere — check: they're not used in the auth/loading views)
- Remove: `Loader2, MessageCircle` from lucide-react (Loader2 is still used in auth loading)
- Remove: `AddMediaDialog`, `LazyAICmdPalette`, `MediaVault`, `KanbanBoard`, `Navbar` imports (Navbar is used in unauth view — keep it)
- Remove: `useMedia`, `MEDIA_TYPES`, `MEDIA_CONFIG`, `TYPE_ICONS`, `EMAIL_TAB_ICON` imports
- Remove: all state hooks that were only for the media view: `activeType`, `activeView`, `items`, `selectedItemId`, `editItem`, `vaultState`, `selectedItem`, and their related callbacks
- Remove: the lazy imports for `ChatLayout`, `EmailInbox`, `MediaDetailModal`, `EditMediaDialog`

Keep: `useAuth`, `useRecoveryTokens`, `session`, `authLoading`, `recoveryTokens`, `Navbar` (used in unauth view), `AuthPanel`, `ResetPasswordPage`, `Loader2`.

The full updated `App.jsx`:

```jsx
import { Loader2 } from 'lucide-react'
import AuthPanel from './components/features/AuthPanel'
import ResetPasswordPage from './components/features/ResetPasswordPage'
import Navbar from './components/layout/Navbar'
import Desktop from './os/Desktop'
import { useAuth } from './hooks/useAuth'
import { useRecoveryTokens } from './hooks/useRecoveryTokens'

function App() {
  const { session, loading: authLoading } = useAuth()
  const [recoveryTokens, dismissTokens] = useRecoveryTokens()

  if (recoveryTokens) {
    return (
      <ResetPasswordPage
        accessToken={recoveryTokens.accessToken}
        refreshToken={recoveryTokens.refreshToken}
        tokenHash={recoveryTokens.tokenHash}
        onComplete={dismissTokens}
      />
    )
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status">
        <div className="ambient-orbs" />
        <div className="scanlines" />
        <Loader2 className="relative z-10 h-10 w-10 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading session</span>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
        <a href="#auth-panel" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground">
          Skip to login
        </a>
        <div className="ambient-orbs" />
        <div className="scanlines" />
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_right,hsl(var(--neon-yellow)/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-yellow)/0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

        <Navbar />
        <main className="relative z-10 flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className="grid w-full max-w-6xl gap-6 sm:gap-8 md:grid-cols-[1.2fr_0.8fr]">
            <section className="neon-border glass-panel rounded-2xl p-6 shadow-2xl order-2 hidden md:block sm:rounded-[2rem] sm:p-8 lg:p-10">
              <p className="heading-ui mb-3 text-xs font-semibold uppercase tracking-[0.4em] text-primary">
                personal media vault
              </p>
              <h1 className="heading-display max-w-3xl text-2xl font-black text-white md:text-3xl lg:text-5xl xl:text-6xl">
                One archive for everything you care about.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:mt-6 md:text-base">
                Nexus Archive replaces scattered lists with one identity-driven
                dashboard. Track books, movies, anime, and job applications — what
                you finished, what you are pursuing now, and the notes that matter.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4">
                {['Books', 'Movies', 'Anime', 'Jobs'].map((label) => (
                  <div
                    key={label}
                    className="neon-border glass-panel rounded-xl px-4 py-4 heading-ui text-sm font-semibold uppercase tracking-wider text-white/80 sm:py-5"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </section>

            <div id="auth-panel" className="relative z-10 order-1 md:order-2 w-full max-w-md mx-auto md:max-w-none">
              <p className="heading-display mb-6 text-center text-lg font-bold text-white truncate md:hidden">
                Nexus Archive
              </p>
              <AuthPanel />
            </div>
          </div>
        </main>

        <footer className="relative z-10 py-4 text-center font-mono text-[10px] tracking-wider text-muted-foreground/50">
          Nexus Archive — {new Date().getFullYear()}
        </footer>
      </div>
    )
  }

  return <Desktop />
}

export default App
```

- [ ] **Step 2: Verify build works**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

Expected: Build succeeds. (The app won't fully render in browser until modal portals are migrated, but it should compile.)

- [ ] **Step 3: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/App.jsx
git commit -m "feat: wire Desktop shell into App.jsx, replace tab navigation"
```

---

## Task 8: Modal portal migration

**Files:**
- Modify: `frontend/src/components/features/MediaDetailModal.jsx`
- Modify: `frontend/src/components/features/EditMediaDialog.jsx`
- Modify: `frontend/src/components/features/AddMediaDialog.jsx`
- Modify: `frontend/src/components/features/ComposeModal.jsx`
- Modify: `frontend/src/components/features/AICmdPalette.jsx`

Note: `ConfirmDialog.jsx` already uses `createPortal(... , document.body)`. Change its portal target to `document.getElementById('modal-root')` for consistency.

- [ ] **Step 1: Migrate MediaDetailModal to portal**

In `frontend/src/components/features/MediaDetailModal.jsx`, add `createPortal` import and wrap the rendered content:

Add at top:
```jsx
import { createPortal } from 'react-dom'
```

Wrap the entire `return` statement's JSX in a portal. Replace:
```jsx
  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          ...
```

With:
```jsx
  return createPortal(
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          ...
```

And close the portal at the very end, replacing the final:
```jsx
    </AnimatePresence>
  )
```

With:
```jsx
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body
  )
```

- [ ] **Step 2: Migrate EditMediaDialog to portal**

In `frontend/src/components/features/EditMediaDialog.jsx`, add portal import and wrap the `if (!item) return null` to also return null from portal. Then wrap the dialog return:

Add at top:
```jsx
import { createPortal } from 'react-dom'
```

Replace the return block (after `if (!item) return null`) — wrap the entire div in a portal:

```jsx
  return createPortal(
    <div
      ref={trapRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-media-title"
    >
      {/* ... existing content unchanged ... */}
    </div>,
    document.getElementById('modal-root') || document.body
  )
```

- [ ] **Step 3: Migrate AddMediaDialog dialog overlay to portal**

In `frontend/src/components/features/AddMediaDialog.jsx`, the FAB button stays inside the window. Only the `AnimatePresence` dialog overlay gets portaled.

Add at top:
```jsx
import { createPortal } from 'react-dom'
```

Wrap the `<AnimatePresence>` block (not the FAB button) in a portal:

```jsx
  return (
    <>
      {/* FAB button — stays inside the window */}
      <button type="button" onClick={handleOpen} className="neon-pulse fixed bottom-...">
        ...
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <Motion.div ref={trapRef} className="fixed inset-0 z-[100]...">
              {/* ... existing dialog content unchanged ... */}
            </Motion.div>
          )}
        </AnimatePresence>,
        document.getElementById('modal-root') || document.body
      )}
    </>
  )
```

- [ ] **Step 4: Migrate ComposeModal to portal**

In `frontend/src/components/features/ComposeModal.jsx`, add portal import and wrap the `AnimatePresence` return:

Add at top:
```jsx
import { createPortal } from 'react-dom'
```

Replace the return:
```jsx
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          ...
        </>
      )}
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body
  )
```

- [ ] **Step 5: Migrate AICmdPalette to portal**

In `frontend/src/components/features/AICmdPalette.jsx`, the `cmdk` `Command.Dialog` already creates its own overlay. Wrap the entire return in a portal:

Add at top:
```jsx
import { createPortal } from 'react-dom'
```

Wrap the return:
```jsx
  return createPortal(
    <Command.Dialog ... >
      {/* ... existing content unchanged ... */}
    </Command.Dialog>,
    document.getElementById('modal-root') || document.body
  )
```

- [ ] **Step 6: Update ConfirmDialog portal target**

In `frontend/src/components/features/ConfirmDialog.jsx`, change the portal target from `document.body` to `document.getElementById('modal-root') || document.body`:

Replace:
```jsx
    document.body
  )
```

With:
```jsx
    document.getElementById('modal-root') || document.body
  )
```

- [ ] **Step 7: Verify build works**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/components/features/MediaDetailModal.jsx frontend/src/components/features/EditMediaDialog.jsx frontend/src/components/features/AddMediaDialog.jsx frontend/src/components/features/ComposeModal.jsx frontend/src/components/features/AICmdPalette.jsx frontend/src/components/features/ConfirmDialog.jsx
git commit -m "fix: migrate all modals to portal rendering for window transform compatibility"
```

---

## Task 9: Container query migration

**Files:**
- Modify: `frontend/src/components/features/KanbanBoard.jsx`
- Modify: `frontend/src/components/features/MediaVault.jsx`
- Modify: `frontend/src/components/features/EmailInbox.jsx`
- Modify: `frontend/src/components/features/ChatLayout.jsx`

- [ ] **Step 1: Migrate KanbanBoard**

In `frontend/src/components/features/KanbanBoard.jsx`:

1. In the `KanbanBoard` component's root `<div>`, change the grid classes that use viewport breakpoints to container query variants. Replace:
```jsx
<div className={`grid h-full auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 ${gridColsClass}`}>
```
With:
```jsx
<div className={`grid h-full auto-rows-min grid-cols-1 gap-4 @sm:grid-cols-2 @sm:gap-6 ${gridColsClass}`}>
```

2. Update `gridColsClass` to use container variants:
```js
const gridColsClass = mediaType === 'job'
  ? '@md:grid-cols-2 @lg:grid-cols-3'
  : '@md:grid-cols-3'
```

3. In the `DroppableColumn` component, update the max-height classes. Replace:
```jsx
className={`neon-border flex flex-col gap-3 rounded-xl glass-panel p-3 relative max-h-[50dvh] sm:max-h-[60dvh] sm:gap-4 sm:p-4 md:max-h-[calc(100dvh-12rem)] transition-colors ${isOver ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
```
With:
```jsx
className={`neon-border flex flex-col gap-3 rounded-xl glass-panel p-3 relative max-h-[50cqh] @sm:max-h-[60cqh] @sm:gap-4 @sm:p-4 transition-colors ${isOver ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
```

Note: `cqh` units may not be supported in Tailwind v4 arbitrary values. If they aren't, use a fixed `max-h-[500px]` as a safe fallback. The key changes are `sm:` → `@sm:` and `md:` → `@md:` for the grid columns.

- [ ] **Step 2: Migrate MediaVault**

In `frontend/src/components/features/MediaVault.jsx`:

1. Replace the root wrapper `<div className="mx-auto max-w-7xl p-3 sm:p-4 md:p-6 xl:p-8">` with:
```jsx
<div className="h-full w-full overflow-auto custom-scrollbar p-3 @sm:p-4 @md:p-6">
```

2. Update the header flex direction. Replace `sm:flex-row sm:items-center sm:justify-between` with `@sm:flex-row @sm:items-center @sm:justify-between`.

3. Update the table header grid visibility. Replace `hidden ... sm:grid` with `hidden ... @sm:grid`.

4. Update table row grid. Replace `sm:grid` and `sm:grid-cols-[...]` classes with `@sm:grid` and `@sm:grid-cols-[...]`.

5. Update max-height on the rows container. Replace `max-h-[calc(100dvh-14rem)] sm:max-h-[calc(100dvh-16rem)]` with `max-h-[400px] @sm:max-h-[500px]` (fixed values since container relative viewport units are tricky).

6. For elements using `sm:mb-0`, replace with `@sm:mb-0`.

- [ ] **Step 3: Migrate EmailInbox**

In `frontend/src/components/features/EmailInbox.jsx`:

1. Replace the root `h-[calc(100dvh-7rem)]` with `h-full w-full`:
```jsx
className="neon-border relative flex h-full w-full overflow-hidden rounded-none glass-panel @sm:rounded-2xl"
```

2. Replace `md:flex` on sidebar with `@md:flex`:
```jsx
<div className="hidden @md:flex">
```

3. Replace `md:w-80` on email list with `@md:w-80`:
```jsx
className={`flex w-full shrink-0 flex-col border-r border-white/[0.06] @md:w-80 ${
  mobileView === 'reader' ? 'hidden @md:flex' : 'flex'
}`}
```

4. Replace `md:hidden` references with `@md:hidden` and `md:flex` with `@md:flex` for the mobile sidebar, reader toggle, and back button.

- [ ] **Step 4: Migrate ChatLayout**

In `frontend/src/components/features/ChatLayout.jsx`:

1. Replace root `h-[calc(100dvh-7rem)]` with `h-full w-full`:
```jsx
<div className="flex h-full w-full overflow-hidden">
```

2. Replace `md:block` on desktop sidebar with `@md:block`:
```jsx
<div className="hidden w-[240px] shrink-0 @md:block @lg:w-[280px]">
```

3. Replace `md:hidden` on mobile toggle with `@md:hidden`:
```jsx
<div className="flex flex-1 flex-col @md:hidden">
```

4. Replace `md:block` on desktop chat window with `@md:block`:
```jsx
<div className="hidden flex-1 @md:block">
```

- [ ] **Step 5: Verify build works**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Run existing tests**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test
```

Expected: All tests pass (container query class changes don't affect test logic since tests don't evaluate CSS).

- [ ] **Step 7: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/components/features/KanbanBoard.jsx frontend/src/components/features/MediaVault.jsx frontend/src/components/features/EmailInbox.jsx frontend/src/components/features/ChatLayout.jsx
git commit -m "refactor: migrate viewport breakpoints to container queries for windowed rendering"
```

---

## Task 10: Final integration test and cleanup

**Files:**
- No new files
- Potential fixes to any file from Tasks 1-9

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test
```

Expected: All tests pass.

- [ ] **Step 2: Run the build**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Run lint**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run lint
```

Expected: No lint errors. Fix any that appear.

- [ ] **Step 4: Start dev server and manual smoke test**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run dev
```

Manual checks:
1. Login → Desktop renders with wallpaper, taskbar, and Media Vault auto-opens in a window
2. Drag the Media Vault window by its title bar
3. Resize from bottom-right corner
4. Click maximize → window fills screen (minus taskbar). Double-click title bar → restores
5. Click minimize → window disappears, tab remains in taskbar. Click tab → window restores
6. Open App Launcher → grid of 8 apps with cyberpunk styling
7. Click "Email" in launcher → Email inbox opens in a new window
8. Click "AI Chat" → Chat opens in a third window
9. Click between windows → z-ordering updates correctly
10. Open a modal from Media Vault (e.g., click a card for detail) → modal renders above all windows
11. Resize browser to < 768px → mobile mode activates, full-screen app + bottom dock
12. Click placeholder apps (Terminal, Notes, etc.) → "Coming Soon" screen renders

- [ ] **Step 5: Fix any issues found during smoke test**

Address any visual or functional issues. Common things to watch:
- FAB button positioning (AddMediaDialog) inside window vs fixed viewport
- Scrolling inside windowed apps
- Z-index conflicts between windows and modals
- Container query breakpoints triggering at wrong sizes

- [ ] **Step 6: Final commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add -A
git commit -m "chore: Phase 1 complete — Nexus browser OS shell with windowed apps"
```

---

## Summary

| Task | What it builds | Est. time |
|---|---|---|
| 1 | Dependencies + modal-root | 5 min |
| 2 | Window Store (Zustand kernel) + tests | 20 min |
| 3 | App Registry + Placeholder | 10 min |
| 4 | Window component + tests | 25 min |
| 5 | Taskbar + AppLauncher + tests | 25 min |
| 6 | MediaApp wrapper + Desktop + tests | 20 min |
| 7 | Wire Desktop into App.jsx | 10 min |
| 8 | Modal portal migration (6 files) | 15 min |
| 9 | Container query migration (4 files) | 20 min |
| 10 | Integration test + smoke test + fixes | 20 min |
| **Total** | | **~170 min** |
