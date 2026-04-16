import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useWindowStore } from './stores/windowStore'
import { useSettingsStore } from './stores/settingsStore'
import { useNotificationStore } from './stores/notificationStore'
import useGlobalShortcuts from './hooks/useGlobalShortcuts'
import { APP_REGISTRY } from './stores/appRegistry'
import Window from './components/Window'
import Taskbar from './components/Taskbar'
import AppLauncher from './components/AppLauncher'
import NotificationToast from './components/NotificationToast'
import DesktopIcons from './components/DesktopIcons'
import ContextMenu from './components/ContextMenu'
import BootSequence from './components/BootSequence'
import LockScreen from './components/LockScreen'

const Z_INDEX_BASE = 100
const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const BOOT_SESSION_KEY = 'nexus_booted'

export default function Desktop() {
  const desktopRef = useRef(null)
  const [snapPreview, setSnapPreview] = useState(null) // null | 'left' | 'right' | 'top'
  const [contextMenu, setContextMenu] = useState(null) // null | { x, y }

  // ── Boot state ────────────────────────────────────────────
  // Skip boot animation if already shown this browser session
  const [booted, setBooted] = useState(
    () => sessionStorage.getItem(BOOT_SESSION_KEY) === '1'
  )

  const handleBootComplete = useCallback(() => {
    sessionStorage.setItem(BOOT_SESSION_KEY, '1')
    setBooted(true)
  }, [])

  // ── Lock screen state ─────────────────────────────────────
  const [locked, setLocked] = useState(false)
  const idleTimerRef = useRef(null)

  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      // Don't lock if user is actively typing in an input element
      const active = document.activeElement
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        resetIdleTimer()
        return
      }
      setLocked(true)
    }, IDLE_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    if (!booted) return

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    const handler = () => resetIdleTimer()

    events.forEach((e) => document.addEventListener(e, handler, { passive: true }))
    resetIdleTimer()

    return () => {
      events.forEach((e) => document.removeEventListener(e, handler))
      clearTimeout(idleTimerRef.current)
    }
  }, [booted, resetIdleTimer])

  // ── Window store ──────────────────────────────────────────
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const launcherOpen = useWindowStore((s) => s.launcherOpen)
  const openApp = useWindowStore((s) => s.openApp)
  const setMobile = useWindowStore((s) => s.setMobile)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    setMobile(mql.matches)
    const handler = (e) => setMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [setMobile])

  const scanlinesEnabled = useSettingsStore((s) => s.scanlinesEnabled)
  const orbsEnabled = useSettingsStore((s) => s.orbsEnabled)
  const hydrateSettings = useSettingsStore((s) => s.hydrateSettings)

  const hydrateFromStorage = useWindowStore((s) => s.hydrateFromStorage)

  useEffect(() => {
    hydrateFromStorage()
    hydrateSettings()
    // getState() is safe here because hydrateFromStorage() is synchronous —
    // it calls set() internally and Zustand's set() updates the store synchronously,
    // so getState() immediately reflects the hydrated windows.
    if (Object.keys(useWindowStore.getState().windows).length === 0) {
      openApp('media')
    }
    // Welcome notification after boot
    useNotificationStore.getState().addNotification({
      title: 'System Ready',
      message: 'Nexus OS initialized successfully. All 8 apps operational.',
      type: 'success',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useGlobalShortcuts()

  const handleSnapHint = useCallback((hint) => {
    setSnapPreview(hint)
  }, [])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const visibleWindows = zStack
    .map((id) => windows[id])
    .filter((w) => w && w.state !== 'minimized')

  return (
    <>
      {/* Boot sequence — overlays desktop on first load */}
      {!booted && <BootSequence onComplete={handleBootComplete} />}

      <div
        ref={desktopRef}
        data-testid="desktop"
        className="fixed inset-0 overflow-hidden bg-background"
        onContextMenu={handleContextMenu}
        onClick={closeContextMenu}
      >
        {/* Wallpaper layers — forced to z-0, absolute (not fixed) to stay in desktop stacking context */}
        {orbsEnabled && <div className="ambient-orbs" style={{ position: 'absolute', zIndex: 0 }} />}
        {scanlinesEnabled && <div className="scanlines" style={{ position: 'absolute', zIndex: 0 }} />}
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 0 }}>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--neon-yellow)/0.02)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-yellow)/0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
        </div>

        {/* Desktop icons — behind all windows */}
        <DesktopIcons />

        {visibleWindows.map((win) => {
          const manifest = APP_REGISTRY[win.appId]
          if (!manifest) return null
          const AppComponent = manifest.component
          const zIndex = Z_INDEX_BASE + zStack.indexOf(win.windowId)
          return (
            <Window
              key={win.windowId}
              windowId={win.windowId}
              appId={win.appId}
              title={win.title}
              position={win.position}
              size={win.size}
              minSize={win.minSize}
              state={win.state}
              restoredRect={win.restoredRect}
              zIndex={zIndex}
              desktopRef={desktopRef}
              onSnapHint={handleSnapHint}
            >
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                }
              >
                <AppComponent appId={win.appId} windowId={win.windowId} />
              </Suspense>
            </Window>
          )
        })}

        {/* Snap preview overlay */}
        {snapPreview && (
          <div
            data-testid="snap-preview"
            className="pointer-events-none absolute z-[99] rounded-lg border border-cyan-500/30 bg-cyan-500/5 backdrop-blur-sm transition-all duration-150"
            style={
              snapPreview === 'left'
                ? { left: 0, top: 0, width: '50%', height: `calc(100% - ${48}px)` }
                : snapPreview === 'right'
                  ? { left: '50%', top: 0, width: '50%', height: `calc(100% - ${48}px)` }
                  : { left: 0, top: 0, width: '100%', height: `calc(100% - ${48}px)` }
            }
          />
        )}

        {!locked && <NotificationToast />}

        <Taskbar />

        <AnimatePresence>
          {launcherOpen && <AppLauncher />}
        </AnimatePresence>

        {/* Desktop right-click context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={closeContextMenu}
          />
        )}

        {/* Lock screen — shown after 5 min idle */}
        {locked && (
          <LockScreen onUnlock={() => setLocked(false)} />
        )}
      </div>
    </>
  )
}
