import { useCallback, useEffect, useState } from 'react'
import { Activity, Globe, MonitorCog, Wifi } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useWindowStore } from '../stores/windowStore'

const API_URL = import.meta.env.VITE_API_URL

function StatusDot({ status }) {
  const colors = {
    online: 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]',
    offline: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]',
    checking: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse',
  }
  return <div className={`h-2 w-2 rounded-full ${colors[status] || colors.checking}`} />
}

function Panel({ icon: Icon, title, children }) {
  return (
    <div className="glass-panel relative rounded-xl p-3 @sm:p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="mb-3 flex items-center gap-2">
        <Icon size={12} className="text-primary" />
        <h3 className="heading-ui text-[10px] font-semibold uppercase tracking-wider text-white/60">
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

function DataRow({ label, value, mono = true }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[10px] text-white/80 ${mono ? 'font-mono' : 'heading-ui'}`}>
        {value}
      </span>
    </div>
  )
}

export default function SystemMonitorApp() {
  const { session } = useAuth()
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)

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
      setLastCheck(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      )
    } catch {
      setApiLatency(null)
      setApiStatus('offline')
      setLastCheck(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      )
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

  const connection = navigator.connection
  const networkType = connection?.effectiveType || '—'
  const downlink = connection?.downlink ? `${connection.downlink} Mbps` : '—'

  // Window stats
  const windowCount = Object.keys(windows).length
  const visibleCount = zStack.filter((id) => windows[id]?.state !== 'minimized').length
  const appCounts = Object.values(windows).reduce((acc, w) => {
    acc[w.appId] = (acc[w.appId] || 0) + 1
    return acc
  }, {})

  const user = session?.user

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar p-3 @sm:p-4">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @sm:gap-4">
        {/* API Health */}
        <Panel icon={Globe} title="API Health">
          <div className="space-y-1">
            <div className="mb-2 flex items-center gap-2">
              <StatusDot status={apiStatus} />
              <span className="heading-display text-sm font-bold text-white">
                {apiStatus === 'online'
                  ? 'ONLINE'
                  : apiStatus === 'offline'
                    ? 'OFFLINE'
                    : 'CHECKING'}
              </span>
            </div>
            <DataRow label="Latency" value={apiLatency != null ? `${apiLatency}ms` : '—'} />
            <DataRow label="Endpoint" value="/healthz" />
            <DataRow label="Last check" value={lastCheck || '—'} />
          </div>
        </Panel>

        {/* Realtime */}
        <Panel icon={Wifi} title="Realtime">
          <div className="space-y-1">
            <div className="mb-2 flex items-center gap-2">
              {/* NOTE: Supabase Realtime does not expose channel connection state easily;
                  showing ACTIVE (subscription registered) rather than CONNECTED. */}
              <StatusDot status="online" />
              <span className="heading-display text-sm font-bold text-white">ACTIVE</span>
            </div>
            <DataRow label="Protocol" value="WebSocket" />
            <DataRow label="Provider" value="Supabase" />
          </div>
        </Panel>

        {/* Session */}
        <Panel icon={MonitorCog} title="Session">
          <div className="space-y-1">
            <DataRow label="User" value={user?.email || '—'} />
            <DataRow label="Provider" value={user?.app_metadata?.provider || 'email'} />
            <DataRow label="Windows" value={`${visibleCount} visible / ${windowCount} total`} />
            {Object.entries(appCounts).map(([appId, count]) => (
              <DataRow key={appId} label={`  ${appId}`} value={`×${count}`} />
            ))}
          </div>
        </Panel>

        {/* Performance */}
        <Panel icon={Activity} title="Performance">
          <div className="space-y-1">
            <DataRow label="JS Heap" value={heapUsed} />
            <DataRow label="Heap Limit" value={heapLimit} />
            <DataRow label="Network" value={networkType} />
            <DataRow label="Downlink" value={downlink} />
          </div>
        </Panel>
      </div>
    </div>
  )
}
