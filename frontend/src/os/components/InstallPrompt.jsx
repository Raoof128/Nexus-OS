import { useEffect, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'
import {
  onInstallAvailabilityChange,
  promptInstall,
  isStandalone,
} from '../../lib/registerServiceWorker'
import { useNotificationStore } from '../stores/notificationStore'

const DISMISS_KEY = 'nexus-os:install-dismissed'

/**
 * "Install Nexus OS" balloon. Appears bottom-right, above the taskbar, when the
 * browser fires `beforeinstallprompt` and the user hasn't already installed or
 * dismissed it. Replaces Chrome's default mini-infobar.
 */
export default function InstallPrompt() {
  const [available, setAvailable] = useState(false)
  // Toasts share the bottom-right corner. Wait until they clear so the
  // balloon never covers them. The install prompt is kept, not dropped.
  const toastsVisible = useNotificationStore((s) =>
    s.notifications.some((n) => !n.read && !n.toastDismissed),
  )
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    return onInstallAvailabilityChange((prompt) => setAvailable(Boolean(prompt)))
  }, [])

  if (dismissed || isStandalone() || !available || toastsVisible) return null

  const handleInstall = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted' || outcome === 'dismissed') setAvailable(false)
  }

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore storage failure
    }
  }

  return (
    <AnimatePresence>
      <Motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.2 }}
        className="nx-flyout fixed bottom-[calc(var(--w7-taskbar-h)_+_8px)] right-3 z-[1400] w-[min(300px,calc(100vw-1.5rem))] px-3 py-2"
        role="dialog"
        aria-label="Install Nexus OS"
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          title="Close"
          className="w7-toolbtn absolute right-1 top-1 p-0.5"
        >
          <X size={12} aria-hidden />
        </button>
        <div className="flex items-start gap-2 pr-5">
          <Download size={16} className="mt-px shrink-0 text-[#1773c4]" aria-hidden />
          <div className="min-w-0">
            <p className="text-[12px] font-bold leading-snug text-foreground">Install Nexus OS</p>
            <p className="mt-0.5 text-[12px] leading-snug text-foreground">
              Open it like a desktop program: full-screen, works offline, opened from your taskbar
              or home screen.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={handleInstall} className="w7-btn default min-w-[75px]">
                Install
              </button>
              <button type="button" onClick={handleDismiss} className="w7-btn min-w-[75px]">
                Not now
              </button>
            </div>
          </div>
        </div>
      </Motion.div>
    </AnimatePresence>
  )
}
