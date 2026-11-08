import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import {
  BellOff,
  BellRing,
  Flag,
  Info,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  X,
  CheckCheck,
  Trash2,
} from 'lucide-react'
import { SPRING } from '../../lib/motion'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useNotificationStore } from '../stores/notificationStore'

// Win7 balloon-tip palette, readable on the light flyout surface.
const TYPE_META = {
  info: { icon: Info, color: '#1773c4' },
  success: { icon: CheckCircle, color: '#2e7d32' },
  warning: { icon: AlertTriangle, color: '#9d5d00' },
  error: { icon: AlertCircle, color: '#c42b1c' },
}

function relativeTime(ts) {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function NotificationRow({ n, onRead, onRemove }) {
  const meta = TYPE_META[n.type] ?? TYPE_META.info
  const Icon = meta.icon
  return (
    <li
      className={`w7-item group relative flex items-start gap-2 border-b border-[#e5e5e5] px-3 py-2 ${
        n.read ? '' : 'font-semibold'
      }`}
    >
      {/* Unread indicator */}
      <span className="mt-1.5 flex w-2 shrink-0 justify-center">
        {!n.read && (
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }}>
            <span className="sr-only">Unread</span>
          </span>
        )}
      </span>

      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: meta.color }} aria-hidden />

      <button
        type="button"
        onClick={() => onRead(n.id)}
        disabled={n.read}
        className="min-w-0 flex-1 text-left disabled:cursor-default disabled:opacity-100"
        title={n.read ? undefined : 'Mark as read'}
      >
        <p className="truncate text-[12px] leading-snug text-foreground">{n.title}</p>
        {n.message && (
          <p className="mt-0.5 line-clamp-3 text-[12px] font-normal leading-snug text-foreground">
            {n.message}
          </p>
        )}
        <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
          {relativeTime(n.timestamp)}
        </p>
      </button>

      <button
        type="button"
        onClick={() => onRemove(n.id)}
        aria-label="Remove notification"
        title="Remove"
        className="w7-toolbtn shrink-0 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X size={12} aria-hidden />
      </button>
    </li>
  )
}

export default function NotificationCenter() {
  const panelOpen = useNotificationStore((s) => s.panelOpen)
  const notifications = useNotificationStore((s) => s.notifications)
  const doNotDisturb = useNotificationStore((s) => s.doNotDisturb)
  const closePanel = useNotificationStore((s) => s.closePanel)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const removeNotification = useNotificationStore((s) => s.removeNotification)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const toggleDoNotDisturb = useNotificationStore((s) => s.toggleDoNotDisturb)

  const trapRef = useFocusTrap(panelOpen)

  // Escape closes the centre (DOM side-effect only — no setState here).
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closePanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, closePanel])

  const modalRoot = typeof document !== 'undefined' ? document.getElementById('modal-root') : null
  if (!modalRoot) return null

  const unread = notifications.filter((n) => !n.read).length

  return createPortal(
    <AnimatePresence>
      {panelOpen && (
        <Motion.div
          className="fixed inset-0 z-[9000]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={closePanel}
          role="presentation"
        >
          <Motion.aside
            ref={trapRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={SPRING.smooth}
            className="nx-flyout absolute bottom-[calc(var(--w7-taskbar-h)_+_8px)] right-3 flex max-h-[min(560px,calc(100dvh-4rem))] w-[360px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Action Center"
          >
            {/* Header */}
            <div className="flex items-center gap-1 border-b border-[#c5cad3] px-3 py-2">
              <Flag size={16} className="shrink-0 text-[#3d5a80]" aria-hidden />
              <h2 className="w7-subheading flex flex-1 items-center gap-2 text-[12px]">
                Action Center
                {unread > 0 && <span className="w7-badge">{unread}</span>}
              </h2>

              <button
                type="button"
                onClick={toggleDoNotDisturb}
                aria-pressed={doNotDisturb}
                aria-label="Do not disturb"
                title={doNotDisturb ? 'Do not disturb: on' : 'Do not disturb: off'}
                className="w7-toolbtn p-1"
              >
                {doNotDisturb ? (
                  <BellOff size={14} aria-hidden />
                ) : (
                  <BellRing size={14} aria-hidden />
                )}
              </button>

              <button
                type="button"
                onClick={closePanel}
                aria-label="Close Action Center"
                title="Close"
                className="w7-toolbtn p-1"
              >
                <X size={14} aria-hidden />
              </button>
            </div>

            {/* Action bar */}
            {notifications.length > 0 && (
              <div className="flex items-center gap-1 border-b border-[#c5cad3] px-2 py-1">
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unread === 0}
                  className="w7-toolbtn flex items-center gap-1.5 px-2 py-0.5 text-[12px]"
                >
                  <CheckCheck size={14} aria-hidden /> Mark all as read
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="w7-toolbtn w7-toolbtn--danger ml-auto flex items-center gap-1.5 px-2 py-0.5 text-[12px]"
                >
                  <Trash2 size={14} aria-hidden /> Clear all
                </button>
              </div>
            )}

            {/* List */}
            <div className="w7-sunken min-h-0 flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex h-full min-h-[160px] items-center justify-center px-6 py-10 text-center">
                  <p className="text-[12px] text-muted-foreground">No new notifications.</p>
                </div>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onRead={markRead}
                      onRemove={removeNotification}
                    />
                  ))}
                </ul>
              )}
            </div>
          </Motion.aside>
        </Motion.div>
      )}
    </AnimatePresence>,
    modalRoot,
  )
}
