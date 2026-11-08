import { useCallback, useEffect, useRef, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { User } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { useAuth } from '../../hooks/useAuth'

const TEXT_SHADOW = '0 1px 2px #000, 0 0 8px #0008'

/** Lock-screen clock, shown small under the sign-in tile. */
function LockClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return (
    <span
      className="select-none text-[12px] tabular-nums text-white"
      style={{ textShadow: TEXT_SHADOW }}
    >
      {time}
    </span>
  )
}

/** Unlock hint — adapts to mobile vs desktop. */
function UnlockHint() {
  const isMobile = useWindowStore((s) => s.isMobile)
  return (
    <p className="select-none text-[12px] text-white" style={{ textShadow: TEXT_SHADOW }}>
      {isMobile ? 'Tap to unlock' : 'Click or press any key to unlock'}
    </p>
  )
}

/** Win7-style user tile: a blue gradient picture frame with an original user glyph. */
function UserTile() {
  return (
    <div className="nx-user-tile flex h-32 w-32 items-center justify-center" aria-hidden="true">
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: 'linear-gradient(#8fc8f2, #2a6cb8 70%, #1d5397)' }}
      >
        <User size={72} strokeWidth={1.5} className="text-white" />
      </div>
    </div>
  )
}

export default function LockScreen({ onUnlock }) {
  const { session } = useAuth()
  const displayName =
    session?.user?.user_metadata?.full_name || session?.user?.email || 'Nexus OS user'
  const [exiting, setExiting] = useState(false)
  const exitingRef = useRef(false)

  const dismiss = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
  }, [])

  // Listen for any user interaction — register once, stable via ref guard
  useEffect(() => {
    const handleInteraction = () => {
      // Don't dismiss if user is typing in a focused input inside the lock screen
      const active = document.activeElement
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return
      }
      dismiss()
    }

    // Attach on the next task: when the lock is triggered by a click (Start →
    // Lock), React flushes this effect synchronously inside that same click,
    // which would otherwise bubble to document and unlock immediately.
    const attachTimer = setTimeout(() => {
      document.addEventListener('click', handleInteraction)
      document.addEventListener('keydown', handleInteraction)
      document.addEventListener('mousedown', handleInteraction)
    }, 0)

    return () => {
      clearTimeout(attachTimer)
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('keydown', handleInteraction)
      document.removeEventListener('mousedown', handleInteraction)
    }
  }, [dismiss])

  return (
    <AnimatePresence onExitComplete={onUnlock}>
      {!exiting && (
        <Motion.div
          key="lock-screen"
          className="nx-wallpaper-aero fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
          style={{ zIndex: 2000, cursor: 'pointer' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ y: '-100%', opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          aria-label="Lock screen — click or press any key to unlock"
          role="dialog"
          aria-modal
        >
          {/* Centre sign-in block */}
          <div className="relative flex flex-col items-center gap-3" style={{ zIndex: 5 }}>
            <UserTile />
            <p
              className="mt-2 select-none text-[18px] text-white"
              style={{ textShadow: TEXT_SHADOW }}
            >
              {displayName}
            </p>
            <p className="select-none text-[12px] text-white" style={{ textShadow: TEXT_SHADOW }}>
              Locked
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <UnlockHint />
              <LockClock />
            </div>
          </div>
        </Motion.div>
      )}
    </AnimatePresence>
  )
}
