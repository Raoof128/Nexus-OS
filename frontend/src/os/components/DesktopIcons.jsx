import { memo, useState, useCallback } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'

const GRID_CELL = 88
const COLS = 2
const ICON_START_X = 16
const ICON_START_Y = 24

function DesktopIcons() {
  const openApp = useWindowStore((s) => s.openApp)
  const isMobile = useWindowStore((s) => s.isMobile)
  const [selectedId, setSelectedId] = useState(null)

  const handleClick = useCallback(
    (e, appId) => {
      e.stopPropagation()
      if (isMobile) {
        openApp(appId)
      } else {
        setSelectedId(appId)
      }
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

  // Deselect when clicking desktop background (bubbled up, but we stop propagation on icons)
  // Selection is cleared by Desktop.jsx onClick

  return (
    <div
      role="group"
      className="pointer-events-none absolute inset-0 z-[2]"
      aria-label="Desktop icons"
    >
      {APP_ORDER.map((appId, index) => {
        const manifest = APP_REGISTRY[appId]
        if (!manifest) return null
        const Icon = manifest.icon
        const col = index % COLS
        const row = Math.floor(index / COLS)
        const x = ICON_START_X + col * GRID_CELL
        const y = ICON_START_Y + row * GRID_CELL
        const isSelected = selectedId === appId

        return (
          <div
            key={appId}
            role="button"
            tabIndex={0}
            aria-label={`Open ${manifest.title}`}
            onClick={(e) => handleClick(e, appId)}
            onDoubleClick={(e) => handleDoubleClick(e, appId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openApp(appId)
              }
            }}
            className={`pointer-events-auto absolute flex flex-col items-center gap-1 rounded-lg p-1 cursor-default select-none transition-all duration-150 ${
              isSelected ? 'ring-1 ring-primary/40 bg-primary/[0.06]' : ''
            }`}
            style={{
              left: x,
              top: y,
              width: 72,
            }}
          >
            {/* Icon container */}
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-xl bg-white/[0.02] ring-1 ring-white/[0.04] transition-all duration-150 relative overflow-hidden ${
                isSelected
                  ? 'bg-primary/[0.08] ring-primary/30 shadow-[0_0_20px_rgba(0,255,255,0.15)]'
                  : 'hover:bg-white/[0.04] hover:ring-white/[0.1] hover:shadow-[0_0_12px_rgba(0,255,255,0.08)]'
              }`}
            >
              {isSelected && <div className="absolute inset-0 bg-primary/5 animate-pulse" />}
              <Icon
                size={32}
                className={`transition-colors duration-150 relative z-10 ${
                  isSelected
                    ? 'text-primary drop-shadow-[0_0_8px_rgba(0,255,255,0.5)]'
                    : 'text-white/60'
                }`}
              />
            </div>

            {/* Label — line-clamp-2 so two-word titles wrap rather than truncate.
                 textShadow provides a dark backdrop that keeps text readable
                 on bright image wallpapers while being invisible on dark ones. */}
            <span
              className="heading-ui w-full break-words line-clamp-2 text-center text-[11px] text-white/80 leading-tight"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)' }}
            >
              {manifest.title}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default memo(DesktopIcons)
