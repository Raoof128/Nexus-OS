import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Use vi.hoisted so the variable is available when vi.mock is hoisted to the top
const { mockUseAionAuth } = vi.hoisted(() => {
  const mockUseAionAuth = vi.fn(() => ({
    session: { access_token: 'tok' },
    isLoading: false,
    error: null,
  }))
  return { mockUseAionAuth }
})

// Mock auth to skip async init
vi.mock('../hooks/useAionAuth', () => ({ useAionAuth: mockUseAionAuth }))

// Mock windowStore
vi.mock('../../../stores/windowStore', () => ({
  useWindowStore: vi.fn((selector) => selector({ activeWindowId: 'aion' })),
}))

// Mock view components with simple identifiable stubs
vi.mock('../views/AionHome', () => ({
  default: ({ onNavigate }) => (
    <div data-testid="aion-home">
      <button onClick={() => onNavigate({ type: 'chat', initialMessage: 'hi' })}>go chat</button>
      <button onClick={() => onNavigate({ type: 'reader' })}>go reader</button>
    </div>
  ),
}))

vi.mock('../views/AionChat', () => ({
  default: ({ onNavigate }) => (
    <div data-testid="aion-chat">
      <button onClick={() => onNavigate({ type: 'home' })}>back</button>
    </div>
  ),
}))

vi.mock('../views/AionReader', () => ({
  default: ({ onNavigate }) => (
    <div data-testid="aion-reader">
      <button onClick={() => onNavigate({ type: 'home' })}>back</button>
    </div>
  ),
}))

import AionApp from '../AionApp'

describe('AionApp', () => {
  it('renders Home by default', () => {
    render(<AionApp windowId="aion" />)
    expect(screen.getByTestId('aion-home')).toBeDefined()
  })

  it('navigates to Chat when onNavigate called with type=chat', () => {
    render(<AionApp windowId="aion" />)
    fireEvent.click(screen.getByText('go chat'))
    expect(screen.getByTestId('aion-chat')).toBeDefined()
    expect(screen.queryByTestId('aion-home')).toBeNull()
  })

  it('navigates to Reader when onNavigate called with type=reader', () => {
    render(<AionApp windowId="aion" />)
    fireEvent.click(screen.getByText('go reader'))
    expect(screen.getByTestId('aion-reader')).toBeDefined()
  })

  it('navigates back to Home from Chat via back button', () => {
    render(<AionApp windowId="aion" />)
    fireEvent.click(screen.getByText('go chat'))
    fireEvent.click(screen.getByText('back'))
    expect(screen.getByTestId('aion-home')).toBeDefined()
  })

  it('shows loading state when auth is loading', () => {
    mockUseAionAuth.mockReturnValueOnce({ session: null, isLoading: true, error: null })
    render(<AionApp windowId="aion" />)
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('Esc key returns to Home from Chat when window is active', () => {
    render(<AionApp windowId="aion" />)
    fireEvent.click(screen.getByText('go chat'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('aion-home')).toBeDefined()
  })
})
