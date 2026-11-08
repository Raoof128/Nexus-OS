import { useEffect, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'

// Total time before the screen starts fading out. The whole sequence (including
// the 400ms fade) finishes inside 2.5s, then onComplete is called.
const HOLD_MS = 1900
const DONE_MS = 2300

/**
 * The Windows 7 "Welcome" screen shown after sign-in: a plain dark screen, the
 * word "Welcome" and a small progress spinner while the desktop is prepared.
 * No glow or pulsing (docs/win7-design-system.md §5).
 */
export default function BootSequence({ onComplete }) {
  const [prefersReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  // Skip animation entirely for reduced motion users
  useEffect(() => {
    if (prefersReduced) {
      onComplete()
    }
  }, [prefersReduced, onComplete])

  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (prefersReduced) return

    // Start the fade-out
    const t1 = setTimeout(() => setVisible(false), HOLD_MS)
    // Truly done — call parent
    const t2 = setTimeout(() => onComplete(), DONE_MS)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [prefersReduced, onComplete])

  if (prefersReduced) return null

  return (
    <AnimatePresence>
      {visible && (
        <Motion.div
          key="welcome-screen"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 overflow-hidden bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          role="status"
        >
          <Motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <p
              className="select-none text-[36px] font-light text-white"
              style={{
                fontFamily: "'Segoe UI Light', 'Segoe UI', 'Noto Sans', system-ui, sans-serif",
              }}
            >
              Welcome
            </p>
            <Loader2 className="h-5 w-5 animate-spin text-white/80" aria-hidden="true" />
            <span className="sr-only">Preparing your desktop…</span>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>
  )
}
