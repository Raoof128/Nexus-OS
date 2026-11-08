import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWindowStore, TASKBAR_HEIGHT } from '../windowStore'

describe('windowStore', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: {},
      zStack: [],
      activeWindowId: null,
      desktopShown: null,
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
    const titlebarHeight = 30
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
  it('restores a minimised window to the state it was minimised from', () => {
    const { openApp, maximizeWindow, minimizeWindow, focusWindow, snapWindow } =
      useWindowStore.getState()
    openApp('terminal')
    const id = Object.keys(useWindowStore.getState().windows)[0]

    maximizeWindow(id)
    minimizeWindow(id)
    expect(useWindowStore.getState().windows[id].state).toBe('minimized')
    focusWindow(id)
    expect(useWindowStore.getState().windows[id].state).toBe('maximized')

    snapWindow(id, 'left')
    minimizeWindow(id)
    focusWindow(id)
    expect(useWindowStore.getState().windows[id].state).toBe('snapped-left')
  })

  it('restoreDesktop brings back what minimizeAll hid, whichever control hid it', () => {
    const { openApp, minimizeAll, restoreDesktop, maximizeWindow } = useWindowStore.getState()
    openApp('terminal')
    openApp('notes')
    const ids = Object.keys(useWindowStore.getState().windows)
    maximizeWindow(ids[0])

    minimizeAll()
    expect(
      Object.values(useWindowStore.getState().windows).every((w) => w.state === 'minimized'),
    ).toBe(true)
    expect(restoreDesktop()).toBe(true)
    const wins = useWindowStore.getState().windows
    expect(wins[ids[0]].state).toBe('maximized')
    expect(wins[ids[1]].state).toBe('normal')
    // Stacking order is preserved: the top window before is the top window after.
    expect(useWindowStore.getState().activeWindowId).toBe(ids[1])
    // Nothing remembered any more.
    expect(useWindowStore.getState().restoreDesktop()).toBe(false)
  })

  it('setWindowTitle retitles an open window and ignores blank titles', () => {
    const { openApp, setWindowTitle } = useWindowStore.getState()
    openApp('files')
    const id = Object.keys(useWindowStore.getState().windows)[0]

    setWindowTitle(id, '  Documents  ')
    expect(useWindowStore.getState().windows[id].title).toBe('Documents')

    setWindowTitle(id, '   ')
    expect(useWindowStore.getState().windows[id].title).toBe('Documents')

    // Unknown windows are a no-op.
    setWindowTitle('missing', 'Nope')
    expect(useWindowStore.getState().windows.missing).toBeUndefined()
  })

  it('never opens a window below the app minimum, even on a narrow viewport', () => {
    vi.stubGlobal('innerWidth', 700)
    const { openApp } = useWindowStore.getState()
    openApp('media') // defaultSize 1000x700, minSize 600x400
    const win = Object.values(useWindowStore.getState().windows)[0]
    expect(win.size.width).toBe(600)
    expect(win.size.height).toBeGreaterThanOrEqual(400)
  })
})
