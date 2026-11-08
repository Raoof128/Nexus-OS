import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useWindowStore } from './stores/windowStore'
import { readTaskbarHeight } from './stores/taskbarHeight'
import {
  useSettingsStore,
  WALLPAPER_PRESETS,
  wallpaperBackgroundStyle,
} from './stores/settingsStore'
import { useNotificationStore } from './stores/notificationStore'
import { useFileSystemStore } from './stores/fileSystemStore'
import useGlobalShortcuts from './hooks/useGlobalShortcuts'
import { APP_REGISTRY, APP_ORDER } from './stores/appRegistry'
import Window from './components/Window'
import Taskbar from './components/Taskbar'
import AppLauncher from './components/AppLauncher'
import NotificationToast from './components/NotificationToast'
import NotificationCenter from './components/NotificationCenter'
import DesktopIcons from './components/DesktopIcons'
import ContextMenu from './components/ContextMenu'
import {
  hideDesktopIcon,
  isIdleLockEnabled,
  refreshDesktopIcons,
  requestDesktopIconRename,
  restoreDesktopIcons,
  setDesktopIconSort,
  setDesktopIconsShown,
  useDesktopIconPrefs,
} from './components/DesktopMenus/desktopPrefs'
import {
  buildDesktopMenu,
  buildIconMenu,
  buildTaskbarMenu,
  toggleShowDesktop,
} from './components/DesktopMenus/menuModels'
import BootSequence from './components/BootSequence'
import LockScreen from './components/LockScreen'
import SnapPreview from './components/SnapPreview'
import CommandPalette from './components/CommandPalette'
import InstallPrompt from './components/InstallPrompt'
import TitlebarOverlay from './components/TitlebarOverlay'
import { consumeShareTarget, consumeFileHandlers } from '../lib/pwaLaunch'
import { claimLocalState } from '../lib/privateState'
import { useAuth } from '../hooks/useAuth'

const Z_INDEX_BASE = 100
const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes, only when the idle lock is switched on
const BOOT_SESSION_KEY = 'nexus_booted'

export default function Desktop() {
  const desktopRef = useRef(null)
  const [snapPreview, setSnapPreview] = useState(null) // null | 'left' | 'right' | 'top'
  // null | { id, kind: 'desktop' | 'taskbar' | 'icon', x, y, appId? }
  const [contextMenu, setContextMenu] = useState(null)
  const menuSerial = useRef(0)

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

  // Keyboard cues: show menu access-key underlines once the keyboard is in
  // use, hide them again on pointer input (Windows 7 default behaviour).
  useEffect(() => {
    const body = document.body
    const onKey = (e) => {
      if (e.key === 'Alt' || e.key === 'F10' || e.key === 'ContextMenu' || e.key === 'Tab') {
        body.classList.add('nx-kbd-cues')
      }
    }
    const onPointer = () => body.classList.remove('nx-kbd-cues')
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      body.classList.remove('nx-kbd-cues')
    }
  }, [])

  // Re-read the opt-in idle lock when Control Panel changes it.
  const [idleLockOn, setIdleLockOn] = useState(isIdleLockEnabled)
  useEffect(() => {
    const sync = () => setIdleLockOn(isIdleLockEnabled())
    window.addEventListener('nexus:idle-lock-changed', sync)
    return () => window.removeEventListener('nexus:idle-lock-changed', sync)
  }, [])

  useEffect(() => {
    // The idle lock is opt-in and off by default.
    if (!booted || !idleLockOn) return

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    const handler = () => resetIdleTimer()

    events.forEach((e) => document.addEventListener(e, handler, { passive: true }))
    resetIdleTimer()

    return () => {
      events.forEach((e) => document.removeEventListener(e, handler))
      clearTimeout(idleTimerRef.current)
    }
  }, [booted, idleLockOn, resetIdleTimer])

  // ── Window store ──────────────────────────────────────────
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const launcherOpen = useWindowStore((s) => s.launcherOpen)
  const openApp = useWindowStore((s) => s.openApp)
  const setMobile = useWindowStore((s) => s.setMobile)
  const cascadeWindows = useWindowStore((s) => s.cascadeWindows)
  const iconPrefs = useDesktopIconPrefs()

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    setMobile(mql.matches)
    const handler = (e) => setMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [setMobile])

  // The taskbar is 48px on touch (pointer:coarse) and 40px otherwise; the CSS
  // token is the source of truth. Sync the store before hydrate/clamp effects
  // below run, and again whenever the pointer type changes.
  const setTaskbarHeight = useWindowStore((s) => s.setTaskbarHeight)
  useEffect(() => {
    const sync = () => setTaskbarHeight?.(readTaskbarHeight())
    sync()
    const coarse = window.matchMedia?.('(pointer: coarse)')
    coarse?.addEventListener?.('change', sync)
    return () => coarse?.removeEventListener?.('change', sync)
  }, [setTaskbarHeight])

  const wallpaperKey = useSettingsStore((s) => s.wallpaper)
  const wallpaperPosition = useSettingsStore((s) => s.wallpaperPosition)
  const attentionIds = useWindowStore((s) => s.attentionIds)
  const wallpaperPreset = WALLPAPER_PRESETS[wallpaperKey] || WALLPAPER_PRESETS.aero
  const hydrateSettings = useSettingsStore((s) => s.hydrateSettings)

  const hydrateFromStorage = useWindowStore((s) => s.hydrateFromStorage)
  const { session } = useAuth()
  const userId = session?.user?.id

  useEffect(() => {
    // Files, notes and window layout live in this browser. If another account
    // owned them, wipe them before any store hydrates (see lib/privateState).
    claimLocalState(userId)
    hydrateFromStorage()
    hydrateSettings()
    // Restore this account's notification history + Do Not Disturb preference.
    useNotificationStore.getState().hydrateNotifications(userId)
    // PWA Web Share Target: shared text/url is appended to Notes, which we open.
    const sharedApp = consumeShareTarget()
    if (sharedApp) openApp(sharedApp)
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
        message: `Welcome to Nexus OS. ${APP_ORDER.length} programs are ready to use.`,
        type: 'success',
      })
    }
    // PWA File Handling API: files the OS opens with Nexus import into the Drive.
    consumeFileHandlers({
      openApp,
      importFile: (parentPath, file) => useFileSystemStore.getState().importFile(parentPath, file),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useGlobalShortcuts({ disabled: locked })

  const handleLock = useCallback(() => setLocked(true), [])

  // `nexus:lock` lets any part of the OS lock the desktop (Start menu, shortcuts).
  useEffect(() => {
    const lockNow = () => setLocked(true)
    window.addEventListener('nexus:lock', lockNow)
    return () => window.removeEventListener('nexus:lock', lockNow)
  }, [])

  // A locked desktop shows no menus behind the lock screen.
  useEffect(() => {
    if (locked) setContextMenu(null)
  }, [locked])

  const handleSnapHint = useCallback((hint) => {
    setSnapPreview(hint)
  }, [])

  const openMenu = useCallback((spec) => {
    menuSerial.current += 1
    setContextMenu({ ...spec, id: menuSerial.current })
  }, [])

  // Right-click on the taskbar gets the taskbar menu; anywhere else on the
  // desktop gets the desktop menu. Icons and windows stop their own event.
  const handleContextMenu = useCallback(
    (e) => {
      const target = e.target instanceof Element ? e.target : null
      // Inside a window or a text field, leave the browser's own menu (copy,
      // paste, spelling) alone; apps that want a menu open their own.
      if (target?.closest('.nx-window, input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      if (locked) return
      if (target?.closest('.nx-startmenu')) return
      const kind = target?.closest('.nx-taskbar') ? 'taskbar' : 'desktop'
      openMenu({ kind, x: e.clientX, y: e.clientY })
    },
    [locked, openMenu],
  )

  const handleIconContextMenu = useCallback(
    ({ x, y, appId }) => {
      if (!locked) openMenu({ kind: 'icon', x, y, appId })
    },
    [locked, openMenu],
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const menu = useMemo(() => {
    if (!contextMenu) return null
    const actions = {
      openApp,
      cascadeWindows,
      showDesktop: () => toggleShowDesktop(useWindowStore.getState()),
      setIconsShown: setDesktopIconsShown,
      setSort: setDesktopIconSort,
      restoreIcons: restoreDesktopIcons,
      refresh: refreshDesktopIcons,
      hideIcon: hideDesktopIcon,
      rename: requestDesktopIconRename,
    }
    if (contextMenu.kind === 'icon') {
      const title = APP_REGISTRY[contextMenu.appId]?.title ?? contextMenu.appId
      return buildIconMenu({ appId: contextMenu.appId, title, prefs: iconPrefs, actions })
    }
    if (contextMenu.kind === 'taskbar') return buildTaskbarMenu({ actions })
    return buildDesktopMenu({ prefs: iconPrefs, actions })
  }, [contextMenu, iconPrefs, openApp, cascadeWindows])

  const visibleWindows = zStack.map((id) => windows[id]).filter((w) => w && w.state !== 'minimized')

  return (
    <>
      {/* Boot sequence — overlays desktop on first load */}
      {!booted && <BootSequence onComplete={handleBootComplete} />}

      {/* Desktop shell — flex column: work area fills space, taskbar at bottom */}
      <div
        className="fixed inset-0 flex flex-col overflow-hidden bg-[#1c3f6e]"
        onContextMenu={handleContextMenu}
        onClick={closeContextMenu}
      >
        {/* Wallpaper — every preset is an image; the CSS class supplies the
             Aero fallback colour while the image loads. */}
        <div
          className="nx-wallpaper-aero pointer-events-none absolute inset-0 -z-1"
          style={{
            backgroundImage: `url(${wallpaperPreset.image})`,
            ...wallpaperBackgroundStyle(wallpaperPosition),
          }}
        />

        {/* Work area — takes all space above the taskbar */}
        <div ref={desktopRef} data-testid="desktop" className="relative flex-1 overflow-hidden">
          {/* Desktop icons — behind all windows */}
          <DesktopIcons onIconContextMenu={handleIconContextMenu} />

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
                        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                        <span className="sr-only" role="status">
                          Loading…
                        </span>
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
        <Taskbar flashingWindowIds={attentionIds} />

        {/* Overlays — these use fixed/absolute positioning above everything */}
        {!locked && <NotificationToast />}

        <AnimatePresence>{launcherOpen && <AppLauncher onLock={handleLock} />}</AnimatePresence>

        <AnimatePresence>
          {contextMenu && menu && (
            <ContextMenu
              key={contextMenu.id}
              x={contextMenu.x}
              y={contextMenu.y}
              label={menu.label}
              items={menu.items}
              onClose={closeContextMenu}
            />
          )}
        </AnimatePresence>

        {locked && <LockScreen onUnlock={() => setLocked(false)} />}
      </div>

      {/* Window Controls Overlay titlebar — only renders in WCO mode */}
      <TitlebarOverlay />

      {/* OS-grade overlays — only live on the unlocked desktop */}
      {!locked && <CommandPalette />}
      {!locked && <NotificationCenter />}
      {!locked && <InstallPrompt />}
    </>
  )
}
