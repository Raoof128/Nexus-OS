import { useCallback, useEffect, useState } from 'react'
import { HEALTH_INTERVAL_MS } from './constants'
import { formatClockTime } from './format'

const API_URL = import.meta.env.VITE_API_URL

export function useApiHealth({ autoRefresh = true } = {}) {
  const [status, setStatus] = useState('checking')
  const [latency, setLatency] = useState(null)
  const [lastCheck, setLastCheck] = useState(null)

  const refresh = useCallback(async () => {
    setStatus('checking')
    const start = performance.now()
    try {
      const res = await fetch(`${API_URL}/healthz`, { signal: AbortSignal.timeout(5000) })
      setLatency(Math.round(performance.now() - start))
      setStatus(res.ok ? 'online' : 'offline')
    } catch {
      setLatency(null)
      setStatus('offline')
    }
    setLastCheck(formatClockTime())
  }, [])

  // Check once on open, then every 30 seconds while auto refresh is on.
  useEffect(() => {
    queueMicrotask(refresh)
  }, [refresh])

  useEffect(() => {
    if (!autoRefresh) return undefined
    const interval = setInterval(refresh, HEALTH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [autoRefresh, refresh])

  return { status, latency, lastCheck, refresh }
}
