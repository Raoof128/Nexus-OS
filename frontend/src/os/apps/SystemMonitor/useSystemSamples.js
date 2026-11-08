import { useEffect, useState } from 'react'
import { HISTORY_LENGTH, SAMPLE_INTERVAL_MS } from './constants'

// Long tasks older than this can no longer affect the current one-second window.
const LONG_TASK_RETENTION_MS = 10_000

// Share of the last `windowMs` that the page's main thread spent in long tasks.
// This is an estimate of this page's CPU use, not whole-system CPU.
export function busyPercent(tasks, now, windowMs) {
  if (windowMs <= 0) return 0
  const windowStart = now - windowMs
  let busy = 0
  for (const task of tasks) {
    const start = Math.max(task.startTime, windowStart)
    const end = Math.min(task.startTime + task.duration, now)
    if (end > start) busy += end - start
  }
  return Math.min(100, Math.round((busy / windowMs) * 100))
}

export function pushHistory(history, value, max = HISTORY_LENGTH) {
  const kept = history.length >= max ? history.slice(history.length - max + 1) : history.slice()
  kept.push(value)
  return kept
}

// Chromium-only. Returns null when the browser does not expose heap figures.
export function heapStats(memory) {
  if (!memory || !memory.jsHeapSizeLimit) return null
  return {
    usedBytes: memory.usedJSHeapSize,
    limitBytes: memory.jsHeapSizeLimit,
    percent: Math.min(100, Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)),
  }
}

export function supportsLongTasks() {
  try {
    return (
      typeof PerformanceObserver !== 'undefined' &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes('longtask')
    )
  } catch {
    return false
  }
}

export function readHeap() {
  return typeof performance !== 'undefined' ? heapStats(performance.memory) : null
}

export function useSystemSamples({ intervalMs = SAMPLE_INTERVAL_MS } = {}) {
  const [cpuSupported] = useState(supportsLongTasks)
  const [samples, setSamples] = useState(() => ({
    cpu: null,
    cpuHistory: [],
    heap: readHeap(),
    heapHistory: [],
  }))

  useEffect(() => {
    let longTasks = []
    let observer = null

    if (cpuSupported) {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push({ startTime: entry.startTime, duration: entry.duration })
          }
        })
        observer.observe({ type: 'longtask', buffered: true })
      } catch {
        observer = null
      }
    }

    const tick = () => {
      const now = performance.now()
      longTasks = longTasks.filter((t) => t.startTime + t.duration >= now - LONG_TASK_RETENTION_MS)
      const cpu = observer ? busyPercent(longTasks, now, intervalMs) : null
      const heap = readHeap()

      setSamples((prev) => ({
        cpu,
        cpuHistory: cpu == null ? prev.cpuHistory : pushHistory(prev.cpuHistory, cpu),
        heap,
        heapHistory: heap ? pushHistory(prev.heapHistory, heap.percent) : prev.heapHistory,
      }))
    }

    const id = setInterval(tick, intervalMs)
    return () => {
      clearInterval(id)
      observer?.disconnect()
    }
  }, [cpuSupported, intervalMs])

  return { ...samples, cpuSupported }
}
