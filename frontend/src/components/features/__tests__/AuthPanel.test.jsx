import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import AuthPanel from '../AuthPanel'

// Mock framer-motion to simplify test transitions
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}))

// Mock API client and hooks
vi.mock('../../../lib/apiClient', () => ({
  authFetch: vi.fn(),
}))

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../../hooks/useAuth'
import { authFetch } from '../../../lib/apiClient'

describe('AuthPanel', () => {
  const mockSignIn = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      signIn: mockSignIn,
    })
  })

  it('renders login panel by default', () => {
    render(<AuthPanel />)
    expect(screen.getByText(/system login/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/runner@nexus\.net/i)).toBeTruthy()
  })

  it('switches to register panel when link is clicked', () => {
    render(<AuthPanel />)
    fireEvent.click(screen.getByText(/create account/i))
    expect(screen.getByText(/new identity/i)).toBeTruthy()
    expect(screen.getByText(/\[reg_init\]/i)).toBeTruthy()
  })

  it('switches to forgot password panel when link is clicked', () => {
    render(<AuthPanel />)
    fireEvent.click(screen.getByText(/forgot password/i))
    expect(screen.getByText(/reset passkey/i)).toBeTruthy()
    expect(screen.getByText(/\[recovery_mode\]/i)).toBeTruthy()
  })

  it('validates password match on registration', async () => {
    render(<AuthPanel />)
    fireEvent.click(screen.getByText(/create account/i))

    const emailInput = screen.getByLabelText(/identity \/\/ email/i)
    const passInput = screen.getByLabelText(/passkey \/\/ secret/i)
    const confirmInput = screen.getByLabelText(/confirm \/\/ passkey/i)
    const submitBtn = screen.getByRole('button', { name: /create archive/i })

    fireEvent.change(emailInput, { target: { value: 'new@test.com' } })
    fireEvent.change(passInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'mismatch' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeTruthy()
    })
  })

  it('shows loading state during login', async () => {
    mockSignIn.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100)),
    )
    render(<AuthPanel />)

    const emailInput = screen.getByLabelText(/identity \/\/ email/i)
    const passInput = screen.getByLabelText(/passkey \/\/ secret/i)
    const submitBtn = screen.getByRole('button', { name: /authenticate/i })

    fireEvent.change(emailInput, { target: { value: 'user@test.com' } })
    fireEvent.change(passInput, { target: { value: 'password' } })
    fireEvent.click(submitBtn)

    expect(screen.getByText(/connecting.../i)).toBeTruthy()
  })

  it('displays API error messages', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid credentials' } })
    render(<AuthPanel />)

    const emailInput = screen.getByLabelText(/identity \/\/ email/i)
    const passInput = screen.getByLabelText(/passkey \/\/ secret/i)
    const submitBtn = screen.getByRole('button', { name: /authenticate/i })

    fireEvent.change(emailInput, { target: { value: 'user@test.com' } })
    fireEvent.change(passInput, { target: { value: 'password' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeTruthy()
    })
  })

  it('handles successful registration and switches to login', async () => {
    vi.mocked(authFetch).mockResolvedValue({ user: { id: '123' } })
    mockSignIn.mockResolvedValue({ error: null })

    render(<AuthPanel />)
    fireEvent.click(screen.getByText(/create account/i))

    const emailInput = screen.getByLabelText(/identity \/\/ email/i)
    const passInput = screen.getByLabelText(/passkey \/\/ secret/i)
    const confirmInput = screen.getByLabelText(/confirm \/\/ passkey/i)
    const submitBtn = screen.getByRole('button', { name: /create archive/i })

    fireEvent.change(emailInput, { target: { value: 'new@test.com' } })
    fireEvent.change(passInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'password123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(authFetch).toHaveBeenCalledWith('/auth/register', expect.any(Object))
    })
  })
})
