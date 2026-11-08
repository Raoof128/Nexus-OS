import { motion as Motion, AnimatePresence } from 'framer-motion'

// Inset a few pixels like Aero Snap's glass outline.
const STYLES = {
  left: { left: 4, top: 4, width: 'calc(50% - 8px)', height: 'calc(100% - 8px)' },
  right: { left: 'calc(50% + 4px)', top: 4, width: 'calc(50% - 8px)', height: 'calc(100% - 8px)' },
  top: { left: 4, top: 4, width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' },
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
