import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  openApp: vi.fn(),
  toggleLauncher: vi.fn(),
  minimizeAll: vi.fn(),
  cascadeWindows: vi.fn(),
  closeAll: vi.fn(),
  openPanel: vi.fn(),
  clearAll: vi.fn(),
  toggleDoNotDisturb: vi.fn(),
  setWallpaper: vi.fn(),
  setAccentColor: vi.fn(),
}))

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) =>
    selector({
      openApp: mocks.openApp,
      toggleLauncher: mocks.toggleLauncher,
      minimizeAll: mocks.minimizeAll,
      cascadeWindows: mocks.cascadeWindows,
      closeAll: mocks.closeAll,
    }),
}))

vi.mock('../../stores/notificationStore', () => ({
  useNotificationStore: (selector) =>
    selector({
      openPanel: mocks.openPanel,
      clearAll: mocks.clearAll,
      toggleDoNotDisturb: mocks.toggleDoNotDisturb,
    }),
}))

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector) =>
    selector({
      setWallpaper: mocks.setWallpaper,
      setAccentColor: mocks.setAccentColor,
      wallpaper: 'aero',
    }),
  WALLPAPER_PRESETS: {
    aero: { id: 'aero', label: 'Aero' },
    sunset: { id: 'sunset', label: 'Sunset' },
  },
  ACCENT_PRESETS: { sky: { label: 'Sky' } },
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: { id: 'media', title: 'Media Vault', icon: () => <span>M</span> },
  },
  APP_ORDER: ['media'],
}))

vi.mock('../../../lib/registerServiceWorker', () => ({
  canInstall: vi.fn(() => false),
  promptInstall: vi.fn(),
  onInstallAvailabilityChange: vi.fn(() => () => {}),
}))

const MOTION_PROPS = ['initial', 'animate', 'exit', 'transition']
const stripMotionProps = (props) =>
  Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_PROPS.includes(k)))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ref, ...rest }) => (
      <div ref={ref} {...stripMotionProps(rest)}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}))

import CommandPalette from '../CommandPalette'

function openWithShortcut() {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
}

describe('CommandPalette', () => {
  let modalRoot

  beforeEach(() => {
    vi.clearAllMocks()
    modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    document.body.appendChild(modalRoot)
  })

  afterEach(() => {
    modalRoot.remove()
  })

  it('opens as a titled dialog with a close button, with focus in the search box', () => {
    render(<CommandPalette />)
    openWithShortcut()
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDefined()
    expect(document.activeElement).toBe(
      screen.getByRole('searchbox', { name: 'Search apps and commands' }),
    )
  })

  it('closes from the title bar close button', () => {
    render(<CommandPalette />)
    openWithShortcut()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
  })

  it('closes on Escape', () => {
    render(<CommandPalette />)
    openWithShortcut()
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search apps and commands' }), {
      key: 'Escape',
    })
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
  })

  it('keeps Tab inside the dialog', () => {
    render(<CommandPalette />)
    openWithShortcut()
    const input = screen.getByRole('searchbox', { name: 'Search apps and commands' })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(input)
  })

  it('uses sentence-case labels and Action Center naming', () => {
    render(<CommandPalette />)
    openWithShortcut()
    expect(screen.getByRole('option', { name: 'Open Action Center' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Open Start menu' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Toggle do not disturb' })).toBeDefined()
    expect(screen.queryByText(/notification centre/i, { selector: '[role=option]' })).toBeNull()
    expect(screen.queryByText('Open App Launcher')).toBeNull()
  })

  it('runs the highlighted command on Enter', async () => {
    render(<CommandPalette />)
    openWithShortcut()
    const input = screen.getByRole('searchbox', { name: 'Search apps and commands' })
    fireEvent.change(input, { target: { value: 'minimize' } })
    const option = screen.getByRole('option', { name: 'Minimize all windows' })
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id)
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mocks.minimizeAll).toHaveBeenCalled())
  })

  it('shows a status message when no command matches', () => {
    render(<CommandPalette />)
    openWithShortcut()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search apps and commands' }), {
      target: { value: 'zzzz' },
    })
    expect(screen.getByRole('status')).toBeDefined()
    expect(screen.getByText('No matching commands.')).toBeDefined()
  })

  it('runs an app command on click and closes the dialog', async () => {
    render(<CommandPalette />)
    openWithShortcut()
    act(() => {
      fireEvent.click(screen.getByRole('option', { name: /Open Media Vault/ }))
    })
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
    await waitFor(() => expect(mocks.openApp).toHaveBeenCalledWith('media'))
  })

  it('closes on Escape even when focus has left the search box', () => {
    render(<CommandPalette />)
    openWithShortcut()
    act(() => document.activeElement.blur())
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
  })

  it('does not stack a second palette on top of Ask AI', () => {
    const askAi = document.createElement('div')
    askAi.setAttribute('role', 'dialog')
    askAi.setAttribute('aria-label', 'Ask AI')
    document.body.appendChild(askAi)
    render(<CommandPalette />)
    openWithShortcut()
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
    askAi.remove()
  })

  it('asks before restarting the shell and makes Cancel the default', async () => {
    render(<CommandPalette />)
    openWithShortcut()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search apps and commands' }), {
      target: { value: 'restart' },
    })
    fireEvent.click(screen.getByRole('option', { name: 'Restart Nexus OS shell' }))

    const confirm = await screen.findByRole('alertdialog', { name: 'Restart Nexus OS' })
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBe(document.activeElement)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: 'Restart Nexus OS' })).toBeNull(),
    )
  })
})
