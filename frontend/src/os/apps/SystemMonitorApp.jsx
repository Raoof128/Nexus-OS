import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useWindowStore } from '../stores/windowStore'

const API_URL = import.meta.env.VITE_API_URL

const TABS = [
  { id: 'performance', label: 'Performance' },
  { id: 'services', label: 'Services' },
  { id: 'applications', label: 'Applications' },
]

const STATUS_LABELS = {
  online: 'Online',
  offline: 'Offline',
  checking: 'Checking…',
}

function StatusDot({ status }) {
  const colors = {
    online: 'bg-[#2e7d32]',
    offline: 'bg-destructive',
    checking: 'bg-warning',
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${colors[status] || colors.checking}`}
    />
  )
}

function DataRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  )
}

function formatTime() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export default function SystemMonitorApp() {
  const { session } = useAuth()
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)

  const [activeTab, setActiveTab] = useState('performance')

  // API healthcheck
  const [apiStatus, setApiStatus] = useState('checking')
  const [apiLatency, setApiLatency] = useState(null)
  const [lastCheck, setLastCheck] = useState(null)

  const checkHealth = useCallback(async () => {
    setApiStatus('checking')
    const start = performance.now()
    try {
      const res = await fetch(`${API_URL}/healthz`, { signal: AbortSignal.timeout(5000) })
      const latency = Math.round(performance.now() - start)
      setApiLatency(latency)
      setApiStatus(res.ok ? 'online' : 'offline')
      setLastCheck(formatTime())
    } catch {
      setApiLatency(null)
      setApiStatus('offline')
      setLastCheck(formatTime())
    }
  }, [])

  useEffect(() => {
    queueMicrotask(checkHealth)
    const interval = setInterval(checkHealth, 30_000)
    return () => clearInterval(interval)
  }, [checkHealth])

  // Performance metrics (Chrome only)
  const perfMemory = performance.memory
  const heapUsed = perfMemory ? `${Math.round(perfMemory.usedJSHeapSize / 1048576)}MB` : '—'
  const heapLimit = perfMemory ? `${Math.round(perfMemory.jsHeapSizeLimit / 1048576)}MB` : '—'
  const heapPercent = perfMemory
    ? Math.min(100, Math.round((perfMemory.usedJSHeapSize / perfMemory.jsHeapSizeLimit) * 100))
    : 0

  const connection = navigator.connection
  const networkType = connection?.effectiveType || '—'
  const downlink = connection?.downlink ? `${connection.downlink} Mbps` : '—'

  // Window stats
  const windowCount = Object.keys(windows).length
  const visibleCount = zStack.filter((id) => windows[id]?.state !== 'minimized').length
  const windowList = zStack.map((id) => windows[id]).filter(Boolean)

  const user = session?.user

  return (
    <div className="flex h-full w-full flex-col bg-background text-[12px]">
      <menu role="tablist" aria-label="Task Manager sections" className="shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`sysmon-tab-${tab.id}`}
            aria-controls={`sysmon-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </menu>

      {activeTab === 'performance' && (
        <article
          role="tabpanel"
          id="sysmon-panel-performance"
          aria-labelledby="sysmon-tab-performance"
          className="flex-1 space-y-3 overflow-y-auto p-3"
        >
          <fieldset>
            <legend>Memory</legend>
            {perfMemory ? (
              <div
                role="progressbar"
                aria-label="JS heap usage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={heapPercent}
                className="mb-2"
              >
                <div style={{ width: `${heapPercent}%` }} />
              </div>
            ) : null}
            <DataRow label="JS heap used" value={heapUsed} />
            <DataRow label="Heap limit" value={heapLimit} />
          </fieldset>

          <fieldset>
            <legend>Network</legend>
            <DataRow label="Connection" value={networkType} />
            <DataRow label="Downlink" value={downlink} />
          </fieldset>
        </article>
      )}

      {activeTab === 'services' && (
        <article
          role="tabpanel"
          id="sysmon-panel-services"
          aria-labelledby="sysmon-tab-services"
          className="flex-1 space-y-3 overflow-y-auto p-3"
        >
          <fieldset>
            <legend>API</legend>
            <div className="flex items-center justify-between gap-4 py-0.5">
              <span className="text-muted-foreground">Status</span>
              <span className="flex items-center gap-2 text-foreground">
                <StatusDot status={apiStatus} />
                {STATUS_LABELS[apiStatus] || STATUS_LABELS.checking}
              </span>
            </div>
            <DataRow label="Latency" value={apiLatency != null ? `${apiLatency}ms` : '—'} />
            <DataRow label="Endpoint" value="/healthz" />
            <DataRow label="Last check" value={lastCheck || '—'} />
          </fieldset>

          <fieldset>
            <legend>Realtime</legend>
            {/* NOTE: Supabase Realtime does not expose channel connection state easily;
                showing Subscribed (subscription registered) rather than Connected. */}
            <div className="flex items-center justify-between gap-4 py-0.5">
              <span className="text-muted-foreground">Status</span>
              <span className="flex items-center gap-2 text-foreground">
                <StatusDot status="online" />
                Subscribed
              </span>
            </div>
            <DataRow label="Protocol" value="WebSocket" />
            <DataRow label="Provider" value="Supabase" />
          </fieldset>

          <fieldset>
            <legend>Session</legend>
            <DataRow label="User" value={user?.email || '—'} />
            <DataRow label="Provider" value={user?.app_metadata?.provider || 'email'} />
            <DataRow label="Windows" value={`${visibleCount} visible / ${windowCount} total`} />
          </fieldset>
        </article>
      )}

      {activeTab === 'applications' && (
        <article
          role="tabpanel"
          id="sysmon-panel-applications"
          aria-labelledby="sysmon-tab-applications"
          className="flex-1 overflow-y-auto p-3"
        >
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Program</th>
              </tr>
            </thead>
            <tbody>
              {windowList.length > 0 ? (
                windowList.map((w) => (
                  <tr key={w.windowId}>
                    <td>{w.title}</td>
                    <td>{w.state === 'minimized' ? 'Minimized' : 'Running'}</td>
                    <td>{w.appId}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>No windows open</td>
                </tr>
              )}
            </tbody>
          </table>
        </article>
      )}

      <div className="status-bar shrink-0">
        <p className="status-bar-field">Windows: {windowCount}</p>
        <p className="status-bar-field">Visible: {visibleCount}</p>
        <p className="status-bar-field">
          API: {STATUS_LABELS[apiStatus] || STATUS_LABELS.checking}
        </p>
      </div>
    </div>
  )
}
