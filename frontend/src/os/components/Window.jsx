import { memo, useCallback, useRef } from 'react'
import { motion as Motion, useDragControls } from 'framer-motion'
import { Minus, Square, X } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY } from '../stores/appRegistry'

const TITLEBAR_HEIGHT = 36
const TASKBAR_HEIGHT = 48
const RESIZE_HANDLE_SIZE = 8

function ResizeHandle({ direction, windowId, position, size, minSize }) {
  const resizeWindow = useWindowStore((s) => s.resizeWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const startRef = useRef(null)

  const cursorMap = {
    n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize',
  }

  const positionStyles = {
    n: { top: 0, left: RESIZE_HANDLE_SIZE, right: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    s: { bottom: 0, left: RESIZE_HANDLE_SIZE, right: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    e: { right: 0, top: RESIZE_HANDLE_SIZE, bottom: RESIZE_HANDLE_SIZE, width: RESIZE_HANDLE_SIZE },
    w: { left: 0, top: RESIZE_HANDLE_SIZE, bottom: RESIZE_HANDLE_SIZE, width: RESIZE_HANDLE_SIZE },
    ne: { top: 0, right: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    nw: { top: 0, left: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    se: { bottom: 0, right: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    sw: { bottom: 0, left: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
  }

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    startRef.current = { x: e.clientX, y: e.clientY, ...position, ...size }
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
  }, [position, size])

  const handlePointerMove = useCallback((e) => {
    if (!startRef.current) return
    const s = startRef.current
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y

    let newX = position.x, newY = position.y, newW = s.width, newH = s.height

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
  }, [direction, windowId, position, minSize, resizeWindow, moveWindow])

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

  const isMaximized = windowState === 'maximized'
  const AppIcon = APP_REGISTRY[appId]?.icon

  const handleDragEnd = useCallback((_e, info) => {
    moveWindow(windowId, {
      x: position.x + info.offset.x,
      y: position.y + info.offset.y,
    })
  }, [windowId, position, moveWindow])

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
        className="fixed inset-0 z-[100] flex flex-col bg-[#0a0a0a]"
        style={{ paddingBottom: TASKBAR_HEIGHT + 8 }}
      >
        <div className="glass-panel flex h-9 items-center justify-between border-b border-cyan-500/10 px-3">
          <div className="flex items-center gap-2">
            {AppIcon && <AppIcon size={12} className="text-primary" />}
            <span className="heading-ui text-[10px] font-semibold text-white/80 truncate">
              {title}
            </span>
          </div>
          <button
            type="button"
            onClick={() => closeWindow(windowId)}
            aria-label="Close window"
            className="rounded-md p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ containerType: 'inline-size' }}>
          {children}
        </div>
      </div>
    )
  }

  const displayPos = isMaximized ? { x: 0, y: 0 } : position
  const displaySize = isMaximized
    ? { width: window.innerWidth, height: window.innerHeight - TASKBAR_HEIGHT }
    : size

  return (
    <Motion.div
      style={{
        position: 'absolute',
        left: displayPos.x,
        top: displayPos.y,
        width: displaySize.width,
        height: displaySize.height,
        zIndex,
      }}
      drag={!isMaximized}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragConstraints={desktopRef}
      onDragEnd={handleDragEnd}
      onPointerDownCapture={() => focusWindow(windowId)}
      className="flex flex-col rounded-lg overflow-hidden"
    >
      {/* Window border glow */}
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
        onPointerDown={(e) => { if (!isMaximized) dragControls.start(e) }}
        onDoubleClick={toggleMaximize}
        className={`glass-panel flex h-9 shrink-0 cursor-grab items-center justify-between border-b px-3 select-none active:cursor-grabbing ${
          isFocused
            ? 'border-b-cyan-500/15'
            : 'border-b-white/[0.04] opacity-60'
        }`}
        style={{
          borderImage: isFocused
            ? 'linear-gradient(to right, rgba(0,255,255,0.3), transparent 40%, transparent 60%, rgba(243,230,0,0.2)) 1'
            : undefined,
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {AppIcon && <AppIcon size={12} className="shrink-0 text-primary" />}
          <span className="heading-ui truncate text-[10px] font-semibold text-white/80">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => minimizeWindow(windowId)}
            aria-label="Minimize window"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-cyan-500/15 hover:text-cyan-400"
          >
            <Minus size={10} />
          </button>
          <button
            type="button"
            onClick={toggleMaximize}
            aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-cyan-500/15 hover:text-cyan-400"
          >
            <Square size={10} />
          </button>
          <button
            type="button"
            onClick={() => closeWindow(windowId)}
            aria-label="Close window"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-400"
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        className="flex-1 overflow-hidden bg-[#0a0a0a]"
        style={{ containerType: 'inline-size' }}
      >
        {children}
      </div>

      {/* Resize handles */}
      {!isMaximized && RESIZE_DIRECTIONS.map((dir) => (
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
