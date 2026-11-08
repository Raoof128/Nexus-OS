import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useWindowStore, TASKBAR_HEIGHT, readTaskbarHeight } from '../windowStore'

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

describe('taskbar height', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: {},
      zStack: [],
      activeWindowId: null,
      taskbarHeight: TASKBAR_HEIGHT,
    })
    vi.stubGlobal('innerWidth', 1200)
    vi.stubGlobal('innerHeight', 800)
  })

  afterEach(() => {
    document.documentElement.style.removeProperty('--w7-taskbar-h')
    useWindowStore.setState({ taskbarHeight: TASKBAR_HEIGHT })
    localStorage.clear()
  })

  it('readTaskbarHeight falls back to 40 when the token is empty', () => {
    document.documentElement.style.removeProperty('--w7-taskbar-h')
    expect(readTaskbarHeight()).toBe(40)
    expect(TASKBAR_HEIGHT).toBe(40)
  })

  it('readTaskbarHeight reads the live --w7-taskbar-h value', () => {
    document.documentElement.style.setProperty('--w7-taskbar-h', '48px')
    expect(readTaskbarHeight()).toBe(48)
  })

  it('setTaskbarHeight changes the bottom clamp used by moveWindow', () => {
    const { openApp, moveWindow, setTaskbarHeight } = useWindowStore.getState()
    openApp('terminal')
    const winId = Object.keys(useWindowStore.getState().windows)[0]

    setTaskbarHeight(48)
    expect(useWindowStore.getState().taskbarHeight).toBe(48)
    moveWindow(winId, { x: 100, y: 1000 })
    expect(useWindowStore.getState().windows[winId].position.y).toBe(800 - 48 - 30)
  })

  it('re-clamps open windows when the taskbar grows', () => {
    const { openApp, moveWindow, setTaskbarHeight } = useWindowStore.getState()
    openApp('terminal')
    const winId = Object.keys(useWindowStore.getState().windows)[0]
    moveWindow(winId, { x: 100, y: 1000 })
    expect(useWindowStore.getState().windows[winId].position.y).toBe(800 - 40 - 30)

    setTaskbarHeight(48)
    expect(useWindowStore.getState().windows[winId].position.y).toBe(800 - 48 - 30)
  })

  it('leaves window objects untouched when re-clamping changes nothing', () => {
    const { openApp, setTaskbarHeight } = useWindowStore.getState()
    openApp('terminal')
    const winId = Object.keys(useWindowStore.getState().windows)[0]
    const before = useWindowStore.getState().windows[winId]

    setTaskbarHeight(48)
    expect(useWindowStore.getState().windows[winId]).toBe(before)
  })

  it('ignores non-positive and non-numeric taskbar heights', () => {
    const { setTaskbarHeight } = useWindowStore.getState()
    setTaskbarHeight(0)
    setTaskbarHeight(-4)
    setTaskbarHeight('tall')
    expect(useWindowStore.getState().taskbarHeight).toBe(TASKBAR_HEIGHT)
  })

  it('clamps a restored persisted window above the live taskbar height', () => {
    useWindowStore.setState({ taskbarHeight: 48 })
    localStorage.setItem(
      'nexus-os:window-layout',
      JSON.stringify({
        schemaVersion: 1,
        windows: {
          'terminal-abc123': {
            appId: 'terminal',
            position: { x: 100, y: 1000 },
            size: { width: 600, height: 400 },
            state: 'normal',
          },
        },
        zStack: ['terminal-abc123'],
        activeWindowId: 'terminal-abc123',
      }),
    )
    useWindowStore.getState().hydrateFromStorage()
    const win = useWindowStore.getState().windows['terminal-abc123']
    // The whole 400px frame sits above the live 48px taskbar, not just its titlebar.
    expect(win.position.y).toBe(800 - 48 - 400)
  })
})

describe('window work area', () => {
  const TB = TASKBAR_HEIGHT
  const frameOf = (id) => useWindowStore.getState().windows[id]
  const onlyId = () => Object.keys(useWindowStore.getState().windows)[0]

  beforeEach(() => {
    useWindowStore.setState({
      windows: {},
      zStack: [],
      activeWindowId: null,
      attentionIds: [],
      desktopShown: null,
      taskbarHeight: TB,
    })
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens Aion at 768x1024 with the whole frame and its caption buttons on screen', () => {
    vi.stubGlobal('innerWidth', 768)
    vi.stubGlobal('innerHeight', 1024)
    useWindowStore.getState().openApp('aion')
    const win = frameOf(onlyId())
    expect(win.position.x).toBeGreaterThanOrEqual(0)
    expect(win.position.x + win.size.width).toBeLessThanOrEqual(768)
    expect(win.position.y + win.size.height).toBeLessThanOrEqual(1024 - TB)
  })

  it('keeps the caption buttons reachable when the app minimum is wider than the screen', () => {
    vi.stubGlobal('innerWidth', 600)
    vi.stubGlobal('innerHeight', 800)
    useWindowStore.getState().openApp('aion') // minSize 700 wide
    const win = frameOf(onlyId())
    expect(win.size.width).toBe(700)
    // Right edge aligned with the screen: the close button is the rightmost control.
    expect(win.position.x + win.size.width).toBe(600)
    expect(win.position.y).toBeGreaterThanOrEqual(0)
  })

  it('fits a restored rect saved on a bigger screen', () => {
    vi.stubGlobal('innerWidth', 1200)
    vi.stubGlobal('innerHeight', 800)
    const { openApp, maximizeWindow, restoreWindow } = useWindowStore.getState()
    openApp('terminal')
    const id = onlyId()
    useWindowStore.setState((s) => ({
      windows: {
        ...s.windows,
        [id]: { ...s.windows[id], position: { x: 900, y: 600 }, size: { width: 700, height: 500 } },
      },
    }))
    maximizeWindow(id)
    vi.stubGlobal('innerWidth', 800)
    vi.stubGlobal('innerHeight', 600)
    restoreWindow(id)
    const win = frameOf(id)
    expect(win.position.x + win.size.width).toBeLessThanOrEqual(800)
    expect(win.position.y + win.size.height).toBeLessThanOrEqual(600 - TB)
  })

  it('restores a window exactly where the user left it, even partly under the taskbar', () => {
    // Review F3: restore used to pull a deliberately low window fully on screen.
    vi.stubGlobal('innerWidth', 1440)
    vi.stubGlobal('innerHeight', 900)
    const { openApp, moveWindow, maximizeWindow, restoreWindow } = useWindowStore.getState()
    openApp('terminal')
    const id = onlyId()
    moveWindow(id, { x: 200, y: 600 })
    const before = frameOf(id).position
    maximizeWindow(id)
    restoreWindow(id)
    expect(frameOf(id).position).toEqual(before)
  })

  it('stops a bottom-edge resize at the taskbar', () => {
    const { openApp, updateWindowRect } = useWindowStore.getState()
    openApp('terminal')
    const id = onlyId()
    updateWindowRect(id, {
      position: { x: 100, y: 120 },
      size: { width: 500, height: 2000 },
    })
    const win = frameOf(id)
    expect(win.position.y + win.size.height).toBeLessThanOrEqual(800 - TB)
    expect(win.position.y).toBe(120)
  })

  it('stops a right-edge resize at the screen edge', () => {
    const { openApp, updateWindowRect } = useWindowStore.getState()
    openApp('terminal')
    const id = onlyId()
    updateWindowRect(id, {
      position: { x: 500, y: 100 },
      size: { width: 3000, height: 400 },
    })
    expect(frameOf(id).position.x + frameOf(id).size.width).toBeLessThanOrEqual(1200)
  })

  it('still lets a resize respect the app minimum', () => {
    const { openApp, updateWindowRect } = useWindowStore.getState()
    openApp('terminal')
    const id = onlyId()
    const min = frameOf(id).minSize
    updateWindowRect(id, { position: { x: 100, y: 100 }, size: { width: 1, height: 1 } })
    expect(frameOf(id).size).toEqual({ width: min.width, height: min.height })
  })

  it('cascades every window inside the work area on a small screen', () => {
    vi.stubGlobal('innerWidth', 640)
    vi.stubGlobal('innerHeight', 480)
    const { openApp, cascadeWindows } = useWindowStore.getState()
    openApp('terminal')
    openApp('notes')
    openApp('files')
    openApp('settings')
    cascadeWindows()
    for (const win of Object.values(useWindowStore.getState().windows)) {
      expect(win.position.x).toBeGreaterThanOrEqual(0)
      expect(win.position.y).toBeGreaterThanOrEqual(0)
      expect(win.position.x + win.size.width).toBeLessThanOrEqual(640)
      expect(win.position.y + win.size.height).toBeLessThanOrEqual(480 - TB)
    }
  })

  it('closeAll clears attention flashes and the Show desktop memory', () => {
    const { openApp, requestAttention, minimizeAll, closeAll } = useWindowStore.getState()
    openApp('terminal')
    openApp('notes')
    requestAttention('terminal')
    minimizeAll()
    expect(useWindowStore.getState().desktopShown).not.toBeNull()
    closeAll()
    const state = useWindowStore.getState()
    expect(state.windows).toEqual({})
    expect(state.attentionIds).toEqual([])
    expect(state.desktopShown).toBeNull()
  })

  it('flushes the pending layout save on pagehide instead of waiting for the debounce', () => {
    const { openApp, moveWindow } = useWindowStore.getState()
    openApp('terminal')
    const id = onlyId()
    moveWindow(id, { x: 333, y: 150 })
    window.dispatchEvent(new Event('pagehide'))
    const saved = JSON.parse(localStorage.getItem('nexus-os:window-layout'))
    expect(saved.windows[id].position).toEqual({ x: 333, y: 150 })
  })
})
