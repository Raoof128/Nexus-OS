import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const mockOpenApp = vi.fn()
const mockToggleLauncher = vi.fn()

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      openApp: mockOpenApp,
      toggleLauncher: mockToggleLauncher,
      isMobile: false,
    }
    return selector(state)
  },
}))

// Pinned by default (PINNED_APPS): chat, files, media, notes.
// Not pinned: settings, which only shows under All Programs or in Recent.
vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: { id: 'media', title: 'Media Vault', icon: () => <span>M</span> },
    chat: { id: 'chat', title: 'AI Chat', icon: () => <span>C</span> },
    files: { id: 'files', title: 'File Manager', icon: () => <span>F</span> },
    notes: { id: 'notes', title: 'Notes', icon: () => <span>N</span> },
    settings: { id: 'settings', title: 'Settings', icon: () => <span>S</span> },
  },
  APP_ORDER: ['media', 'chat', 'files', 'settings', 'notes'],
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
}))

import { AuthContext } from '../../../context/auth-context'
import AppLauncher from '../AppLauncher'

const RECENT_KEY = 'nexus.startmenu.recent'

function renderLauncher(props = {}, auth = null) {
  return render(
    <AuthContext.Provider value={auth}>
      <AppLauncher {...props} />
    </AuthContext.Provider>,
  )
}

function optionNames() {
  return screen.getAllByRole('option').map((o) => o.querySelector('.truncate').textContent)
}

describe('AppLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('shows pinned programs and an All Programs entry by default', () => {
    renderLauncher()
    expect(screen.getByText('Media Vault')).toBeDefined()
    expect(screen.getByText('AI Chat')).toBeDefined()
    expect(screen.getByRole('group', { name: 'Pinned' })).toBeDefined()
    expect(screen.getByRole('option', { name: /All Programs/ })).toBeDefined()
    expect(screen.queryByText('Settings')).toBeNull()
  })

  it('All Programs swaps to the full alphabetical list with a Back entry', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('option', { name: /All Programs/ }))
    expect(optionNames()).toEqual([
      'AI Chat',
      'File Manager',
      'Media Vault',
      'Notes',
      'Settings',
      'Back',
    ])
    expect(screen.queryByRole('group', { name: 'Pinned' })).toBeNull()

    fireEvent.click(screen.getByRole('option', { name: /Back/ }))
    expect(screen.getByRole('group', { name: 'Pinned' })).toBeDefined()
    expect(screen.queryByText('Settings')).toBeNull()
  })

  it('calls openApp and toggleLauncher when a program is clicked', () => {
    renderLauncher()
    fireEvent.click(screen.getByText('Media Vault'))
    expect(mockOpenApp).toHaveBeenCalledWith('media')
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('shows recently launched programs and records new launches', () => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['settings']))
    renderLauncher()
    const recent = screen.getByRole('group', { name: 'Recent' })
    expect(within(recent).getByText('Settings')).toBeDefined()

    fireEvent.click(screen.getByText('Media Vault'))
    expect(JSON.parse(window.localStorage.getItem(RECENT_KEY))).toEqual(['media', 'settings'])
  })

  it('ignores stored recent ids that are not registry apps', () => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['constructor', 'toString', 'settings']))
    renderLauncher()
    const recent = screen.getByRole('group', { name: 'Recent' })
    expect(within(recent).getAllByRole('option').length).toBe(1)
    expect(within(recent).getByText('Settings')).toBeDefined()
  })

  it('opens Control Panel and Documents from the places column', () => {
    renderLauncher()
    const places = screen.getByRole('navigation', { name: 'Places' })
    expect(within(places).getByRole('button', { name: 'Documents' })).toBeDefined()
    expect(within(places).getByRole('button', { name: 'Computer' })).toBeDefined()
    expect(within(places).queryByRole('button', { name: 'Notes' })).toBeNull()
    fireEvent.click(within(places).getByRole('button', { name: 'Documents' }))
    expect(mockOpenApp).toHaveBeenCalledWith('files')
    fireEvent.click(within(places).getByRole('button', { name: 'Control Panel' }))
    expect(mockOpenApp).toHaveBeenCalledWith('settings')
  })

  it('closes launcher when backdrop clicked', () => {
    renderLauncher()
    fireEvent.click(screen.getByTestId('launcher-backdrop'))
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('filters apps by search query under a Programs count header', () => {
    renderLauncher()
    const input = screen.getByPlaceholderText('Search programs')
    fireEvent.change(input, { target: { value: 'med' } })
    expect(screen.getByText('Programs (1)')).toBeDefined()
    expect(screen.getByText('Media Vault')).toBeDefined()
    expect(screen.queryByText('AI Chat')).toBeNull()
  })

  it('launches first result on Enter', () => {
    renderLauncher()
    const input = screen.getByPlaceholderText('Search programs')
    fireEvent.change(input, { target: { value: 'med' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockOpenApp).toHaveBeenCalledWith('media')
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('shows no matches message when nothing matches', () => {
    renderLauncher()
    const input = screen.getByPlaceholderText('Search programs')
    fireEvent.change(input, { target: { value: 'zzzzz' } })
    expect(screen.getByText('No items match your search.')).toBeDefined()
  })

  it('moves the selection with ArrowDown, exposes it via aria-activedescendant, and launches on Enter', () => {
    renderLauncher()
    const input = screen.getByRole('searchbox', { name: 'Search programs' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const chat = screen.getByRole('option', { name: /AI Chat/ })
    expect(chat.getAttribute('aria-selected')).toBe('false')
    // Pinned order is chat, files, media, notes, so the next row is File Manager.
    const next = screen.getByRole('option', { name: /File Manager/ })
    expect(next.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(next.id)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockOpenApp).toHaveBeenCalledWith('files')
  })

  it('offers no session actions when the desktop provides neither handler', () => {
    renderLauncher()
    expect(screen.queryByRole('button', { name: 'Shut down options' })).toBeNull()
  })

  it('keeps Lock and Log off in the Shut down menu, with Log off as the main button', () => {
    const onLock = vi.fn()
    const signOut = vi.fn()
    renderLauncher({ onLock }, { session: null, signOut })

    expect(screen.getByRole('button', { name: 'Log off' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Shut down options' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Lock' })).toBeDefined()
    expect(within(menu).getByRole('menuitem', { name: 'Log off' })).toBeDefined()

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Lock' }))
    expect(mockToggleLauncher).toHaveBeenCalled()
    expect(onLock).toHaveBeenCalled()
  })

  it('signs out from the main Log off button', () => {
    const signOut = vi.fn()
    renderLauncher({}, { session: null, signOut })
    fireEvent.click(screen.getByRole('button', { name: 'Log off' }))
    expect(signOut).toHaveBeenCalled()
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('closes the Shut down menu on Escape before closing the launcher', () => {
    renderLauncher({ onLock: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: 'Shut down options' }))
    expect(screen.getByRole('menu')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(mockToggleLauncher).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    renderLauncher()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockToggleLauncher).toHaveBeenCalled()
  })
})
