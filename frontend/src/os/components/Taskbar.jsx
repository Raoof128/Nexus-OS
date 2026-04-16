import { memo, useEffect, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { useNotificationStore } from '../stores/notificationStore'
import { APP_REGISTRY } from '../stores/appRegistry'

function Clock() {
  const [time, setTime] = useState(() => {
    const now = new Date()
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="heading-ui text-[10px] font-semibold text-white/60">{time}</span>
  )
}

function NotificationBadge() {
  const notifications = useNotificationStore((s) => s.notifications)
  const unread = notifications.filter((n) => !n.read).length
  if (unread === 0) return null
  return (
    <span
      className="flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-[3px] text-[8px] font-bold leading-none text-black"
      aria-label={`${unread} unread notification${unread !== 1 ? 's' : ''}`}
    >
      {unread > 9 ? '9+' : unread}
    </span>
  )
}

function Taskbar() {
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const isMobile = useWindowStore((s) => s.isMobile)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  const windowEntries = zStack
    .map((id) => windows[id])
    .filter(Boolean)

  if (isMobile) {
    return (
      <nav
        className="glass-panel fixed inset-x-0 bottom-0 z-[500] flex items-center justify-around border-t border-cyan-500/10 px-2 py-1.5"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="App dock"
      >
        <button
          type="button"
          onClick={toggleLauncher}
          aria-label="Open app launcher"
          className="flex flex-col items-center gap-0.5 rounded-lg p-2 text-muted-foreground transition-colors hover:text-primary"
        >
          <LayoutGrid size={18} />
        </button>
        {windowEntries.map((win) => {
          const manifest = APP_REGISTRY[win.appId]
          const Icon = manifest?.icon
          const isActive = win.windowId === activeWindowId
          return (
            <button
              key={win.windowId}
              type="button"
              onClick={() => focusWindow(win.windowId)}
              aria-label={win.title}
              className={`flex flex-col items-center gap-0.5 rounded-lg p-2 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {Icon && <Icon size={18} />}
              {isActive && (
                <div className="h-1 w-1 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(0,255,255,0.6)]" />
              )}
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav
      className="glass-panel fixed inset-x-0 bottom-0 z-[500] flex h-12 items-center border-t border-cyan-500/10 px-3"
      aria-label="Taskbar"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

      <button
        type="button"
        onClick={toggleLauncher}
        aria-label="Open app launcher"
        className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/20 hover:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.2)]"
      >
        <LayoutGrid size={14} />
      </button>

      <div className="mr-3 h-5 w-px bg-white/10" />

      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {windowEntries.map((win) => {
          const manifest = APP_REGISTRY[win.appId]
          const Icon = manifest?.icon
          const isActive = win.windowId === activeWindowId
          const isMinimized = win.state === 'minimized'
          return (
            <button
              key={win.windowId}
              type="button"
              onClick={() => focusWindow(win.windowId)}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 heading-ui text-[10px] font-semibold transition-all ${
                isActive
                  ? 'bg-white/[0.06] text-white'
                  : isMinimized
                    ? 'text-muted-foreground/50 hover:text-muted-foreground'
                    : 'text-muted-foreground hover:bg-white/[0.03] hover:text-white'
              }`}
            >
              {Icon && <Icon size={12} />}
              <span className="max-w-[100px] truncate">{win.title}</span>
              {isActive && (
                <div className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,255,255,0.5)]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="ml-3 flex items-center gap-3" data-testid="system-tray">
        <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" title="Connected" />
        <NotificationBadge />
        <Clock />
      </div>
    </nav>
  )
}

export default memo(Taskbar)
