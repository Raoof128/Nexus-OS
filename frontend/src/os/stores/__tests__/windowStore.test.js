import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWindowStore, TASKBAR_HEIGHT } from '../windowStore'

describe('windowStore', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: {},
      zStack: [],
      activeWindowId: null,
    })
    // Mock window dimensions
    vi.stubGlobal('innerWidth', 1200)
    vi.stubGlobal('innerHeight', 800)
  })

  it('opens an app with default size and cascaded position', () => {
    const { openApp } = useWindowStore.getState()
    openApp('terminal')

    const state = useWindowStore.getState()
    const win = Object.values(state.windows)[0]

    expect(win.appId).toBe('terminal')
    expect(win.state).toBe('normal')
    expect(win.position.x).toBeGreaterThan(0)
    expect(win.position.y).toBeGreaterThan(0)
  })

  it('clamps window position correctly (relaxed constraints)', () => {
    const { openApp, moveWindow } = useWindowStore.getState()
    openApp('terminal')
    const winId = Object.keys(useWindowStore.getState().windows)[0]
    const size = useWindowStore.getState().windows[winId].size

    // Try to move too far left (should keep 80px accessible — close button area)
    moveWindow(winId, { x: -size.width - 100, y: 100 })
    expect(useWindowStore.getState().windows[winId].position.x).toBe(-size.width + 80)

    // Try to move too far right (should keep 80px accessible)
    moveWindow(winId, { x: 1200 + 100, y: 100 })
    expect(useWindowStore.getState().windows[winId].position.x).toBe(1200 - 80)

    // Try to move too far up (should clamp to 0 for titlebar)
    moveWindow(winId, { x: 100, y: -50 })
    expect(useWindowStore.getState().windows[winId].position.y).toBe(0)

    // Try to move too far down (should keep titlebar visible)
    const titlebarHeight = 36
    moveWindow(winId, { x: 100, y: 800 + 100 })
    expect(useWindowStore.getState().windows[winId].position.y).toBe(
      800 - TASKBAR_HEIGHT - titlebarHeight,
    )
  })

  it('handles maximizing and restoring', () => {
    const { openApp, maximizeWindow, restoreWindow } = useWindowStore.getState()
    openApp('terminal')
    const winId = Object.keys(useWindowStore.getState().windows)[0]

    maximizeWindow(winId)
    expect(useWindowStore.getState().windows[winId].state).toBe('maximized')

    restoreWindow(winId)
    expect(useWindowStore.getState().windows[winId].state).toBe('normal')
  })

  it('focuses window and updates zStack', () => {
    const { openApp, focusWindow } = useWindowStore.getState()
    openApp('terminal')
    openApp('notes')

    const ids = Object.keys(useWindowStore.getState().windows)
    const termId = ids.find((id) => id.startsWith('terminal'))

    focusWindow(termId)
    const state = useWindowStore.getState()
    expect(state.activeWindowId).toBe(termId)
    expect(state.zStack[state.zStack.length - 1]).toBe(termId)
  })
})
