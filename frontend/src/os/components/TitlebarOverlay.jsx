import { useState, useEffect } from 'react'
import { Z } from '../../lib/zLayers'

/**
 * Window Controls Overlay (WCO) titlebar strip.
 *
 * When the PWA is installed and the user enables "Window Controls Overlay", the
 * browser hands the title-bar row back to the page and exposes its geometry via
 * the `titlebar-area-*` CSS env() vars. We paint a thin draggable cyberpunk bar
 * into that region so the window still feels like part of the OS (and stays
 * movable — the strip is `app-region: drag`).
 *
 * Outside WCO mode this renders nothing, so the normal in-app chrome on the web
 * and in plain standalone mode is completely untouched.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API
 */
export default function TitlebarOverlay() {
  const [visible, setVisible] = useState(
    () => typeof navigator !== 'undefined' && navigator.windowControlsOverlay?.visible === true,
  )

  useEffect(() => {
    const wco = navigator.windowControlsOverlay
    if (!wco) return
    const onChange = () => setVisible(wco.visible)
    wco.addEventListener('geometrychange', onChange)
    return () => wco.removeEventListener('geometrychange', onChange)
  }, [])

  if (!visible) return null

  return (
    <div className="titlebar-overlay" style={{ zIndex: Z.titlebarOverlay }} aria-hidden="true">
      <span className="titlebar-overlay__brand">◢ NEXUS&nbsp;OS</span>
    </div>
  )
}
