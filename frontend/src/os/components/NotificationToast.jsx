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

/**
 * One Win7 balloon tip (7.css `[role=tooltip]`). The tail points down toward
 * the clock in the notification area. Errors are wrapped in an assertive alert;
 * everything else is announced politely by the region around the stack.
 */
function Toast({ notification }) {
  const dismissToast = useNotificationStore((s) => s.dismissToast)
  const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.info
  const Icon = config.icon
  const isError = notification.type === 'error'

  const balloon = (
    <div role="tooltip" className="is-top is-left box-border w-[300px] px-3 py-2">
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
          <p className="mt-0.5 text-[12px] text-muted-foreground">
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
    </div>
  )

  return isError ? <div role="alert">{balloon}</div> : balloon
}

export default function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications)

  // Show only the latest 3 toasts still live: unread AND not yet auto-/hand-
  // dismissed. Dismissed-but-unread items live on in the notification centre.
  const visible = notifications.filter((n) => !n.read && !n.toastDismissed).slice(0, 3)

  // One polite live region for the whole stack. It is always mounted so that
  // the first announcement is not lost. The 18px bottom padding on each item
  // leaves room for the balloon tail.
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(var(--w7-taskbar-h)_+_8px)] right-3 z-[1500] flex flex-col"
    >
      <AnimatePresence mode="sync" initial={false}>
        {visible.map((n) => (
          <Motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={SPRING.snappy}
            className="pointer-events-auto pb-[18px]"
          >
            <Toast notification={n} />
          </Motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
