import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', async () => {
  const React = await import('react')
  return {
    motion: {
      div: React.forwardRef(
        (
          {
            children,
            onPointerDownCapture,
            onTransitionEnd,
            style,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            transition: _transition,
            variants: _variants,
            ...rest
          },
          ref,
        ) => (
          <div
            ref={ref}
            data-testid="window-frame"
            onPointerDownCapture={onPointerDownCapture}
            onTransitionEnd={onTransitionEnd}
            style={style}
            {...rest}
          >
            {children}
          </div>
        ),
      ),
    },
  }
})

// Mock the window store
const mockFocusWindow = vi.fn()
const mockCloseWindow = vi.fn()
const mockMinimizeWindow = vi.fn()
const mockMaximizeWindow = vi.fn()
const mockRestoreWindow = vi.fn()
const mockMoveWindow = vi.fn()
const mockSnapWindow = vi.fn()
const mockUpdateWindowRect = vi.fn()

// Mutable so a test can move focus or re-stack windows and re-render.
const mockStore = {
  activeWindowId: 'test-win',
  zStack: ['test-win'],
  isMobile: false,
}

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      ...mockStore,
      focusWindow: mockFocusWindow,
      closeWindow: mockCloseWindow,
      minimizeWindow: mockMinimizeWindow,
      maximizeWindow: mockMaximizeWindow,
      restoreWindow: mockRestoreWindow,
      moveWindow: mockMoveWindow,
      updateWindowRect: mockUpdateWindowRect,
      snapWindow: mockSnapWindow,
    }
    return selector(state)
  },
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: { id: 'media', icon: () => <span data-testid="app-icon">M</span> },
  },
}))

import Window from '../Window'

// jsdom has no PointerEvent, so fireEvent would drop clientX and button.
// A MouseEvent typed as a pointer event carries them through to React.
function firePointer(target, type, init) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
}

describe('Window', () => {
  const defaultProps = {
    windowId: 'test-win',
    appId: 'media',
    title: 'Media Vault',
    position: { x: 100, y: 50 },
    size: { width: 800, height: 600 },
    minSize: { width: 400, height: 300 },
    state: 'normal',
    restoredRect: { x: 100, y: 50, width: 800, height: 600 },
    zIndex: 101,
    desktopRef: { current: document.createElement('div') },
    children: <div data-testid="app-content">App Content</div>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.activeWindowId = 'test-win'
    mockStore.zStack = ['test-win']
    mockStore.isMobile = false
  })

  it('renders title bar with app title', () => {
    render(<Window {...defaultProps} />)
    expect(screen.getByText('Media Vault')).toBeDefined()
  })

  it('renders children inside content area', () => {
    render(<Window {...defaultProps} />)
    expect(screen.getByTestId('app-content')).toBeDefined()
  })

  it('renders close, minimize, maximize buttons', () => {
    render(<Window {...defaultProps} />)
    expect(screen.getByLabelText('Close window')).toBeDefined()
    expect(screen.getByLabelText('Minimize window')).toBeDefined()
    expect(screen.getByLabelText('Maximize window')).toBeDefined()
  })

  it('calls closeWindow when close button clicked', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Close window'))
    expect(mockCloseWindow).toHaveBeenCalledWith('test-win')
  })

  it('calls minimizeWindow when minimize button clicked', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Minimize window'))
    expect(mockMinimizeWindow).toHaveBeenCalledWith('test-win')
  })

  it('calls maximizeWindow when maximize button clicked', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Maximize window'))
    expect(mockMaximizeWindow).toHaveBeenCalledWith('test-win')
  })

  it('calls restoreWindow when maximize clicked on maximized window', () => {
    render(<Window {...defaultProps} state="maximized" />)
    fireEvent.click(screen.getByLabelText('Restore window'))
    expect(mockRestoreWindow).toHaveBeenCalledWith('test-win')
  })

  it('renders with CSS percentage sizing when snapped-left', () => {
    render(<Window {...defaultProps} state="snapped-left" />)
    const frame = screen.getByTestId('window-frame')
    expect(frame.style.left).toBe('0px')
    expect(frame.style.top).toBe('0px')
    expect(frame.style.width).toBe('50%')
  })

  it('renders with CSS percentage sizing when snapped-right', () => {
    render(<Window {...defaultProps} state="snapped-right" />)
    const frame = screen.getByTestId('window-frame')
    expect(frame.style.left).toBe('50%')
    expect(frame.style.width).toBe('50%')
  })

  it('gives the window a region name with the window role description', () => {
    render(<Window {...defaultProps} />)
    const region = screen.getByRole('region', { name: 'Media Vault' })
    expect(region.getAttribute('aria-roledescription')).toBe('window')
  })

  it('moves focus into the window when it becomes the active window', () => {
    render(<Window {...defaultProps} />)
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Media Vault' }))
  })

  it('opens the system menu from the title icon with Win7 menu items', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Window menu'))
    const menu = screen.getByRole('menu', { name: 'Window menu' })
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((li) => li.textContent)
    expect(labels).toEqual(['Restore', 'Move', 'Size', 'Minimize', 'Maximize', 'CloseAlt+F4'])
    // Normal window: Restore is unavailable, Move and Size are available.
    expect(menu.querySelectorAll('[aria-disabled="true"]')).toHaveLength(1)
  })

  it('disables Move and Size in the system menu while maximised', () => {
    render(<Window {...defaultProps} state="maximized" />)
    fireEvent.click(screen.getByLabelText('Window menu'))
    const menu = screen.getByRole('menu', { name: 'Window menu' })
    const disabled = [...menu.querySelectorAll('[aria-disabled="true"]')].map((li) =>
      li.textContent.replace('Alt+F4', ''),
    )
    expect(disabled).toEqual(expect.arrayContaining(['Move', 'Size', 'Maximize']))
    expect(disabled).not.toContain('Restore')
  })

  it('closes the system menu on Escape', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Window menu'))
    const menu = screen.getByRole('menu', { name: 'Window menu' })
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Window menu' })).toBeNull()
  })

  it('opens the system menu with Alt+Space', () => {
    render(<Window {...defaultProps} />)
    fireEvent.keyDown(document, { key: ' ', code: 'Space', altKey: true })
    expect(screen.getByRole('menu', { name: 'Window menu' })).toBeDefined()
  })

  it('closes the window from the system menu Close item', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Window menu'))
    const menu = screen.getByRole('menu', { name: 'Window menu' })
    fireEvent.click(within(menu).getByRole('button', { name: /Close/ }))
    expect(mockCloseWindow).toHaveBeenCalledWith('test-win')
  })

  it('moves the window with the arrow keys and commits on Enter', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Window menu'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Move' }))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(mockMoveWindow).toHaveBeenCalledWith('test-win', { x: 110, y: 60 })
  })

  it('clamps a keyboard move to the title bar height read from --w7-titlebar-h', () => {
    // innerHeight 768 (jsdom), taskbar fallback 40px. The 30px fallback title bar
    // gives a bottom limit of 698; a live 44px token gives 694.
    const press = (keys) => {
      keys.forEach((key) => fireEvent.keyDown(window, { key }))
      fireEvent.keyDown(window, { key: 'Enter' })
    }
    const moveBottom = () => {
      fireEvent.click(screen.getByLabelText('Window menu'))
      fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Move' }))
      press(Array(100).fill('ArrowDown'))
      return mockMoveWindow.mock.calls.at(-1)[1].y
    }
    try {
      document.documentElement.style.removeProperty('--w7-titlebar-h')
      const { unmount } = render(<Window {...defaultProps} />)
      expect(moveBottom()).toBe(768 - 40 - 30)
      unmount()

      vi.clearAllMocks()
      document.documentElement.style.setProperty('--w7-titlebar-h', '44px')
      render(<Window {...defaultProps} />)
      expect(moveBottom()).toBe(768 - 40 - 44)
    } finally {
      document.documentElement.style.removeProperty('--w7-titlebar-h')
    }
  })

  it('cancels a keyboard move on Escape and leaves the window where it was', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Window menu'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Move' }))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockMoveWindow).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('resizes with the arrow keys in Size mode and commits on Enter', () => {
    render(<Window {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Window menu'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Size' }))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(mockUpdateWindowRect).toHaveBeenCalledWith('test-win', {
      position: { x: 100, y: 50 },
      size: { width: 810, height: 590 },
    })
  })

  it('does not restore a maximised window on a plain click of the title bar', () => {
    render(<Window {...defaultProps} state="maximized" />)
    firePointer(screen.getByTestId('titlebar'), 'pointerdown', {
      clientX: 300,
      clientY: 10,
      button: 0,
    })
    firePointer(window, 'pointerup', { clientX: 300, clientY: 10 })
    expect(mockRestoreWindow).not.toHaveBeenCalled()
  })

  it('restores a maximised window once the pointer is dragged, then keeps dragging', () => {
    render(<Window {...defaultProps} state="maximized" />)
    firePointer(screen.getByTestId('titlebar'), 'pointerdown', {
      clientX: 300,
      clientY: 10,
      button: 0,
    })
    act(() => {
      firePointer(window, 'pointermove', { clientX: 320, clientY: 30 })
    })
    expect(mockRestoreWindow).toHaveBeenCalledWith('test-win')
    expect(mockMoveWindow).toHaveBeenCalled()
    firePointer(window, 'pointerup', { clientX: 320, clientY: 30 })
  })
  it('ends a keyboard move when focus moves to another window', () => {
    render(<Window {...defaultProps} />)
    const region = screen.getByRole('region', { name: 'Media Vault' })
    fireEvent.click(screen.getByLabelText('Window menu'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Move' }))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.focusOut(region, { relatedTarget: document.body })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(mockMoveWindow).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('brings focus back to the window when it is re-activated while already active', () => {
    const { rerender } = render(<Window {...defaultProps} />)
    const region = screen.getByRole('region', { name: 'Media Vault' })
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside)
    mockStore.zStack = ['test-win']
    rerender(<Window {...defaultProps} zIndex={102} />)
    expect(document.activeElement).toBe(region)
    outside.remove()
  })

  it('snaps left when the pointer reaches the left screen edge on release', () => {
    render(<Window {...defaultProps} />)
    firePointer(screen.getByTestId('titlebar'), 'pointerdown', {
      clientX: 300,
      clientY: 10,
      button: 0,
    })
    firePointer(window, 'pointerup', { clientX: 0, clientY: 300 })
    expect(mockSnapWindow).toHaveBeenCalledWith('test-win', 'left')
  })

  it('ends a drag on pointercancel at the last pointer position', () => {
    render(<Window {...defaultProps} />)
    firePointer(screen.getByTestId('titlebar'), 'pointerdown', {
      clientX: 300,
      clientY: 10,
      button: 0,
    })
    firePointer(window, 'pointermove', { clientX: 0, clientY: 300 })
    firePointer(window, 'pointercancel', { clientX: 0, clientY: 0 })
    expect(mockSnapWindow).toHaveBeenCalledWith('test-win', 'left')
    // The gesture is over: later moves and releases do nothing.
    firePointer(window, 'pointermove', { clientX: 500, clientY: 300 })
    firePointer(window, 'pointerup', { clientX: 500, clientY: 300 })
    expect(mockSnapWindow).toHaveBeenCalledTimes(1)
    expect(mockMoveWindow).not.toHaveBeenCalled()
  })

  it('drops an in-progress drag on unmount and resets the body cursor', () => {
    const { unmount } = render(<Window {...defaultProps} />)
    firePointer(screen.getByTestId('titlebar'), 'pointerdown', {
      clientX: 300,
      clientY: 10,
      button: 0,
    })
    firePointer(window, 'pointermove', { clientX: 330, clientY: 40 })
    expect(document.body.style.cursor).toBe('grabbing')
    unmount()
    expect(document.body.style.cursor).toBe('')
    firePointer(window, 'pointerup', { clientX: 330, clientY: 40 })
    expect(mockMoveWindow).not.toHaveBeenCalled()
    expect(mockSnapWindow).not.toHaveBeenCalled()
  })

  it('does not snap when only the window edge, not the pointer, reaches the screen edge', () => {
    render(<Window {...defaultProps} position={{ x: 0, y: 50 }} />)
    firePointer(screen.getByTestId('titlebar'), 'pointerdown', {
      clientX: 300,
      clientY: 10,
      button: 0,
    })
    firePointer(window, 'pointerup', { clientX: 300, clientY: 300 })
    expect(mockSnapWindow).not.toHaveBeenCalled()
    expect(mockMoveWindow).toHaveBeenCalledWith('test-win', { x: 0, y: 340 })
  })

  it('gives the mobile close control a 44px touch target', () => {
    mockStore.isMobile = true
    render(<Window {...defaultProps} />)
    const close = screen.getByLabelText('Close window')
    expect(close.style.minHeight).toBe('44px')
    expect(close.style.minWidth).toBe('56px')
  })
})
