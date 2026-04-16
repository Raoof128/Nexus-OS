import { memo, useEffect, useRef } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import {
  AppWindow,
  ChevronDown,
  Layers,
  Minus,
  X,
  ScanLine,
  Sparkles,
  Settings,
  Info,
} from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { useSettingsStore } from '../stores/settingsStore'

function Separator() {
  return <div className="mx-2 my-1 h-px bg-white/[0.06]" />
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors duration-100 ${
        danger
          ? 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
          : 'text-white/60 hover:bg-primary/10 hover:text-primary'
      }`}
    >
      {Icon && (
        <Icon
          size={12}
          className="shrink-0 opacity-70"
        />
      )}
      <span className="heading-ui text-[10px]">{label}</span>
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
  const toggleScanlines = useSettingsStore((s) => s.toggleScanlines)
  const toggleOrbs = useSettingsStore((s) => s.toggleOrbs)

  // Clamp position so the menu doesn't overflow off-screen
  const MENU_WIDTH = 192
  const MENU_HEIGHT_EST = 280
  const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH - 8)
  const clampedY = Math.min(y, window.innerHeight - MENU_HEIGHT_EST - 8)

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

  return (
    <AnimatePresence>
      <Motion.div
        ref={menuRef}
        key="context-menu"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.1, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          left: clampedX,
          top: clampedY,
          minWidth: MENU_WIDTH,
          zIndex: 900,
          transformOrigin: 'top left',
        }}
        className="neon-border glass-panel rounded-lg py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Accent line at top */}
        <div className="absolute inset-x-0 top-0 h-px rounded-t-lg bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <MenuItem
          icon={AppWindow}
          label="Open App Launcher"
          onClick={() => run(toggleLauncher)}
        />

        <Separator />

        <MenuItem
          icon={Layers}
          label="Arrange Windows"
          onClick={() => run(cascadeWindows)}
        />
        <MenuItem
          icon={Minus}
          label="Minimize All"
          onClick={() => run(minimizeAll)}
        />
        <MenuItem
          icon={X}
          label="Close All"
          onClick={() => run(closeAll)}
          danger
        />

        <Separator />

        <MenuItem
          icon={ScanLine}
          label="Toggle Scanlines"
          onClick={() => run(toggleScanlines)}
        />
        <MenuItem
          icon={Sparkles}
          label="Toggle Orbs"
          onClick={() => run(toggleOrbs)}
        />

        <Separator />

        <MenuItem
          icon={Settings}
          label="Settings"
          onClick={() => run(() => openApp('settings'))}
        />
        <MenuItem
          icon={Info}
          label="About Nexus OS"
          onClick={() => run(() => openApp('settings'))}
        />
      </Motion.div>
    </AnimatePresence>
  )
}

export default memo(ContextMenu)
