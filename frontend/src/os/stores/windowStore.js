import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { APP_REGISTRY } from './appRegistry'
import { TASKBAR_HEIGHT, readTaskbarHeight } from './taskbarHeight'

// Live taskbar height is --w7-taskbar-h (48px on pointer:coarse); Desktop calls
// setTaskbarHeight(readTaskbarHeight()). Re-exported for callers and tests.
export { TASKBAR_HEIGHT, readTaskbarHeight }

const STORAGE_KEY = 'nexus-os:window-layout'
const SCHEMA_VERSION = 1
const SAVE_DEBOUNCE_MS = 500

// Viewport-bounded default size. Never below the app's declared minimum: Win7
// does not open a window smaller than its minimum track size, even on a narrow
// screen (the window may then overflow the viewport instead).
function boundedSize(defaultSize, minSize) {
  return {
    width: Math.max(minSize.width, Math.min(defaultSize.width, window.innerWidth * 0.8)),
    height: Math.max(minSize.height, Math.min(defaultSize.height, window.innerHeight * 0.8)),
  }
}

function cascadePosition(zStack, _size, taskbarH) {
  // Simple cascading: each new window is offset by 30px
  const offset = (zStack.length % 10) * 30
  return {
    // Start right of the desktop icon column (DesktopIcons cell is 78px).
    x: Math.min(offset + 96, window.innerWidth - 100),
    y: Math.min(offset + 40, window.innerHeight - taskbarH - 100),
  }
}

function clampPosition(pos, size, taskbarH) {
  // Keep at least MIN_ACCESSIBLE pixels of the window's horizontal extent on
  // screen so the titlebar controls remain reachable. The close/min/max buttons
  // occupy roughly the rightmost 80px, so 80px is the minimum useful threshold.
  // Top is clamped to 0 (titlebar must not go above the viewport).
  // Bottom is clamped so the full titlebar height stays above the taskbar.
  const TITLEBAR_H = 30
  const MIN_ACCESSIBLE = 80
  return {
    x: Math.max(
      -(size.width - MIN_ACCESSIBLE),
      Math.min(pos.x, window.innerWidth - MIN_ACCESSIBLE),
    ),
    y: Math.max(0, Math.min(pos.y, window.innerHeight - taskbarH - TITLEBAR_H)),
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
  desktopShown: null,
  // Windows whose taskbar button flashes for attention (Win7 FlashWindow).
  attentionIds: [],
  // Live taskbar height in px (see readTaskbarHeight). Used for window clamping.
  taskbarHeight: TASKBAR_HEIGHT,

  openApp: (appId) => {
    const manifest = APP_REGISTRY[appId]
    if (!manifest) return

    const { windows, zStack, taskbarHeight } = get()

    // Singleton check
    if (manifest.singleton) {
      const existing = Object.values(windows).find((w) => w.appId === appId)
      if (existing) {
        get().focusWindow(existing.windowId)
        return
      }
    }

    const windowId = manifest.singleton ? appId : `${appId}-${nanoid(6)}`
    const minSize = manifest.minSize ?? { width: 0, height: 0 }
    const size = boundedSize(manifest.defaultSize, minSize)
    const position = cascadePosition(zStack, size, taskbarHeight)

    set((state) => ({
      windows: {
        ...state.windows,
        [windowId]: {
          windowId,
          appId,
          title: manifest.title,
          position,
          size,
          minSize: { ...minSize },
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
        attentionIds: state.attentionIds.filter((id) => id !== windowId),
      }
    })
  },

  // Flash the taskbar button of every window of `appId` that is not the
  // active window. Focusing or closing the window clears it.
  requestAttention: (appId) => {
    set((state) => {
      const ids = Object.values(state.windows)
        .filter((w) => w.appId === appId && w.windowId !== state.activeWindowId)
        .map((w) => w.windowId)
        .filter((id) => !state.attentionIds.includes(id))
      if (ids.length === 0) return state
      return { attentionIds: [...state.attentionIds, ...ids] }
    })
  },

  // Apps may retitle their own window (e.g. File Manager shows the folder name).
  // Blank titles are ignored so a window never ends up with no name.
  setWindowTitle: (windowId, title) => {
    set((state) => {
      const win = state.windows[windowId]
      const next = typeof title === 'string' ? title.trim().slice(0, 200) : ''
      if (!win || !next || win.title === next) return state
      return {
        windows: {
          ...state.windows,
          [windowId]: { ...win, title: next },
        },
      }
    })
  },

  focusWindow: (windowId) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state

      const newZStack = [...state.zStack.filter((id) => id !== windowId), windowId]

      if (win.state === 'minimized') {
        // Come back in the state the window was minimised from (maximised and
        // snapped windows stay maximised/snapped, as on Windows 7). Position
        // and size are untouched while minimised, so they are still correct.
        return {
          windows: {
            ...state.windows,
            [windowId]: {
              ...win,
              state: win.preMinimizeState || 'normal',
              preMinimizeState: undefined,
            },
          },
          zStack: newZStack,
          activeWindowId: windowId,
          attentionIds: state.attentionIds.filter((id) => id !== windowId),
        }
      }

      return {
        zStack: newZStack,
        activeWindowId: windowId,
        attentionIds: state.attentionIds.filter((id) => id !== windowId),
      }
    })
  },

  minimizeWindow: (windowId) => {
    set((state) => {
      const win = state.windows[windowId]
      if (!win) return state

      const newWindows = {
        ...state.windows,
        [windowId]: {
          ...win,
          state: 'minimized',
          preMinimizeState: win.state === 'minimized' ? win.preMinimizeState : win.state,
        },
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
          [windowId]: {
            ...win,
            position: clampPosition(pos, win.size, state.taskbarHeight),
          },
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
            position: clampPosition(position, newSize, state.taskbarHeight),
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

  // Called by Desktop on mount and on every (pointer: coarse) change.
  setTaskbarHeight: (height) => {
    const next = Number(height)
    if (!Number.isFinite(next) || next <= 0) return
    set((state) => (state.taskbarHeight === next ? state : { taskbarHeight: next }))
  },

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
      const { taskbarHeight } = get()

      for (const [oldId, win] of Object.entries(saved.windows)) {
        const manifest = APP_REGISTRY[win.appId]
        if (!manifest) continue

        const newId = manifest.singleton ? win.appId : oldId
        idMap[oldId] = newId

        const minSize = manifest.minSize ?? { width: 0, height: 0 }
        const x = Math.max(0, Math.min(win.position?.x ?? 0, window.innerWidth - 100))
        const y = Math.max(
          0,
          Math.min(win.position?.y ?? 0, window.innerHeight - taskbarHeight - 40),
        )
        const width = Math.max(
          minSize.width,
          Math.min(win.size?.width ?? 600, window.innerWidth * 0.95),
        )
        const height = Math.max(
          minSize.height,
          Math.min(win.size?.height ?? 400, (window.innerHeight - taskbarHeight) * 0.95),
        )

        const state = win.state === 'minimized' ? 'normal' : win.state || 'normal'

        restoredWindows[newId] = {
          windowId: newId,
          appId: win.appId,
          title: manifest.title,
          position: { x, y },
          size: { width, height },
          minSize: { ...minSize },
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
      // Remember what was on screen (bottom to top) so Show desktop can bring
      // it back whichever control hid it (taskbar strip or desktop menu).
      const shown = state.zStack.filter(
        (id) => newWindows[id] && newWindows[id].state !== 'minimized',
      )
      for (const id of Object.keys(newWindows)) {
        const win = newWindows[id]
        if (win.state === 'minimized') continue
        newWindows[id] = { ...win, state: 'minimized', preMinimizeState: win.state }
      }
      return {
        windows: newWindows,
        activeWindowId: null,
        desktopShown: shown.length > 0 ? shown : state.desktopShown,
      }
    })
  },

  // Second press of Show desktop: bring back the windows minimizeAll hid, in
  // their previous stacking order, if nothing has been opened since.
  restoreDesktop: () => {
    const ids = (get().desktopShown || []).filter((id) => get().windows[id]?.state === 'minimized')
    set({ desktopShown: null })
    ids.forEach((id) => get().focusWindow(id))
    return ids.length > 0
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
        windowsToSave[id] =
          win.state === 'minimized' ? { ...win, state: win.preMinimizeState || 'normal' } : win
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
