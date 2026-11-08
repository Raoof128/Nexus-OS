import { memo, useCallback, useEffect, useRef } from 'react'
import { motion as Motion } from 'framer-motion'
import { DURATION, EASE } from '../../lib/motion'
import { AppWindow, Layers, Minus, X, Monitor } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'

function Separator() {
  return <div role="separator" className="nx-menu-separator" />
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`nx-menuitem ${danger ? 'text-[#a8261b]' : ''}`}
    >
      <span className="nx-menuitem__icon">{Icon && <Icon size={14} aria-hidden="true" />}</span>
      <span>{label}</span>
    </button>
  )
}

function ContextMenu({ x, y, onClose }) {
  const menuRef = useRef(null)
  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)
  const cascadeWindows = useWindowStore((s) => s.cascadeWindows)
  const minimizeAll = useWindowStore((s) => s.minimizeAll)
  const closeAll = useWindowStore((s) => s.closeAll)

  // Clamp position so the menu doesn't overflow off-screen
  const MENU_WIDTH = 200
  const MENU_HEIGHT_EST = 180
  const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH - 8)
  const clampedY = Math.min(y, window.innerHeight - MENU_HEIGHT_EST - 8)

  // Focus the first item on open so arrow-key navigation works immediately
  // (without this, ArrowDown is dead until the user tabs into the menu).
  useEffect(() => {
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
  }, [])

  // Dismiss on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Dismiss on outside click
  useEffect(() => {
    const handlePointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }
    // Use capture so we catch clicks on the backdrop before they hit the menu
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [onClose])

  const run = (fn) => {
    onClose()
    fn()
  }

  const handleMenuKeyDown = useCallback((e) => {
    const items = menuRef.current
      ? Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'))
      : []
    if (items.length === 0) return
    const focused = document.activeElement
    const currentIndex = items.indexOf(focused)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
      items[nextIndex]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
      items[prevIndex]?.focus()
    }
  }, [])

  return (
    <Motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: DURATION.fast, ease: EASE.standard }}
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        minWidth: MENU_WIDTH,
        // Above windows (100–~250) and above in-app modals (1000–1051) so a
        // right-click inside an open dialog still surfaces the menu on top.
        zIndex: 1200,
        transformOrigin: 'top left',
      }}
      role="menu"
      aria-label="Desktop context menu"
      className="nx-flyout p-[2px]"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      <MenuItem icon={AppWindow} label="Open Start menu" onClick={() => run(toggleLauncher)} />

      <Separator />

      <MenuItem icon={Layers} label="Cascade windows" onClick={() => run(cascadeWindows)} />
      <MenuItem icon={Minus} label="Show the desktop" onClick={() => run(minimizeAll)} />
      <MenuItem icon={X} label="Close all windows" onClick={() => run(closeAll)} danger />

      <Separator />

      <MenuItem icon={Monitor} label="Personalize" onClick={() => run(() => openApp('settings'))} />
    </Motion.div>
  )
}

export default memo(ContextMenu)
