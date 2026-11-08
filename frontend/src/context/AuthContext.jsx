import { useEffect, useState } from 'react'
import { authFetch, refreshSession, setAuthExpiredCallback } from '../lib/apiClient'
import { queryClient } from '../lib/queryClient'
import { AuthContext, BOOT_RETRY_DELAYS_MS } from './auth-context'

// Backend detail for a rejected login (auth_controller.py). Matched exactly so
// that only a credential rejection, not a network failure, reads as "wrong password".
const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials'

// Only the server rejecting the session (401/403) means it is expired. A network
// error, 5xx or 429 at boot is not a sign-out: the cookies are untouched. Boot
// retries, then reports the server as unreachable instead of showing sign-in.
function isSessionRejection(error) {
  return error?.status === 401 || error?.status === 403
}

// Resolves to { session } (null when signed out) or { unreachable: true } when
// the server could not answer for reasons other than rejecting the session.
async function loadCurrentSession() {
  // /auth/session returns:
  //   { user, expires_at, ... }  → valid session
  //   { authenticated: false }   → no cookies present at all (logged out / first visit)
  //   401/403                    → cookie present but expired — try silent refresh
  let sessionResult
  try {
    sessionResult = await authFetch('/auth/session')
  } catch (sessionError) {
    if (!isSessionRejection(sessionError)) return { unreachable: true }
    // Access cookie IS present but expired — attempt silent refresh
    try {
      const refreshResult = await refreshSession()
      // Refresh also returned no-cookie sentinel → nothing to do
      if (!refreshResult?.user) return { session: null }
      return { session: await authFetch('/auth/session') }
    } catch (refreshError) {
      return isSessionRejection(refreshError) ? { session: null } : { unreachable: true }
    }
  }

  // 200 with authenticated:false means the browser has no cookies at all.
  // Skip the refresh round-trip entirely — there is nothing to refresh.
  if (!sessionResult?.user) return { session: null }
  return { session: sessionResult }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadSessionWithRetry(isActive) {
  let result = await loadCurrentSession()
  for (const delay of BOOT_RETRY_DELAYS_MS) {
    if (!result.unreachable || !isActive()) break
    await wait(delay)
    result = await loadCurrentSession()
  }
  return result
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Expiry is a sign-out: drop the cached account data along with the session.
    setAuthExpiredCallback(() => {
      queryClient.clear()
      setSession(null)
    })
    return () => setAuthExpiredCallback(null)
  }, [])

  // True when the server could not be reached at boot (not a sign-out: the
  // cookies are untouched). App shows a "can't reach the server" message.
  const [unreachable, setUnreachable] = useState(false)
  const [bootAttempt, setBootAttempt] = useState(0)

  useEffect(() => {
    let active = true

    loadSessionWithRetry(() => active)
      .then((result) => {
        if (!active) return
        if (result.unreachable) {
          setUnreachable(true)
          return
        }
        setUnreachable(false)
        if (!result.session) queryClient.clear()
        setSession(result.session)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [bootAttempt])

  const retrySession = () => {
    setLoading(true)
    setBootAttempt((n) => n + 1)
  }

  const signIn = async (email, password) => {
    try {
      const authenticatedSession = await authFetch('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      queryClient.clear()
      setSession(authenticatedSession)
      return { data: authenticatedSession, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Re-checks the password of the signed-in user (lock screen unlock). Uses the
  // same login endpoint, but keeps the cached query data: the user is not
  // changing, so the cache must survive. Resolves false only when the backend
  // rejects the credentials; other failures (network, timeout) throw.
  const verifyPassword = async (password) => {
    const email = session?.user?.email
    if (!email || !password) return false
    try {
      const authenticatedSession = await authFetch('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      setSession(authenticatedSession)
      return true
    } catch (error) {
      if (error?.message === INVALID_CREDENTIALS_MESSAGE) return false
      throw error
    }
  }

  // Never rejects: callers (Log off, Switch user, lock screen) do not catch.
  // The local session is cleared even when the server call fails.
  const signOut = async () => {
    try {
      await authFetch('/auth/logout', { method: 'POST' })
    } catch {
      // The server-side cookies may survive; the local sign-out still happens.
    }
    queryClient.clear()
    setSession(null)
  }

  const value = {
    session,
    loading,
    unreachable,
    retrySession,
    signIn,
    signOut,
    verifyPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
