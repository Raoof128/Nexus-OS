import { Suspense, lazy, useEffect, useState } from 'react'
import { Loader2, Zap } from 'lucide-react'

const loadAICmdPalette = () => import('./AICmdPalette')
const AICmdPalette = lazy(loadAICmdPalette)

function LoadingDialog() {
  return (
    <>
      <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-md" aria-hidden="true" />
      <div className="neon-border fixed left-1/2 top-1/2 z-[1001] flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl glass-panel p-10 shadow-[0_0_60px_hsl(var(--neon-yellow)/0.08)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="heading-display text-[10px] tracking-[0.3em] text-primary/50">Loading Module</span>
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
        className="fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-black/70 backdrop-blur-md px-3 py-2 heading-ui text-[10px] font-semibold text-muted-foreground transition-all hover:border-primary/30 hover:text-primary hover:shadow-[0_0_15px_hsl(var(--neon-yellow)/0.2)] sm:bottom-[4.5rem] sm:right-6 sm:z-50 sm:px-3.5 sm:text-xs"
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
        <Zap size={14} className="text-primary" />
        <span className="hidden sm:inline">AI_CMD</span>
        <kbd className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-muted-foreground">
          {typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl+K'}
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
