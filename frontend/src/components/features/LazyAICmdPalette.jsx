import { Suspense, lazy, useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

const loadAICmdPalette = () => import('./AICmdPalette')
const AICmdPalette = lazy(loadAICmdPalette)

function LoadingDialog() {
  return (
    <div className="fixed left-1/2 top-1/2 z-[100] flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/95 p-8 shadow-2xl backdrop-blur-xl">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}

export default function LazyAICmdPalette() {
  const [open, setOpen] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)

  const openPalette = () => {
    setShouldLoad(true)
    setOpen(true)
  }

  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        openPalette()
      }
    }

    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  return (
    <>
      <button
        type="button"
        className="fixed bottom-6 right-6 z-50 flex cursor-pointer items-center gap-2 rounded-full border border-primary bg-primary/20 px-4 py-2 font-mono text-xs text-primary shadow-[0_0_15px_var(--color-primary)] backdrop-blur-xl transition-all hover:bg-primary/40 hover:animate-pulse"
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
        <Sparkles size={16} />
        Activate AI_CMD <span>[ Cmd + K ]</span>
      </button>

      {shouldLoad ? (
        <Suspense fallback={<LoadingDialog />}>
          <AICmdPalette open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  )
}
