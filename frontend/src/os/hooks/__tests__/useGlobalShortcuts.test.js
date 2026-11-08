import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockCloseWindow = vi.fn()
const mockMinimizeWindow = vi.fn()
const mockMaximizeWindow = vi.fn()
const mockRestoreWindow = vi.fn()
const mockSnapWindow = vi.fn()
const mockCycleWindow = vi.fn()
const mockOpenApp = vi.fn()
const mockToggleLauncher = vi.fn()
const mockFocusWindow = vi.fn()
const mockMinimizeAll = vi.fn()
const mockRestoreDesktop = vi.fn(() => false)

let mockActiveWindowId = 'test-win'
let mockWindows = { 'test-win': { state: 'normal' } }
let mockZStack = ['test-win']

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      activeWindowId: mockActiveWindowId,
      windows: mockWindows,
      zStack: mockZStack,
      focusWindow: mockFocusWindow,
      minimizeAll: mockMinimizeAll,
      restoreDesktop: mockRestoreDesktop,
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

function fireAltKey(key) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )
}

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveWindowId = 'test-win'
    mockWindows = { 'test-win': { state: 'normal' } }
    mockZStack = ['test-win']
    mockRestoreDesktop.mockReturnValue(false)
  })

  function fireKey(init) {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    )
  }

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
  it('reads the physical key on macOS, where Option+W types a composed character', () => {
    renderHook(() => useGlobalShortcuts())
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '∑',
        code: 'KeyW',
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(mockCloseWindow).toHaveBeenCalledWith('test-win')
  })

  it('Alt+F4 closes the active window', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('F4')
    expect(mockCloseWindow).toHaveBeenCalledWith('test-win')
  })

  it('Alt+ArrowDown minimises a normal window and restores a maximised one', () => {
    renderHook(() => useGlobalShortcuts())
    fireAltKey('ArrowDown')
    expect(mockMinimizeWindow).toHaveBeenCalledWith('test-win')

    mockWindows = { 'test-win': { state: 'maximized' } }
    vi.clearAllMocks()
    renderHook(() => useGlobalShortcuts())
    fireAltKey('ArrowDown')
    expect(mockRestoreWindow).toHaveBeenCalledWith('test-win')
  })

  it('Win+ArrowUp maximises and Win+ArrowLeft snaps left', () => {
    renderHook(() => useGlobalShortcuts())
    fireKey({ key: 'ArrowUp', code: 'ArrowUp', metaKey: true })
    expect(mockMaximizeWindow).toHaveBeenCalledWith('test-win')
    fireKey({ key: 'ArrowLeft', code: 'ArrowLeft', metaKey: true })
    expect(mockSnapWindow).toHaveBeenCalledWith('test-win', 'left')
  })

  it('Win+D minimises everything when windows are visible, and restores them otherwise', () => {
    const first = renderHook(() => useGlobalShortcuts())
    fireKey({ key: 'd', code: 'KeyD', metaKey: true })
    expect(mockMinimizeAll).toHaveBeenCalled()
    first.unmount()

    mockWindows = { 'test-win': { state: 'minimized' } }
    mockZStack = ['test-win']
    vi.clearAllMocks()
    mockRestoreDesktop.mockReturnValue(true)
    renderHook(() => useGlobalShortcuts())
    fireKey({ key: 'd', code: 'KeyD', metaKey: true })
    expect(mockRestoreDesktop).toHaveBeenCalled()
    expect(mockMinimizeAll).not.toHaveBeenCalled()
  })

  it('Win+T moves focus to the first taskbar button', () => {
    const bar = document.createElement('nav')
    bar.setAttribute('data-testid', 'taskbar')
    bar.innerHTML = '<button>Start</button><button>Task</button>'
    document.body.appendChild(bar)
    renderHook(() => useGlobalShortcuts())
    fireKey({ key: 't', code: 'KeyT', metaKey: true })
    expect(document.activeElement).toBe(bar.querySelector('button'))
    bar.remove()
  })

  it('Win+2 focuses the second window in taskbar order', () => {
    mockWindows = {
      'test-win': { windowId: 'test-win', state: 'normal' },
      other: { windowId: 'other', state: 'normal' },
    }
    renderHook(() => useGlobalShortcuts())
    fireKey({ key: '2', code: 'Digit2', metaKey: true })
    expect(mockFocusWindow).toHaveBeenCalledWith('other')
  })

  it('Win+L and Ctrl+Alt+L request a lock', () => {
    const listener = vi.fn()
    window.addEventListener('nexus:lock', listener)
    renderHook(() => useGlobalShortcuts())
    fireKey({ key: 'l', code: 'KeyL', metaKey: true })
    expect(listener).toHaveBeenCalledTimes(1)
    fireKey({ key: 'l', code: 'KeyL', altKey: true, ctrlKey: true })
    expect(listener).toHaveBeenCalledTimes(2)
    // Alt+L on its own still toggles the launcher, not a lock.
    fireAltKey('l')
    expect(mockToggleLauncher).toHaveBeenCalled()
    expect(listener).toHaveBeenCalledTimes(2)
    window.removeEventListener('nexus:lock', listener)
  })

  it('does not hijack Win combinations while typing', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    renderHook(() => useGlobalShortcuts())
    fireKey({ key: 'ArrowUp', code: 'ArrowUp', metaKey: true })
    expect(mockMaximizeWindow).not.toHaveBeenCalled()
    input.remove()
  })

  it('Ctrl+Esc toggles the launcher', () => {
    renderHook(() => useGlobalShortcuts())
    fireKey({ key: 'Escape', code: 'Escape', ctrlKey: true })
    expect(mockToggleLauncher).toHaveBeenCalled()
  })
})
