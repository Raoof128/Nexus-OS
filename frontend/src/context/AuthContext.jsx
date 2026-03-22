import { useEffect, useState } from 'react'
import { authFetch, refreshSession, setAuthExpiredCallback } from '../lib/apiClient'
import { queryClient } from '../lib/queryClient'
import { AuthContext } from './auth-context'

async function loadCurrentSession() {
  try {
    return await authFetch('/auth/session')
  } catch {
    // Only attempt refresh if session failed (user might have a valid refresh cookie)
    try {
      const refreshResult = await refreshSession()
      // Refresh succeeded — we now have fresh cookies, fetch session
      if (refreshResult) {
        return await authFetch('/auth/session')
      }
    } catch {
      // No valid session or refresh token — user is logged out
    }
    return null
  }
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
