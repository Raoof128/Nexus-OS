import { useEffect } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { APP_ORDER } from '../stores/appRegistry'

export default function useGlobalShortcuts() {
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const windows = useWindowStore((s) => s.windows)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const snapWindow = useWindowStore((s) => s.snapWindow)
  const cycleWindow = useWindowStore((s) => s.cycleWindow)
  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  useEffect(() => {
    const handler = (e) => {
      if (!e.altKey) return

      // Never hijack keys while the user is typing — Alt+W in a text field must
      // not close the active window (same rule applied elsewhere in the OS).
      const active = document.activeElement
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return
      }

      const key = e.key.toLowerCase()
      const activeWin = activeWindowId ? windows[activeWindowId] : null

      switch (key) {
        case 'w':
          if (activeWindowId) { e.preventDefault(); closeWindow(activeWindowId) }
          break
        case 'm':
          if (activeWindowId) { e.preventDefault(); minimizeWindow(activeWindowId) }
          break
        case 'arrowup':
          if (activeWindowId) {
            e.preventDefault()
            if (activeWin?.state === 'maximized') restoreWindow(activeWindowId)
            else maximizeWindow(activeWindowId)
          }
          break
        case 'arrowleft':
          if (activeWindowId) { e.preventDefault(); snapWindow(activeWindowId, 'left') }
          break
        case 'arrowright':
          if (activeWindowId) { e.preventDefault(); snapWindow(activeWindowId, 'right') }
          break
        case ']':
          e.preventDefault(); cycleWindow('next')
          break
        case '[':
          e.preventDefault(); cycleWindow('prev')
          break
        case 'l':
          e.preventDefault(); toggleLauncher()
          break
        default:
          if (key >= '1' && key <= '8') {
            const idx = parseInt(key, 10) - 1
            if (idx < APP_ORDER.length) { e.preventDefault(); openApp(APP_ORDER[idx]) }
          }
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeWindowId, windows, closeWindow, minimizeWindow, maximizeWindow, restoreWindow, snapWindow, cycleWindow, openApp, toggleLauncher])
}
