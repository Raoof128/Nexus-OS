import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  BellOff,
  BellRing,
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

const TYPE_META = {
  info: { icon: Info, color: '#06b6d4' },
  success: { icon: CheckCircle, color: '#22c55e' },
  warning: { icon: AlertTriangle, color: '#f59e0b' },
  error: { icon: AlertCircle, color: '#ef4444' },
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
      className={`group relative flex items-start gap-3 border-b border-white/5 px-4 py-3 transition-colors ${
        n.read ? 'opacity-60' : 'bg-cyan-400/[0.04]'
      }`}
    >
      {/* Unread indicator */}
      <span className="mt-1.5 flex w-2 shrink-0 justify-center">
        {!n.read && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
            aria-label="Unread"
          />
        )}
      </span>

      <Icon size={15} className="mt-0.5 shrink-0" style={{ color: meta.color }} />

      <button
        type="button"
        onClick={() => onRead(n.id)}
        disabled={n.read}
        className="min-w-0 flex-1 text-left focus-visible:outline-none disabled:cursor-default"
        title={n.read ? undefined : 'Mark as read'}
      >
        <p className="heading-ui truncate text-[12px] font-semibold leading-tight text-white">
          {n.title}
        </p>
        {n.message && (
          <p className="mt-0.5 line-clamp-3 font-mono text-[10px] leading-relaxed text-white/55">
            {n.message}
          </p>
        )}
        <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/30">
          {relativeTime(n.timestamp)}
        </p>
      </button>

      <button
        type="button"
        onClick={() => onRemove(n.id)}
        aria-label="Remove notification"
        className="shrink-0 rounded p-1 text-white/25 opacity-0 transition-all hover:text-white/70 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={12} />
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
            initial={{ x: '105%' }}
            animate={{ x: 0 }}
            exit={{ x: '105%' }}
            transition={SPRING.smooth}
            className="absolute bottom-14 right-2 top-2 flex w-[360px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#070b1a]/95 shadow-[0_0_50px_rgba(0,245,255,0.18)] backdrop-blur-xl"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Notification centre"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-cyan-400/20 px-4 py-3">
              <Bell size={16} className="text-cyan-300" />
              <h2 className="heading-ui flex-1 text-[13px] font-bold tracking-wide text-cyan-50">
                Notifications
                {unread > 0 && (
                  <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-black">
                    {unread}
                  </span>
                )}
              </h2>

              <button
                type="button"
                onClick={toggleDoNotDisturb}
                aria-pressed={doNotDisturb}
                title={doNotDisturb ? 'Do Not Disturb: ON' : 'Do Not Disturb: OFF'}
                className={`rounded-md p-1.5 transition-colors focus-visible:outline-none ${
                  doNotDisturb
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-cyan-200/60 hover:text-cyan-100'
                }`}
              >
                {doNotDisturb ? <BellOff size={14} /> : <BellRing size={14} />}
              </button>

              <button
                type="button"
                onClick={closePanel}
                aria-label="Close notification centre"
                className="rounded-md p-1.5 text-cyan-200/60 transition-colors hover:text-cyan-100 focus-visible:outline-none"
              >
                <X size={14} />
              </button>
            </div>

            {/* Action bar */}
            {notifications.length > 0 && (
              <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unread === 0}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] text-cyan-200/70 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100 focus-visible:outline-none disabled:opacity-30"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] text-red-300/70 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none"
                >
                  <Trash2 size={12} /> Clear all
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <BellOff size={28} className="text-cyan-200/20" />
                  <p className="font-mono text-[11px] text-cyan-200/40">No notifications</p>
                  <p className="font-mono text-[9px] text-cyan-200/25">
                    System alerts will appear here.
                  </p>
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
