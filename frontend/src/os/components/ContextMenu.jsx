import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { DURATION, EASE } from '../../lib/motion'
import MenuPanel from './DesktopMenus/MenuPanel'

const MIN_WIDTH = 200
const EDGE = 4

/**
 * A positioned Windows 7 context menu. Clamps itself inside the viewport,
 * closes on an outside press, Escape, Tab or a resize, and returns focus to
 * whatever opened it when the keyboard dismisses it.
 */
function ContextMenu({ x, y, label, items, onClose }) {
  const panelRef = useRef(null)
  const [opener] = useState(() => (typeof document !== 'undefined' ? document.activeElement : null))
  const [pos, setPos] = useState({ left: x, top: y })

  // offsetWidth/Height ignore the open animation's scale transform.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    setPos({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - el.offsetWidth - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - el.offsetHeight - EDGE)),
    })
  }, [x, y, items])

  const dismiss = useCallback(
    (reason) => {
      if (
        reason !== 'select' &&
        opener &&
        opener.isConnected &&
        opener !== document.body &&
        typeof opener.focus === 'function'
      ) {
        opener.focus()
      }
      onClose()
    },
    [onClose, opener],
  )

  useEffect(() => {
    const onPointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    // Escape when focus is outside the menu; inside, MenuPanel handles it.
    const onKeyDown = (e) => {
      if (e.key === 'Escape') dismiss('escape')
    }
    const onResize = () => onClose()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [onClose, dismiss])

  return (
    <Motion.div
      ref={panelRef}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: DURATION.fast, ease: EASE.standard }}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        minWidth: MIN_WIDTH,
        // Above windows (100–~250) and above in-app modals (1000–1051) so a
        // right-click inside an open dialog still surfaces the menu on top.
        zIndex: 1200,
        transformOrigin: 'top left',
      }}
      // The shell root also handles clicks and right-clicks; keep them here.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <MenuPanel label={label} items={items} onDismiss={dismiss} />
    </Motion.div>
  )
}

export default memo(ContextMenu)
