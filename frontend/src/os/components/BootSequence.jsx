import { useEffect, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'

// Total time before the screen starts fading out. The whole sequence (including
// the 400ms fade) finishes inside 2.5s, then onComplete is called.
const HOLD_MS = 1900
const DONE_MS = 2300

/** Original Aero-style orb: a glossy blue sphere with a soft pulsing glow. */
function BootOrb() {
  return (
    <Motion.div
      aria-hidden="true"
      style={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        background:
          'radial-gradient(circle at 50% 22%, #e6f6ff 0 10%, #8fd0ff 34%, #1f7bd0 62%, #0b3f78 100%)',
        border: '1px solid #0a2c50',
        boxShadow: 'inset 0 0 0 1px #ffffff66, 0 0 18px 4px #7fd3ff66',
      }}
      animate={{
        boxShadow: [
          'inset 0 0 0 1px #ffffff66, 0 0 18px 4px #7fd3ff66',
          'inset 0 0 0 1px #ffffff99, 0 0 36px 10px #7fd3ffb3',
          'inset 0 0 0 1px #ffffff66, 0 0 18px 4px #7fd3ff66',
        ],
      }}
      transition={{ duration: 1.2, repeat: 1, ease: 'easeInOut' }}
    />
  )
}

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
          key="boot-screen"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 overflow-hidden bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          role="status"
          aria-live="polite"
        >
          <Motion.div
            className="flex flex-col items-center gap-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <BootOrb />
            <p
              className="select-none text-[14px] text-white"
              style={{
                fontFamily: "'Segoe UI', 'Noto Sans', system-ui, sans-serif",
                textShadow: '0 1px 2px #000',
              }}
            >
              Starting Nexus OS
            </p>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>
  )
}
