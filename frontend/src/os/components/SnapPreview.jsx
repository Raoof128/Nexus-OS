import { motion as Motion, AnimatePresence } from 'framer-motion'

const STYLES = {
  left: { left: 0, top: 0, width: '50%', height: '100%' },
  right: { left: '50%', top: 0, width: '50%', height: '100%' },
  top: { left: 0, top: 0, width: '100%', height: '100%' },
}

export default function SnapPreview({ hint }) {
  // AnimatePresence must stay mounted across hint changes so the overlay can
  // animate OUT when the drag leaves a snap zone (a prior early `return null`
  // unmounted the wrapper and skipped the exit animation entirely). Keying the
  // child on `hint` also cross-fades cleanly when moving left → right.
  return (
    <AnimatePresence>
      {hint && (
        <Motion.div
          key={hint}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="pointer-events-none absolute z-[90] rounded-lg border border-primary/40 bg-primary/5 backdrop-blur-sm shadow-[0_0_40px_rgba(0,255,255,0.1)]"
          style={STYLES[hint]}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-20 w-20 animate-pulse rounded-full bg-primary/5 blur-3xl" />
          </div>
        </Motion.div>
      )}
    </AnimatePresence>
  )
}
