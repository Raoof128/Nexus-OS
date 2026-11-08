import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

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
    media: {
      id: 'media',
      title: 'Media Vault',
      icon: () => <span data-testid="icon-media">M</span>,
    },
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
    expect(screen.getByLabelText('Start')).toBeDefined()
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
    fireEvent.click(screen.getByLabelText('Start'))
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('shows clock in system tray', () => {
    render(<Taskbar />)
    const timeRegex = /\d{1,2}:\d{2}/
    const tray = screen.getByTestId('system-tray')
    expect(tray.textContent).toMatch(timeRegex)
  })

  it('keeps the Start orb popup role consistent with the launcher dialog', () => {
    render(<Taskbar />)
    expect(screen.getByLabelText('Start').getAttribute('aria-haspopup')).toBe('dialog')
  })

  it('names the tray flag Action Center', () => {
    render(<Taskbar />)
    expect(screen.getByLabelText(/^Action Center/)).toBeDefined()
    expect(screen.queryByLabelText(/^Notifications/)).toBeNull()
  })

  it('marks task buttons with attention as flashing', () => {
    render(<Taskbar flashingWindowIds={['chat']} />)
    const chat = screen.getByText('AI Chat').closest('button')
    expect(chat.classList.contains('is-flashing')).toBe(true)
    expect(
      screen.getByText('Media Vault').closest('button').classList.contains('is-flashing'),
    ).toBe(false)
  })

  describe('grouping', () => {
    beforeEach(() => {
      mockWindows = {
        media: { windowId: 'media', appId: 'media', title: 'Media Vault', state: 'normal' },
        media2: { windowId: 'media2', appId: 'media', title: 'Media Vault', state: 'normal' },
        chat: { windowId: 'chat', appId: 'chat', title: 'AI Chat', state: 'normal' },
      }
      mockZStack = ['media', 'media2', 'chat']
      mockActiveWindowId = 'chat'
    })

    it('shows one button per app with a count, and lists its windows in a menu', () => {
      render(<Taskbar />)
      const group = screen.getByRole('button', { name: 'Media Vault, 2 windows' })
      expect(group.getAttribute('aria-haspopup')).toBe('menu')
      expect(group.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(group)
      expect(group.getAttribute('aria-expanded')).toBe('true')
      const menu = screen.getByRole('menu', { name: 'Media Vault' })
      expect(menu.querySelectorAll('[role="menuitem"]').length).toBe(2)
    })

    it('focuses the chosen window from the group menu', () => {
      render(<Taskbar />)
      fireEvent.click(screen.getByRole('button', { name: 'Media Vault, 2 windows' }))
      fireEvent.click(screen.getAllByRole('menuitem')[1].querySelector('button'))
      expect(mockFocusWindow).toHaveBeenCalledWith('media2')
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('closes the group menu on Escape and returns focus to its button', () => {
      render(<Taskbar />)
      const group = screen.getByRole('button', { name: 'Media Vault, 2 windows' })
      fireEvent.click(group)
      expect(screen.getByRole('menu')).toBeDefined()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(group)
    })

    it('closes the group menu on Tab and hands focus back to the taskbar button', () => {
      render(<Taskbar />)
      const group = screen.getByRole('button', { name: 'Media Vault, 2 windows' })
      fireEvent.click(group)
      fireEvent.keyDown(document.activeElement, { key: 'Tab' })
      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(group)
    })

    it('forgets the group menu when the group shrinks, so it does not reopen later', () => {
      const { rerender } = render(<Taskbar />)
      fireEvent.click(screen.getByRole('button', { name: 'Media Vault, 2 windows' }))
      expect(screen.getByRole('menu')).toBeDefined()
      const second = mockWindows.media2
      mockWindows = { media: mockWindows.media, chat: mockWindows.chat }
      rerender(<Taskbar flashingWindowIds={[]} />)
      expect(screen.queryByRole('menu')).toBeNull()
      mockWindows = { ...mockWindows, media2: second }
      rerender(<Taskbar flashingWindowIds={['x']} />)
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('moves through the window list menu with Home and End', () => {
      render(<Taskbar />)
      fireEvent.click(screen.getByRole('button', { name: 'Media Vault, 2 windows' }))
      const items = screen.getAllByRole('menuitem').map((li) => li.querySelector('button'))
      expect(document.activeElement).toBe(items[0])
      fireEvent.keyDown(document.activeElement, { key: 'End' })
      expect(document.activeElement).toBe(items[items.length - 1])
      fireEvent.keyDown(document.activeElement, { key: 'Home' })
      expect(document.activeElement).toBe(items[0])
    })

    it('still focuses a single-window app directly', () => {
      render(<Taskbar />)
      fireEvent.click(screen.getByText('AI Chat'))
      expect(mockFocusWindow).toHaveBeenCalledWith('chat')
    })
  })

  describe('Aero Peek on Show desktop', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
      document.documentElement.removeAttribute('data-aero-peek')
    })

    it('fades windows after a hover delay and restores them on leave', () => {
      render(<Taskbar />)
      const show = screen.getByRole('button', { name: 'Show desktop' })
      fireEvent.pointerEnter(show)
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(document.documentElement.hasAttribute('data-aero-peek')).toBe(false)
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(document.documentElement.getAttribute('data-aero-peek')).toBe('true')
      fireEvent.pointerLeave(show)
      expect(document.documentElement.hasAttribute('data-aero-peek')).toBe(false)
    })

    it('does not peek when the pointer only passes over the strip', () => {
      render(<Taskbar />)
      const show = screen.getByRole('button', { name: 'Show desktop' })
      fireEvent.pointerEnter(show)
      fireEvent.pointerLeave(show)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.documentElement.hasAttribute('data-aero-peek')).toBe(false)
    })
  })

  describe('tray overflow', () => {
    it('opens a hidden-icons menu holding Do not disturb', () => {
      render(<Taskbar />)
      const chevron = screen.getByRole('button', { name: 'Show hidden icons' })
      fireEvent.click(chevron)
      expect(chevron.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('menuitem', { name: 'Do not disturb' })).toBeDefined()
    })
  })
})
