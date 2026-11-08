import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { useWindowStore } from '../stores/windowStore'
import AppIcon from './AppIcon'

const TASKBAR_HEIGHT = 40 // keep in sync with --w7-taskbar-h in index.css
const RESIZE_EDGE_SIZE = 6
const RESIZE_CORNER_SIZE = 14
const SNAP_THRESHOLD = 20

const CURSOR_MAP = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
}

function ResizeHandle({ direction, windowId, position, size, minSize }) {
  const updateWindowRect = useWindowStore((s) => s.updateWindowRect)
  const isResizingRef = useRef(false)
  const startRef = useRef(null)

  const positionStyles = {
    n: {
      top: -RESIZE_EDGE_SIZE / 2,
      left: RESIZE_CORNER_SIZE,
      right: RESIZE_CORNER_SIZE,
      height: RESIZE_EDGE_SIZE,
    },
    s: {
      bottom: -RESIZE_EDGE_SIZE / 2,
      left: RESIZE_CORNER_SIZE,
      right: RESIZE_CORNER_SIZE,
      height: RESIZE_EDGE_SIZE,
    },
    e: {
      right: -RESIZE_EDGE_SIZE / 2,
      top: RESIZE_CORNER_SIZE,
      bottom: RESIZE_CORNER_SIZE,
      width: RESIZE_EDGE_SIZE,
    },
    w: {
      left: -RESIZE_EDGE_SIZE / 2,
      top: RESIZE_CORNER_SIZE,
      bottom: RESIZE_CORNER_SIZE,
      width: RESIZE_EDGE_SIZE,
    },
    ne: {
      top: -RESIZE_EDGE_SIZE / 2,
      right: -RESIZE_EDGE_SIZE / 2,
      width: RESIZE_CORNER_SIZE,
      height: RESIZE_CORNER_SIZE,
    },
    nw: {
      top: -RESIZE_EDGE_SIZE / 2,
      left: -RESIZE_EDGE_SIZE / 2,
      width: RESIZE_CORNER_SIZE,
      height: RESIZE_CORNER_SIZE,
    },
    se: {
      bottom: -RESIZE_EDGE_SIZE / 2,
      right: -RESIZE_EDGE_SIZE / 2,
      width: RESIZE_CORNER_SIZE,
      height: RESIZE_CORNER_SIZE,
    },
    sw: {
      bottom: -RESIZE_EDGE_SIZE / 2,
      left: -RESIZE_EDGE_SIZE / 2,
      width: RESIZE_CORNER_SIZE,
      height: RESIZE_CORNER_SIZE,
    },
  }

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      isResizingRef.current = true
      startRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        x: position.x,
        y: position.y,
        w: size.width,
        h: size.height,
      }
      document.body.style.cursor = CURSOR_MAP[direction]
      document.body.style.userSelect = 'none'

      const onPointerMove = (moveEvent) => {
        if (!isResizingRef.current || !startRef.current) return
        const s = startRef.current
        const dx = moveEvent.clientX - s.mouseX
        const dy = moveEvent.clientY - s.mouseY
        let newX = s.x,
          newY = s.y,
          newW = s.w,
          newH = s.h
        if (direction.includes('e')) newW = Math.max(minSize.width, s.w + dx)
        if (direction.includes('w')) {
          newW = Math.max(minSize.width, s.w - dx)
          newX = s.x + s.w - newW
        }
        if (direction.includes('s')) newH = Math.max(minSize.height, s.h + dy)
        if (direction.includes('n')) {
          newH = Math.max(minSize.height, s.h - dy)
          newY = s.y + s.h - newH
        }
        updateWindowRect(windowId, {
          position: { x: newX, y: newY },
          size: { width: newW, height: newH },
        })
      }

      const onPointerUp = () => {
        isResizingRef.current = false
        startRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [direction, windowId, position, size, minSize, updateWindowRect],
  )

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute',
        cursor: CURSOR_MAP[direction],
        zIndex: 10,
        touchAction: 'none',
        ...positionStyles[direction],
      }}
    />
  )
}

const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function Window({
  windowId,
  appId,
  title,
  position,
  size,
  minSize,
  state: windowState,
  restoredRect: _restoredRect,
  zIndex,
  onSnapHint,
  children,
}) {
  const isFocused = useWindowStore((s) => s.activeWindowId === windowId)
  const isMobile = useWindowStore((s) => s.isMobile)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const snapWindow = useWindowStore((s) => s.snapWindow)

  const isMaximized = windowState === 'maximized'
  const isSnapped = windowState === 'snapped-left' || windowState === 'snapped-right'
  const isSnappedLeft = windowState === 'snapped-left'
  const isLocked = isMaximized || isSnapped

  // ── Pointer-event drag ────────────────────────────────────
  // dragDelta null = not dragging; {x,y} = current offset from drag start.
  // Storing delta (not absolute pos) means the display can be computed as
  // position + delta, and on release both values batch-update atomically in
  // the same React flush — no 1-frame positional flash.
  const [dragDelta, setDragDelta] = useState(null)
  const dragStartRef = useRef(null)
  const rafRef = useRef(null)
  const latestPointerRef = useRef(null)

  // Stash current size in a ref so the closure in handleTitleBarPointerDown
  // always reads the current value without stale capture.
  const sizeRef = useRef(size)
  useEffect(() => {
    sizeRef.current = size
  }, [size])

  const toggleMaximize = useCallback(() => {
    if (isMaximized) restoreWindow(windowId)
    else maximizeWindow(windowId)
  }, [windowId, isMaximized, restoreWindow, maximizeWindow])

  const handleTitleBarPointerDown = useCallback(
    (e) => {
      if (e.target.closest('button')) return
      if (e.button !== 0) return

      // Dragging a snapped window restores it first then allow re-drag
      if (isSnapped) {
        restoreWindow(windowId)
        return
      }
      if (isMaximized) return

      e.preventDefault()

      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        winX: position.x,
        winY: position.y,
      }
      setDragDelta({ x: 0, y: 0 })
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'

      const onMove = (moveEvent) => {
        // Stash latest pointer; process at most once per animation frame.
        latestPointerRef.current = { clientX: moveEvent.clientX, clientY: moveEvent.clientY }
        if (rafRef.current !== null) return
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const ptr = latestPointerRef.current
          if (!ptr || !dragStartRef.current) return
          const dx = ptr.clientX - dragStartRef.current.mouseX
          const dy = ptr.clientY - dragStartRef.current.mouseY
          setDragDelta({ x: dx, y: dy })
          // Snap zone hints
          const rawX = dragStartRef.current.winX + dx
          const rawY = dragStartRef.current.winY + dy
          const sw = sizeRef.current.width
          if (rawX <= SNAP_THRESHOLD) onSnapHint?.('left')
          else if (rawX + sw >= window.innerWidth - SNAP_THRESHOLD) onSnapHint?.('right')
          else if (rawY <= SNAP_THRESHOLD) onSnapHint?.('top')
          else onSnapHint?.(null)
        })
      }

      const cleanup = () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        document.removeEventListener('keydown', onKeyDown)
      }

      const onUp = (upEvent) => {
        const dx = upEvent.clientX - dragStartRef.current.mouseX
        const dy = upEvent.clientY - dragStartRef.current.mouseY
        const finalX = dragStartRef.current.winX + dx
        const finalY = dragStartRef.current.winY + dy
        const sw = sizeRef.current.width

        // Batch: reset delta + commit position → single React flush, no flash.
        setDragDelta(null)
        if (finalX <= SNAP_THRESHOLD) snapWindow(windowId, 'left')
        else if (finalX + sw >= window.innerWidth - SNAP_THRESHOLD) snapWindow(windowId, 'right')
        else if (finalY <= SNAP_THRESHOLD) maximizeWindow(windowId)
        else moveWindow(windowId, { x: finalX, y: finalY })

        onSnapHint?.(null)
        dragStartRef.current = null
        latestPointerRef.current = null
        cleanup()
      }

      // Escape cancels the drag and returns the window to its original position
      const onKeyDown = (e) => {
        if (e.key !== 'Escape') return
        setDragDelta(null)
        onSnapHint?.(null)
        dragStartRef.current = null
        latestPointerRef.current = null
        cleanup()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      document.addEventListener('keydown', onKeyDown)
    },
    [
      windowId,
      position,
      isMaximized,
      isSnapped,
      onSnapHint,
      moveWindow,
      snapWindow,
      maximizeWindow,
      restoreWindow,
    ],
  )

  // ── Mobile layout ─────────────────────────────────────────
  // Phones get a full-screen maximised Win7 window above the taskbar: same
  // frame and title bar, no drag/resize, and a 44px-tall close target.
  if (isMobile) {
    return (
      <div
        className="window glass nx-window active is-maximized fixed inset-x-0 top-0 z-[100]"
        data-testid="mobile-window"
        role="region"
        aria-label={title}
        style={{
          bottom: `calc(${TASKBAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="title-bar" style={{ minHeight: 44 }}>
          <div className="title-bar-text">
            <AppIcon appId={appId} size={16} />
            <span>{title}</span>
          </div>
          <div className="title-bar-controls">
            <button
              type="button"
              className="is-close"
              onClick={() => closeWindow(windowId)}
              aria-label="Close window"
              style={{ minHeight: 30, minWidth: 56 }}
            />
          </div>
        </div>
        <div className="window-body" style={{ containerType: 'inline-size' }}>
          {children}
        </div>
      </div>
    )
  }

  // ── Position calculation ──────────────────────────────────
  // During drag: position.x/y + delta gives the live dragged position.
  // On release: setDragDelta(null) + moveWindow batch in the same React flush,
  // so the render sees delta=null and the new store position simultaneously.
  const effectiveX = dragDelta !== null ? position.x + dragDelta.x : position.x
  const effectiveY = dragDelta !== null ? position.y + dragDelta.y : position.y

  const displayStyle = isSnapped
    ? {
        position: 'absolute',
        left: isSnappedLeft ? '0px' : '50%',
        top: '0px',
        width: '50%',
        height: '100%',
        zIndex,
      }
    : isMaximized
      ? { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', zIndex }
      : {
          position: 'absolute',
          left: effectiveX,
          top: effectiveY,
          width: size.width,
          height: size.height,
          zIndex,
        }

  // CSS transition for position/size — disabled during active drag so movement
  // stays instant. When drag ends and the store commits (or clamping adjusts
  // the position), the transition produces a short ease into the final rect.
  // Snap/maximize/restore changes animate automatically because dragDelta is
  // null for those (they're triggered by buttons or keyboard, not pointer drag).
  const positionTransition =
    dragDelta !== null
      ? undefined
      : 'left 240ms cubic-bezier(0.16,1,0.3,1), top 240ms cubic-bezier(0.16,1,0.3,1), width 240ms cubic-bezier(0.16,1,0.3,1), height 240ms cubic-bezier(0.16,1,0.3,1)'

  return (
    <Motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      style={{ ...displayStyle, transition: positionTransition }}
      onPointerDownCapture={() => focusWindow(windowId)}
      onContextMenu={(e) => e.stopPropagation()}
      role="region"
      aria-label={title}
      className={`window glass nx-window ${isFocused ? 'active' : ''} ${isMaximized ? 'is-maximized' : ''}`}
    >
      {/* Title bar — 7.css .title-bar with Aero glass streaks */}
      <div
        data-testid="titlebar"
        onPointerDown={handleTitleBarPointerDown}
        onDoubleClick={(e) => {
          if (e.target.closest('button')) return
          toggleMaximize()
        }}
        className="title-bar"
      >
        <div className="title-bar-text">
          <AppIcon appId={appId} size={16} />
          <span>{title}</span>
        </div>
        <div className="title-bar-controls">
          <button
            type="button"
            className="is-minimize"
            onClick={() => minimizeWindow(windowId)}
            aria-label="Minimize window"
            title="Minimize"
          />
          <button
            type="button"
            className={isMaximized ? 'is-restore' : 'is-maximize'}
            onClick={toggleMaximize}
            aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            title={isMaximized ? 'Restore Down' : 'Maximize'}
          />
          <button
            type="button"
            className="is-close"
            onClick={() => closeWindow(windowId)}
            aria-label="Close window"
            title="Close"
          />
        </div>
      </div>

      {/* Client area — white, like every Win7 application window */}
      <div className="window-body" style={{ containerType: 'inline-size' }}>
        {children}
      </div>

      {/* Resize handles — only when not locked (maximized / snapped) */}
      {!isLocked &&
        RESIZE_DIRECTIONS.map((dir) => (
          <ResizeHandle
            key={dir}
            direction={dir}
            windowId={windowId}
            position={position}
            size={size}
            minSize={minSize}
          />
        ))}
    </Motion.div>
  )
}

export default memo(Window)
