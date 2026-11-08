import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { useWindowStore } from '../stores/windowStore'
import { TASKBAR_HEIGHT } from '../stores/taskbarHeight'
import AppIcon from './AppIcon'
import SystemMenu from './SystemMenu'

const TITLEBAR_HEIGHT = 30 // keep in sync with --w7-titlebar-h in index.css
const RESIZE_EDGE_SIZE = 6
const RESIZE_CORNER_SIZE = 14
// Aero Snap and top-edge maximise fire when the POINTER reaches the screen edge.
const SNAP_EDGE_PX = 2
// Pointer travel before a maximised or snapped window is restored and dragged.
const RESTORE_DRAG_PX = 4
// Keyboard move/size: arrow keys step 10px, Ctrl+arrow nudges 1px.
const KEY_STEP = 10
const KEY_NUDGE = 1
// Same rule as windowStore's clampPosition: keep this much width on screen.
const MIN_ACCESSIBLE_PX = 80

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

// Which screen edge, if any, the pointer is touching.
function snapZoneAt(x, y) {
  if (x <= SNAP_EDGE_PX) return 'left'
  if (x >= window.innerWidth - 1 - SNAP_EDGE_PX) return 'right'
  if (y <= SNAP_EDGE_PX) return 'top'
  return null
}

// Keeps a keyboard move/size preview inside the same bounds the store enforces.
function clampKeyRect(rect, kind, minSize, taskbarH) {
  if (kind === 'size') {
    // Same work-area rule as windowStore.updateWindowRect: the right and bottom
    // edges stop at the screen edge and the taskbar.
    return {
      ...rect,
      width: Math.max(minSize.width, Math.min(rect.width, window.innerWidth - Math.max(0, rect.x))),
      height: Math.max(
        minSize.height,
        Math.min(rect.height, window.innerHeight - taskbarH - rect.y),
      ),
    }
  }
  return {
    ...rect,
    x: Math.max(
      -(rect.width - MIN_ACCESSIBLE_PX),
      Math.min(rect.x, window.innerWidth - MIN_ACCESSIBLE_PX),
    ),
    y: Math.max(0, Math.min(rect.y, window.innerHeight - taskbarH - TITLEBAR_HEIGHT)),
  }
}

function ResizeHandle({ direction, windowId, position, size, minSize }) {
  const updateWindowRect = useWindowStore((s) => s.updateWindowRect)
  const isResizingRef = useRef(false)
  const startRef = useRef(null)
  // Ends the active resize (listeners, cursor). Called on pointerup, pointercancel
  // and unmount, so an interrupted gesture never leaves listeners or the cursor behind.
  const stopResizeRef = useRef(null)

  useEffect(
    () => () => {
      stopResizeRef.current?.()
    },
    [],
  )

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
          // The top edge stops at the top of the screen; the bottom edge stays
          // put instead of the window growing downwards.
          newH = Math.max(minSize.height, Math.min(s.h - dy, s.y + s.h))
          newY = s.y + s.h - newH
        }
        updateWindowRect(windowId, {
          position: { x: newX, y: newY },
          size: { width: newW, height: newH },
        })
      }

      const stop = () => {
        isResizingRef.current = false
        startRef.current = null
        stopResizeRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
      }
      stopResizeRef.current = stop

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
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
  restoredRect,
  zIndex,
  onSnapHint,
  children,
}) {
  const isFocused = useWindowStore((s) => s.activeWindowId === windowId)
  const zStack = useWindowStore((s) => s.zStack)
  const isMobile = useWindowStore((s) => s.isMobile)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const updateWindowRect = useWindowStore((s) => s.updateWindowRect)
  const snapWindow = useWindowStore((s) => s.snapWindow)
  // Live taskbar height (48px touch, 40px fine pointer).
  const taskbarHeight = useWindowStore((s) => s.taskbarHeight) ?? TASKBAR_HEIGHT

  const isMaximized = windowState === 'maximized'
  const isSnapped = windowState === 'snapped-left' || windowState === 'snapped-right'
  const isSnappedLeft = windowState === 'snapped-left'
  const isLocked = isMaximized || isSnapped

  const frameRef = useRef(null)
  const menuAnchorRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // ── Keyboard move / size ──────────────────────────────────
  // keyMode is 'move' | 'size' | null. While it is set, keyRect is the live
  // preview; Enter commits it to the store and Escape discards it.
  const [keyMode, setKeyMode] = useState(null)
  const [keyRect, setKeyRect] = useState(null)
  const keyRectRef = useRef(null)

  // ── Pointer-event drag ────────────────────────────────────
  // dragDelta null = not dragging; {x,y} = current offset from drag start.
  // Storing delta (not absolute pos) means the display can be computed as
  // position + delta, and on release both values batch-update atomically in
  // the same React flush — no 1-frame positional flash.
  const [dragDelta, setDragDelta] = useState(null)
  const dragStartRef = useRef(null)
  const rafRef = useRef(null)
  const latestPointerRef = useRef(null)
  // Ends an in-progress title-bar drag (listeners, pending frame, cursor).
  // Run on unmount, so a window closed mid-drag leaves nothing behind.
  const dragCleanupRef = useRef(null)
  useEffect(
    () => () => {
      dragCleanupRef.current?.()
    },
    [],
  )

  const toggleMaximize = useCallback(() => {
    if (isMaximized) restoreWindow(windowId)
    else maximizeWindow(windowId)
  }, [windowId, isMaximized, restoreWindow, maximizeWindow])

  // Win7 moves keyboard focus into a window when it opens, is focused or is
  // cycled to, so its own controls (and the app's autofocus) receive keystrokes.
  // zStack gets a new array on every focus, so re-activating the window that is
  // already active (a singleton relaunched from the Start menu) still focuses it.
  useEffect(() => {
    if (!isFocused) return
    const frame = frameRef.current
    if (!frame || frame.contains(document.activeElement)) return
    frame.focus({ preventScroll: true })
  }, [isFocused, zStack])

  // Keyboard move/size belongs to the focused window only. When focus leaves
  // the window (for example a click on another window), the mode ends without
  // moving anything.
  const handleFrameBlur = useCallback((e) => {
    if (!keyRectRef.current || e.currentTarget.contains(e.relatedTarget)) return
    keyRectRef.current = null
    setKeyRect(null)
    setKeyMode(null)
  }, [])

  const closeMenu = useCallback(({ restoreFocus } = {}) => {
    setMenuOpen(false)
    if (restoreFocus) menuAnchorRef.current?.focus()
  }, [])

  // Alt+Space opens the system menu of the focused window, or closes it.
  useEffect(() => {
    if (!isFocused || isMobile) return
    const handleKeyDown = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.code !== 'Space' && e.key !== ' ') return
      // Never hijack keys while the user is typing.
      const active = document.activeElement
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      if (menuOpen) closeMenu({ restoreFocus: true })
      else setMenuOpen(true)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFocused, isMobile, menuOpen, closeMenu])

  const startKeyMode = useCallback(
    (kind) => {
      if (isLocked) return
      const rect = { x: position.x, y: position.y, width: size.width, height: size.height }
      keyRectRef.current = rect
      setKeyRect(rect)
      setKeyMode(kind)
    },
    [isLocked, position, size],
  )

  useEffect(() => {
    if (!keyMode) return

    const finish = (commit) => {
      const rect = keyRectRef.current
      keyRectRef.current = null
      setKeyRect(null)
      setKeyMode(null)
      if (!commit || !rect) return
      if (keyMode === 'move') {
        moveWindow(windowId, { x: rect.x, y: rect.y })
      } else {
        updateWindowRect(windowId, {
          position: { x: rect.x, y: rect.y },
          size: { width: rect.width, height: rect.height },
        })
      }
    }

    // Capture phase, so the arrows, Enter and Escape reach the window and not
    // the app content underneath while the mode is active.
    const handleKeyDown = (e) => {
      const rect = keyRectRef.current
      if (!rect) return
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        finish(true)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finish(false)
        return
      }
      const step = e.ctrlKey ? KEY_NUDGE : KEY_STEP
      const isMove = keyMode === 'move'
      let next = null
      switch (e.key) {
        case 'ArrowLeft':
          next = isMove ? { ...rect, x: rect.x - step } : { ...rect, width: rect.width - step }
          break
        case 'ArrowRight':
          next = isMove ? { ...rect, x: rect.x + step } : { ...rect, width: rect.width + step }
          break
        case 'ArrowUp':
          next = isMove ? { ...rect, y: rect.y - step } : { ...rect, height: rect.height - step }
          break
        case 'ArrowDown':
          next = isMove ? { ...rect, y: rect.y + step } : { ...rect, height: rect.height + step }
          break
        default:
          return
      }
      e.preventDefault()
      e.stopPropagation()
      const clamped = clampKeyRect(next, keyMode, minSize, taskbarHeight)
      keyRectRef.current = clamped
      setKeyRect(clamped)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [keyMode, windowId, minSize, moveWindow, updateWindowRect, taskbarHeight])

  const handleTitleBarPointerDown = useCallback(
    (e) => {
      if (e.target.closest('button')) return
      if (e.button !== 0) return
      e.preventDefault()

      // A maximised or snapped window is restored only once the pointer has
      // moved, so a plain click, or a double-click that toggles maximise, leaves
      // it alone. The restored window lands with the pointer at the same
      // proportional x along the title bar, and the drag carries on from there.
      const startX = e.clientX
      const startY = e.clientY
      const frameRect = frameRef.current?.getBoundingClientRect()
      const grabRatio =
        frameRect && frameRect.width > 0 ? (e.clientX - frameRect.left) / frameRect.width : 0.5
      const restored = restoredRect ?? {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      }
      let started = !isLocked

      const beginDrag = (origin) => {
        dragStartRef.current = origin
        setDragDelta({ x: 0, y: 0 })
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
        started = true
      }

      if (!isLocked) {
        beginDrag({ mouseX: startX, mouseY: startY, winX: position.x, winY: position.y })
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
        window.removeEventListener('pointercancel', onUp)
        document.removeEventListener('keydown', onKeyDown)
        dragCleanupRef.current = null
      }
      dragCleanupRef.current = cleanup

      const onMove = (moveEvent) => {
        if (!started) {
          const dx = moveEvent.clientX - startX
          const dy = moveEvent.clientY - startY
          if (Math.hypot(dx, dy) < RESTORE_DRAG_PX) return
          // Restore under the pointer, then carry on dragging from there.
          const nextX = moveEvent.clientX - grabRatio * restored.width
          const nextY = Math.max(0, moveEvent.clientY - TITLEBAR_HEIGHT / 2)
          restoreWindow(windowId)
          moveWindow(windowId, { x: nextX, y: nextY })
          beginDrag({
            mouseX: moveEvent.clientX,
            mouseY: moveEvent.clientY,
            winX: nextX,
            winY: nextY,
          })
        }
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
          onSnapHint?.(snapZoneAt(ptr.clientX, ptr.clientY))
        })
      }

      // Shared by pointerup and pointercancel. A cancel (the browser took the
      // pointer, for example for a touch gesture) has no reliable coordinates, so it
      // ends the drag at the last pointer position seen.
      const onUp = (upEvent) => {
        // A click on a maximised or snapped window never started a drag.
        if (!started || !dragStartRef.current) {
          cleanup()
          return
        }
        const point =
          upEvent.type === 'pointercancel' && latestPointerRef.current
            ? latestPointerRef.current
            : upEvent
        const dx = point.clientX - dragStartRef.current.mouseX
        const dy = point.clientY - dragStartRef.current.mouseY
        const finalX = dragStartRef.current.winX + dx
        const finalY = dragStartRef.current.winY + dy
        const zone = snapZoneAt(point.clientX, point.clientY)

        // Batch: reset delta + commit position → single React flush, no flash.
        setDragDelta(null)
        if (zone === 'left') snapWindow(windowId, 'left')
        else if (zone === 'right') snapWindow(windowId, 'right')
        else if (zone === 'top') maximizeWindow(windowId)
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
      window.addEventListener('pointercancel', onUp)
      document.addEventListener('keydown', onKeyDown)
    },
    [
      windowId,
      position,
      size,
      restoredRect,
      isLocked,
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
        ref={frameRef}
        tabIndex={-1}
        className="window glass nx-window active is-maximized fixed inset-x-0 top-0 z-[100]"
        data-testid="mobile-window"
        role="region"
        aria-roledescription="window"
        aria-label={title}
        style={{
          bottom: 'calc(var(--w7-taskbar-h) + env(safe-area-inset-bottom, 0px))',
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
              style={{ minHeight: 44, minWidth: 56 }}
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
  // While a title-bar drag is in progress the frame keeps its store left/top and
  // only the CSS `translate` offset changes. Moving with `translate` (compositor
  // only) avoids a layout of the frame and its backdrop-blurred glass on every
  // pointer frame. `translate` is an individual transform property, so framer's
  // entrance `transform` (scale) on this element is left alone. On release the
  // offset returns to 0 while left/top jump to the store value, and the transition
  // below animates both, so the frame lands and snaps from the drop point.
  const dragOffset = dragDelta !== null ? `${dragDelta.x}px ${dragDelta.y}px 0px` : undefined

  const displayStyle = keyRect
    ? {
        position: 'absolute',
        left: keyRect.x,
        top: keyRect.y,
        width: keyRect.width,
        height: keyRect.height,
        zIndex,
      }
    : isSnapped
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
            left: position.x,
            top: position.y,
            width: size.width,
            height: size.height,
            zIndex,
          }

  // CSS transition for position/size — disabled during active drag and keyboard
  // move/size so movement stays instant. When the store commits (or clamping
  // adjusts the position), the transition produces a short ease into the final rect.
  // Snap/maximize/restore changes animate automatically because dragDelta is
  // null for those (they're triggered by buttons or keyboard, not pointer drag).
  // `translate` is included so the drop offset eases back into place with the rect.
  const positionTransition =
    dragDelta !== null || keyRect !== null
      ? undefined
      : 'left 240ms cubic-bezier(0.16,1,0.3,1), top 240ms cubic-bezier(0.16,1,0.3,1), width 240ms cubic-bezier(0.16,1,0.3,1), height 240ms cubic-bezier(0.16,1,0.3,1), translate 240ms cubic-bezier(0.16,1,0.3,1)'

  // Win7 system menu entries. Move and Size are unavailable while the window is
  // maximised or snapped, as on Windows 7.
  const systemMenuItems = [
    { id: 'restore', label: 'Restore', disabled: !isLocked, action: () => restoreWindow(windowId) },
    { id: 'move', label: 'Move', disabled: isLocked, action: () => startKeyMode('move') },
    { id: 'size', label: 'Size', disabled: isLocked, action: () => startKeyMode('size') },
    { id: 'minimize', label: 'Minimize', action: () => minimizeWindow(windowId) },
    {
      id: 'maximize',
      label: 'Maximize',
      disabled: isMaximized,
      divider: true,
      action: () => maximizeWindow(windowId),
    },
    {
      id: 'close',
      label: 'Close',
      shortcut: 'Alt+F4',
      action: () => closeWindow(windowId),
    },
  ]

  const handleSystemMenuSelect = (item) => {
    setMenuOpen(false)
    item.action()
    // Keep keyboard focus in the window (Move/Size and Restore keep working).
    frameRef.current?.focus({ preventScroll: true })
  }

  const keyModeHint =
    keyMode === 'move'
      ? 'Move mode. Use the arrow keys to move the window, Enter to place it or Escape to cancel.'
      : keyMode === 'size'
        ? 'Size mode. Use the arrow keys to resize the window, Enter to confirm or Escape to cancel.'
        : ''

  return (
    <Motion.div
      ref={frameRef}
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      style={{
        ...displayStyle,
        translate: dragOffset,
        willChange: dragOffset ? 'translate' : undefined,
        transition: positionTransition,
      }}
      onPointerDownCapture={() => focusWindow(windowId)}
      onBlur={handleFrameBlur}
      onContextMenu={(e) => e.stopPropagation()}
      role="region"
      aria-roledescription="window"
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
          {/* Title icon opens the window system menu (click or Alt+Space); double-click closes. */}
          <button
            ref={menuAnchorRef}
            type="button"
            aria-label="Window menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Window menu"
            onClick={() => setMenuOpen((open) => !open)}
            onDoubleClick={() => closeWindow(windowId)}
            className="flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded-[2px] p-0"
          >
            <AppIcon appId={appId} size={16} />
          </button>
          <span>{title}</span>
        </div>
        <div className="title-bar-controls">
          <button
            type="button"
            className="is-minimize"
            onClick={() => minimizeWindow(windowId)}
            aria-label="Minimize window"
            title="Minimize"
            style={{ minHeight: 24 }}
          />
          <button
            type="button"
            className={isMaximized ? 'is-restore' : 'is-maximize'}
            onClick={toggleMaximize}
            aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            title={isMaximized ? 'Restore Down' : 'Maximize'}
            style={{ minHeight: 24 }}
          />
          <button
            type="button"
            className="is-close"
            onClick={() => closeWindow(windowId)}
            aria-label="Close window"
            title="Close"
            style={{ minHeight: 24 }}
          />
        </div>
      </div>

      {menuOpen && (
        <SystemMenu
          items={systemMenuItems}
          onSelect={handleSystemMenuSelect}
          onClose={closeMenu}
          anchorRef={menuAnchorRef}
          style={{ position: 'absolute', left: 4, top: TITLEBAR_HEIGHT + 2, zIndex: 20 }}
        />
      )}

      {keyMode && (
        <div role="status" className="sr-only">
          {keyModeHint}
        </div>
      )}

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
