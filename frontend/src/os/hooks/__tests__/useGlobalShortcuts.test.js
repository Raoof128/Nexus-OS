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
