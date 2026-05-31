import { useState, useEffect } from 'react'
import { aionSupabase } from '../lib/aionSupabase'

export function useAionAuth() {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const {
          data: { session: existing },
        } = await aionSupabase.auth.getSession()

        if (existing) {
          if (mounted) setSession(existing)
        } else {
          const { data, error: signInError } = await aionSupabase.auth.signInAnonymously()
          if (signInError) throw signInError
          if (mounted) setSession(data.session)
        }
      } catch (err) {
        if (mounted) setError(err.message)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    init()

    const {
      data: { subscription },
    } = aionSupabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) setSession(newSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { session, isLoading, error }
}
