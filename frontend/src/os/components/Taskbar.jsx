import { memo, useEffect, useState } from 'react'
import { LayoutGrid, Bell } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { useNotificationStore } from '../stores/notificationStore'
import { APP_REGISTRY } from '../stores/appRegistry'

function Clock() {
  const [time, setTime] = useState(() => {
    const now = new Date()
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  })

  useEffect(() => {
    let timeoutId
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))
      const msToNext = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds())
      timeoutId = setTimeout(tick, msToNext + 50) // +50ms buffer to avoid edge cases
    }
    timeoutId = setTimeout(
      tick,
      60_000 - (new Date().getSeconds() * 1000 + new Date().getMilliseconds()) + 50,
    )
    return () => clearTimeout(timeoutId)
  }, [])

  return (
    <span className="heading-ui text-[11px] font-semibold text-white/70 tabular-nums">{time}</span>
  )
}

function NotificationTrayButton() {
  const notifications = useNotificationStore((s) => s.notifications)
  const togglePanel = useNotificationStore((s) => s.togglePanel)
  const panelOpen = useNotificationStore((s) => s.panelOpen)
  const unread = notifications.filter((n) => !n.read).length

  return (
    <button
      type="button"
      onClick={togglePanel}
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      aria-expanded={panelOpen}
      className={`relative flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        panelOpen ? 'bg-primary/15 text-primary' : 'text-white/60 hover:text-white'
      }`}
    >
      <Bell size={14} />
      {unread > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-[3px] text-[8px] font-bold leading-none text-black"
          aria-hidden="true"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}

function Taskbar() {
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const isMobile = useWindowStore((s) => s.isMobile)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  const windowEntries = zStack.map((id) => windows[id]).filter(Boolean)

  if (isMobile) {
    return (
      <nav
        className="glass-panel relative z-[500] flex shrink-0 items-center justify-around border-t border-cyan-500/10 px-2 py-1.5 overflow-x-auto"
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
        <div className="flex flex-col items-center gap-0.5 p-2">
          <NotificationTrayButton />
        </div>
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
              <span className="heading-ui text-[10px] max-w-[56px] truncate">{win.title}</span>
              {isActive && (
                <div className="h-1 w-4 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(0,255,255,0.6)]" />
              )}
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav
      className="glass-panel relative z-[500] flex h-12 shrink-0 items-center border-t border-cyan-500/10 px-3"
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

      <div
        className="flex flex-1 items-center gap-1 overflow-x-auto custom-scrollbar"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)',
        }}
      >
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
              className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 heading-ui text-[11px] font-semibold transition-all ${
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
        <div
          className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]"
          title="System Online"
          role="status"
          aria-label="System Online"
        />
        <NotificationTrayButton />
        <Clock />
      </div>
    </nav>
  )
}

export default memo(Taskbar)
