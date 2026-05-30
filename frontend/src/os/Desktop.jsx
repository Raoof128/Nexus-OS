import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useWindowStore } from './stores/windowStore'
import { useSettingsStore, WALLPAPER_PRESETS } from './stores/settingsStore'
import { useNotificationStore } from './stores/notificationStore'
import useGlobalShortcuts from './hooks/useGlobalShortcuts'
import { APP_REGISTRY, APP_ORDER } from './stores/appRegistry'
import Window from './components/Window'
import Taskbar from './components/Taskbar'
import AppLauncher from './components/AppLauncher'
import NotificationToast from './components/NotificationToast'
import DesktopIcons from './components/DesktopIcons'
import ContextMenu from './components/ContextMenu'
import BootSequence from './components/BootSequence'
import LockScreen from './components/LockScreen'
import SnapPreview from './components/SnapPreview'
import CommandPalette from './components/CommandPalette'
import InstallPrompt from './components/InstallPrompt'

const Z_INDEX_BASE = 100
const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const BOOT_SESSION_KEY = 'nexus_booted'

export default function Desktop() {
  const desktopRef = useRef(null)
  const [snapPreview, setSnapPreview] = useState(null) // null | 'left' | 'right' | 'top'
  const [contextMenu, setContextMenu] = useState(null) // null | { x, y }

  // ── Boot state ────────────────────────────────────────────
  // Skip boot animation if already shown this browser session
  const [booted, setBooted] = useState(() => sessionStorage.getItem(BOOT_SESSION_KEY) === '1')

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
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
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
  const wallpaperKey = useSettingsStore((s) => s.wallpaper)
  const wallpaperPreset = WALLPAPER_PRESETS[wallpaperKey] || { id: wallpaperKey }
  const hydrateSettings = useSettingsStore((s) => s.hydrateSettings)

  const hydrateFromStorage = useWindowStore((s) => s.hydrateFromStorage)

  useEffect(() => {
    hydrateFromStorage()
    hydrateSettings()
    // getState() is safe here because hydrateFromStorage() is synchronous —
    // it calls set() internally and Zustand's set() updates the store synchronously,
    // so getState() immediately reflects the hydrated windows.
    const firstBoot = Object.keys(useWindowStore.getState().windows).length === 0
    if (firstBoot) {
      openApp('media')
    }
    // PWA shortcut / deep-link: ?app=<id> (from a manifest shortcut or
    // start_url) opens that app on launch, then the param is stripped so a
    // later reload doesn't reopen it on top of the restored layout.
    const params = new URLSearchParams(window.location.search)
    const deepLinkApp = params.get('app')
    if (deepLinkApp && APP_REGISTRY[deepLinkApp]) {
      openApp(deepLinkApp)
    }
    if (params.has('app') || params.has('source')) {
      const url = new URL(window.location.href)
      url.searchParams.delete('app')
      url.searchParams.delete('source')
      window.history.replaceState({}, '', url)
    }
    // Welcome notification only on a genuine first boot this session
    if (firstBoot && sessionStorage.getItem(BOOT_SESSION_KEY) !== '1') {
      useNotificationStore.getState().addNotification({
        title: 'System Ready',
        message: `Nexus OS initialized successfully. ${APP_ORDER.length} apps operational.`,
        type: 'success',
      })
    }
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

  const visibleWindows = zStack.map((id) => windows[id]).filter((w) => w && w.state !== 'minimized')

  return (
    <>
      {/* Boot sequence — overlays desktop on first load */}
      {!booted && <BootSequence onComplete={handleBootComplete} />}

      {/* Desktop shell — flex column: work area fills space, taskbar at bottom */}
      <div
        className="fixed inset-0 flex flex-col overflow-hidden bg-background"
        onContextMenu={handleContextMenu}
        onClick={closeContextMenu}
      >
        {/* Wallpaper layers ─────────────────────────────────────────
             Stacking order (all z-index: -1, DOM order = bottom→top):
               1. wallpaper  — base texture / image (rendered first = lowest)
               2. orbs       — neon glow on top of wallpaper
               3. scanlines  — CRT overlay on top of everything
             Image wallpapers use `background-size: cover` which fills the
             full viewport on every device and orientation. */}
        <div
          className={`pointer-events-none absolute inset-0 -z-1 ${
            wallpaperPreset.image ? '' : `wallpaper-${wallpaperKey}`
          }`}
          style={
            wallpaperPreset.image
              ? {
                  backgroundImage: `url(${wallpaperPreset.image})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }
              : {}
          }
        />
        {orbsEnabled && <div className="ambient-orbs" />}
        {scanlinesEnabled && <div className="scanlines" />}

        {/* Work area — takes all space above the taskbar */}
        <div ref={desktopRef} data-testid="desktop" className="relative flex-1 overflow-hidden">
          {/* Desktop icons — behind all windows */}
          <DesktopIcons />

          <AnimatePresence>
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
          </AnimatePresence>

          {/* Snap preview overlay */}
          <SnapPreview hint={snapPreview} />
        </div>

        {/* Taskbar — normal flex child at the bottom, NOT fixed */}
        <Taskbar />

        {/* Overlays — these use fixed/absolute positioning above everything */}
        {!locked && <NotificationToast />}

        <AnimatePresence>{launcherOpen && <AppLauncher />}</AnimatePresence>

        <AnimatePresence>
          {contextMenu && (
            <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu} />
          )}
        </AnimatePresence>

        {locked && <LockScreen onUnlock={() => setLocked(false)} />}
      </div>

      {/* OS-grade overlays — only live on the unlocked desktop */}
      {!locked && <CommandPalette />}
      {!locked && <InstallPrompt />}
    </>
  )
}
