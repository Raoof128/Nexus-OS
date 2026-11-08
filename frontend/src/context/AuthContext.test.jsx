import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { render, screen, act } from '@testing-library/react'

const authFetch = vi.fn()
const refreshSession = vi.fn()
vi.mock('../lib/apiClient', () => ({
  authFetch: (...args) => authFetch(...args),
  refreshSession: (...args) => refreshSession(...args),
  setAuthExpiredCallback: vi.fn(),
}))
const clear = vi.fn()
vi.mock('../lib/queryClient', () => ({ queryClient: { clear: () => clear() } }))

import { AuthProvider } from './AuthContext'
import { BOOT_RETRY_DELAYS_MS } from './auth-context'
import { useAuth } from '../hooks/useAuth'
import { setAuthExpiredCallback } from '../lib/apiClient'

let api
function Probe() {
  const auth = useAuth()
  useEffect(() => {
    api = auth
  })
  if (auth.unreachable && !auth.session) {
    return (
      <button type="button" onClick={auth.retrySession}>
        unreachable
      </button>
    )
  }
  return <span>{auth.session ? 'signed-in' : 'signed-out'}</span>
}

async function mountSignedIn() {
  authFetch.mockImplementation((path) => {
    if (path === '/auth/session') return Promise.resolve({ user: { email: 'runner@nexus.net' } })
    return Promise.reject(new Error('unexpected'))
  })
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  // Generous timeout: boot is a short async chain and the full suite runs
  // under heavy CPU load (the default 1s flaked once).
  await screen.findByText('signed-in', {}, { timeout: 5000 })
}

describe('AuthContext.verifyPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts the current session email with the password and returns true', async () => {
    await mountSignedIn()
    authFetch.mockImplementation((path) => {
      if (path === '/auth/login') return Promise.resolve({ user: { email: 'runner@nexus.net' } })
      return Promise.reject(new Error('unexpected'))
    })
    let ok
    await act(async () => {
      ok = await api.verifyPassword('correct horse battery')
    })
    expect(ok).toBe(true)
    expect(authFetch).toHaveBeenLastCalledWith('/auth/login', {
      method: 'POST',
      body: { email: 'runner@nexus.net', password: 'correct horse battery' },
    })
  })

  it('keeps the query cache on success', async () => {
    await mountSignedIn()
    clear.mockClear()
    authFetch.mockResolvedValueOnce({ user: { email: 'runner@nexus.net' } })
    await act(async () => {
      await api.verifyPassword('pw')
    })
    expect(clear).not.toHaveBeenCalled()
  })

  it('resolves false when the backend rejects the credentials', async () => {
    await mountSignedIn()
    authFetch.mockRejectedValueOnce(new Error('Invalid credentials'))
    let ok
    await act(async () => {
      ok = await api.verifyPassword('wrong')
    })
    expect(ok).toBe(false)
    expect(api.session).not.toBeNull()
  })

  it('rethrows other failures so the caller can show them', async () => {
    await mountSignedIn()
    authFetch.mockRejectedValueOnce(new Error('Request timed out. Please try again.'))
    await expect(api.verifyPassword('pw')).rejects.toThrow('Request timed out')
  })

  it('does not call the backend without an empty password or a session email', async () => {
    await mountSignedIn()
    authFetch.mockClear()
    expect(await api.verifyPassword('')).toBe(false)
    expect(authFetch).not.toHaveBeenCalled()
  })
})

describe('AuthContext session expiry and sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs out and clears the query cache when the API reports expiry', async () => {
    await mountSignedIn()
    clear.mockClear()
    const onExpired = setAuthExpiredCallback.mock.calls.at(-1)[0]
    act(() => onExpired())
    expect(api.session).toBeNull()
    expect(screen.getByText('signed-out')).toBeTruthy()
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('retries a boot-time blip quietly and signs in when the server answers', async () => {
    BOOT_RETRY_DELAYS_MS.splice(0, BOOT_RETRY_DELAYS_MS.length, 0, 0)
    authFetch
      .mockRejectedValueOnce(Object.assign(new Error('Service unavailable'), { status: 503 }))
      .mockResolvedValueOnce({ user: { email: 'runner@nexus.net' } })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await screen.findByText('signed-in')
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('reports the server as unreachable at boot instead of signing out, and Try again recovers', async () => {
    // Review M4: a 503 at boot used to land on the sign-in screen.
    BOOT_RETRY_DELAYS_MS.splice(0, BOOT_RETRY_DELAYS_MS.length, 0, 0)
    const down = () => Object.assign(new Error('Service unavailable'), { status: 503 })
    authFetch
      .mockRejectedValueOnce(down())
      .mockRejectedValueOnce(down())
      .mockRejectedValueOnce(down())
      .mockResolvedValueOnce({ user: { email: 'runner@nexus.net' } })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    const retry = await screen.findByText('unreachable')
    expect(screen.queryByText('signed-out')).toBeNull()
    expect(refreshSession).not.toHaveBeenCalled()
    act(() => retry.click())
    await screen.findByText('signed-in')
  })

  it('treats a transient refresh failure at boot as unreachable, not as expiry', async () => {
    BOOT_RETRY_DELAYS_MS.splice(0, BOOT_RETRY_DELAYS_MS.length)
    authFetch.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
    refreshSession.mockRejectedValueOnce(Object.assign(new Error('Busy'), { status: 429 }))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await screen.findByText('unreachable')
  })

  it('refreshes an expired access cookie at boot and signs in with the new session', async () => {
    authFetch
      .mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
      .mockResolvedValueOnce({ user: { email: 'runner@nexus.net' } })
    refreshSession.mockResolvedValueOnce({ user: { email: 'runner@nexus.net' } })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await screen.findByText('signed-in')
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('resolves signOut and clears the local session even when the logout call fails', async () => {
    await mountSignedIn()
    clear.mockClear()
    authFetch.mockRejectedValueOnce(new Error('Request timed out. Please try again.'))
    await act(async () => {
      await expect(api.signOut()).resolves.toBeUndefined()
    })
    expect(api.session).toBeNull()
    expect(clear).toHaveBeenCalledTimes(1)
  })
})
