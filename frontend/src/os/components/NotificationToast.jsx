import { AnimatePresence, motion as Motion } from 'framer-motion'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { SPRING } from '../../lib/motion'
import { useNotificationStore } from '../stores/notificationStore'

// Icon colours are the Win7 balloon-tip palette, chosen to read on a light panel.
const TYPE_CONFIG = {
  info: { icon: Info, color: '#1773c4' },
  success: { icon: CheckCircle, color: '#2e7d32' },
  warning: { icon: AlertTriangle, color: '#9d5d00' },
  error: { icon: AlertCircle, color: '#c42b1c' },
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function Toast({ notification }) {
  const dismissToast = useNotificationStore((s) => s.dismissToast)
  const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.info
  const Icon = config.icon

  return (
    <Motion.div
      layout
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={SPRING.snappy}
      className="nx-flyout relative w-[300px] px-3 py-2"
      role="alert"
      aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
    >
      <div className="flex items-start gap-2">
        {/* Icon */}
        <Icon size={16} className="mt-px shrink-0" style={{ color: config.color }} aria-hidden />

        {/* Body */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold leading-snug text-foreground">
            {notification.title}
          </p>
          {notification.message && (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-foreground">
              {notification.message}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatTime(notification.timestamp)}
          </p>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={() => dismissToast(notification.id)}
          aria-label="Close notification"
          title="Close"
          className="w7-toolbtn -mr-1 -mt-1 shrink-0 p-0.5"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
    </Motion.div>
  )
}

export default function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications)

  // Show only the latest 3 toasts still live: unread AND not yet auto-/hand-
  // dismissed. Dismissed-but-unread items live on in the notification centre.
  const visible = notifications.filter((n) => !n.read && !n.toastDismissed).slice(0, 3)

  return (
    <div
      className="pointer-events-none fixed bottom-12 right-3 z-[1500] flex flex-col gap-2"
      aria-label="Notifications"
    >
      <AnimatePresence mode="sync" initial={false}>
        {visible.map((n) => (
          // Wrap each toast so pointer-events work even inside a pointer-events-none container
          <div key={n.id} className="pointer-events-auto">
            <Toast notification={n} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
