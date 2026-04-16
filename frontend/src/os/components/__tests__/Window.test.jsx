import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onPointerDownCapture, style, ...rest }) => (
      <div data-testid="window-frame" onPointerDownCapture={onPointerDownCapture} style={style} {...rest}>
        {children}
      </div>
    ),
  },
  useDragControls: () => ({ start: vi.fn() }),
}))

// Mock the window store
const mockFocusWindow = vi.fn()
const mockCloseWindow = vi.fn()
const mockMinimizeWindow = vi.fn()
const mockMaximizeWindow = vi.fn()
const mockRestoreWindow = vi.fn()

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      activeWindowId: 'test-win',
      isMobile: false,
      focusWindow: mockFocusWindow,
      closeWindow: mockCloseWindow,
      minimizeWindow: mockMinimizeWindow,
      maximizeWindow: mockMaximizeWindow,
      restoreWindow: mockRestoreWindow,
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
})
