import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { render, screen, act } from '@testing-library/react'

const authFetch = vi.fn()
vi.mock('../lib/apiClient', () => ({
  authFetch: (...args) => authFetch(...args),
  refreshSession: vi.fn(),
  setAuthExpiredCallback: vi.fn(),
}))
const clear = vi.fn()
vi.mock('../lib/queryClient', () => ({ queryClient: { clear: () => clear() } }))
vi.mock('../lib/realtimeClient', () => ({
  realtimeClient: { removeAllChannels: vi.fn().mockResolvedValue(undefined) },
}))

import { AuthProvider } from './AuthContext'
import { useAuth } from '../hooks/useAuth'

let api
function Probe() {
  const auth = useAuth()
  useEffect(() => {
    api = auth
  })
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
  await screen.findByText('signed-in')
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
