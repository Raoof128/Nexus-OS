import { AnimatePresence, motion as Motion } from 'framer-motion'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { useNotificationStore } from '../stores/notificationStore'

const TYPE_CONFIG = {
  info:    { icon: Info,          accentColor: '#06b6d4', borderClass: 'border-l-cyan-500',  bgClass: 'bg-cyan-500/5'  },
  success: { icon: CheckCircle,   accentColor: '#22c55e', borderClass: 'border-l-green-500', bgClass: 'bg-green-500/5' },
  warning: { icon: AlertTriangle, accentColor: '#f59e0b', borderClass: 'border-l-amber-500', bgClass: 'bg-amber-500/5' },
  error:   { icon: AlertCircle,   accentColor: '#ef4444', borderClass: 'border-l-red-500',   bgClass: 'bg-red-500/5'   },
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
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 60, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className={`glass-panel relative w-[300px] overflow-hidden rounded-lg border border-white/10 shadow-lg ${config.bgClass}`}
      role="alert"
      aria-live="assertive"
    >
      {/* Left accent bar */}
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: config.accentColor, boxShadow: `0 0 6px ${config.accentColor}80` }}
      />

      <div className="flex items-start gap-2.5 px-3 py-2.5 pl-4">
        {/* Icon */}
        <Icon
          size={13}
          className="mt-[1px] shrink-0"
          style={{ color: config.accentColor }}
        />

        {/* Body */}
        <div className="min-w-0 flex-1">
          <p className="heading-ui truncate text-[11px] font-semibold leading-tight text-white">
            {notification.title}
          </p>
          {notification.message && (
            <p className="mono mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-white/50">
              {notification.message}
            </p>
          )}
          <p className="mono mt-1 text-[9px] text-white/30">
            {formatTime(notification.timestamp)}
          </p>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={() => dismissToast(notification.id)}
          aria-label="Dismiss notification"
          className="shrink-0 rounded p-0.5 text-white/30 transition-colors hover:text-white/70"
        >
          <X size={10} />
        </button>
      </div>
    </Motion.div>
  )
}

export default function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications)

  // Show only the latest 3 unread notifications
  const visible = notifications.filter((n) => !n.read).slice(0, 3)

  return (
    <div
      className="pointer-events-none fixed right-3 top-3 z-[1500] flex flex-col gap-2"
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
