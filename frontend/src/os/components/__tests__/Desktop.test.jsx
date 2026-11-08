import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

let mockWindows = {}
let mockZStack = []
let mockActiveWindowId = null
let mockIsMobile = false
let mockLauncherOpen = false
const mockHydrateNotifications = vi.fn()
const mockClaimLocalState = vi.fn()

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-a' } } }),
}))

vi.mock('../../../lib/privateState', () => ({
  claimLocalState: (...args) => mockClaimLocalState(...args),
}))

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

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector) =>
    selector({
      wallpaper: 'aero',
      hydrateSettings: vi.fn(),
    }),
  WALLPAPER_PRESETS: {
    aero: { id: 'aero', label: 'Aero', image: '/wallpapers/aero.svg' },
  },
  ACCENT_PRESETS: {
    sky: { frame: '#4580c4', label: 'Sky' },
  },
  wallpaperBackgroundStyle: () => ({ backgroundSize: 'cover' }),
}))

vi.mock('../../stores/notificationStore', () => {
  const useNotificationStore = (selector) =>
    selector({
      notifications: [],
      panelOpen: false,
      doNotDisturb: false,
      addNotification: vi.fn(),
      clearAll: vi.fn(),
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      togglePanel: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      removeNotification: vi.fn(),
      toggleDoNotDisturb: vi.fn(),
      hydrateNotifications: vi.fn(),
    })
  useNotificationStore.getState = () => ({
    addNotification: vi.fn(),
    hydrateNotifications: (...args) => mockHydrateNotifications(...args),
  })
  return { useNotificationStore }
})

vi.mock('../NotificationCenter', () => ({
  default: () => null,
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: {
      id: 'media',
      title: 'Media Vault',
      singleton: true,
      icon: () => <span>M</span>,
      component: () => <div>Media Content</div>,
    },
  },
  APP_ORDER: ['media'],
}))

vi.mock('../Window', () => ({
  default: ({ children, title }) => <div data-testid={`window-${title}`}>{children}</div>,
}))

vi.mock('../Taskbar', () => ({
  default: () => (
    <div data-testid="taskbar" className="nx-taskbar">
      Taskbar
    </div>
  ),
}))

vi.mock('../AppLauncher', () => ({
  default: () => <div data-testid="app-launcher">Launcher</div>,
}))

vi.mock('../NotificationToast', () => ({
  default: () => null,
}))

vi.mock('../DesktopIcons', () => ({
  default: () => <div data-testid="desktop-icons" />,
}))

vi.mock('../ContextMenu', () => ({
  default: ({ label }) => <div data-testid="context-menu" role="menu" aria-label={label} />,
}))

vi.mock('../BootSequence', () => ({
  default: ({ onComplete }) => {
    // Simply return null and let the test trigger onComplete if needed,
    // or call it in a way that RTL understands.
    return <div data-testid="boot-sequence" onClick={onComplete} />
  },
}))

vi.mock('../LockScreen', () => ({
  default: ({ onUnlock }) => (
    <div data-testid="lock-screen" onClick={onUnlock}>
      Locked
    </div>
  ),
}))

vi.mock('../../hooks/useGlobalShortcuts', () => ({
  default: () => {},
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  // Proxy so motion.div, motion.span etc. all just render a plain div
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag) =>
        ({ children, ...rest }) => (
          <div data-motion={String(tag)} {...rest}>
            {children}
          </div>
        ),
    },
  ),
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
    // Simulate first-ever load (no session flag)
    sessionStorage.clear()
  })

  it('renders taskbar', () => {
    render(<Desktop />)
    expect(screen.getByTestId('taskbar')).toBeDefined()
  })

  it('claims local data for the signed-in user and hydrates their notifications', () => {
    mockClaimLocalState.mockClear()
    mockHydrateNotifications.mockClear()
    render(<Desktop />)
    // Regression: hydrateNotifications() was called with no user id, so Do
    // Not Disturb and notification history never persisted (ARCH-03).
    expect(mockClaimLocalState).toHaveBeenCalledWith('user-a')
    expect(mockHydrateNotifications).toHaveBeenCalledWith('user-a')
  })

  it('renders wallpaper elements', () => {
    render(<Desktop />)
    const desktop = screen.getByTestId('desktop')
    expect(desktop).toBeDefined()
  })

  it('renders windows for non-minimized entries', () => {
    mockWindows = {
      media: {
        windowId: 'media',
        appId: 'media',
        title: 'Media Vault',
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 },
        state: 'normal',
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
        windowId: 'media',
        appId: 'media',
        title: 'Media Vault',
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
        minSize: { width: 400, height: 300 },
        state: 'minimized',
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

  it('right-click on the desktop opens the desktop menu', () => {
    render(<Desktop />)
    fireEvent.contextMenu(screen.getByTestId('desktop'))
    expect(screen.getByTestId('context-menu').getAttribute('aria-label')).toBe(
      'Desktop context menu',
    )
  })

  it('right-click on the taskbar opens the taskbar menu, not the desktop menu', () => {
    render(<Desktop />)
    fireEvent.contextMenu(screen.getByTestId('taskbar'))
    expect(screen.getByTestId('context-menu').getAttribute('aria-label')).toBe(
      'Taskbar context menu',
    )
  })

  it('nexus:lock locks the desktop', () => {
    render(<Desktop />)
    expect(screen.queryByTestId('lock-screen')).toBeNull()
    act(() => {
      window.dispatchEvent(new Event('nexus:lock'))
    })
    expect(screen.getByTestId('lock-screen')).toBeTruthy()
  })

  it('does not open a menu on the desktop while it is locked', () => {
    render(<Desktop />)
    act(() => {
      window.dispatchEvent(new Event('nexus:lock'))
    })
    fireEvent.contextMenu(screen.getByTestId('desktop'))
    expect(screen.queryByTestId('context-menu')).toBeNull()
  })
})
