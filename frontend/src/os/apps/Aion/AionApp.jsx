import { useState, useEffect } from 'react'
import { Loader2, Home, MessageSquare, BookOpen } from 'lucide-react'
import { useWindowStore } from '../../stores/windowStore'
import { useAionAuth } from './hooks/useAionAuth'
import AionHome from './views/AionHome'
import AionChat from './views/AionChat'
import AionReader from './views/AionReader'

const NAV_ITEMS = [
  { type: 'home', label: 'Home', Icon: Home },
  { type: 'chat', label: 'Chat', Icon: MessageSquare },
  { type: 'reader', label: 'Reader', Icon: BookOpen },
]

// Shown when the Aion Supabase env vars are missing; the auth error alone does not say what to set.
const CONFIG_MISSING = !(
  import.meta.env.VITE_AION_SUPABASE_URL && import.meta.env.VITE_AION_SUPABASE_ANON_KEY
)

export default function AionApp({ windowId }) {
  const [view, setView] = useState({ type: 'home' })
  const { session, isLoading, error, retry } = useAionAuth()
  const activeWindowId = useWindowStore((s) => s.activeWindowId)

  // Stamp each chat navigation with a unique key so AionChat's auto-submit can
  // guard against React Strict Mode's simulated double-mount.
  const navigate = (newView) =>
    setView(newView.type === 'chat' ? { ...newView, _chatKey: Date.now() } : newView)

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
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-[12px] text-muted-foreground">Connecting to Aion…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-white p-6">
        {CONFIG_MISSING ? (
          <p role="alert" className="w7-error max-w-[420px] text-center text-[12px]">
            Aion is not set up on this computer. Add VITE_AION_SUPABASE_URL and
            VITE_AION_SUPABASE_ANON_KEY to frontend/.env, then restart the app.
          </p>
        ) : (
          <p role="alert" className="w7-error max-w-[420px] text-center text-[12px]">
            Aion could not connect. {error}
          </p>
        )}
        <button type="button" onClick={retry} className="w7-btn">
          Try again
        </button>
      </div>
    )
  }

  let content
  if (view.type === 'chat') {
    content = <AionChat view={view} onNavigate={navigate} session={session} />
  } else if (view.type === 'reader') {
    content = <AionReader view={view} onNavigate={navigate} />
  } else {
    content = <AionHome onNavigate={navigate} />
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="w7-commandbar" role="toolbar" aria-label="Aion sections">
        {NAV_ITEMS.map(({ type, label, Icon }) => (
          <button
            key={type}
            type="button"
            className="w7-toolbtn"
            aria-pressed={view.type === type}
            onClick={() => navigate({ type })}
          >
            <Icon className="h-4 w-4 text-[#3d5a80]" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">{content}</div>
    </div>
  )
}
