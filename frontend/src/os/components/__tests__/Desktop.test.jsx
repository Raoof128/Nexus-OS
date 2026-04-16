import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let mockWindows = {}
let mockZStack = []
let mockActiveWindowId = null
let mockIsMobile = false
let mockLauncherOpen = false

vi.mock('../../stores/windowStore', () => {
  const useWindowStore = (selector) => {
    const state = {
      windows: mockWindows,
      zStack: mockZStack,
      activeWindowId: mockActiveWindowId,
      isMobile: mockIsMobile,
      launcherOpen: mockLauncherOpen,
      openApp: vi.fn(),
      setMobile: vi.fn(),
      hydrateFromStorage: vi.fn(),
    }
    return selector(state)
  }
  useWindowStore.getState = () => ({ windows: mockWindows })
  return { useWindowStore }
})

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: {
      id: 'media', title: 'Media Vault', singleton: true,
      icon: () => <span>M</span>,
      component: () => <div>Media Content</div>,
    },
  },
}))

vi.mock('../Window', () => ({
  default: ({ children, title }) => <div data-testid={`window-${title}`}>{children}</div>,
}))

vi.mock('../Taskbar', () => ({
  default: () => <div data-testid="taskbar">Taskbar</div>,
}))

vi.mock('../AppLauncher', () => ({
  default: () => <div data-testid="app-launcher">Launcher</div>,
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
}))

import Desktop from '../../Desktop'

describe('Desktop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWindows = {}
    mockZStack = []
    mockActiveWindowId = null
    mockIsMobile = false
    mockLauncherOpen = false
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it('renders taskbar', () => {
    render(<Desktop />)
    expect(screen.getByTestId('taskbar')).toBeDefined()
  })

  it('renders wallpaper elements', () => {
    render(<Desktop />)
    const desktop = screen.getByTestId('desktop')
    expect(desktop).toBeDefined()
  })

  it('renders windows for non-minimized entries', () => {
    mockWindows = {
      media: {
        windowId: 'media', appId: 'media', title: 'Media Vault',
        position: { x: 0, y: 0 }, size: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 }, state: 'normal',
        restoredRect: { x: 0, y: 0, width: 800, height: 600 },
      },
    }
    mockZStack = ['media']
    render(<Desktop />)
    expect(screen.getByTestId('window-Media Vault')).toBeDefined()
  })

  it('does not render minimized windows', () => {
    mockWindows = {
      media: {
        windowId: 'media', appId: 'media', title: 'Media Vault',
        position: { x: 0, y: 0 }, size: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 }, state: 'minimized',
        restoredRect: { x: 0, y: 0, width: 800, height: 600 },
      },
    }
    mockZStack = ['media']
    render(<Desktop />)
    expect(screen.queryByTestId('window-Media Vault')).toBeNull()
  })

  it('renders app launcher when launcherOpen is true', () => {
    mockLauncherOpen = true
    render(<Desktop />)
    expect(screen.getByTestId('app-launcher')).toBeDefined()
  })

  it('does not render app launcher when launcherOpen is false', () => {
    mockLauncherOpen = false
    render(<Desktop />)
    expect(screen.queryByTestId('app-launcher')).toBeNull()
  })
})
