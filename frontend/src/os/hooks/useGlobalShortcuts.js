import { useEffect } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { APP_ORDER } from '../stores/appRegistry'

const CODE_KEYS = { BracketLeft: '[', BracketRight: ']' }

function keyFromCode(code) {
  if (!code) return null
  if (code.startsWith('Key')) return code.slice(3).toLowerCase()
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Arrow')) return code.toLowerCase()
  return CODE_KEYS[code] ?? null
}

function isTyping() {
  const active = document.activeElement
  return (
    !!active &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
  )
}

// Announces the lock request; the desktop shell listens for it and locks.
function requestLock() {
  window.dispatchEvent(new CustomEvent('nexus:lock'))
}

// `disabled` (e.g. while the lock screen is up) turns every shortcut off so
// nothing acts on the desktop hidden behind the lock.
export default function useGlobalShortcuts({ disabled = false } = {}) {
  const activeWindowId = useWindowStore((s) => s.activeWindowId)
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const snapWindow = useWindowStore((s) => s.snapWindow)
  const cycleWindow = useWindowStore((s) => s.cycleWindow)
  const openApp = useWindowStore((s) => s.openApp)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const minimizeAll = useWindowStore((s) => s.minimizeAll)
  const restoreDesktop = useWindowStore((s) => s.restoreDesktop)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  useEffect(() => {
    // Win7 Up: maximise, or restore a maximised window.
    const toggleMaximized = (id) => {
      if (windows[id]?.state === 'maximized') restoreWindow(id)
      else maximizeWindow(id)
    }
    // Win7 Down: restore a maximised or snapped window, otherwise minimise.
    const restoreOrMinimize = (id) => {
      const state = windows[id]?.state
      if (state === 'maximized' || state === 'snapped-left' || state === 'snapped-right') {
        restoreWindow(id)
      } else {
        minimizeWindow(id)
      }
    }

    if (disabled) return undefined

    const handler = (e) => {
      // Ctrl+Esc opens or closes the Start menu, as on Windows 7.
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Escape') {
        if (isTyping()) return
        e.preventDefault()
        toggleLauncher()
        return
      }

      if (!e.altKey && !e.metaKey) return

      // Never hijack keys while the user is typing — Alt+W in a text field must
      // not close the active window (same rule applied elsewhere in the OS).
      if (isTyping()) return

      // On macOS, Option composes characters (Option+L is "¬"), so read the
      // physical key from e.code and fall back to e.key where code is absent.
      const key = keyFromCode(e.code) ?? (e.key ?? '').toLowerCase()

      // Ctrl+Alt+L: lock fallback for browsers that never deliver the Win key.
      if (e.altKey && e.ctrlKey && key === 'l') {
        e.preventDefault()
        requestLock()
        return
      }

      // Win key (Cmd on macOS). Only where the browser delivers it; Windows
      // reserves most Win combinations for the shell before a page sees them.
      if (!e.altKey && e.metaKey) {
        const handled = handleWinKey(key)
        if (handled) e.preventDefault()
        return
      }

      function handleWinKey(k) {
        switch (k) {
          case 'arrowup':
            if (!activeWindowId) return false
            toggleMaximized(activeWindowId)
            return true
          case 'arrowdown':
            if (!activeWindowId) return false
            restoreOrMinimize(activeWindowId)
            return true
          case 'arrowleft':
            if (!activeWindowId) return false
            snapWindow(activeWindowId, 'left')
            return true
          case 'arrowright':
            if (!activeWindowId) return false
            snapWindow(activeWindowId, 'right')
            return true
          case 'd': {
            // Show desktop toggles, as on the taskbar.
            const anyVisible = zStack.some((id) => windows[id] && windows[id].state !== 'minimized')
            if (!anyVisible && restoreDesktop()) return true
            minimizeAll()
            return true
          }
          case 't': {
            // Win+T moves focus to the taskbar.
            const first = document.querySelector('[data-testid="taskbar"] button:not(:disabled)')
            if (!first) return false
            first.focus()
            return true
          }
          case 'l':
            requestLock()
            return true
          default:
            if (k >= '1' && k <= '8') {
              const idx = parseInt(k, 10) - 1
              const entry = Object.values(windows)[idx]
              // Same as the taskbar: activate that window, or launch the app.
              if (entry) {
                if (entry.windowId === activeWindowId && entry.state !== 'minimized') {
                  minimizeWindow(entry.windowId)
                } else {
                  focusWindow(entry.windowId)
                }
                return true
              }
              if (idx < APP_ORDER.length) {
                openApp(APP_ORDER[idx])
                return true
              }
            }
            return false
        }
      }

      switch (key) {
        case 'w':
          if (activeWindowId) {
            e.preventDefault()
            closeWindow(activeWindowId)
          }
          break
        case 'f4':
          // Alt+F4 closes the active window. Browsers may keep this key for
          // closing the tab, so this only applies where the page receives it.
          if (activeWindowId) {
            e.preventDefault()
            closeWindow(activeWindowId)
          }
          break
        case 'm':
          if (activeWindowId) {
            e.preventDefault()
            minimizeWindow(activeWindowId)
          }
          break
        case 'arrowup':
          if (activeWindowId) {
            e.preventDefault()
            toggleMaximized(activeWindowId)
          }
          break
        case 'arrowdown':
          if (activeWindowId) {
            e.preventDefault()
            restoreOrMinimize(activeWindowId)
          }
          break
        case 'arrowleft':
          if (activeWindowId) {
            e.preventDefault()
            snapWindow(activeWindowId, 'left')
          }
          break
        case 'arrowright':
          if (activeWindowId) {
            e.preventDefault()
            snapWindow(activeWindowId, 'right')
          }
          break
        case ']':
          e.preventDefault()
          cycleWindow('next')
          break
        case '[':
          e.preventDefault()
          cycleWindow('prev')
          break
        case 'l':
          e.preventDefault()
          toggleLauncher()
          break
        default:
          if (key >= '1' && key <= '8') {
            const idx = parseInt(key, 10) - 1
            if (idx < APP_ORDER.length) {
              e.preventDefault()
              openApp(APP_ORDER[idx])
            }
          }
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [
    disabled,
    activeWindowId,
    windows,
    zStack,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    snapWindow,
    cycleWindow,
    openApp,
    focusWindow,
    minimizeAll,
    restoreDesktop,
    toggleLauncher,
  ])
}
