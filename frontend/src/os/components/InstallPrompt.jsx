import { useEffect, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'
import {
  onInstallAvailabilityChange,
  promptInstall,
  isStandalone,
} from '../../lib/registerServiceWorker'

const DISMISS_KEY = 'nexus-os:install-dismissed'

/**
 * Cyberpunk "install Nexus OS" toast. Appears bottom-right when the browser
 * fires `beforeinstallprompt` and the user hasn't already installed or
 * dismissed it. Replaces Chrome's default mini-infobar.
 */
export default function InstallPrompt() {
  const [available, setAvailable] = useState(false)
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

  if (dismissed || isStandalone() || !available) return null

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
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="fixed bottom-16 right-4 z-[9000] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-cyan-400/40 bg-[#070b1a]/95 p-4 shadow-[0_0_30px_rgba(0,245,255,0.25)] backdrop-blur-md"
        role="dialog"
        aria-label="Install Nexus OS"
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="absolute right-2 top-2 rounded-md p-1 text-cyan-200/60 transition hover:bg-cyan-400/10 hover:text-cyan-100"
        >
          <X size={16} />
        </button>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <Download size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-[Orbitron] text-sm font-bold tracking-wide text-cyan-100">
              Install Nexus OS
            </p>
            <p className="mt-1 text-xs leading-relaxed text-cyan-200/70">
              Launch it like a native app — full-screen, offline-ready, from your dock.
            </p>
            <button
              type="button"
              onClick={handleInstall}
              className="mt-3 w-full rounded-lg border border-cyan-400/50 bg-cyan-400/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-400/25"
            >
              Install
            </button>
          </div>
        </div>
      </Motion.div>
    </AnimatePresence>
  )
}
