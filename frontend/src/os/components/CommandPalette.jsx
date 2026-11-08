import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import {
  LayoutGrid,
  Minus,
  Copy,
  X as XIcon,
  Download,
  Palette,
  Image as ImageIcon,
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
import { useFocusTrap } from '../../hooks/useFocusTrap'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

// Mouse presses inside the list must not move focus off the search box; the
// highlighted row is announced through aria-activedescendant instead.
const keepFocus = (e) => e.preventDefault()

function CommandOption({ id, idx, active, item, onHover, onRun }) {
  const Icon = item.icon
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-idx={idx}
      onMouseMove={onHover}
      onMouseDown={keepFocus}
      onClick={onRun}
      className={`w7-item mx-1 flex min-h-6 cursor-default items-center gap-2 px-2 py-1 text-[12px] pointer-coarse:min-h-11 ${
        active ? 'is-selected' : ''
      }`}
    >
      {Icon ? (
        <Icon size={16} className="shrink-0 text-[#3d5a80]" aria-hidden="true" />
      ) : (
        <span className="w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{item.label}</span>
      {active && (
        <CornerDownLeft size={14} className="ml-auto shrink-0 text-muted-foreground" aria-hidden />
      )}
    </div>
  )
}

/**
 * Universal command centre (Cmd/Ctrl+K). The OS "brainstem": fuzzy-search every
 * app plus a set of system commands and run them by keyboard. Mounted once,
 * globally; renders into #modal-root as a Win7 dialog (title bar, close
 * button, focus trapped). Self-contained — all actions go through the zustand
 * stores, so no parent wiring is required.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [confirmCloseAll, setConfirmCloseAll] = useState(false)
  const [confirmReload, setConfirmReload] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [installable, setInstallable] = useState(false)
  const baseId = useId()
  const titleId = `${baseId}-title`
  const listId = `${baseId}-commands`
  const optionId = (idx) => `${baseId}-option-${idx}`
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const trapRef = useFocusTrap(open)

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
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return
      // A focused app already consumed the shortcut.
      if (e.defaultPrevented) return
      // Ask AI owns its own dialog; never stack a second palette on top of it.
      if (document.querySelector('[role="dialog"][aria-label="Ask AI"]')) return
      e.preventDefault()
      if (open) {
        close()
      } else {
        setQuery('')
        setActiveIdx(0)
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Escape closes the palette wherever focus has landed (for example after
  // another dialog returned focus elsewhere), so it can never be left behind.
  useEffect(() => {
    if (!open) return undefined
    const onEscape = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [open, close])

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
        label: 'Open Start menu',
        keywords: 'start menu launcher apps grid all programs',
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
        label: 'Close all windows…',
        keywords: 'close quit all windows',
        icon: XIcon,
        // Destructive: confirm first, with Cancel as the default button.
        action: () => setConfirmCloseAll(true),
      },
      {
        id: 'sys:notifications',
        group: 'System',
        label: 'Open Action Center',
        keywords: 'action center notification centre notifications alerts bell history',
        icon: Bell,
        action: () => openNotifications(),
      },
      {
        id: 'sys:dnd',
        group: 'System',
        label: 'Toggle do not disturb',
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
        // Reloading drops unsaved work in open apps, so ask first (Cancel is the default).
        action: () => setConfirmReload(true),
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
        label: `Window colour: ${preset.label}`,
        keywords: `window colour color accent theme ${preset.label} ${key}`,
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

  // Group the (already group-ordered) results for the listbox headers.
  const groups = useMemo(() => {
    const out = []
    filtered.forEach((item, idx) => {
      const last = out[out.length - 1]
      if (last && last.name === item.group) last.items.push({ item, idx })
      else out.push({ name: item.group, items: [{ item, idx }] })
    })
    return out
  }, [filtered])

  // Clamp at read-time rather than storing a corrected index in an effect, so
  // the active row stays in range as the filter narrows without setState-in-effect.
  const safeIdx = filtered.length === 0 ? 0 : Math.min(activeIdx, filtered.length - 1)

  // Scroll the active row into view (DOM side-effect only — no setState).
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector(`[data-idx="${safeIdx}"]`)
    node?.scrollIntoView?.({ block: 'nearest' })
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
    <>
      <ConfirmDialog
        open={confirmReload}
        id="palette-reload"
        title="Restart Nexus OS"
        message="Restart the shell now? Unsaved work in open apps will be lost."
        confirmLabel="Restart"
        defaultAction="cancel"
        onConfirm={() => {
          setConfirmReload(false)
          window.location.reload()
        }}
        onCancel={() => setConfirmReload(false)}
      />
      <ConfirmDialog
        open={confirmCloseAll}
        id="palette-close-all"
        title="Close all windows"
        message="Close every open window? Unsaved work in them will be lost."
        confirmLabel="Close all"
        defaultAction="cancel"
        onConfirm={() => {
          setConfirmCloseAll(false)
          closeAll()
        }}
        onCancel={() => setConfirmCloseAll(false)}
      />
      <AnimatePresence>
        {open && (
          <Motion.div
            className="fixed inset-0 z-[9500] flex items-start justify-center px-4 pt-[12vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onMouseDown={close}
          >
            <div className="absolute inset-0 bg-black/20" aria-hidden="true" />
            <Motion.div
              ref={trapRef}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.12 }}
              className="relative w-full max-w-[560px]"
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby={titleId}
              aria-modal="true"
              data-testid="command-palette"
            >
              <div className="window active w-full">
                <div className="title-bar">
                  <div className="title-bar-text" id={titleId}>
                    Command palette
                  </div>
                  <div className="title-bar-controls">
                    <button type="button" aria-label="Close" className="is-close" onClick={close} />
                  </div>
                </div>
                <div className="window-body m-0">
                  <div className="flex items-center gap-2 border-b border-border bg-muted px-2 py-2">
                    <Search size={16} className="shrink-0 text-[#3d5a80]" aria-hidden="true" />
                    <input
                      ref={inputRef}
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setActiveIdx(0)
                      }}
                      onKeyDown={onInputKeyDown}
                      placeholder="Search apps and commands"
                      className="min-w-0 flex-1"
                      aria-label="Search apps and commands"
                      aria-controls={listId}
                      aria-activedescendant={filtered.length > 0 ? optionId(safeIdx) : undefined}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <kbd className="hidden shrink-0 items-center gap-1 border border-border bg-white px-1.5 py-px text-[11px] text-muted-foreground sm:flex">
                      Ctrl+K
                    </kbd>
                  </div>

                  <div
                    id={listId}
                    ref={listRef}
                    role="listbox"
                    aria-label="Commands"
                    onMouseDown={keepFocus}
                    className="max-h-[50vh] overflow-y-auto bg-background py-1"
                  >
                    {groups.map((group) => (
                      <div key={group.name} role="group" aria-label={group.name}>
                        <p
                          aria-hidden="true"
                          className="px-3 pb-0.5 pt-2 text-[11px] text-w7-title"
                        >
                          {group.name}
                        </p>
                        {group.items.map(({ item, idx }) => (
                          <CommandOption
                            key={item.id}
                            id={optionId(idx)}
                            idx={idx}
                            active={idx === safeIdx}
                            item={item}
                            onHover={() => setActiveIdx(idx)}
                            onRun={() => run(item.action)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  {filtered.length === 0 && (
                    <p
                      role="status"
                      className="px-4 py-6 text-center text-[12px] text-muted-foreground"
                    >
                      No matching commands.
                    </p>
                  )}
                </div>
              </div>
            </Motion.div>
          </Motion.div>
        )}
      </AnimatePresence>
    </>,
    modalRoot,
  )
}
