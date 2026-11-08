import { Suspense, lazy, useEffect, useState } from 'react'
import { Zap } from 'lucide-react'

const loadAICmdPalette = () => import('./AICmdPalette')
const AICmdPalette = lazy(loadAICmdPalette)

// Ctrl+K belongs to the OS command palette everywhere. Ask AI takes Alt+A.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac/i.test(navigator.userAgentData?.platform ?? navigator.platform)
const SHORTCUT_LABEL = IS_MAC ? '⌥A' : 'Alt+A'

function LoadingDialog() {
  return (
    <>
      <div className="fixed inset-0 z-[1000] bg-black/20" aria-hidden="true" />
      <div
        role="status"
        className="window active fixed left-1/2 top-1/2 z-[1001] w-full max-w-[320px] -translate-x-1/2 -translate-y-1/2"
      >
        <div className="title-bar">
          <div className="title-bar-text">Ask AI</div>
        </div>
        <div className="window-body has-space flex flex-col gap-2">
          <div role="progressbar" aria-label="Loading Ask AI" className="marquee" />
          <p className="text-[12px] text-foreground">Loading…</p>
        </div>
      </div>
    </>
  )
}

// placement="floating" pins the entry point to the viewport corner (the default).
// placement="inline" renders it in normal flow, for a host's command bar.
export default function LazyAICmdPalette({ mediaType = 'book', onAdd, placement = 'floating' }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleShortcut = (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.code !== 'KeyA') return
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      // One palette at a time: the OS command palette is already open.
      if (document.querySelector('[data-testid="command-palette"]')) return
      event.preventDefault()
      setOpen(true)
    }
    const handleExternalOpen = () => setOpen(true)

    document.addEventListener('keydown', handleShortcut)
    window.addEventListener('nexus:open-ai-cmd', handleExternalOpen)
    return () => {
      document.removeEventListener('keydown', handleShortcut)
      window.removeEventListener('nexus:open-ai-cmd', handleExternalOpen)
    }
  }, [])

  // Hover and focus only warm the chunk. Mounting waits for an actual open,
  // so a cold click never races a half-mounted palette.
  const prefetch = () => {
    void loadAICmdPalette()
  }

  return (
    <>
      <button
        type="button"
        aria-label="Ask AI (open command palette)"
        aria-keyshortcuts="Alt+A"
        title={`Ask AI (${SHORTCUT_LABEL})`}
        className={`w7-toolbtn w7-card min-h-[44px] min-w-[44px] gap-1.5 px-2 sm:pointer-fine:min-h-[28px] sm:pointer-fine:min-w-0 ${
          placement === 'floating'
            ? 'fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 sm:bottom-[4.5rem] sm:right-6 sm:z-50'
            : ''
        }`}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        onClick={() => setOpen(true)}
      >
        <Zap size={14} className="text-[#3d5a80]" aria-hidden="true" />
        <span>Ask AI</span>
        <kbd className="hidden text-[11px] text-muted-foreground sm:inline">{SHORTCUT_LABEL}</kbd>
      </button>

      {open ? (
        <Suspense fallback={<LoadingDialog />}>
          <AICmdPalette open={open} onOpenChange={setOpen} mediaType={mediaType} onAdd={onAdd} />
        </Suspense>
      ) : null}
    </>
  )
}
