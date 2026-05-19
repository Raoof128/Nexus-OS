import { useEffect, useRef, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'

const BOOT_LINES = [
  '[BOOT] Nexus OS v1.0 initializing...',
  '[CORE] Zustand kernel loaded ............. OK',
  '[AUTH] Session validated ................. OK',
  '[REAL] WebSocket channel connected ....... OK',
  '[SYNC] Window state hydrated ............ OK',
  '[APPS] 8 applications registered ......... OK',
  '[GPU]  Neon renderer initialized ........ OK',
  '[SYS]  All systems operational',
]

const STAGGER_MS = 150

// Phase timings
const PHASE2_START = 1000 // Log starts scrolling (after logo fade-in)
// PHASE3_START is calculated dynamically: log finishes typing + 300ms pause
const PHASE3_START = PHASE2_START + BOOT_LINES.length * STAGGER_MS + 300
const PHASE3_END = PHASE3_START + 1500 // Sweep + fade-out (1.5s after log done)

/** One typed-out boot log line */
function BootLine({ text, delayMs }) {
  const [displayed, setDisplayed] = useState('')
  const charRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const typeNext = () => {
        charRef.current += 1
        setDisplayed(text.slice(0, charRef.current))
        if (charRef.current < text.length) {
          timerRef.current = setTimeout(typeNext, 18)
        }
      }
      typeNext()
    }, delayMs)

    return () => {
      clearTimeout(timeout)
      clearTimeout(timerRef.current)
    }
  }, [text, delayMs])

  const isOk = text.includes('... OK') || text.endsWith('OK')

  return (
    <div className="flex items-baseline gap-1 leading-snug">
      <span className="font-mono text-[11px]" style={{ color: 'hsl(170 76% 63%)' }}>
        {displayed}
      </span>
      {displayed.length === text.length && isOk && (
        <Motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="font-mono text-[11px]"
          style={{ color: 'hsl(56 100% 48%)' }}
        >
          OK
        </Motion.span>
      )}
    </div>
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

  const [phase, setPhase] = useState(1) // 1 | 2 | 3 | 'done'
  const [sweepVisible, setSweepVisible] = useState(false)
  const [logLines, setLogLines] = useState([])

  useEffect(() => {
    if (prefersReduced) return

    // Phase 1 → 2
    const t1 = setTimeout(() => {
      setPhase(2)
      setLogLines(BOOT_LINES)
    }, PHASE2_START)

    // Phase 2 → 3 (log fades, sweep starts)
    const t2 = setTimeout(() => {
      setPhase(3)
      setSweepVisible(true)
    }, PHASE3_START)

    // Phase 3: sweep animates for ~600ms, then screen fades out
    const t3 = setTimeout(() => {
      setPhase('done')
    }, PHASE3_END - 200)

    // Truly done — call parent
    const t4 = setTimeout(() => {
      onComplete()
    }, PHASE3_END)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [prefersReduced, onComplete])

  if (prefersReduced) return null

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <Motion.div
          key="boot-screen"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          {/* Scanline overlay — always visible during boot */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.035) 2px, rgba(255,255,255,0.035) 4px)',
              zIndex: 10,
            }}
          />

          {/* Ambient orbs behind content */}
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ zIndex: 0 }}
          >
            <div
              style={{
                position: 'absolute',
                width: 500,
                height: 500,
                borderRadius: '50%',
                background: 'hsl(56 100% 48%)',
                opacity: 0.06,
                filter: 'blur(120px)',
                top: '-10%',
                right: '-5%',
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: 600,
                height: 600,
                borderRadius: '50%',
                background: 'hsl(170 76% 63%)',
                opacity: 0.04,
                filter: 'blur(120px)',
                bottom: '-15%',
                left: '-10%',
              }}
            />
          </div>

          {/* Content layer */}
          <div className="relative flex flex-col items-center" style={{ zIndex: 5 }}>
            {/* ── Phase 1 & 2: Logo ── */}
            <AnimatePresence mode="wait">
              {phase === 1 && (
                <Motion.div
                  key="logo-center"
                  className="flex flex-col items-center"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.3 } }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                >
                  <NexusLogo size="lg" glitch />
                </Motion.div>
              )}

              {phase === 2 && (
                <Motion.div
                  key="logo-small"
                  className="flex items-center gap-3 self-start"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <NexusLogo size="sm" />
                  <div>
                    <div
                      className="heading-display text-xs font-bold"
                      style={{ color: 'hsl(56 100% 48%)' }}
                    >
                      NEXUS OS
                    </div>
                    <div
                      className="font-mono text-[10px]"
                      style={{ color: 'hsl(170 76% 63% / 0.7)' }}
                    >
                      v1.0.0
                    </div>
                  </div>
                </Motion.div>
              )}

              {phase === 3 && (
                <Motion.div
                  key="logo-fade"
                  className="flex items-center gap-3 self-start"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <NexusLogo size="sm" />
                </Motion.div>
              )}
            </AnimatePresence>

            {/* ── Phase 2: Boot log ── */}
            <AnimatePresence>
              {phase === 2 && (
                <Motion.div
                  key="boot-log"
                  className="mt-8 w-[480px] max-w-[90vw] rounded-lg border p-4 relative"
                  style={{
                    background: 'rgba(0,0,0,0.7)',
                    borderColor: 'hsl(170 76% 63% / 0.2)',
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="space-y-1">
                    {logLines.map((line, i) => (
                      <BootLine key={line} text={line} delayMs={i * STAGGER_MS} />
                    ))}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-6 h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <Motion.div
                      className="h-full bg-primary"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{
                        duration: (BOOT_LINES.length * STAGGER_MS) / 1000,
                        ease: 'linear',
                      }}
                      style={{
                        boxShadow: '0 0 10px hsl(var(--neon-yellow)/0.5)',
                      }}
                    />
                  </div>
                </Motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Phase 3: CRT horizontal sweep ── */}
          <AnimatePresence>
            {sweepVisible && (
              <Motion.div
                key="crt-sweep"
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                style={{
                  zIndex: 20,
                  background:
                    'linear-gradient(90deg, transparent, hsl(56 100% 48% / 0.8), hsl(170 76% 63% / 0.6), transparent)',
                  boxShadow: '0 0 20px hsl(56 100% 48% / 0.6), 0 0 60px hsl(170 76% 63% / 0.3)',
                  willChange: 'transform',
                }}
                initial={{ y: '-2px' }}
                animate={{ y: '100vh' }}
                transition={{ duration: 0.8, ease: 'easeIn' }}
                onAnimationComplete={() => setSweepVisible(false)}
              />
            )}
          </AnimatePresence>
        </Motion.div>
      )}
    </AnimatePresence>
  )
}

/** Reusable Nexus "N" logo mark */
function NexusLogo({ size = 'lg', glitch = false }) {
  const isLg = size === 'lg'
  const boxSize = isLg ? 96 : 36
  const fontSize = isLg ? '3rem' : '1.1rem'

  return (
    <Motion.div
      className={glitch ? 'glitch-anim' : ''}
      style={{
        width: boxSize,
        height: boxSize,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid hsl(56 100% 48% / 0.4)',
        boxShadow: isLg
          ? '0 0 30px hsl(56 100% 48% / 0.4), 0 0 80px hsl(170 76% 63% / 0.15), inset 0 0 20px hsl(56 100% 48% / 0.05)'
          : '0 0 10px hsl(56 100% 48% / 0.3)',
        position: 'relative',
      }}
      animate={
        glitch
          ? {
              x: [0, -2, 2, -1, 1, 0],
              filter: [
                'none',
                'drop-shadow(-3px 0 #f3e600) drop-shadow(3px 0 #55ead4)',
                'drop-shadow(3px 0 #f3e600) drop-shadow(-3px 0 #c5003c)',
                'drop-shadow(-2px 0 #55ead4) drop-shadow(2px 0 #f3e600)',
                'none',
              ],
            }
          : {}
      }
      transition={
        glitch
          ? {
              duration: 0.4,
              repeat: Infinity,
              repeatDelay: 1.2,
              ease: 'easeInOut',
            }
          : {}
      }
    >
      <span
        className="heading-display font-black select-none"
        style={{
          fontSize,
          color: 'hsl(56 100% 48%)',
          textShadow: isLg ? '0 0 20px hsl(56 100% 48% / 0.8)' : '0 0 8px hsl(56 100% 48% / 0.6)',
          lineHeight: 1,
        }}
      >
        N
      </span>
      {/* Corner accent marks */}
      {isLg && (
        <>
          <span
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              width: 8,
              height: 8,
              borderTop: '1px solid hsl(170 76% 63% / 0.6)',
              borderLeft: '1px solid hsl(170 76% 63% / 0.6)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              width: 8,
              height: 8,
              borderBottom: '1px solid hsl(170 76% 63% / 0.6)',
              borderRight: '1px solid hsl(170 76% 63% / 0.6)',
            }}
          />
        </>
      )}
    </Motion.div>
  )
}
