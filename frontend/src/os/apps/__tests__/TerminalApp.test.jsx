import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { email: 'dev@example.com', id: 'user-123' } },
  }),
}))

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => selector({
    windows: { media: { appId: 'media' }, chat: { appId: 'chat' } },
    zStack: ['media', 'chat'],
  }),
}))

import TerminalApp from '../TerminalApp'

describe('TerminalApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders input prompt', () => {
    render(<TerminalApp windowId="term-1" />)
    expect(screen.getByPlaceholderText('type a command...')).toBeDefined()
  })

  it('shows welcome message on mount', () => {
    render(<TerminalApp windowId="term-1" />)
    expect(screen.getByText(/Nexus Terminal/)).toBeDefined()
  })

  it('executes help command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    fireEvent.change(input, { target: { value: 'help' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText(/Available commands/)).toBeDefined()
  })

  it('executes whoami command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    fireEvent.change(input, { target: { value: 'whoami' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText(/dev@example.com/)).toBeDefined()
  })

  it('executes clear command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    // Run a command first
    fireEvent.change(input, { target: { value: 'whoami' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Clear
    fireEvent.change(input, { target: { value: 'clear' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Welcome message should be gone
    expect(screen.queryByText(/dev@example.com/)).toBeNull()
  })

  it('shows error for unknown command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    fireEvent.change(input, { target: { value: 'foobar' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText(/command not found: foobar/)).toBeDefined()
  })

  it('navigates command history with arrow keys', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText('type a command...')
    fireEvent.change(input, { target: { value: 'whoami' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'help' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Press up twice
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('help')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('whoami')
  })
})
