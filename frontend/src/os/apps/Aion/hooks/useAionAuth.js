import { useState, useEffect } from 'react'
import { aionSupabase } from '../lib/aionSupabase'

export function useAionAuth() {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)

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
  }, [retryCount])

  const retry = () => {
    setSession(null)
    setRetryCount((c) => c + 1)
  }

  return { session, isLoading, error, retry }
}
