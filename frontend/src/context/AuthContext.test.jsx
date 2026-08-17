import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(),
  refreshSession: vi.fn(),
  setAuthExpiredCallback: vi.fn(),
  queryClear: vi.fn(),
  removeAllChannels: vi.fn(),
  clearLegacyStorage: vi.fn(),
  resetFileSystem: vi.fn(),
  resetNotifications: vi.fn(),
}))

vi.mock('../lib/apiClient', () => ({
  authFetch: mocks.authFetch,
  refreshSession: mocks.refreshSession,
  setAuthExpiredCallback: mocks.setAuthExpiredCallback,
}))

vi.mock('../lib/queryClient', () => ({
  queryClient: { clear: mocks.queryClear },
}))

vi.mock('../lib/realtimeClient', () => ({
  realtimeClient: { removeAllChannels: mocks.removeAllChannels },
  clearLegacyRealtimeAuthStorage: mocks.clearLegacyStorage,
}))

vi.mock('../os/stores/fileSystemStore', () => ({
  useFileSystemStore: { getState: () => ({ resetPrivateState: mocks.resetFileSystem }) },
}))

vi.mock('../os/stores/notificationStore', () => ({
  useNotificationStore: { getState: () => ({ resetPrivateState: mocks.resetNotifications }) },
}))

import { AuthProvider } from './AuthContext'
import { AuthContext } from './auth-context'

function Consumer() {
  return (
    <AuthContext.Consumer>
      {({ loading, session, signOut }) => (
        <>
          <span>{loading ? 'loading' : session?.user?.id || 'signed-out'}</span>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </>
      )}
    </AuthContext.Consumer>
  )
}

describe('AuthProvider client teardown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authFetch.mockImplementation((path) => {
      if (path === '/auth/session') return Promise.resolve({ user: { id: 'user-1' } })
      return Promise.resolve({ ok: true })
    })
    mocks.removeAllChannels.mockResolvedValue([])
  })

  it('clears Realtime credentials and cached data on logout', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )
    await screen.findByText('user-1')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    })

    expect(screen.getByText('signed-out')).toBeTruthy()
    expect(mocks.removeAllChannels).toHaveBeenCalledOnce()
    expect(mocks.clearLegacyStorage).toHaveBeenCalledOnce()
    expect(mocks.queryClear).toHaveBeenCalledOnce()
    expect(mocks.resetFileSystem).toHaveBeenCalledOnce()
    expect(mocks.resetNotifications).toHaveBeenCalledOnce()
  })

  it('fails closed and tears down client state on API auth expiry', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )
    await screen.findByText('user-1')
    const expiryCallback = mocks.setAuthExpiredCallback.mock.calls.find(
      ([callback]) => typeof callback === 'function',
    )[0]

    act(() => expiryCallback())

    expect(screen.getByText('signed-out')).toBeTruthy()
    expect(mocks.queryClear).toHaveBeenCalledOnce()
    expect(mocks.clearLegacyStorage).toHaveBeenCalledOnce()
    expect(mocks.removeAllChannels).toHaveBeenCalledOnce()
    expect(mocks.resetFileSystem).toHaveBeenCalledOnce()
    expect(mocks.resetNotifications).toHaveBeenCalledOnce()
  })
})
