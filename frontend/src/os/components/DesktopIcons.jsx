import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useWindowStore } from '../stores/windowStore'
import { TASKBAR_HEIGHT } from '../stores/taskbarHeight'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'
import AppIcon from './AppIcon'
import {
  hideDesktopIcon,
  iconTitle,
  renameDesktopIcon,
  useDesktopIconPrefs,
} from './DesktopMenus/desktopPrefs'

// Windows 7 "Medium icons" grid: 48px icons in 78×88 cells, filled
// top-to-bottom then left-to-right. The grid is measured, so it reflows when
// the window changes size and never runs under the taskbar.
const CELL_W = 78
const CELL_H = 88
const START_X = 6
const START_Y = 6
const DRAG_THRESHOLD = 4

function rowsFor(height) {
  return Math.max(1, Math.floor((height - START_Y) / CELL_H))
}

function useGridRows(gridRef, revision, taskbarH) {
  const [rows, setRows] = useState(() =>
    rowsFor(typeof window === 'undefined' ? 800 : window.innerHeight - taskbarH),
  )
  useEffect(() => {
    const el = gridRef.current
    if (!el) return undefined
    const measure = () => setRows(rowsFor(el.clientHeight || window.innerHeight - taskbarH))
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(el)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [gridRef, revision, taskbarH])
  return rows
}

const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i])
const stop = (e) => e.stopPropagation()

function DesktopIcons({ onIconContextMenu }) {
  const openApp = useWindowStore((s) => s.openApp)
  const isMobile = useWindowStore((s) => s.isMobile)
  // Live taskbar height (48px touch, 40px fine pointer).
  const taskbarH = useWindowStore((s) => s.taskbarHeight) ?? TASKBAR_HEIGHT
  const prefs = useDesktopIconPrefs()
  const gridRef = useRef(null)
  const rows = useGridRows(gridRef, prefs.revision, taskbarH)
  const itemRefs = useRef(new Map())
  const dragRef = useRef(null)
  const renameRef = useRef(null)
  const renameSettled = useRef(false)
  const [rawSelection, setSelection] = useState([])
  const [anchorId, setAnchorId] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [marquee, setMarquee] = useState(null)

  // Visible icons in display order (hidden icons are kept, not shown).
  const orderedIds = useMemo(() => {
    const visible = APP_ORDER.filter((id) => APP_REGISTRY[id] && !prefs.hidden.includes(id))
    if (prefs.sort !== 'name') return visible
    const title = (id) => iconTitle(id, prefs, APP_REGISTRY[id].title)
    return [...visible].sort((a, b) =>
      title(a).localeCompare(title(b), undefined, { sensitivity: 'base' }),
    )
  }, [prefs])

  // Icons that were hidden or re-sorted away drop out of the selection.
  const selection = useMemo(
    () => rawSelection.filter((id) => orderedIds.includes(id)),
    [rawSelection, orderedIds],
  )

  // F2 / the Rename command from the icon menu.
  useEffect(() => {
    const onRename = (e) => {
      const id = e.detail?.appId
      if (id && orderedIds.includes(id)) setRenamingId(id)
    }
    window.addEventListener('nexus:desktop-rename', onRename)
    return () => window.removeEventListener('nexus:desktop-rename', onRename)
  }, [orderedIds])

  useEffect(() => {
    if (renamingId) {
      renameSettled.current = false
      renameRef.current?.focus()
      renameRef.current?.select()
    }
  }, [renamingId])

  const focusId = orderedIds.includes(activeId) ? activeId : orderedIds[0]

  const setItemRef = (id, el) => {
    if (el) itemRefs.current.set(id, el)
    else itemRefs.current.delete(id)
  }

  const focusIcon = (id) => {
    setActiveId(id)
    itemRefs.current.get(id)?.focus()
  }

  const selectOnly = (id) => {
    setSelection([id])
    setAnchorId(id)
  }

  const toggle = (id) => {
    setSelection((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))
    setAnchorId(id)
  }

  const selectRange = (id) => {
    const a = orderedIds.indexOf(anchorId)
    const b = orderedIds.indexOf(id)
    if (a < 0 || b < 0) return selectOnly(id)
    const [lo, hi] = a < b ? [a, b] : [b, a]
    setSelection(orderedIds.slice(lo, hi + 1))
  }

  const finishRename = (appId, value, apply, refocus) => {
    if (renameSettled.current) return
    renameSettled.current = true
    if (apply) renameDesktopIcon(appId, value, APP_REGISTRY[appId].title)
    setRenamingId(null)
    if (refocus) itemRefs.current.get(appId)?.focus()
  }

  const hideFromKeyboard = (appId) => {
    const index = orderedIds.indexOf(appId)
    const neighbour = orderedIds[index + 1] ?? orderedIds[index - 1] ?? null
    hideDesktopIcon(appId)
    if (neighbour) focusIcon(neighbour)
  }

  const handleClick = (e, appId) => {
    e.stopPropagation()
    if (isMobile) {
      openApp(appId)
      return
    }
    if (e.shiftKey && anchorId) selectRange(appId)
    else if (e.ctrlKey || e.metaKey) toggle(appId)
    else selectOnly(appId)
    setActiveId(appId)
  }

  const handleDoubleClick = (e, appId) => {
    e.stopPropagation()
    openApp(appId)
  }

  // Win7 listbox keys: arrows move (and select), Ctrl+arrows move focus only,
  // Shift extends, Space toggles, Enter opens. Space never opens.
  const handleKeyDown = (e, appId) => {
    // Keys typed into the rename field are not icon commands.
    if (e.target !== e.currentTarget) return
    const index = orderedIds.indexOf(appId)
    const ctrl = e.ctrlKey || e.metaKey
    let target = null
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        openApp(appId)
        return
      case ' ':
        e.preventDefault()
        toggle(appId)
        return
      case 'F2':
        e.preventDefault()
        setRenamingId(appId)
        return
      case 'Delete':
        e.preventDefault()
        hideFromKeyboard(appId)
        return
      case 'a':
      case 'A':
        if (!ctrl) return
        e.preventDefault()
        setSelection([...orderedIds])
        return
      case 'Home':
        target = orderedIds[0]
        break
      case 'End':
        target = orderedIds[orderedIds.length - 1]
        break
      case 'ArrowDown':
        target = orderedIds[index + 1]
        break
      case 'ArrowUp':
        target = orderedIds[index - 1]
        break
      case 'ArrowRight':
        target = orderedIds[index + rows]
        break
      case 'ArrowLeft':
        target = orderedIds[index - rows]
        break
      default:
        return
    }
    e.preventDefault()
    if (!target) return
    if (e.shiftKey) selectRange(target)
    else if (!ctrl) selectOnly(target)
    focusIcon(target)
  }

  const handleContextMenu = (e, appId) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selection.includes(appId)) selectOnly(appId)
    onIconContextMenu?.({ x: e.clientX, y: e.clientY, appId })
  }

  // Rubber-band selection on empty desktop.
  const gridPoint = (e) => {
    const r = gridRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onGridPointerDown = (e) => {
    if ((e.button ?? 0) !== 0 || isMobile || e.target !== e.currentTarget) return
    const p = gridPoint(e)
    const additive = e.ctrlKey || e.metaKey
    dragRef.current = {
      startX: p.x,
      startY: p.y,
      additive,
      base: additive ? selection : [],
      moved: false,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onGridPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const p = gridPoint(e)
    if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) < DRAG_THRESHOLD) return
    drag.moved = true
    const box = {
      left: Math.min(p.x, drag.startX),
      top: Math.min(p.y, drag.startY),
      right: Math.max(p.x, drag.startX),
      bottom: Math.max(p.y, drag.startY),
    }
    setMarquee({
      left: box.left,
      top: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
    })
    const r = gridRef.current.getBoundingClientRect()
    const hits = orderedIds.filter((id) => {
      if (drag.base.includes(id)) return true
      const el = itemRefs.current.get(id)
      if (!el) return false
      const ir = el.getBoundingClientRect()
      const l = ir.left - r.left
      const t = ir.top - r.top
      return l < box.right && l + ir.width > box.left && t < box.bottom && t + ir.height > box.top
    })
    setSelection((sel) => {
      if (sameIds(sel, hits)) return sel
      return hits
    })
  }

  const endDrag = (cancelled) => {
    const drag = dragRef.current
    dragRef.current = null
    setMarquee(null)
    if (!drag || cancelled) return
    // A plain click on empty desktop clears the selection, as in Explorer.
    if (!drag.moved && !drag.additive) {
      setSelection([])
      setAnchorId(null)
    }
  }

  return (
    <div
      ref={gridRef}
      role="listbox"
      aria-label="Desktop icons"
      aria-multiselectable="true"
      className="pointer-events-auto absolute inset-0 z-[2] select-none"
      onPointerDown={onGridPointerDown}
      onPointerMove={onGridPointerMove}
      onPointerUp={() => endDrag(false)}
      onPointerCancel={() => endDrag(true)}
    >
      {prefs.showIcons &&
        orderedIds.map((appId, index) => {
          const manifest = APP_REGISTRY[appId]
          const col = Math.floor(index / rows)
          const row = index % rows
          const isSelected = selection.includes(appId)
          const isRenaming = renamingId === appId
          const title = iconTitle(appId, prefs, manifest.title)

          return (
            <div
              key={appId}
              role="option"
              aria-selected={isSelected}
              tabIndex={appId === focusId ? 0 : -1}
              ref={(el) => setItemRef(appId, el)}
              title={manifest.description}
              onClick={(e) => handleClick(e, appId)}
              onDoubleClick={(e) => handleDoubleClick(e, appId)}
              onPointerDown={stop}
              onKeyDown={(e) => handleKeyDown(e, appId)}
              onFocus={(e) => {
                if (e.target === e.currentTarget) setActiveId(appId)
              }}
              onContextMenu={(e) => handleContextMenu(e, appId)}
              className={`nx-desktop-icon absolute flex cursor-default flex-col items-center gap-[3px] px-[2px] pb-[3px] pt-[4px] ${
                isSelected ? 'is-selected' : ''
              }`}
              style={{ left: START_X + col * CELL_W, top: START_Y + row * CELL_H, width: 74 }}
            >
              <AppIcon appId={appId} size={48} />
              {isRenaming ? (
                <input
                  ref={renameRef}
                  type="text"
                  defaultValue={title}
                  maxLength={60}
                  aria-label={`Name for ${manifest.title}`}
                  className="w-full text-center text-[9pt]"
                  onPointerDown={stop}
                  onClick={stop}
                  onDoubleClick={stop}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      finishRename(appId, e.currentTarget.value, true, true)
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      finishRename(appId, '', false, true)
                    }
                  }}
                  onBlur={(e) => finishRename(appId, e.currentTarget.value, true, false)}
                />
              ) : (
                <span className="nx-desktop-icon__label line-clamp-2 w-full break-words text-center text-[9pt] leading-[1.2]">
                  {title}
                </span>
              )}
            </div>
          )
        })}
      {marquee && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
            background: '#3399ff40',
            border: '1px solid #3399ff',
          }}
        />
      )}
    </div>
  )
}

export default memo(DesktopIcons)
