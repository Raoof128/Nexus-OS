import { Suspense, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useWindowStore } from './stores/windowStore'
import { APP_REGISTRY } from './stores/appRegistry'
import Window from './components/Window'
import Taskbar from './components/Taskbar'
import AppLauncher from './components/AppLauncher'

const Z_INDEX_BASE = 100

export default function Desktop() {
  const desktopRef = useRef(null)
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

  useEffect(() => {
    if (Object.keys(windows).length === 0) {
      openApp('media')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleWindows = zStack
    .map((id) => windows[id])
    .filter((w) => w && w.state !== 'minimized')

  return (
    <div
      ref={desktopRef}
      data-testid="desktop"
      className="fixed inset-0 overflow-hidden bg-background"
    >
      <div className="ambient-orbs" />
      <div className="scanlines" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(to_right,hsl(var(--neon-yellow)/0.02)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-yellow)/0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />

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
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }
            >
              <AppComponent appId={win.appId} />
            </Suspense>
          </Window>
        )
      })}

      <Taskbar />

      <AnimatePresence>
        {launcherOpen && <AppLauncher />}
      </AnimatePresence>
    </div>
  )
}
