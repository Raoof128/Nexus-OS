import { memo, useState, useCallback } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'
import AppIcon from './AppIcon'

// Windows 7 "Medium icons" desktop grid: 48px icons, 78×88 cells, filled
// top-to-bottom then left-to-right.
const CELL_W = 78
const CELL_H = 88
const START_X = 6
const START_Y = 6

function DesktopIcons() {
  const openApp = useWindowStore((s) => s.openApp)
  const isMobile = useWindowStore((s) => s.isMobile)
  const [selectedId, setSelectedId] = useState(null)

  const handleClick = useCallback(
    (e, appId) => {
      e.stopPropagation()
      if (isMobile) openApp(appId)
      else setSelectedId(appId)
    },
    [isMobile, openApp],
  )

  const handleDoubleClick = useCallback(
    (e, appId) => {
      e.stopPropagation()
      openApp(appId)
      setSelectedId(null)
    },
    [openApp],
  )

  // Arrow keys move between icons in the column-major grid, like Explorer.
  const handleKeyDown = (e, index, appId, rows) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openApp(appId)
      return
    }
    const delta = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rows, ArrowLeft: -rows }[e.key]
    if (delta === undefined) return
    e.preventDefault()
    const next = index + delta
    if (next < 0 || next >= APP_ORDER.length) return
    const el = e.currentTarget.parentElement?.children[next]
    el?.focus()
    setSelectedId(APP_ORDER[next])
  }

  // Rows that fit above the taskbar; at least 1.
  const rows =
    typeof window === 'undefined'
      ? 8
      : Math.max(1, Math.floor((window.innerHeight - 40 - START_Y) / CELL_H))

  return (
    <div
      role="group"
      className="pointer-events-none absolute inset-0 z-[2]"
      aria-label="Desktop icons"
      onClick={() => setSelectedId(null)}
    >
      {APP_ORDER.map((appId, index) => {
        const manifest = APP_REGISTRY[appId]
        if (!manifest) return null
        const col = Math.floor(index / rows)
        const row = index % rows
        const isSelected = selectedId === appId

        return (
          <div
            key={appId}
            role="button"
            tabIndex={0}
            aria-label={`Open ${manifest.title}`}
            aria-pressed={isSelected}
            title={manifest.description}
            onClick={(e) => handleClick(e, appId)}
            onDoubleClick={(e) => handleDoubleClick(e, appId)}
            onKeyDown={(e) => handleKeyDown(e, index, appId, rows)}
            onFocus={() => setSelectedId(appId)}
            className={`nx-desktop-icon pointer-events-auto absolute flex cursor-default select-none flex-col items-center gap-[3px] px-[2px] pb-[3px] pt-[4px] ${
              isSelected ? 'is-selected' : ''
            }`}
            style={{ left: START_X + col * CELL_W, top: START_Y + row * CELL_H, width: 74 }}
          >
            <AppIcon appId={appId} size={48} />
            <span className="nx-desktop-icon__label line-clamp-2 w-full break-words text-center text-[9pt] leading-[1.2]">
              {manifest.title}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default memo(DesktopIcons)
