import { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { useWindowStore } from '../../stores/windowStore'
import { useAionAuth } from './hooks/useAionAuth'
import AionHome from './views/AionHome'
import AionChat from './views/AionChat'
import AionReader from './views/AionReader'

export default function AionApp({ windowId }) {
  const [view, setView] = useState({ type: 'home' })
  const { session, isLoading, error } = useAionAuth()
  const activeWindowId = useWindowStore((s) => s.activeWindowId)

  const navigate = (newView) => setView(newView)

  // Esc: return to Home when this window is focused and an input is not active
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return
      if (activeWindowId !== windowId) return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      setView((prev) => (prev.type === 'home' ? prev : { type: 'home' }))
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeWindowId, windowId])

  if (isLoading) {
    return (
      <div
        role="status"
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0a0a0c]"
      >
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        <p className="font-mono text-[10px] tracking-widest text-amber-500/50 uppercase">
          Connecting...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#0a0a0c] p-6">
        <AlertTriangle className="h-8 w-8 text-amber-500/60" />
        <p className="text-center font-mono text-sm text-amber-200/60">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded border border-amber-500/30 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    )
  }

  if (view.type === 'chat') {
    return <AionChat view={view} onNavigate={navigate} session={session} />
  }
  if (view.type === 'reader') {
    return <AionReader view={view} onNavigate={navigate} session={session} />
  }
  return <AionHome onNavigate={navigate} session={session} />
}
