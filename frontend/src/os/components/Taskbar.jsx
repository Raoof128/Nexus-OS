import { memo, useCallback, useEffect, useState } from 'react'
import { Bell, BellDot } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { useNotificationStore } from '../stores/notificationStore'
import { APP_REGISTRY } from '../stores/appRegistry'
import AppIcon from './AppIcon'
import StartOrb from './StartOrb'

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function formatDate(d) {
  return d.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: 'numeric' })
}

/** Two-line Win7 notification-area clock; re-renders on the minute boundary. */
function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timeoutId
    const schedule = () => {
      const d = new Date()
      const msToNext = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds())
      timeoutId = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, msToNext + 50) // +50ms so we land just after the boundary
    }
    schedule()
    return () => clearTimeout(timeoutId)
  }, [])

  const full = now.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })
  return (
    <div
      className="flex h-[30px] flex-col items-center justify-center px-2 text-center leading-[14px] tabular-nums"
      style={{ textShadow: '0 0 6px #000, 0 1px 1px #000' }}
      title={full}
    >
      <span>{formatTime(now)}</span>
      <span>{formatDate(now)}</span>
    </div>
  )
}

function NotificationTrayButton() {
  const notifications = useNotificationStore((s) => s.notifications)
  const togglePanel = useNotificationStore((s) => s.togglePanel)
  const panelOpen = useNotificationStore((s) => s.panelOpen)
  const unread = notifications.filter((n) => !n.read).length
  const Icon = unread > 0 ? BellDot : Bell

  return (
    <button
      type="button"
      onClick={togglePanel}
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      aria-expanded={panelOpen}
      title={unread > 0 ? `${unread} new notification${unread === 1 ? '' : 's'}` : 'Notifications'}
      className="nx-tray-btn relative"
    >
      <Icon size={15} strokeWidth={2} style={{ filter: 'drop-shadow(0 1px 1px #000)' }} />
      {unread > 0 && (
        <span
          className="absolute right-0 top-[3px] flex h-[13px] min-w-[13px] items-center justify-center rounded-full border border-white/70 bg-[#d42809] px-[3px] text-[9px] font-bold leading-none text-white"
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
  const launcherOpen = useWindowStore((s) => s.launcherOpen)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const minimizeAll = useWindowStore((s) => s.minimizeAll)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  // Taskbar order is launch order — Win7 does not reorder buttons on focus.
  // The windows map preserves insertion order, which is exactly that.
  const windowEntries = Object.values(windows)

  // Win7: clicking the active window's button minimises it; any other click
  // restores/focuses.
  const handleTaskClick = useCallback(
    (win) => {
      if (win.windowId === activeWindowId && win.state !== 'minimized' && minimizeWindow) {
        minimizeWindow(win.windowId)
      } else {
        focusWindow(win.windowId)
      }
    },
    [activeWindowId, focusWindow, minimizeWindow],
  )

  // Show desktop toggles: first click minimises everything, second click
  // restores the windows it hid (in their previous stacking order). The store
  // remembers them, so this also undoes the desktop menu's "Show the desktop".
  const restoreDesktop = useWindowStore((s) => s.restoreDesktop)
  const handleShowDesktop = useCallback(() => {
    const anyVisible = zStack.some((id) => windows[id] && windows[id].state !== 'minimized')
    if (!anyVisible && restoreDesktop?.()) return
    minimizeAll?.()
  }, [zStack, windows, minimizeAll, restoreDesktop])

  return (
    <nav
      className="nx-taskbar z-[500] flex shrink-0 items-stretch"
      style={
        isMobile
          ? {
              height: 'calc(var(--w7-taskbar-h) + env(safe-area-inset-bottom, 0px))',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }
          : undefined
      }
      aria-label="Taskbar"
      data-testid="taskbar"
    >
      <StartOrb open={launcherOpen} onClick={toggleLauncher} />

      <ul
        className="flex min-w-0 flex-1 items-center gap-[3px] overflow-x-auto px-1"
        aria-label="Running applications"
        style={{ scrollbarWidth: 'none' }}
      >
        {windowEntries.map((win) => {
          const isActive = win.windowId === activeWindowId && win.state !== 'minimized'
          const isMinimized = win.state === 'minimized'
          const title = win.title || APP_REGISTRY[win.appId]?.title
          return (
            <li key={win.windowId} className="shrink-0">
              <button
                type="button"
                onClick={() => handleTaskClick(win)}
                aria-pressed={isActive}
                title={title}
                className={`nx-taskbtn is-running ${isActive ? 'is-active' : ''} ${
                  isMinimized ? 'is-minimized' : ''
                } ${isMobile ? 'max-w-[52px] justify-center px-2' : 'w-[168px]'}`}
              >
                <AppIcon appId={win.appId} size={isMobile ? 22 : 24} />
                <span className={isMobile ? 'sr-only' : 'truncate'}>{title}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="nx-tray" data-testid="system-tray">
        <NotificationTrayButton />
        {!isMobile && <Clock />}
        {isMobile && (
          <span className="sr-only">
            <Clock />
          </span>
        )}
        <button
          type="button"
          onClick={handleShowDesktop}
          aria-label="Show desktop"
          title="Show desktop"
          className="nx-show-desktop"
        />
      </div>
    </nav>
  )
}

export default memo(Taskbar)
