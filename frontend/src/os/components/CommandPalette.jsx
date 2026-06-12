import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import {
  Command,
  LayoutGrid,
  Minus,
  Copy,
  X as XIcon,
  Download,
  Palette,
  Image as ImageIcon,
  Sparkles,
  RotateCw,
  Search,
  CornerDownLeft,
  Bell,
  BellOff,
  Trash2,
} from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useSettingsStore, WALLPAPER_PRESETS, ACCENT_PRESETS } from '../stores/settingsStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'
import {
  canInstall,
  promptInstall,
  onInstallAvailabilityChange,
} from '../../lib/registerServiceWorker'

/**
 * Universal command centre (Cmd/Ctrl+K). The OS "brainstem": fuzzy-search every
 * app plus a set of system commands and run them by keyboard. Mounted once,
 * globally; renders into #modal-root. Self-contained — all actions go through
 * the zustand stores, so no parent wiring is required.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [installable, setInstallable] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)
  const minimizeAll = useWindowStore((s) => s.minimizeAll)
  const cascadeWindows = useWindowStore((s) => s.cascadeWindows)
  const closeAll = useWindowStore((s) => s.closeAll)

  const openNotifications = useNotificationStore((s) => s.openPanel)
  const clearNotifications = useNotificationStore((s) => s.clearAll)
  const toggleDoNotDisturb = useNotificationStore((s) => s.toggleDoNotDisturb)

  const setWallpaper = useSettingsStore((s) => s.setWallpaper)
  const setAccentColor = useSettingsStore((s) => s.setAccentColor)
  const toggleScanlines = useSettingsStore((s) => s.toggleScanlines)
  const toggleOrbs = useSettingsStore((s) => s.toggleOrbs)
  const currentWallpaper = useSettingsStore((s) => s.wallpaper)

  useEffect(() => onInstallAvailabilityChange((p) => setInstallable(Boolean(p))), [])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIdx(0)
  }, [])

  // Global Cmd/Ctrl+K toggle. `open`/`close` are in the deps so the handler
  // always sees the current state (cheap re-subscribe on toggle). Resetting
  // happens here in the event handler, not in an effect.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) {
          close()
        } else {
          setQuery('')
          setActiveIdx(0)
          setOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Focus the input when the palette opens (DOM side-effect only — no setState).
  useEffect(() => {
    if (open) {
      // next frame so the portal node exists
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const run = useCallback(
    (action) => {
      close()
      // defer so the close animation isn't janked by heavy actions
      requestAnimationFrame(() => action())
    },
    [close],
  )

  // ── Command catalogue ─────────────────────────────────────────────────────
  const commands = useMemo(() => {
    const items = []

    // Apps
    for (const id of APP_ORDER) {
      const app = APP_REGISTRY[id]
      if (!app) continue
      items.push({
        id: `app:${id}`,
        group: 'Apps',
        label: `Open ${app.title}`,
        keywords: `${app.title} ${id} launch open app`,
        icon: app.icon,
        action: () => openApp(id),
      })
    }

    // System / window commands
    items.push(
      {
        id: 'sys:launcher',
        group: 'System',
        label: 'Open App Launcher',
        keywords: 'launcher apps grid all',
        icon: LayoutGrid,
        action: () => toggleLauncher(),
      },
      {
        id: 'sys:minimize-all',
        group: 'System',
        label: 'Minimize all windows',
        keywords: 'minimize hide all windows show desktop',
        icon: Minus,
        action: () => minimizeAll(),
      },
      {
        id: 'sys:cascade',
        group: 'System',
        label: 'Cascade windows',
        keywords: 'cascade arrange tidy windows',
        icon: Copy,
        action: () => cascadeWindows(),
      },
      {
        id: 'sys:close-all',
        group: 'System',
        label: 'Close all windows',
        keywords: 'close quit all windows',
        icon: XIcon,
        action: () => closeAll(),
      },
      {
        id: 'sys:notifications',
        group: 'System',
        label: 'Open notification centre',
        keywords: 'notifications centre center alerts bell history',
        icon: Bell,
        action: () => openNotifications(),
      },
      {
        id: 'sys:dnd',
        group: 'System',
        label: 'Toggle Do Not Disturb',
        keywords: 'do not disturb dnd silence mute notifications focus',
        icon: BellOff,
        action: () => toggleDoNotDisturb(),
      },
      {
        id: 'sys:clear-notifications',
        group: 'System',
        label: 'Clear all notifications',
        keywords: 'clear dismiss all notifications alerts empty',
        icon: Trash2,
        action: () => clearNotifications(),
      },
      {
        id: 'sys:reload',
        group: 'System',
        label: 'Restart Nexus OS shell',
        keywords: 'reload restart refresh shell reboot',
        icon: RotateCw,
        action: () => window.location.reload(),
      },
    )

    if (installable || canInstall()) {
      items.push({
        id: 'sys:install',
        group: 'System',
        label: 'Install Nexus OS as an app',
        keywords: 'install pwa app desktop dock',
        icon: Download,
        action: () => promptInstall(),
      })
    }

    // Appearance commands
    items.push(
      {
        id: 'appearance:scanlines',
        group: 'Appearance',
        label: 'Toggle CRT scanlines',
        keywords: 'scanlines crt effect appearance toggle',
        icon: Sparkles,
        action: () => toggleScanlines(),
      },
      {
        id: 'appearance:orbs',
        group: 'Appearance',
        label: 'Toggle ambient orbs',
        keywords: 'orbs ambient glow background appearance toggle',
        icon: Sparkles,
        action: () => toggleOrbs(),
      },
    )

    for (const wp of Object.values(WALLPAPER_PRESETS || {})) {
      if (wp.id === currentWallpaper) continue
      items.push({
        id: `wallpaper:${wp.id}`,
        group: 'Appearance',
        label: `Wallpaper: ${wp.label}`,
        keywords: `wallpaper background ${wp.label} ${wp.id}`,
        icon: ImageIcon,
        action: () => setWallpaper(wp.id),
      })
    }

    for (const [key, preset] of Object.entries(ACCENT_PRESETS || {})) {
      items.push({
        id: `accent:${key}`,
        group: 'Appearance',
        label: `Accent: ${preset.label}`,
        keywords: `accent color theme ${preset.label} ${key}`,
        icon: Palette,
        action: () => setAccentColor(key),
      })
    }

    return items
  }, [
    openApp,
    toggleLauncher,
    minimizeAll,
    cascadeWindows,
    closeAll,
    toggleScanlines,
    toggleOrbs,
    setWallpaper,
    setAccentColor,
    currentWallpaper,
    installable,
    openNotifications,
    clearNotifications,
    toggleDoNotDisturb,
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    const terms = q.split(/\s+/)
    return commands.filter((c) => {
      const haystack = `${c.label} ${c.keywords} ${c.group}`.toLowerCase()
      return terms.every((t) => haystack.includes(t))
    })
  }, [commands, query])

  // Clamp at read-time rather than storing a corrected index in an effect, so
  // the active row stays in range as the filter narrows without setState-in-effect.
  const safeIdx = filtered.length === 0 ? 0 : Math.min(activeIdx, filtered.length - 1)

  // Scroll the active row into view (DOM side-effect only — no setState).
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector(`[data-idx="${safeIdx}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [safeIdx, open])

  const onInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(Math.min(safeIdx + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(Math.max(safeIdx - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[safeIdx]
      if (item) run(item.action)
    }
  }

  const modalRoot = typeof document !== 'undefined' ? document.getElementById('modal-root') : null
  if (!modalRoot) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <Motion.div
          className="fixed inset-0 z-[9500] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={close}
          role="presentation"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <Motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-cyan-400/40 bg-[#070b1a]/95 shadow-[0_0_50px_rgba(0,245,255,0.25)]"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Command palette"
            aria-modal="true"
          >
            <div className="flex items-center gap-3 border-b border-cyan-400/20 px-4 py-3">
              <Search size={18} className="shrink-0 text-cyan-300/70" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveIdx(0)
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search apps and commands…"
                className="w-full bg-transparent font-[Oxanium] text-sm text-cyan-50 placeholder:text-cyan-200/40 focus:outline-none"
                aria-label="Search apps and commands"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="hidden shrink-0 items-center gap-1 rounded border border-cyan-400/30 px-1.5 py-0.5 text-[10px] text-cyan-200/60 sm:flex">
                <Command size={10} /> K
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-cyan-200/50">
                  No matching commands.
                </p>
              ) : (
                filtered.map((item, idx) => {
                  const Icon = item.icon
                  const active = idx === safeIdx
                  const prevGroup = idx > 0 ? filtered[idx - 1].group : null
                  const showHeader = item.group !== prevGroup
                  return (
                    <div key={item.id}>
                      {showHeader && (
                        <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/50">
                          {item.group}
                        </p>
                      )}
                      <button
                        type="button"
                        data-idx={idx}
                        onMouseMove={() => setActiveIdx(idx)}
                        onClick={() => run(item.action)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition ${
                          active
                            ? 'bg-cyan-400/15 text-cyan-50'
                            : 'text-cyan-100/80 hover:bg-cyan-400/10'
                        }`}
                      >
                        {Icon ? (
                          <Icon size={16} className="shrink-0 text-cyan-300/80" />
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <span className="truncate">{item.label}</span>
                        {active && (
                          <CornerDownLeft size={14} className="ml-auto shrink-0 text-cyan-300/60" />
                        )}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>,
    modalRoot,
  )
}
