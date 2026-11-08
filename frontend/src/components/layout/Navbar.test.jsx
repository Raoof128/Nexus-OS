import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const state = { session: null, signOut: vi.fn() }
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => state }))

import Navbar from './Navbar'

describe('Navbar', () => {
  it('renders nothing without a session', () => {
    const { container } = render(<Navbar />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the account and a Log off button with a session', () => {
    state.session = { user: { email: 'runner@nexus.net' } }
    render(<Navbar />)
    expect(screen.getByRole('navigation', { name: 'Account' })).toBeTruthy()
    expect(screen.getByText('runner@nexus.net')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Log off' }))
    expect(state.signOut).toHaveBeenCalledTimes(1)
  })
})
