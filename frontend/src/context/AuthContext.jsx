import { useEffect, useState } from 'react'
import { authFetch, refreshSession, setAuthExpiredCallback } from '../lib/apiClient'
import { queryClient } from '../lib/queryClient'
import { realtimeClient } from '../lib/realtimeClient'
import { AuthContext } from './auth-context'

async function loadCurrentSession() {
  // /auth/session returns:
  //   { user, expires_at, ... }  → valid session
  //   { authenticated: false }   → no cookies present at all (logged out / first visit)
  //   throws 401                 → cookie present but expired — try silent refresh
  let sessionResult
  try {
    sessionResult = await authFetch('/auth/session')
  } catch {
    // 401: access cookie IS present but expired — attempt silent refresh
    try {
      const refreshResult = await refreshSession()
      // Refresh also returned no-cookie sentinel → nothing to do
      if (!refreshResult?.user) return null
      return await authFetch('/auth/session')
    } catch {
      return null
    }
  }

  // 200 with authenticated:false means the browser has no cookies at all.
  // Skip the refresh round-trip entirely — there is nothing to refresh.
  if (!sessionResult?.user) return null
  return sessionResult
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAuthExpiredCallback(() => setSession(null))
    return () => setAuthExpiredCallback(null)
  }, [])

  useEffect(() => {
    let active = true

    loadCurrentSession()
      .then((currentSession) => {
        if (active) {
          if (!currentSession) {
            queryClient.clear()
          }
          setSession(currentSession)
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

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

  const signOut = async () => {
    try {
      await authFetch('/auth/logout', { method: 'POST' })
    } finally {
      // Tear down Realtime channels before clearing the session so no
      // authenticated events land in a cache that is about to be wiped.
      try {
        await realtimeClient.removeAllChannels()
      } catch {
        // Best-effort — failures here must not block logout.
      }
      queryClient.clear()
      setSession(null)
    }
  }

  const value = {
    session,
    loading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
