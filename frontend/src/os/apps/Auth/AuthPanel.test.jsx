import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const state = { signIn: vi.fn() }
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => state }))
const authFetch = vi.fn()
vi.mock('../../../lib/apiClient', () => ({ authFetch: (...a) => authFetch(...a) }))

import AuthPanel from './AuthPanel'

describe('AuthPanel copy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
  })

  it('shows the Windows 7 wording when the backend rejects the password', async () => {
    state.signIn.mockResolvedValue({ data: null, error: new Error('Invalid credentials') })
    render(<AuthPanel />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.change(document.getElementById('login-password'), { target: { value: 'nope' } })
    fireEvent.submit(document.getElementById('login-password').closest('form'))
    expect(await screen.findByText('The user name or password is incorrect.')).toBeTruthy()
    expect(screen.queryByText('Invalid credentials')).toBeNull()
  })

  it('explains the confirm-password mismatch with a full stop and a remedy', async () => {
    render(<AuthPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    await screen.findByRole('heading', { name: 'Create an account' })
    await waitFor(() => expect(document.getElementById('reg-email')).not.toBeNull())
    fireEvent.change(document.getElementById('reg-email'), { target: { value: 'a@b.co' } })
    fireEvent.change(document.getElementById('reg-password'), {
      target: { value: 'correct horse battery' },
    })
    fireEvent.change(document.getElementById('reg-confirm'), {
      target: { value: 'different horse battery' },
    })
    fireEvent.submit(document.getElementById('reg-confirm').closest('form'))
    expect(
      await screen.findByText('The passwords do not match. Type the same password in both boxes.'),
    ).toBeTruthy()
    await waitFor(() => expect(authFetch).not.toHaveBeenCalled())
  })

  it('keeps the account-created notice when the user is sent back to sign in', async () => {
    state.signIn.mockResolvedValue({ data: null, error: new Error('Email not confirmed') })
    authFetch.mockResolvedValue({ user: { email: 'a@b.co' } })
    render(<AuthPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    await waitFor(() => expect(document.getElementById('reg-email')).not.toBeNull())
    fireEvent.change(document.getElementById('reg-email'), { target: { value: 'a@b.co' } })
    fireEvent.change(document.getElementById('reg-password'), {
      target: { value: 'correct horse battery' },
    })
    fireEvent.change(document.getElementById('reg-confirm'), {
      target: { value: 'correct horse battery' },
    })
    fireEvent.submit(document.getElementById('reg-confirm').closest('form'))

    expect(await screen.findByText('Account created. Please log in.')).toBeTruthy()
    expect(document.getElementById('login-email')).not.toBeNull()
    expect(document.getElementById('login-success')).not.toBeNull()
  })

  it('clears a sign-in error as soon as the user edits a field', async () => {
    state.signIn.mockResolvedValue({ data: null, error: new Error('Invalid credentials') })
    render(<AuthPanel />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.change(document.getElementById('login-password'), { target: { value: 'nope' } })
    fireEvent.submit(document.getElementById('login-password').closest('form'))
    expect(await screen.findByText('The user name or password is incorrect.')).toBeTruthy()

    fireEvent.change(document.getElementById('login-password'), { target: { value: 'nope again' } })
    expect(screen.queryByText('The user name or password is incorrect.')).toBeNull()
  })
})
