import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockOpenApp = vi.fn()
const mockToggleLauncher = vi.fn()

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => {
    const state = {
      openApp: mockOpenApp,
      toggleLauncher: mockToggleLauncher,
    }
    return selector(state)
  },
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    media: { id: 'media', title: 'Media Vault', icon: () => <span>M</span> },
    chat: { id: 'chat', title: 'AI Chat', icon: () => <span>C</span> },
  },
  APP_ORDER: ['media', 'chat'],
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, ...rest }) => <div onClick={onClick} {...rest}>{children}</div>,
  },
}))

import AppLauncher from '../AppLauncher'

describe('AppLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all registered apps', () => {
    render(<AppLauncher />)
    expect(screen.getByText('Media Vault')).toBeDefined()
    expect(screen.getByText('AI Chat')).toBeDefined()
  })

  it('calls openApp and toggleLauncher when app tile clicked', () => {
    render(<AppLauncher />)
    fireEvent.click(screen.getByText('Media Vault'))
    expect(mockOpenApp).toHaveBeenCalledWith('media')
    expect(mockToggleLauncher).toHaveBeenCalled()
  })

  it('closes launcher when backdrop clicked', () => {
    render(<AppLauncher />)
    fireEvent.click(screen.getByTestId('launcher-backdrop'))
    expect(mockToggleLauncher).toHaveBeenCalled()
  })
})
