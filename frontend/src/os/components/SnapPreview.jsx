import { motion as Motion, AnimatePresence } from 'framer-motion'

// The preview covers exactly the area the window will land in (the same rect as
// the snapped or maximised window), so what you see is where it goes.
const STYLES = {
  left: { left: 0, top: 0, width: '50%', height: '100%' },
  right: { left: '50%', top: 0, width: '50%', height: '100%' },
  top: { left: 0, top: 0, width: '100%', height: '100%' },
}

export default function SnapPreview({ hint }) {
  // AnimatePresence stays mounted across hint changes so the overlay can
  // animate out when the drag leaves a snap zone; keying on `hint` cross-fades
  // left → right.
  return (
    <AnimatePresence>
      {hint && (
        <Motion.div
          key={hint}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
          className="nx-snap-preview pointer-events-none absolute z-[90]"
          style={STYLES[hint]}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  )
}
