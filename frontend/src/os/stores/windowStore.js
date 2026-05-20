import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { APP_REGISTRY } from './appRegistry'

export const TASKBAR_HEIGHT = 48

const STORAGE_KEY = 'nexus-os:window-layout'
const SCHEMA_VERSION = 1
const SAVE_DEBOUNCE_MS = 500

function boundedSize(defaultSize) {
  return {
    width: Math.min(defaultSize.width, window.innerWidth * 0.8),
    height: Math.min(defaultSize.height, window.innerHeight * 0.8),
  }
}

function cascadePosition(zStack, _size) {
  // Simple cascading: each new window is offset by 30px
  const offset = (zStack.length % 10) * 30
  return {
    x: Math.min(offset + 60, window.innerWidth - 100),
    y: Math.min(offset + 40, window.innerHeight - TASKBAR_HEIGHT - 100),
  }
}

function clampPosition(pos, size) {
  // Keep at least MIN_ACCESSIBLE pixels of the window's horizontal extent on
  // screen so the titlebar controls remain reachable. The close/min/max buttons
  // occupy roughly the rightmost 80px, so 80px is the minimum useful threshold.
  // Top is clamped to 0 (titlebar must not go above the viewport).
  // Bottom is clamped so the full titlebar height stays above the taskbar.
  const TITLEBAR_H = 36
  const MIN_ACCESSIBLE = 80
  return {
    x: Math.max(
      -(size.width - MIN_ACCESSIBLE),
      Math.min(pos.x, window.innerWidth - MIN_ACCESSIBLE),
    ),
    y: Math.max(0, Math.min(pos.y, window.innerHeight - TASKBAR_HEIGHT - TITLEBAR_H)),
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
          [windowId]: { ...win, position: clampPosition(pos, win.size) },
        },
      }
    })
  },

  updateWindowRect: (windowId, { position, size }) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state

      const newSize = {
        width: Math.max(size.width, win.minSize.width),
        height: Math.max(size.height, win.minSize.height),
      }

      return {
        windows: {
          ...state.windows,
          [windowId]: {
            ...win,
            size: newSize,
            position: clampPosition(position, newSize),
          },
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

  hydrateFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const saved = JSON.parse(raw)
      if (!saved || saved.schemaVersion !== SCHEMA_VERSION) return
      if (!saved.windows || !saved.zStack) return

      const restoredWindows = {}
      const newZStack = []
      const idMap = {}

      for (const [oldId, win] of Object.entries(saved.windows)) {
        const manifest = APP_REGISTRY[win.appId]
        if (!manifest) continue

        const newId = manifest.singleton ? win.appId : oldId
        idMap[oldId] = newId

        const x = Math.max(0, Math.min(win.position?.x ?? 0, window.innerWidth - 100))
        const y = Math.max(
          0,
          Math.min(win.position?.y ?? 0, window.innerHeight - TASKBAR_HEIGHT - 40),
        )
        const width = Math.min(win.size?.width ?? 600, window.innerWidth * 0.95)
        const height = Math.min(
          win.size?.height ?? 400,
          (window.innerHeight - TASKBAR_HEIGHT) * 0.95,
        )

        const state = win.state === 'minimized' ? 'normal' : win.state || 'normal'

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

      // Dedupe: a stale persisted zStack could contain duplicates, which
      // would then break filter/indexOf assumptions in focus/close.
      const seen = new Set()
      for (const oldId of saved.zStack) {
        const newId = idMap[oldId]
        if (newId && !seen.has(newId)) {
          newZStack.push(newId)
          seen.add(newId)
        }
      }

      if (Object.keys(restoredWindows).length === 0) return

      const newActive =
        saved.activeWindowId && idMap[saved.activeWindowId]
          ? idMap[saved.activeWindowId]
          : newZStack[newZStack.length - 1] || null

      set({
        windows: restoredWindows,
        zStack: newZStack,
        activeWindowId: newActive,
      })
    } catch {
      // Corrupt data — silently ignore
    }
  },

  cycleWindow: (direction) => {
    const { zStack, windows, activeWindowId } = get()
    const visible = zStack.filter((id) => windows[id] && windows[id].state !== 'minimized')
    if (visible.length <= 1) return
    const currentIdx = visible.indexOf(activeWindowId)
    let nextIdx
    if (direction === 'next') {
      nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % visible.length
    } else {
      nextIdx = currentIdx <= 0 ? visible.length - 1 : currentIdx - 1
    }
    get().focusWindow(visible[nextIdx])
  },

  cascadeWindows: () => {
    set((state) => {
      const newWindows = { ...state.windows }
      let offset = 0
      for (const id of state.zStack) {
        if (newWindows[id] && newWindows[id].state !== 'minimized') {
          newWindows[id] = {
            ...newWindows[id],
            state: 'normal',
            position: { x: 60 + offset, y: 40 + offset },
          }
          offset += 30
        }
      }
      return { windows: newWindows }
    })
  },

  minimizeAll: () => {
    set((state) => {
      const newWindows = { ...state.windows }
      for (const id of Object.keys(newWindows)) {
        newWindows[id] = { ...newWindows[id], state: 'minimized' }
      }
      return { windows: newWindows, activeWindowId: null }
    })
  },

  closeAll: () => {
    set({ windows: {}, zStack: [], activeWindowId: null })
  },
}))

// Debounced persistence subscriber
let saveTimeout = null
useWindowStore.subscribe((state) => {
  if (state.isMobile) return

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      const { windows, zStack, activeWindowId } = state
      // Convert minimized windows to normal before saving — hydration ignores minimized state anyway
      const windowsToSave = {}
      for (const [id, win] of Object.entries(windows)) {
        windowsToSave[id] = win.state === 'minimized' ? { ...win, state: 'normal' } : win
      }
      const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        windows: windowsToSave,
        zStack,
        activeWindowId,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      // Storage full or unavailable
    }
  }, SAVE_DEBOUNCE_MS)
})
