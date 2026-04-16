import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { APP_REGISTRY } from './appRegistry'

const TASKBAR_HEIGHT = 48

function boundedSize(defaultSize) {
  return {
    width: Math.min(defaultSize.width, window.innerWidth * 0.8),
    height: Math.min(defaultSize.height, window.innerHeight * 0.8),
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
    const visible = zStack.filter(
      (id) => windows[id] && windows[id].state !== 'minimized',
    )
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
}))
