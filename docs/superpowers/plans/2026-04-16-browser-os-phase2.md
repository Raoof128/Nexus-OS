# Nexus Browser OS — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the window manager with edge-snap tiling, keyboard shortcuts, app launcher search, and localStorage window state persistence.

**Architecture:** Extends the Phase 1 OS shell. New store actions (`snapWindow`, `cycleWindow`, `hydrateFromStorage`) added to the existing Zustand kernel. A new `useGlobalShortcuts` hook handles keyboard input. Window.jsx gains CSS-percentage rendering for snapped states. AppLauncher gets a search filter. A debounced subscriber persists layout to localStorage.

**Tech Stack:** Zustand (existing), Framer Motion `useMotionValue`/`useTransform` (for snap preview), React 19, Tailwind CSS v4

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `frontend/src/os/hooks/useGlobalShortcuts.js` | Global `Alt+key` keyboard shortcut handler |
| `frontend/src/os/hooks/__tests__/useGlobalShortcuts.test.js` | Tests for keyboard shortcuts |

### Modified files

| File | Change |
|---|---|
| `frontend/src/os/stores/windowStore.js` | Add `snapWindow`, `cycleWindow`, `hydrateFromStorage` actions; add debounced localStorage persistence subscriber; add `SCHEMA_VERSION` |
| `frontend/src/os/stores/__tests__/windowStore.test.js` | Add tests for new actions and persistence |
| `frontend/src/os/components/Window.jsx` | CSS percentage rendering for snapped states; disable drag when snapped; title-bar tear-away to restore |
| `frontend/src/os/components/__tests__/Window.test.jsx` | Add tests for snapped state rendering |
| `frontend/src/os/Desktop.jsx` | Add snap preview overlay; call `useGlobalShortcuts()`; call `hydrateFromStorage()` on mount |
| `frontend/src/os/components/AppLauncher.jsx` | Add search input, filter logic, Enter-to-launch, active tile highlight |
| `frontend/src/os/components/__tests__/AppLauncher.test.jsx` | Add tests for search/filter behavior |

---

## Task 1: Store — `snapWindow` and `cycleWindow` actions

**Files:**
- Modify: `frontend/src/os/stores/windowStore.js`
- Modify: `frontend/src/os/stores/__tests__/windowStore.test.js`

- [ ] **Step 1: Write failing tests for snapWindow and cycleWindow**

Append to `frontend/src/os/stores/__tests__/windowStore.test.js`:

```js
  describe('snapWindow', () => {
    it('saves restoredRect and sets state to snapped-left', () => {
      useWindowStore.getState().openApp('media')
      const before = useWindowStore.getState().windows.media
      const prevPos = { ...before.position }
      const prevSize = { ...before.size }
      useWindowStore.getState().snapWindow('media', 'left')
      const after = useWindowStore.getState().windows.media
      expect(after.state).toBe('snapped-left')
      expect(after.restoredRect).toEqual({ ...prevPos, ...prevSize })
    })

    it('sets state to snapped-right', () => {
      useWindowStore.getState().openApp('media')
      useWindowStore.getState().snapWindow('media', 'right')
      expect(useWindowStore.getState().windows.media.state).toBe('snapped-right')
    })

    it('does nothing for unknown windowId', () => {
      useWindowStore.getState().snapWindow('nonexistent', 'left')
      expect(Object.keys(useWindowStore.getState().windows)).toHaveLength(0)
    })
  })

  describe('cycleWindow', () => {
    it('cycles forward through zStack', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      openApp('terminal')
      // active is the last terminal opened
      useWindowStore.getState().focusWindow('media')
      expect(useWindowStore.getState().activeWindowId).toBe('media')

      useWindowStore.getState().cycleWindow('next')
      // Should move to next in zStack after media
      const state = useWindowStore.getState()
      expect(state.activeWindowId).not.toBe('media')
    })

    it('cycles backward through zStack', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      useWindowStore.getState().focusWindow('chat')

      useWindowStore.getState().cycleWindow('prev')
      expect(useWindowStore.getState().activeWindowId).toBe('media')
    })

    it('skips minimized windows', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      openApp('terminal')
      useWindowStore.getState().minimizeWindow('chat')
      useWindowStore.getState().focusWindow('media')

      useWindowStore.getState().cycleWindow('next')
      const state = useWindowStore.getState()
      // Should skip minimized chat, go to terminal
      expect(state.activeWindowId).not.toBe('chat')
    })

    it('wraps around at the end', () => {
      const { openApp } = useWindowStore.getState()
      openApp('media')
      openApp('chat')
      // Focus last window
      useWindowStore.getState().focusWindow('chat')
      useWindowStore.getState().cycleWindow('next')
      // Should wrap to media
      expect(useWindowStore.getState().activeWindowId).toBe('media')
    })

    it('does nothing with zero or one window', () => {
      useWindowStore.getState().cycleWindow('next')
      expect(useWindowStore.getState().activeWindowId).toBeNull()

      useWindowStore.getState().openApp('media')
      useWindowStore.getState().cycleWindow('next')
      expect(useWindowStore.getState().activeWindowId).toBe('media')
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/windowStore.test.js
```

Expected: FAIL — `snapWindow` and `cycleWindow` are not functions.

- [ ] **Step 3: Implement snapWindow and cycleWindow**

In `frontend/src/os/stores/windowStore.js`, add these two actions inside the `create` callback, after the `toggleLauncher` action:

```js
  snapWindow: (windowId, side) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state

      return {
        windows: {
          ...state.windows,
          [windowId]: {
            ...win,
            state: side === 'left' ? 'snapped-left' : 'snapped-right',
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

  cycleWindow: (direction) => {
    const { zStack, windows, activeWindowId } = get()
    // Build list of visible (non-minimized) window IDs in zStack order
    const visible = zStack.filter(
      (id) => windows[id] && windows[id].state !== 'minimized',
    )
    if (visible.length <= 1) return

    const currentIdx = visible.indexOf(activeWindowId)
    let nextIdx
    if (direction === 'next') {
      nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % visible.length
    } else {
      nextIdx =
        currentIdx <= 0 ? visible.length - 1 : currentIdx - 1
    }
    get().focusWindow(visible[nextIdx])
  },
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/windowStore.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/stores/windowStore.js frontend/src/os/stores/__tests__/windowStore.test.js
git commit -m "feat: add snapWindow and cycleWindow actions to window store"
```

---

## Task 2: Store — Window state persistence

**Files:**
- Modify: `frontend/src/os/stores/windowStore.js`
- Modify: `frontend/src/os/stores/__tests__/windowStore.test.js`

- [ ] **Step 1: Write failing tests for persistence**

Append to `frontend/src/os/stores/__tests__/windowStore.test.js`:

```js
  describe('persistence', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('hydrateFromStorage restores saved layout', () => {
      const saved = {
        schemaVersion: 1,
        windows: {
          media: {
            windowId: 'media',
            appId: 'media',
            title: 'Media Vault',
            position: { x: 200, y: 100 },
            size: { width: 800, height: 500 },
            minSize: { width: 600, height: 400 },
            state: 'normal',
            restoredRect: { x: 200, y: 100, width: 800, height: 500 },
          },
        },
        zStack: ['media'],
        activeWindowId: 'media',
      }
      localStorage.setItem('nexus-os:window-layout', JSON.stringify(saved))

      useWindowStore.getState().hydrateFromStorage()
      const state = useWindowStore.getState()
      expect(Object.keys(state.windows)).toHaveLength(1)
      expect(state.windows.media.position.x).toBe(200)
      expect(state.zStack).toEqual(['media'])
    })

    it('hydrateFromStorage clamps positions to current viewport', () => {
      const saved = {
        schemaVersion: 1,
        windows: {
          media: {
            windowId: 'media',
            appId: 'media',
            title: 'Media Vault',
            position: { x: 5000, y: 3000 },
            size: { width: 800, height: 500 },
            minSize: { width: 600, height: 400 },
            state: 'normal',
            restoredRect: { x: 5000, y: 3000, width: 800, height: 500 },
          },
        },
        zStack: ['media'],
        activeWindowId: 'media',
      }
      localStorage.setItem('nexus-os:window-layout', JSON.stringify(saved))

      useWindowStore.getState().hydrateFromStorage()
      const win = useWindowStore.getState().windows.media
      expect(win.position.x).toBeLessThanOrEqual(window.innerWidth - 100)
      expect(win.position.y).toBeLessThanOrEqual(window.innerHeight - TASKBAR_HEIGHT - 40)
    })

    it('hydrateFromStorage converts minimized to normal', () => {
      const saved = {
        schemaVersion: 1,
        windows: {
          media: {
            windowId: 'media',
            appId: 'media',
            title: 'Media Vault',
            position: { x: 100, y: 50 },
            size: { width: 800, height: 500 },
            minSize: { width: 600, height: 400 },
            state: 'minimized',
            restoredRect: { x: 100, y: 50, width: 800, height: 500 },
          },
        },
        zStack: ['media'],
        activeWindowId: 'media',
      }
      localStorage.setItem('nexus-os:window-layout', JSON.stringify(saved))

      useWindowStore.getState().hydrateFromStorage()
      expect(useWindowStore.getState().windows.media.state).toBe('normal')
    })

    it('hydrateFromStorage discards on schema version mismatch', () => {
      const saved = {
        schemaVersion: 999,
        windows: { media: { windowId: 'media', appId: 'media' } },
        zStack: ['media'],
        activeWindowId: 'media',
      }
      localStorage.setItem('nexus-os:window-layout', JSON.stringify(saved))

      useWindowStore.getState().hydrateFromStorage()
      // Should not have loaded
      expect(Object.keys(useWindowStore.getState().windows)).toHaveLength(0)
    })

    it('hydrateFromStorage handles corrupt JSON gracefully', () => {
      localStorage.setItem('nexus-os:window-layout', 'not-json{{{')

      useWindowStore.getState().hydrateFromStorage()
      expect(Object.keys(useWindowStore.getState().windows)).toHaveLength(0)
    })

    it('hydrateFromStorage regenerates multi-instance windowIds', () => {
      const saved = {
        schemaVersion: 1,
        windows: {
          'terminal-abc123': {
            windowId: 'terminal-abc123',
            appId: 'terminal',
            title: 'Terminal',
            position: { x: 100, y: 50 },
            size: { width: 700, height: 450 },
            minSize: { width: 400, height: 250 },
            state: 'normal',
            restoredRect: { x: 100, y: 50, width: 700, height: 450 },
          },
        },
        zStack: ['terminal-abc123'],
        activeWindowId: 'terminal-abc123',
      }
      localStorage.setItem('nexus-os:window-layout', JSON.stringify(saved))

      useWindowStore.getState().hydrateFromStorage()
      const state = useWindowStore.getState()
      const windowIds = Object.keys(state.windows)
      expect(windowIds).toHaveLength(1)
      // Should have a new ID (not terminal-abc123)
      expect(windowIds[0]).toMatch(/^terminal-/)
      expect(windowIds[0]).not.toBe('terminal-abc123')
    })
  })
```

Note: You need to add `const TASKBAR_HEIGHT = 48` at the top of the test file (or import it) for the clamping test. Since it's a constant, just define it locally in the test.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/windowStore.test.js
```

Expected: FAIL — `hydrateFromStorage` is not a function.

- [ ] **Step 3: Implement persistence in windowStore.js**

Add at the top of `frontend/src/os/stores/windowStore.js`, after the existing constants:

```js
const STORAGE_KEY = 'nexus-os:window-layout'
const SCHEMA_VERSION = 1
const SAVE_DEBOUNCE_MS = 500
```

Add the `hydrateFromStorage` action inside the `create` callback, after `cycleWindow`:

```js
  hydrateFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const saved = JSON.parse(raw)
      if (!saved || saved.schemaVersion !== SCHEMA_VERSION) return
      if (!saved.windows || !saved.zStack) return

      const restoredWindows = {}
      const newZStack = []
      const idMap = {} // old windowId -> new windowId

      for (const [oldId, win] of Object.entries(saved.windows)) {
        // Verify the app still exists in registry
        const manifest = APP_REGISTRY[win.appId]
        if (!manifest) continue

        // Regenerate IDs for multi-instance apps
        const newId = manifest.singleton ? win.appId : `${win.appId}-${nanoid(6)}`
        idMap[oldId] = newId

        // Clamp position to current viewport
        const x = Math.max(0, Math.min(win.position?.x ?? 0, window.innerWidth - 100))
        const y = Math.max(0, Math.min(win.position?.y ?? 0, window.innerHeight - TASKBAR_HEIGHT - 40))
        const width = Math.min(win.size?.width ?? 600, window.innerWidth * 0.95)
        const height = Math.min(win.size?.height ?? 400, (window.innerHeight - TASKBAR_HEIGHT) * 0.95)

        // Convert minimized to normal
        const state = win.state === 'minimized' ? 'normal' : (win.state || 'normal')

        restoredWindows[newId] = {
          windowId: newId,
          appId: win.appId,
          title: manifest.title,
          position: { x, y },
          size: { width, height },
          minSize: { ...manifest.minSize },
          state,
          restoredRect: { x, y, width, height },
        }
      }

      // Rebuild zStack with new IDs, preserving order
      for (const oldId of saved.zStack) {
        if (idMap[oldId]) {
          newZStack.push(idMap[oldId])
        }
      }

      if (Object.keys(restoredWindows).length === 0) return

      // Determine active window
      const newActive = saved.activeWindowId && idMap[saved.activeWindowId]
        ? idMap[saved.activeWindowId]
        : newZStack[newZStack.length - 1] || null

      set({
        windows: restoredWindows,
        zStack: newZStack,
        activeWindowId: newActive,
      })
    } catch {
      // Corrupt data — silently ignore, start fresh
    }
  },
```

Add the debounced persistence subscriber at the bottom of the file, after the `create` call:

```js
// Debounced persistence subscriber
let saveTimeout = null
useWindowStore.subscribe((state) => {
  // Don't save in mobile mode — preserve desktop layout
  if (state.isMobile) return

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      const { windows, zStack, activeWindowId } = state
      const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        windows,
        zStack,
        activeWindowId,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }, SAVE_DEBOUNCE_MS)
})
```

Also export `TASKBAR_HEIGHT` so tests can reference it:

Change `const TASKBAR_HEIGHT = 48` to `export const TASKBAR_HEIGHT = 48`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/windowStore.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/stores/windowStore.js frontend/src/os/stores/__tests__/windowStore.test.js
git commit -m "feat: add localStorage persistence with hydration, clamping, and mobile guard"
```

---

## Task 3: Window component — snapped state rendering

**Files:**
- Modify: `frontend/src/os/components/Window.jsx`
- Modify: `frontend/src/os/components/__tests__/Window.test.jsx`

- [ ] **Step 1: Write failing tests for snapped states**

Append to `frontend/src/os/components/__tests__/Window.test.jsx`, inside the existing `describe('Window', ...)`:

```jsx
  it('renders with CSS percentage sizing when snapped-left', () => {
    render(<Window {...defaultProps} state="snapped-left" />)
    const frame = screen.getByTestId('window-frame')
    expect(frame.style.left).toBe('0px')
    expect(frame.style.top).toBe('0px')
    expect(frame.style.width).toBe('50%')
  })

  it('renders with CSS percentage sizing when snapped-right', () => {
    render(<Window {...defaultProps} state="snapped-right" />)
    const frame = screen.getByTestId('window-frame')
    expect(frame.style.left).toBe('50%')
    expect(frame.style.width).toBe('50%')
  })

  it('calls restoreWindow on title bar pointer down when snapped', () => {
    const mockRestore = vi.fn()
    // Need to update the mock to include restoreWindow
    render(<Window {...defaultProps} state="snapped-left" />)
    // Pointer down on title bar should call restoreWindow to "tear away"
    const titlebar = screen.getByText('Media Vault').closest('[data-testid="titlebar"]')
    if (titlebar) {
      fireEvent.pointerDown(titlebar)
      expect(mockRestoreWindow).toHaveBeenCalledWith('test-win')
    }
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/Window.test.jsx
```

- [ ] **Step 3: Update Window.jsx for snapped state rendering**

In `frontend/src/os/components/Window.jsx`, make these changes:

1. Add `snapWindow` to the store subscriptions alongside the existing actions.

2. Add snapped state detection:

```js
  const isSnapped = windowState === 'snapped-left' || windowState === 'snapped-right'
  const isSnappedLeft = windowState === 'snapped-left'
```

3. Replace the existing `displayPos` / `displaySize` / `drag` logic to handle snapped states. The key change is that snapped windows use CSS percentages, not absolute pixels:

Replace:
```js
  const displayPos = isMaximized ? { x: 0, y: 0 } : position
  const displaySize = isMaximized
    ? { width: window.innerWidth, height: window.innerHeight - TASKBAR_HEIGHT }
    : size
```

With:
```js
  const isLocked = isMaximized || isSnapped

  // For snapped/maximized states, use CSS-friendly values
  const displayStyle = isSnapped
    ? {
        position: 'absolute',
        left: isSnappedLeft ? '0px' : '50%',
        top: '0px',
        width: '50%',
        height: `calc(100% - ${TASKBAR_HEIGHT}px)`,
        zIndex,
      }
    : isMaximized
      ? {
          position: 'absolute',
          left: 0,
          top: 0,
          width: window.innerWidth,
          height: window.innerHeight - TASKBAR_HEIGHT,
          zIndex,
        }
      : {
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          zIndex,
        }
```

4. Update the `drag` prop: `drag={!isLocked}` instead of `drag={!isMaximized}`.

5. Update title bar `onPointerDown` for tear-away from snapped state:

```js
  onPointerDown={(e) => {
    if (isSnapped) {
      restoreWindow(windowId)
      // Don't start drag immediately — let the next pointer move handle it
      return
    }
    if (!isMaximized) dragControls.start(e)
  }}
```

6. Add `data-testid="titlebar"` to the title bar div for test targeting.

7. Update resize handle visibility: hide when snapped too:

```js
  {!isLocked && RESIZE_DIRECTIONS.map((dir) => (
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/Window.test.jsx
```

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/components/Window.jsx frontend/src/os/components/__tests__/Window.test.jsx
git commit -m "feat: add CSS percentage rendering for snapped window states"
```

---

## Task 4: Snap preview overlay in Desktop

**Files:**
- Modify: `frontend/src/os/Desktop.jsx`

- [ ] **Step 1: Add snap preview overlay**

In `frontend/src/os/Desktop.jsx`, add a snap preview overlay that shows when the user is dragging a window near an edge. This is driven by a `useState` for simplicity in Phase 2 (the motion-value optimization can come as a polish pass if needed).

Add state at the top of the Desktop component:

```js
  const [snapPreview, setSnapPreview] = useState(null) // null | 'left' | 'right' | 'top'
```

Add a callback that Window components will call during drag:

```js
  const handleSnapHint = useCallback((hint) => {
    setSnapPreview(hint)
  }, [])
```

Pass `onSnapHint={handleSnapHint}` to each `<Window>` component.

Add the preview overlay div before the Taskbar:

```jsx
      {/* Snap preview overlay */}
      {snapPreview && (
        <div
          data-testid="snap-preview"
          className="pointer-events-none absolute z-[99] rounded-lg border border-cyan-500/30 bg-cyan-500/5 backdrop-blur-sm transition-all duration-150"
          style={
            snapPreview === 'left'
              ? { left: 0, top: 0, width: '50%', height: `calc(100% - ${48}px)` }
              : snapPreview === 'right'
                ? { left: '50%', top: 0, width: '50%', height: `calc(100% - ${48}px)` }
                : { left: 0, top: 0, width: '100%', height: `calc(100% - ${48}px)` }
          }
        />
      )}
```

In `Window.jsx`, update `handleDragEnd` to detect snap zones and call `onSnapHint`:

Add `onSnapHint` to the Window props. During `onDrag` (add a new handler), check if cursor is near edge:

```js
  const handleDrag = useCallback((_e, info) => {
    const cursorX = position.x + info.offset.x
    const cursorY = position.y + info.offset.y
    const SNAP_THRESHOLD = 20

    if (cursorX <= SNAP_THRESHOLD) {
      onSnapHint?.('left')
    } else if (cursorX + size.width >= window.innerWidth - SNAP_THRESHOLD) {
      onSnapHint?.('right')
    } else if (cursorY <= SNAP_THRESHOLD) {
      onSnapHint?.('top')
    } else {
      onSnapHint?.(null)
    }
  }, [position, size, onSnapHint])
```

Update `handleDragEnd` to snap if preview is active:

```js
  const handleDragEnd = useCallback((_e, info) => {
    const newX = position.x + info.offset.x
    const newY = position.y + info.offset.y
    const SNAP_THRESHOLD = 20

    if (newX <= SNAP_THRESHOLD) {
      snapWindow(windowId, 'left')
    } else if (newX + size.width >= window.innerWidth - SNAP_THRESHOLD) {
      snapWindow(windowId, 'right')
    } else if (newY <= SNAP_THRESHOLD) {
      maximizeWindow(windowId)
    } else {
      moveWindow(windowId, { x: newX, y: newY })
    }
    onSnapHint?.(null)
  }, [windowId, position, size, moveWindow, snapWindow, maximizeWindow, onSnapHint])
```

Add `onDrag={handleDrag}` to the `Motion.div`.

- [ ] **Step 2: Verify build works**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/Desktop.jsx frontend/src/os/components/Window.jsx
git commit -m "feat: add snap preview overlay and edge-snap detection on drag"
```

---

## Task 5: Keyboard shortcuts hook

**Files:**
- Create: `frontend/src/os/hooks/useGlobalShortcuts.js`
- Create: `frontend/src/os/hooks/__tests__/useGlobalShortcuts.test.js`
- Modify: `frontend/src/os/Desktop.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/hooks/__tests__/useGlobalShortcuts.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockCloseWindow = vi.fn()
const mockMinimizeWindow = vi.fn()
const mockMaximizeWindow = vi.fn()
const mockRestoreWindow = vi.fn()
const mockSnapWindow = vi.fn()
const mockCycleWindow = vi.fn()
const mockOpenApp = vi.fn()
const mockToggleLauncher = vi.fn()

let mockActiveWindowId = 'test-win'
let mockWindows = { 'test-win': { state: 'normal' } }

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      activeWindowId: mockActiveWindowId,
      windows: mockWindows,
      closeWindow: mockCloseWindow,
      minimizeWindow: mockMinimizeWindow,
      maximizeWindow: mockMaximizeWindow,
      restoreWindow: mockRestoreWindow,
      snapWindow: mockSnapWindow,
      cycleWindow: mockCycleWindow,
      openApp: mockOpenApp,
      toggleLauncher: mockToggleLauncher,
    }
    return selector(state)
  },
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_ORDER: ['media', 'email', 'chat', 'terminal', 'files', 'settings', 'sysmon', 'notes'],
}))

import useGlobalShortcuts from '../useGlobalShortcuts'

function fireAltKey(key, extra = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    altKey: true,
    bubbles: true,
    cancelable: true,
    ...extra,
  })
  document.dispatchEvent(event)
}

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveWindowId = 'test-win'
    mockWindows = { 'test-win': { state: 'normal' } }
  })

  afterEach(() => {
    // Clean up hook
  })

  it('Alt+W closes active window', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('w')
    expect(mockCloseWindow).toHaveBeenCalledWith('test-win')
  })

  it('Alt+M minimizes active window', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('m')
    expect(mockMinimizeWindow).toHaveBeenCalledWith('test-win')
  })

  it('Alt+ArrowUp maximizes normal window', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('ArrowUp')
    expect(mockMaximizeWindow).toHaveBeenCalledWith('test-win')
  })

  it('Alt+ArrowUp restores maximized window', () => {
    mockWindows = { 'test-win': { state: 'maximized' } }
    renderHook(() => useGlobalShortcuts())
    fireAltKey('ArrowUp')
    expect(mockRestoreWindow).toHaveBeenCalledWith('test-win')
  })

  it('Alt+ArrowLeft snaps left', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('ArrowLeft')
    expect(mockSnapWindow).toHaveBeenCalledWith('test-win', 'left')
  })

  it('Alt+ArrowRight snaps right', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('ArrowRight')
    expect(mockSnapWindow).toHaveBeenCalledWith('test-win', 'right')
  })

  it('Alt+] cycles next', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey(']')
    expect(mockCycleWindow).toHaveBeenCalledWith('next')
  })

  it('Alt+[ cycles prev', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('[')
    expect(mockCycleWindow).toHaveBeenCalledWith('prev')
  })

  it('Alt+1 opens first app', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('1')
    expect(mockOpenApp).toHaveBeenCalledWith('media')
  })

  it('Alt+L toggles launcher', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('l')
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('ignores non-Alt keystrokes', () => {
    renderHook(() => useGlobalShortcuts())
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', altKey: false, bubbles: true }))
    expect(mockCloseWindow).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/hooks/__tests__/useGlobalShortcuts.test.js
```

- [ ] **Step 3: Implement useGlobalShortcuts**

Create `frontend/src/os/hooks/useGlobalShortcuts.js`:

```js
import { useEffect } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { APP_ORDER } from '../stores/appRegistry'

export default function useGlobalShortcuts() {
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const windows = useWindowStore((s) => s.windows)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const snapWindow = useWindowStore((s) => s.snapWindow)
  const cycleWindow = useWindowStore((s) => s.cycleWindow)
  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  useEffect(() => {
    const handler = (e) => {
      if (!e.altKey) return

      const key = e.key.toLowerCase()
      const activeWin = activeWindowId ? windows[activeWindowId] : null

      switch (key) {
        case 'w':
          if (activeWindowId) {
            e.preventDefault()
            closeWindow(activeWindowId)
          }
          break

        case 'm':
          if (activeWindowId) {
            e.preventDefault()
            minimizeWindow(activeWindowId)
          }
          break

        case 'arrowup':
          if (activeWindowId) {
            e.preventDefault()
            if (activeWin?.state === 'maximized') {
              restoreWindow(activeWindowId)
            } else {
              maximizeWindow(activeWindowId)
            }
          }
          break

        case 'arrowleft':
          if (activeWindowId) {
            e.preventDefault()
            snapWindow(activeWindowId, 'left')
          }
          break

        case 'arrowright':
          if (activeWindowId) {
            e.preventDefault()
            snapWindow(activeWindowId, 'right')
          }
          break

        case ']':
          e.preventDefault()
          cycleWindow('next')
          break

        case '[':
          e.preventDefault()
          cycleWindow('prev')
          break

        case 'l':
          e.preventDefault()
          toggleLauncher()
          break

        default:
          // Alt+1 through Alt+8
          if (key >= '1' && key <= '8') {
            const idx = parseInt(key, 10) - 1
            if (idx < APP_ORDER.length) {
              e.preventDefault()
              openApp(APP_ORDER[idx])
            }
          }
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [
    activeWindowId, windows, closeWindow, minimizeWindow,
    maximizeWindow, restoreWindow, snapWindow, cycleWindow,
    openApp, toggleLauncher,
  ])
}
```

- [ ] **Step 4: Wire into Desktop.jsx**

In `frontend/src/os/Desktop.jsx`, add the import and call:

```js
import useGlobalShortcuts from './hooks/useGlobalShortcuts'
```

Inside the `Desktop` component, before the return:

```js
  useGlobalShortcuts()
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/hooks/__tests__/useGlobalShortcuts.test.js
```

- [ ] **Step 6: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/hooks/useGlobalShortcuts.js frontend/src/os/hooks/__tests__/useGlobalShortcuts.test.js frontend/src/os/Desktop.jsx
git commit -m "feat: add Alt-key global shortcuts for window management"
```

---

## Task 6: App Launcher search

**Files:**
- Modify: `frontend/src/os/components/AppLauncher.jsx`
- Modify: `frontend/src/os/components/__tests__/AppLauncher.test.jsx`

- [ ] **Step 1: Write failing tests for search**

Append to `frontend/src/os/components/__tests__/AppLauncher.test.jsx`:

```jsx
  it('filters apps by search query', () => {
    render(<AppLauncher />)
    const input = screen.getByPlaceholderText('search::applications...')
    fireEvent.change(input, { target: { value: 'med' } })
    expect(screen.getByText('Media Vault')).toBeDefined()
    expect(screen.queryByText('AI Chat')).toBeNull()
  })

  it('launches first result on Enter', () => {
    render(<AppLauncher />)
    const input = screen.getByPlaceholderText('search::applications...')
    fireEvent.change(input, { target: { value: 'med' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockOpenApp).toHaveBeenCalledWith('media')
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('shows all apps when search is empty', () => {
    render(<AppLauncher />)
    expect(screen.getByText('Media Vault')).toBeDefined()
    expect(screen.getByText('AI Chat')).toBeDefined()
  })

  it('shows no matches message when nothing matches', () => {
    render(<AppLauncher />)
    const input = screen.getByPlaceholderText('search::applications...')
    fireEvent.change(input, { target: { value: 'zzzzz' } })
    expect(screen.getByText('NO_MATCHES_FOUND')).toBeDefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/AppLauncher.test.jsx
```

- [ ] **Step 3: Update AppLauncher with search**

Replace `frontend/src/os/components/AppLauncher.jsx` with:

```jsx
import { memo, useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { Search, SearchX } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'

function AppLauncher() {
  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)
  const isMobile = useWindowStore((s) => s.isMobile)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  // Auto-focus on desktop only
  useEffect(() => {
    if (!isMobile && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isMobile])

  const handleLaunch = (appId) => {
    openApp(appId)
    toggleLauncher()
  }

  // Filter apps by query
  const filtered = query.trim()
    ? APP_ORDER.filter((appId) => {
        const manifest = APP_REGISTRY[appId]
        return manifest?.title.toLowerCase().includes(query.toLowerCase())
      })
    : APP_ORDER

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault()
      handleLaunch(filtered[0])
    }
  }

  return (
    <>
      <div
        data-testid="launcher-backdrop"
        className="fixed inset-0 z-[599] bg-black/50 backdrop-blur-sm"
        onClick={toggleLauncher}
      />

      <Motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="neon-border glass-panel fixed bottom-14 left-1/2 z-[600] w-[90vw] max-w-md -translate-x-1/2 rounded-2xl p-4 shadow-[0_0_60px_rgba(0,255,255,0.05)] sm:bottom-16 sm:p-6"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <p className="mb-3 heading-display text-[10px] tracking-[0.3em] text-primary/50">
          // Applications
        </p>

        {/* Search input */}
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 focus-within:border-primary/30 focus-within:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.08)]">
          <Search size={11} className="shrink-0 text-primary/40" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="search::applications..."
            className="flex-1 bg-transparent font-mono text-[11px] text-white/70 placeholder-muted-foreground/30 focus:outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <SearchX size={24} className="text-muted-foreground/30" />
            <p className="font-mono text-[10px] text-muted-foreground/50">NO_MATCHES_FOUND</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
            {filtered.map((appId, index) => {
              const manifest = APP_REGISTRY[appId]
              if (!manifest) return null
              const Icon = manifest.icon
              const isFirst = index === 0 && query.trim().length > 0
              return (
                <button
                  key={appId}
                  type="button"
                  onClick={() => handleLaunch(appId)}
                  className={`group flex flex-col items-center gap-2 rounded-xl p-3 transition-all hover:bg-white/[0.04] hover:shadow-[0_0_15px_rgba(0,255,255,0.05)] sm:p-4 ${
                    isFirst ? 'ring-1 ring-primary/40 bg-primary/[0.04]' : ''
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] transition-all group-hover:bg-primary/10 group-hover:ring-primary/20 group-hover:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.15)] ${
                    isFirst ? 'bg-primary/10 ring-primary/20' : ''
                  }`}>
                    <Icon size={20} className={`text-muted-foreground transition-colors group-hover:text-primary ${isFirst ? 'text-primary' : ''}`} />
                  </div>
                  <span className="heading-ui text-[9px] font-semibold text-muted-foreground transition-colors group-hover:text-white sm:text-[10px]">
                    {manifest.title}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Motion.div>
    </>
  )
}

export default memo(AppLauncher)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/components/__tests__/AppLauncher.test.jsx
```

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/components/AppLauncher.jsx frontend/src/os/components/__tests__/AppLauncher.test.jsx
git commit -m "feat: add search filter to app launcher with Spotlight-style Enter"
```

---

## Task 7: Desktop hydration + integration

**Files:**
- Modify: `frontend/src/os/Desktop.jsx`

- [ ] **Step 1: Update Desktop to hydrate from storage on mount**

In `frontend/src/os/Desktop.jsx`, replace the existing "auto-open media" effect with hydration:

Replace:
```js
  useEffect(() => {
    if (Object.keys(windows).length === 0) {
      openApp('media')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

With:
```js
  const hydrateFromStorage = useWindowStore((s) => s.hydrateFromStorage)

  useEffect(() => {
    hydrateFromStorage()
    // If hydration didn't restore any windows, open the default app
    if (Object.keys(useWindowStore.getState().windows).length === 0) {
      openApp('media')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/Desktop.jsx
git commit -m "feat: hydrate window layout from localStorage on desktop mount"
```

---

## Task 8: Final integration test and cleanup

**Files:**
- No new files — fix any issues from Tasks 1-7

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test
```

- [ ] **Step 2: Run build**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

- [ ] **Step 3: Run lint**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run lint
```

- [ ] **Step 4: Manual smoke test**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run dev
```

Manual checks:
1. Drag window to left edge → cyan snap preview appears → drop → window fills left 50%
2. Drag window to right edge → snap right
3. Drag snapped window away → restores to previous size and position
4. Drag to top edge → maximizes
5. `Alt+Left` → snaps active window left
6. `Alt+Right` → snaps right
7. `Alt+Up` → maximize/restore toggle
8. `Alt+W` → closes active window
9. `Alt+M` → minimizes
10. `Alt+]` → cycles through windows
11. `Alt+1` → opens/focuses Media Vault
12. `Alt+L` → opens launcher
13. Type "ter" in launcher → shows Terminal only → press Enter → opens Terminal
14. Arrange 3 windows → refresh → same layout restores
15. Resize browser significantly → refresh → windows clamp to visible area
16. Open app on mobile viewport → no layout saved to localStorage

- [ ] **Step 5: Fix any issues**

- [ ] **Step 6: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add -A
git commit -m "chore: Phase 2 complete — window manager hardening"
```

---

## Summary

| Task | What it builds | Est. time |
|---|---|---|
| 1 | `snapWindow` + `cycleWindow` store actions + tests | 15 min |
| 2 | localStorage persistence + hydration + tests | 25 min |
| 3 | Window snapped-state CSS rendering + tests | 20 min |
| 4 | Snap preview overlay in Desktop + edge detection in Window | 20 min |
| 5 | `useGlobalShortcuts` hook + tests + Desktop wiring | 20 min |
| 6 | AppLauncher search filter + tests | 15 min |
| 7 | Desktop hydration from localStorage on mount | 10 min |
| 8 | Integration test + smoke test + fixes | 20 min |
| **Total** | | **~145 min** |
