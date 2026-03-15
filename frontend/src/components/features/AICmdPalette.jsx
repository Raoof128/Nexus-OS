import { useState } from 'react'
import { Command } from 'cmdk'
import { Sparkles, Terminal } from 'lucide-react'
import { useSuggest } from '../../hooks/useSuggest'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'

export default function AICmdPalette({ open, onOpenChange, mediaType = 'book' }) {
  const [result, setResult] = useState(null)
  const config = MEDIA_CONFIG[mediaType]
  const { suggestBook, suggestError, suggesting } = useSuggest(mediaType)

  const handleSuggest = async () => {
    const response = await suggestBook()
    if (response) {
      setResult(response)
    }
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => { if (!v) setResult(null); onOpenChange(v) }}
      label="Global AI Command Menu"
      className="fixed left-1/2 top-1/2 z-[100] w-full max-w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/90 p-4 font-mono shadow-2xl backdrop-blur-xl"
      overlayClassName="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm"
    >
      <span className="sr-only" role="heading" aria-level="2">AI Command Menu</span>
      <p className="sr-only">Search commands or request AI-powered media suggestions.</p>

      <div className="mb-4 flex border-b border-white/10 pb-4">
        <Terminal className="mr-3 text-primary" />
        <Command.Input
          autoFocus
          placeholder="Type a command or search..."
          className="w-full bg-transparent font-mono text-white outline-none placeholder-muted-foreground"
        />
      </div>

      <Command.List className="h-full max-h-[400px] overflow-y-auto custom-scrollbar">
        <Command.Empty className="py-6 text-center font-mono text-sm text-neutral-500">
          No commands found.
        </Command.Empty>

        <Command.Group
          heading="Gemini AI Operations"
          className="mb-2 font-mono text-xs text-neutral-400"
        >
          <Command.Item
            onSelect={handleSuggest}
            className="my-1 flex cursor-pointer items-center gap-3 rounded-md px-4 py-3 text-sm text-white transition-all hover:bg-white/5 hover:text-primary aria-selected:bg-white/10 aria-selected:text-primary"
          >
            Run Intelligence Matrix // Suggest {config?.singular || 'Media'}
          </Command.Item>
        </Command.Group>

        {suggesting && (
          <div className="animate-pulse p-4 text-center text-xs uppercase tracking-wider text-primary">
            Processing via Neural Link...
          </div>
        )}

        {suggestError && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 font-mono text-sm text-red-500">
            ERR_CRITICAL: {suggestError}
          </div>
        )}

        {result && result.suggestions && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/70">
                Recommendations
              </p>
              <span className="rounded-full border border-white/10 px-3 py-0.5 text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                {result.source === 'local' ? 'Local Fallback' : 'Gemini Live'}
              </span>
            </div>
            {result.suggestions.map((s, i) => (
              <div
                key={`${s.title}-${i}`}
                className="rounded-lg border border-primary/20 bg-primary/5 p-4"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h4 className="flex items-center gap-2 text-base font-bold text-primary">
                    <Sparkles size={14} className="shrink-0" />
                    {s.title}
                  </h4>
                  {s.genre && (
                    <span className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-neutral-400 ring-1 ring-white/10">
                      {s.genre}
                    </span>
                  )}
                </div>
                {s.creator && (
                  <p className="mb-1 font-mono text-[11px] text-muted-foreground">
                    {config?.creatorLabel}: {s.creator}
                  </p>
                )}
                {s.pitch && (
                  <p className="text-sm leading-relaxed text-neutral-300">
                    {s.pitch}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
