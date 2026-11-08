import { Suspense, lazy, useEffect, useState } from 'react'
import { Zap } from 'lucide-react'

const loadAICmdPalette = () => import('./AICmdPalette')
const AICmdPalette = lazy(loadAICmdPalette)

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

export default function LazyAICmdPalette({ mediaType = 'book', onAdd }) {
  const [open, setOpen] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)

  const openPalette = () => {
    setShouldLoad(true)
    setOpen(true)
  }

  useEffect(() => {
    const handleShortcut = (event) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        openPalette()
      }
    }
    const handleExternalOpen = () => openPalette()

    document.addEventListener('keydown', handleShortcut)
    window.addEventListener('nexus:open-ai-cmd', handleExternalOpen)
    return () => {
      document.removeEventListener('keydown', handleShortcut)
      window.removeEventListener('nexus:open-ai-cmd', handleExternalOpen)
    }
  }, [])

  return (
    <>
      <button
        type="button"
        aria-label="Ask AI (open command palette)"
        className="w7-btn fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 gap-1.5 px-3 sm:bottom-[4.5rem] sm:right-6 sm:z-50"
        onMouseEnter={() => {
          setShouldLoad(true)
          void loadAICmdPalette()
        }}
        onFocus={() => {
          setShouldLoad(true)
          void loadAICmdPalette()
        }}
        onClick={openPalette}
      >
        <Zap size={14} className="text-[#3d5a80]" aria-hidden="true" />
        <span className="hidden sm:inline">Ask AI</span>
        <kbd className="text-[11px] text-muted-foreground">
          {typeof navigator !== 'undefined' &&
          /Mac/i.test(navigator.userAgentData?.platform ?? navigator.platform)
            ? '⌘K'
            : 'Ctrl+K'}
        </kbd>
      </button>

      {shouldLoad ? (
        <Suspense fallback={<LoadingDialog />}>
          <AICmdPalette open={open} onOpenChange={setOpen} mediaType={mediaType} onAdd={onAdd} />
        </Suspense>
      ) : null}
    </>
  )
}
