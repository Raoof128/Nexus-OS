import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const verifyRecoveryOtp = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/realtimeClient', () => ({
  verifyRecoveryOtp: (...args) => verifyRecoveryOtp(...args),
}))
const authFetch = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/apiClient', () => ({ authFetch: (...args) => authFetch(...args) }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ session: null, signOut: vi.fn() }) }))

import ResetPasswordPage from './ResetPasswordPage'

const EXPIRED_HEADING = 'Reset link expired'

function renderPage(props = {}) {
  const onComplete = vi.fn()
  render(<ResetPasswordPage tokenHash="recovery-hash" onComplete={onComplete} {...props} />)
  return { onComplete }
}

describe('ResetPasswordPage recovery link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
  })

  it('shows the expired panel and no password form when the link is rejected', async () => {
    verifyRecoveryOtp.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid' },
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: EXPIRED_HEADING })).toBeTruthy()
    expect(document.getElementById('new-password')).toBeNull()
    expect(document.getElementById('confirm-password')).toBeNull()
  })

  it('shows the expired panel when the exchange itself throws', async () => {
    verifyRecoveryOtp.mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage()

    expect(await screen.findByRole('heading', { name: EXPIRED_HEADING })).toBeTruthy()
    expect(document.getElementById('new-password')).toBeNull()
  })

  it('shows the expired panel when no recovery token is present at all', () => {
    render(<ResetPasswordPage onComplete={vi.fn()} />)
    expect(screen.getByRole('heading', { name: EXPIRED_HEADING })).toBeTruthy()
    expect(document.getElementById('new-password')).toBeNull()
  })

  it('exchanges the token once on the isolated recovery client and then shows the form', async () => {
    verifyRecoveryOtp.mockResolvedValue({
      data: { session: { access_token: 'access-1', refresh_token: 'refresh-1' } },
      error: null,
    })
    renderPage()

    await waitFor(() => expect(document.getElementById('new-password')).not.toBeNull())
    expect(verifyRecoveryOtp).toHaveBeenCalledTimes(1)
    expect(verifyRecoveryOtp).toHaveBeenCalledWith('recovery-hash')
    expect(screen.queryByRole('heading', { name: EXPIRED_HEADING })).toBeNull()
  })

  it('exchanges the token once even under StrictMode double effects', async () => {
    verifyRecoveryOtp.mockResolvedValue({
      data: { session: { access_token: 'access-1', refresh_token: 'refresh-1' } },
      error: null,
    })
    render(
      <StrictMode>
        <ResetPasswordPage tokenHash="recovery-hash" onComplete={vi.fn()} />
      </StrictMode>,
    )

    await waitFor(() => expect(document.getElementById('new-password')).not.toBeNull())
    expect(verifyRecoveryOtp).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: EXPIRED_HEADING })).toBeNull()
  })

  it('clears a stale mismatch message when the user edits the confirm field', async () => {
    verifyRecoveryOtp.mockResolvedValue({
      data: { session: { access_token: 'access-1', refresh_token: 'refresh-1' } },
      error: null,
    })
    renderPage()
    await waitFor(() => expect(document.getElementById('new-password')).not.toBeNull())

    fireEvent.change(document.getElementById('new-password'), {
      target: { value: 'correct horse battery' },
    })
    fireEvent.change(document.getElementById('confirm-password'), {
      target: { value: 'different horse battery' },
    })
    fireEvent.submit(document.getElementById('confirm-password').closest('form'))
    expect(await screen.findByText(/passwords do not match/i)).toBeTruthy()

    fireEvent.change(document.getElementById('confirm-password'), {
      target: { value: 'correct horse battery' },
    })
    expect(screen.queryByText(/passwords do not match/i)).toBeNull()
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('returns to sign in from the expired panel', async () => {
    verifyRecoveryOtp.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } })
    const { onComplete } = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Back to sign in' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
