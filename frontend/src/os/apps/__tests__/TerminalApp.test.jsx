import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { email: 'dev@example.com', id: 'user-123' } },
  }),
}))

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) =>
    selector({
      windows: { media: { appId: 'media' }, chat: { appId: 'chat' } },
      zStack: ['media', 'chat'],
    }),
}))

import TerminalApp from '../TerminalApp'

const PLACEHOLDER = 'Type a command, or help'

function run(input, text) {
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('TerminalApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders input prompt', () => {
    render(<TerminalApp windowId="term-1" />)
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeDefined()
  })

  it('shows welcome message on mount', () => {
    render(<TerminalApp windowId="term-1" />)
    expect(screen.getByText(/Nexus Terminal/)).toBeDefined()
  })

  it('executes help command with the cmd-style header', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'help')
    expect(screen.getByText(/For more information on a specific command/)).toBeDefined()
    expect(screen.getByText(/Clear the screen/)).toBeDefined()
  })

  it('lists each command once, even when it has an alias', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'help')
    const pres = document.querySelectorAll('pre')
    const listing = pres[pres.length - 1].textContent
    expect(listing.match(/Clear the screen/g)).toHaveLength(1)
    expect(listing).toMatch(/cls/)
  })

  it('help <command> describes one command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'help ver')
    expect(screen.getByText(/VER\s+Display the operating system version/)).toBeDefined()
  })

  it('help <unknown> explains the help utility does not support it', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'help nope')
    expect(screen.getByText(/not supported by the help utility/)).toBeDefined()
  })

  it('executes whoami command', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'whoami')
    expect(screen.getByText(/dev@example.com/)).toBeDefined()
  })

  it('cls clears the output', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'whoami')
    run(input, 'cls')
    expect(screen.queryByText(/dev@example.com/)).toBeNull()
    expect(screen.queryByText(/Nexus Terminal/)).toBeNull()
  })

  it('keeps clear working as an alias of cls', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'whoami')
    run(input, 'clear')
    expect(screen.queryByText(/dev@example.com/)).toBeNull()
  })

  it('ver prints the Nexus OS version line', () => {
    render(<TerminalApp windowId="term-1" />)
    run(screen.getByPlaceholderText(PLACEHOLDER), 'ver')
    expect(screen.getByText('Nexus OS [Version 2.1.0]')).toBeDefined()
  })

  it('hostname prints the computer name', () => {
    render(<TerminalApp windowId="term-1" />)
    run(screen.getByPlaceholderText(PLACEHOLDER), 'hostname')
    expect(screen.getByText('NEXUS-PC')).toBeDefined()
  })

  it('commands are case-insensitive', () => {
    render(<TerminalApp windowId="term-1" />)
    run(screen.getByPlaceholderText(PLACEHOLDER), 'HOSTNAME')
    expect(screen.getByText('NEXUS-PC')).toBeDefined()
  })

  it('shows the cmd.exe wording for an unknown command', () => {
    render(<TerminalApp windowId="term-1" />)
    run(screen.getByPlaceholderText(PLACEHOLDER), 'foobar')
    expect(
      screen.getByText(
        /'foobar' is not recognized as an internal or external command,\s*operable program or batch file\./,
      ),
    ).toBeDefined()
    expect(screen.queryByText(/command not found/)).toBeNull()
  })

  it('draws every line in the same grey, errors included', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'foobar')
    const errorLine = screen.getByText(/is not recognized/)
    expect(errorLine.className).toContain('text-[#c0c0c0]')
    expect(errorLine.className).not.toContain('ff6b6b')
  })

  it('Escape clears the command being typed', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(input, { target: { value: 'half typed' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
  })

  it('Tab completes a unique command name and adds a space', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(input, { target: { value: 'wh' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('whoami ')
  })

  it('Tab leaves the line alone when several commands share only what is typed', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    // healthz and help both start with "he", so there is nothing more to add.
    fireEvent.change(input, { target: { value: 'he' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('he')
  })

  it('treats Object prototype names as unknown commands', () => {
    render(<TerminalApp windowId="term-1" />)
    run(screen.getByPlaceholderText(PLACEHOLDER), 'constructor')
    expect(screen.getByText(/'constructor' is not recognized/)).toBeDefined()
  })

  it('Tab leaves the line alone when no command matches', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(input, { target: { value: 'zz' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('zz')
  })

  it('Tab does not complete after the command name', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(input, { target: { value: 'echo hel' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('echo hel')
  })

  it('navigates command history with arrow keys', () => {
    render(<TerminalApp windowId="term-1" />)
    const input = screen.getByPlaceholderText(PLACEHOLDER)
    run(input, 'whoami')
    run(input, 'help')
    // Press up twice
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('help')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('whoami')
  })
})
