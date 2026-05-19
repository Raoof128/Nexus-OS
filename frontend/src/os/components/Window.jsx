import { memo, useCallback, useRef } from 'react'
import { motion as Motion, useDragControls } from 'framer-motion'
import { Minus, Square, X } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY } from '../stores/appRegistry'

const TITLEBAR_HEIGHT = 36
const TASKBAR_HEIGHT = 48
// Resize grab area. Edges are thinner (6px) so the cursor only becomes a
// resize arrow when the user is genuinely at the border; corners are larger
// (14px) to stay reachable despite the rounded-lg window radius.
const RESIZE_EDGE_SIZE = 6
const RESIZE_CORNER_SIZE = 14

function ResizeHandle({ direction, windowId, position, size, minSize }) {
  const resizeWindow = useWindowStore((s) => s.resizeWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const startRef = useRef(null)

  const cursorMap = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
    sw: 'nesw-resize',
  }

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
      startRef.current = { x: e.clientX, y: e.clientY, ...position, ...size }
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
    },
    [position, size],
  )

  const handlePointerMove = useCallback(
    (e) => {
      if (!startRef.current) return
      const s = startRef.current
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y

      let newX = position.x,
        newY = position.y,
        newW = s.width,
        newH = s.height

      if (direction.includes('e')) newW = Math.max(minSize.width, s.width + dx)
      if (direction.includes('w')) {
        newW = Math.max(minSize.width, s.width - dx)
        newX = s.x + s.width - newW
      }
      if (direction.includes('s')) newH = Math.max(minSize.height, s.height + dy)
      if (direction.includes('n')) {
        newH = Math.max(minSize.height, s.height - dy)
        newY = s.y + s.height - newH
      }

      resizeWindow(windowId, { width: newW, height: newH })
      if (direction.includes('w') || direction.includes('n')) {
        moveWindow(windowId, { x: newX, y: newY })
      }
    },
    [direction, windowId, position, minSize, resizeWindow, moveWindow],
  )

  const handlePointerUp = useCallback(() => {
    startRef.current = null
  }, [])

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        cursor: cursorMap[direction],
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
  desktopRef,
  onSnapHint,
  children,
}) {
  const dragControls = useDragControls()
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
  const AppIcon = APP_REGISTRY[appId]?.icon

  const handleDrag = useCallback(
    (_e, info) => {
      const cursorX = position.x + info.offset.x
      const cursorY = position.y + info.offset.y
      const SNAP_THRESHOLD = 20

      if (cursorX <= SNAP_THRESHOLD) {
        onSnapHint?.('left')
      } else if (cursorX + size.width >= window.innerWidth - SNAP_THRESHOLD) {
        onSnapHint?.('right')
      } else if (cursorY <= SNAP_THRESHOLD) {
        onSnapHint?.('top')
      } else {
        onSnapHint?.(null)
      }
    },
    [position, size, onSnapHint],
  )

  const handleDragEnd = useCallback(
    (_e, info) => {
      const newX = position.x + info.offset.x
      const newY = position.y + info.offset.y
      const SNAP_THRESHOLD = 20

      if (newX <= SNAP_THRESHOLD) {
        snapWindow(windowId, 'left')
      } else if (newX + size.width >= window.innerWidth - SNAP_THRESHOLD) {
        snapWindow(windowId, 'right')
      } else if (newY <= SNAP_THRESHOLD) {
        maximizeWindow(windowId)
      } else {
        moveWindow(windowId, { x: newX, y: newY })
      }
      onSnapHint?.(null)
    },
    [windowId, position, size, moveWindow, snapWindow, maximizeWindow, onSnapHint],
  )

  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      restoreWindow(windowId)
    } else {
      maximizeWindow(windowId)
    }
  }, [windowId, isMaximized, restoreWindow, maximizeWindow])

  // Mobile: full-screen mode
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col bg-background"
        data-testid="mobile-window"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: TASKBAR_HEIGHT + 8,
        }}
      >
        <div className="glass-panel flex h-11 items-center justify-between border-b border-cyan-500/10 px-3">
          <div className="flex items-center gap-2">
            {AppIcon && <AppIcon size={14} className="text-primary" />}
            <span className="heading-ui text-[12px] font-semibold text-white/80 truncate">
              {title}
            </span>
          </div>
          <button
            type="button"
            onClick={() => closeWindow(windowId)}
            aria-label="Close window"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ containerType: 'inline-size' }}>
          {children}
        </div>
      </div>
    )
  }

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
      ? {
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          zIndex,
        }
      : {
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          zIndex,
        }

  return (
    <Motion.div
      style={displayStyle}
      drag={!isLocked}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragConstraints={desktopRef}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onPointerDownCapture={() => focusWindow(windowId)}
      onContextMenu={(e) => e.stopPropagation()}
      className="flex flex-col"
    >
      {/* Window border glow — rounded-lg lives here, not on the outer Motion.div,
         so the absolute-positioned resize handles aren't clipped by the corner
         radius. */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-lg border transition-all duration-200 ${
          isFocused
            ? 'border-cyan-500/20 shadow-[0_0_20px_rgba(0,255,255,0.1)]'
            : 'border-white/[0.06]'
        }`}
        style={{ zIndex: 20 }}
      />

      {/* Title bar */}
      <div
        data-testid="titlebar"
        onPointerDown={(e) => {
          // Don't start a drag when the pointer lands on the window controls
          // (min/max/close) — framer's dragControls.start(e) captures the
          // pointer and suppresses the button's click, so users had to click
          // several times to actually close a window.
          if (e.target.closest('button')) return
          if (isSnapped) {
            restoreWindow(windowId)
            return
          }
          if (!isMaximized) dragControls.start(e)
        }}
        onDoubleClick={(e) => {
          if (e.target.closest('button')) return
          toggleMaximize()
        }}
        className={`glass-panel flex h-9 shrink-0 cursor-grab items-center justify-between border-b rounded-t-lg px-3 select-none active:cursor-grabbing ${
          isFocused ? 'border-b-cyan-500/15' : 'border-b-white/[0.04] bg-white/[0.01]'
        }`}
        style={{
          borderImage: isFocused
            ? 'linear-gradient(to right, rgba(0,255,255,0.3), transparent 40%, transparent 60%, rgba(243,230,0,0.2)) 1'
            : undefined,
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {AppIcon && <AppIcon size={12} className="shrink-0 text-primary" />}
          <span
            className={`heading-ui truncate text-[11px] font-semibold ${isFocused ? 'text-white/80' : 'text-white/50'}`}
          >
            {title}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => minimizeWindow(windowId)}
            aria-label="Minimize window"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-cyan-500/15 hover:text-cyan-400"
          >
            <Minus size={10} />
          </button>
          <button
            type="button"
            onClick={toggleMaximize}
            aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-cyan-500/15 hover:text-cyan-400"
          >
            <Square size={10} />
          </button>
          <button
            type="button"
            onClick={() => closeWindow(windowId)}
            aria-label="Close window"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-400"
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* Content area — rounded-b-lg so the bottom corners stay clipped even
         though the outer container no longer has overflow:hidden. */}
      <div
        className="flex-1 overflow-hidden rounded-b-lg bg-background"
        style={{ containerType: 'inline-size' }}
      >
        {children}
      </div>

      {/* Resize handles */}
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
