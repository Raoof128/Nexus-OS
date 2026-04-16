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
      useWindowStore.getState().moveWindow('media', { x: 9999, y: 50 })
      const pos = useWindowStore.getState().windows.media.position
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
      expect(size.width).toBe(600)
      expect(size.height).toBe(400)
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
