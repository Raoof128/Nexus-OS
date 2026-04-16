import { useCallback, useEffect, useRef, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'

/** Clock that updates every second for the lock screen */
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

  const date = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="heading-display select-none tabular-nums"
        style={{
          fontSize: 'clamp(4rem, 10vw, 7rem)',
          fontWeight: 900,
          color: 'hsl(56 100% 48%)',
          textShadow:
            '0 0 20px hsl(56 100% 48% / 0.6), 0 0 60px hsl(56 100% 48% / 0.2)',
          lineHeight: 1,
          letterSpacing: '0.04em',
        }}
      >
        {time}
      </span>
      <span
        className="heading-ui select-none"
        style={{
          fontSize: 'clamp(0.85rem, 2vw, 1.1rem)',
          color: 'hsl(170 76% 63% / 0.85)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {date}
      </span>
    </div>
  )
}

/** Blinking "click to unlock" hint */
function UnlockHint() {
  return (
    <Motion.p
      className="select-none font-mono text-xs"
      style={{ color: 'hsl(0 0% 60%)' }}
      animate={{ opacity: [1, 0.3, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      Click or press any key to unlock
    </Motion.p>
  )
}

/** CSS-only animated circuit pattern rendered as a background div */
function CircuitBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 0 }}
      aria-hidden
    >
      {/* Base grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(hsl(56 100% 48% / 0.04) 1px, transparent 1px),
            linear-gradient(90deg, hsl(56 100% 48% / 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Denser sub-grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(hsl(170 76% 63% / 0.02) 1px, transparent 1px),
            linear-gradient(90deg, hsl(170 76% 63% / 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      />
      {/* Animated horizontal scan highlight */}
      <Motion.div
        className="absolute inset-x-0 h-[1px]"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, hsl(56 100% 48% / 0.15) 30%, hsl(170 76% 63% / 0.12) 70%, transparent 100%)',
        }}
        animate={{ top: ['0%', '100%'] }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
      {/* Ambient orbs */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'hsl(56 100% 48%)',
          opacity: 0.05,
          filter: 'blur(130px)',
          top: '-15%',
          right: '-10%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'hsl(170 76% 63%)',
          opacity: 0.04,
          filter: 'blur(140px)',
          bottom: '-20%',
          left: '-15%',
        }}
      />
    </div>
  )
}

/** Pulsing neon "N" logo for the lock screen */
function LockLogo() {
  return (
    <Motion.div
      style={{
        width: 80,
        height: 80,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid hsl(56 100% 48% / 0.35)',
        position: 'relative',
      }}
      animate={{
        boxShadow: [
          '0 0 15px hsl(56 100% 48% / 0.3), 0 0 40px hsl(170 76% 63% / 0.1)',
          '0 0 30px hsl(56 100% 48% / 0.5), 0 0 80px hsl(170 76% 63% / 0.2)',
          '0 0 15px hsl(56 100% 48% / 0.3), 0 0 40px hsl(170 76% 63% / 0.1)',
        ],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <span
        className="heading-display select-none"
        style={{
          fontSize: '2.4rem',
          fontWeight: 900,
          color: 'hsl(56 100% 48%)',
          textShadow: '0 0 16px hsl(56 100% 48% / 0.7)',
          lineHeight: 1,
        }}
      >
        N
      </span>
      {/* Corner marks */}
      {[
        { top: 5, left: 5, borderTop: true, borderLeft: true },
        { bottom: 5, right: 5, borderBottom: true, borderRight: true },
      ].map((pos, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            ...(pos.left !== undefined ? { left: pos.left } : { right: pos.right }),
            borderTop: pos.borderTop ? '1px solid hsl(170 76% 63% / 0.5)' : undefined,
            borderLeft: pos.borderLeft ? '1px solid hsl(170 76% 63% / 0.5)' : undefined,
            borderBottom: pos.borderBottom ? '1px solid hsl(170 76% 63% / 0.5)' : undefined,
            borderRight: pos.borderRight ? '1px solid hsl(170 76% 63% / 0.5)' : undefined,
          }}
        />
      ))}
    </Motion.div>
  )
}

export default function LockScreen({ onUnlock }) {
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
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return
      }
      dismiss()
    }

    document.addEventListener('click', handleInteraction)
    document.addEventListener('keydown', handleInteraction)
    document.addEventListener('mousedown', handleInteraction)

    return () => {
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
          className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
          style={{
            zIndex: 2000,
            background: 'rgba(0, 0, 0, 0.97)',
            cursor: 'pointer',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{
            enter: { duration: 0.4, ease: 'easeOut' },
            exit: { duration: 0.5, ease: 'easeInOut' },
          }}
          aria-label="Lock screen — click or press any key to unlock"
          role="dialog"
          aria-modal
        >
          <CircuitBackground />

          {/* Scanlines */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)',
              zIndex: 1,
            }}
          />

          {/* Center content */}
          <div
            className="relative flex flex-col items-center gap-6"
            style={{ zIndex: 5 }}
          >
            <LockLogo />
            <LockClock />
            <UnlockHint />
          </div>

          {/* Bottom NEXUS wordmark */}
          <div
            className="absolute bottom-8 left-0 right-0 flex justify-center"
            style={{ zIndex: 5 }}
          >
            <span
              className="heading-display select-none text-[10px]"
              style={{
                color: 'hsl(56 100% 48% / 0.25)',
                letterSpacing: '0.3em',
              }}
            >
              NEXUS OS
            </span>
          </div>
        </Motion.div>
      )}
    </AnimatePresence>
  )
}
