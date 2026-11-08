import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, Flag, X } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { useNotificationStore } from '../stores/notificationStore'
import AppIcon from './AppIcon'
import StartOrb from './StartOrb'
import { groupWindowsByApp } from './taskbarGroups'

/** Full-width task button and its gap, used to decide when labels collapse. */
const TASK_BUTTON_PX = 168
const TASK_GAP_PX = 3
/** Icon-only (collapsed) task button width, the 44px touch minimum. */
const TASK_COLLAPSED_PX = 44
/** Win7 Aero Peek waits about half a second before it fades the windows. */
const PEEK_DELAY_MS = 500
const PEEK_ATTRIBUTE = 'data-aero-peek'
const NO_IDS = []

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

/**
 * A 7.css menu (`ul[role=menu]`) anchored above a taskbar control. It is
 * portalled to <body> because the taskbar list clips overflow. Escape and Tab
 * return focus to the anchor and close it; an outside pointer press closes it
 * without moving focus; arrow keys move between items.
 */
function FloatingMenu({ anchor, label, align = 'start', onClose, children }) {
  const menuRef = useRef(null)

  // The anchor is a DOM element held in state, so measuring it here is a plain
  // layout read. It is taken when the menu opens and sits above the anchor.
  const rect = anchor?.getBoundingClientRect()
  const bottom = rect ? window.innerHeight - rect.top + 4 : 0
  const position =
    align === 'end'
      ? { right: rect ? Math.max(4, window.innerWidth - rect.right) : 0 }
      : { left: rect ? Math.max(4, rect.left) : 0 }

  useEffect(() => {
    menuRef.current?.querySelector('button')?.focus()
  }, [])

  useEffect(() => {
    const items = () => Array.from(menuRef.current?.querySelectorAll('button') ?? [])
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || anchor?.contains(e.target)) return
      onClose()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        anchor?.focus()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        // Focus moves to the anchor first, so the browser's own Tab step
        // continues from the taskbar, the way Win7 menus hand focus back.
        anchor?.focus()
        onClose()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
      if (!menuRef.current?.contains(document.activeElement)) return
      e.preventDefault()
      const list = items()
      if (list.length === 0) return
      if (e.key === 'Home' || e.key === 'End') {
        list[e.key === 'Home' ? 0 : list.length - 1].focus()
        return
      }
      const index = list.indexOf(document.activeElement)
      const step = e.key === 'ArrowDown' ? 1 : -1
      list[(index + step + list.length) % list.length].focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchor, onClose])

  return createPortal(
    <ul
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={{
        position: 'fixed',
        zIndex: 600,
        bottom,
        ...position,
      }}
    >
      {children}
    </ul>,
    document.body,
  )
}

/**
 * Aero Peek on the Show desktop strip: after a short hover the windows fade
 * to their outlines (`data-aero-peek` on <html>, styled in index.css). Leaving
 * the strip restores them. Clicking is unchanged.
 */
function useAeroPeek() {
  const timerRef = useRef(null)

  const endPeek = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    document.documentElement.removeAttribute(PEEK_ATTRIBUTE)
  }, [])

  const startPeek = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      document.documentElement.setAttribute(PEEK_ATTRIBUTE, 'true')
    }, PEEK_DELAY_MS)
  }, [])

  // Never leave the desktop faded if the taskbar unmounts mid-peek.
  useEffect(() => endPeek, [endPeek])

  return { onPointerEnter: startPeek, onPointerLeave: endPeek }
}

function NotificationTrayButton() {
  const notifications = useNotificationStore((s) => s.notifications)
  const togglePanel = useNotificationStore((s) => s.togglePanel)
  const panelOpen = useNotificationStore((s) => s.panelOpen)
  const unread = notifications.filter((n) => !n.read).length
  const unreadProblems = notifications.filter((n) => !n.read && n.type === 'error').length

  return (
    <button
      type="button"
      onClick={togglePanel}
      aria-label={`Action Center${unread > 0 ? `, ${unread} unread` : ''}`}
      aria-expanded={panelOpen}
      title={
        unread > 0
          ? `Action Center: ${unread} new notification${unread === 1 ? '' : 's'}`
          : 'Action Center'
      }
      className="nx-tray-btn relative"
    >
      {/* Win7 flag. A red cross marks open problems (unread error notifications). */}
      <span className="relative flex">
        <Flag
          size={15}
          strokeWidth={2}
          style={{ filter: 'drop-shadow(0 1px 1px #000)' }}
          aria-hidden
        />
        {unreadProblems > 0 && (
          <X
            size={9}
            strokeWidth={3.5}
            className="absolute -bottom-[3px] -right-[5px] text-[#ff6b5a]"
            style={{ filter: 'drop-shadow(0 0 1px #000)' }}
            aria-hidden
          />
        )}
      </span>
      {unread > 0 && (
        <span
          className="w7-badge absolute -right-1 -top-1 min-h-[14px] px-1 text-[9px] leading-none"
          aria-hidden="true"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}

/** Tray chevron: secondary tray controls that do not fit beside the flag. */
function TrayOverflowButton() {
  const doNotDisturb = useNotificationStore((s) => s.doNotDisturb)
  const toggleDoNotDisturb = useNotificationStore((s) => s.toggleDoNotDisturb)
  // The open menu remembers its anchor element, so no ref is read in render.
  const [menu, setMenu] = useState(null)

  const close = useCallback(() => setMenu(null), [])

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const el = e.currentTarget
          setMenu((current) => (current ? null : el))
        }}
        aria-label="Show hidden icons"
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        title="Show hidden icons"
        className="nx-tray-btn"
      >
        <ChevronUp size={14} aria-hidden />
      </button>
      {menu && (
        <FloatingMenu anchor={menu} label="Hidden icons" align="end" onClose={close}>
          <li role="menuitem">
            <button type="button" aria-pressed={doNotDisturb} onClick={toggleDoNotDisturb}>
              Do not disturb
            </button>
          </li>
        </FloatingMenu>
      )}
    </>
  )
}

function Taskbar({ flashingWindowIds = NO_IDS }) {
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const isMobile = useWindowStore((s) => s.isMobile)
  const launcherOpen = useWindowStore((s) => s.launcherOpen)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const minimizeAll = useWindowStore((s) => s.minimizeAll)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)
  const restoreDesktop = useWindowStore((s) => s.restoreDesktop)

  const peek = useAeroPeek()
  const listRef = useRef(null)
  const [listWidth, setListWidth] = useState(0)
  // Open group menu: the group key plus the button element that opened it.
  const [groupMenu, setGroupMenu] = useState(null)

  // Taskbar order is launch order: Win7 does not reorder buttons on focus.
  // Object.values keeps insertion order, which is exactly that.
  // Windows of one program share one button (Win7 "Always combine").
  const groups = useMemo(() => groupWindowsByApp(windows), [windows])

  // Collapse labels to icons once the bar cannot hold a full button per group.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return undefined
    const measure = () => setListWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const labelsCollapsed =
    isMobile || (listWidth > 0 && groups.length * (TASK_BUTTON_PX + TASK_GAP_PX) > listWidth)

  const flashing = useMemo(() => new Set(flashingWindowIds), [flashingWindowIds])

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

  const openGroup = groups.find((g) => g.key === groupMenu?.key && g.windows.length > 1) ?? null

  // The menu belongs to one open group. When that group closes or shrinks to a
  // single window, forget the menu, so it does not pop open again when the
  // program is later reopened (SHELL-06).
  // Adjusted during render (React's "storing information from previous renders"
  // pattern), so the stale menu is gone before the next commit.
  if (groupMenu && !openGroup) setGroupMenu(null)

  const closeGroupMenu = useCallback(() => setGroupMenu(null), [])

  // Show desktop toggles: first click minimises everything, second click
  // restores the windows it hid (in their previous stacking order). The store
  // remembers them, so this also undoes the desktop menu's "Show the desktop".
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
        ref={listRef}
        className="flex min-w-0 flex-1 items-center gap-[3px] overflow-x-auto px-1"
        aria-label="Running applications"
        style={{ scrollbarWidth: 'thin' }}
      >
        {groups.map((group) => {
          const grouped = group.windows.length > 1
          const single = group.windows[0]
          const groupActive = group.windows.some(
            (w) => w.windowId === activeWindowId && w.state !== 'minimized',
          )
          const allMinimized = group.windows.every((w) => w.state === 'minimized')
          const isFlashing = group.windows.some((w) => flashing.has(w.windowId))
          const label = isMobile ? undefined : group.title
          const buttonLabel = grouped
            ? `${group.title}, ${group.windows.length} windows`
            : group.title

          const itemWidth = isMobile
            ? '0 0 52px'
            : labelsCollapsed
              ? `0 0 ${TASK_COLLAPSED_PX}px`
              : `0 1 ${TASK_BUTTON_PX}px`

          return (
            <li
              key={group.key}
              className="shrink-0"
              style={{ flex: itemWidth, minWidth: TASK_COLLAPSED_PX }}
            >
              <button
                type="button"
                onClick={
                  grouped
                    ? (e) => {
                        const el = e.currentTarget
                        setGroupMenu((current) =>
                          current?.key === group.key ? null : { key: group.key, anchor: el },
                        )
                      }
                    : () => handleTaskClick(single)
                }
                {...(grouped
                  ? { 'aria-haspopup': 'menu', 'aria-expanded': openGroup?.key === group.key }
                  : { 'aria-pressed': groupActive })}
                aria-label={grouped || labelsCollapsed || isMobile ? buttonLabel : undefined}
                title={grouped ? buttonLabel : group.title}
                className={[
                  'nx-taskbtn is-running',
                  groupActive ? 'is-active' : '',
                  allMinimized ? 'is-minimized' : '',
                  grouped ? 'is-stacked' : '',
                  isFlashing ? 'is-flashing' : '',
                  isMobile ? 'max-w-[52px] justify-center px-2' : 'w-full',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <AppIcon appId={group.appId} size={isMobile ? 22 : 24} />
                <span className={labelsCollapsed || isMobile ? 'sr-only' : 'truncate'}>
                  {label}
                </span>
                {grouped && (
                  <span className="nx-taskbtn__count" aria-hidden="true">
                    {group.windows.length}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {openGroup && (
        <FloatingMenu anchor={groupMenu.anchor} label={openGroup.title} onClose={closeGroupMenu}>
          {openGroup.windows.map((win) => {
            const isActive = win.windowId === activeWindowId && win.state !== 'minimized'
            return (
              <li key={win.windowId} role="menuitem">
                <button
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => {
                    focusWindow(win.windowId)
                    setGroupMenu(null)
                  }}
                >
                  {win.title || openGroup.title}
                </button>
              </li>
            )
          })}
        </FloatingMenu>
      )}

      <div className="nx-tray" data-testid="system-tray">
        <TrayOverflowButton />
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
          onPointerEnter={peek.onPointerEnter}
          onPointerLeave={peek.onPointerLeave}
          aria-label="Show desktop"
          title="Show desktop"
          className="nx-show-desktop"
        />
      </div>
    </nav>
  )
}

export default memo(Taskbar)
