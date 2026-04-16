import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockFocusWindow = vi.fn()
const mockToggleLauncher = vi.fn()

let mockWindows = {}
let mockZStack = []
let mockActiveWindowId = null
let mockIsMobile = false

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      windows: mockWindows,
      zStack: mockZStack,
      activeWindowId: mockActiveWindowId,
      isMobile: mockIsMobile,
      focusWindow: mockFocusWindow,
      toggleLauncher: mockToggleLauncher,
    }
    return selector(state)
  },
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: { id: 'media', title: 'Media Vault', icon: () => <span data-testid="icon-media">M</span> },
    chat: { id: 'chat', title: 'AI Chat', icon: () => <span data-testid="icon-chat">C</span> },
  },
}))

import Taskbar from '../Taskbar'

describe('Taskbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWindows = {
      media: { windowId: 'media', appId: 'media', title: 'Media Vault', state: 'normal' },
      chat: { windowId: 'chat', appId: 'chat', title: 'AI Chat', state: 'minimized' },
    }
    mockZStack = ['media', 'chat']
    mockActiveWindowId = 'media'
    mockIsMobile = false
  })

  it('renders launcher button', () => {
    render(<Taskbar />)
    expect(screen.getByLabelText('Open app launcher')).toBeDefined()
  })

  it('renders tabs for each open window', () => {
    render(<Taskbar />)
    expect(screen.getByText('Media Vault')).toBeDefined()
    expect(screen.getByText('AI Chat')).toBeDefined()
  })

  it('calls focusWindow when tab clicked', () => {
    render(<Taskbar />)
    fireEvent.click(screen.getByText('AI Chat'))
    expect(mockFocusWindow).toHaveBeenCalledWith('chat')
  })

  it('calls toggleLauncher when launcher button clicked', () => {
    render(<Taskbar />)
    fireEvent.click(screen.getByLabelText('Open app launcher'))
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('shows clock in system tray', () => {
    render(<Taskbar />)
    const timeRegex = /\d{1,2}:\d{2}/
    const tray = screen.getByTestId('system-tray')
    expect(tray.textContent).toMatch(timeRegex)
  })
})
