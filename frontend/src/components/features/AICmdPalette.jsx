import { useState } from 'react'
import { Command } from 'cmdk'
import { Bot, Cpu, Sparkles, Terminal, Zap } from 'lucide-react'
import { useSuggest } from '../../hooks/useSuggest'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'

export default function AICmdPalette({ open, onOpenChange, mediaType = 'book' }) {
  const [result, setResult] = useState(null)
  const config = MEDIA_CONFIG[mediaType]
  const { suggest, suggestError, suggesting } = useSuggest(mediaType)

  const handleSuggest = async () => {
    const response = await suggest()
    if (response) {
      setResult(response)
    }
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => { if (!v) setResult(null); onOpenChange(v) }}
      label="Global AI Command Menu"
      className="neon-border fixed left-1/2 top-1/2 z-[100] w-full max-w-[680px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl glass-panel p-0 shadow-[0_0_80px_hsl(var(--neon-cyan)/0.08)]"
      overlayClassName="fixed inset-0 z-[99] bg-black/60 backdrop-blur-md"
    >
      <span className="sr-only" role="heading" aria-level="2">AI Command Menu</span>
      <p className="sr-only">Search commands or request AI-powered media suggestions.</p>

      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <Terminal size={14} className="text-primary" />
        </div>
        <Command.Input
          autoFocus
          placeholder="nexus:// enter command..."
          className="w-full bg-transparent heading-ui text-sm text-white outline-none placeholder:text-muted-foreground/50"
        />
        <kbd className="hidden rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-muted-foreground sm:inline">
          ESC
        </kbd>
      </div>

      <Command.List className="max-h-[450px] overflow-y-auto custom-scrollbar p-3">
        <Command.Empty className="py-10 text-center">
          <Cpu size={24} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="heading-ui text-xs text-muted-foreground/50">NO_COMMANDS_FOUND</p>
        </Command.Empty>

        <Command.Group
          heading={
            <span className="heading-display text-[10px] tracking-[0.2em] text-primary/50">
              Neural Operations
            </span>
          }
          className="mb-2"
        >
          <Command.Item
            onSelect={handleSuggest}
            className="group my-1 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3.5 transition-all hover:bg-primary/[0.06] aria-selected:bg-primary/10 aria-selected:ring-1 aria-selected:ring-primary/20"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 transition-all group-hover:bg-primary/20 group-hover:shadow-[0_0_12px_hsl(var(--neon-cyan)/0.2)]">
              <Zap size={16} className="text-primary" />
            </div>
            <div>
              <p className="heading-ui text-sm font-semibold text-white">
                Suggest {config?.singular || 'Media'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Analyze your library and recommend new titles
              </p>
            </div>
          </Command.Item>
        </Command.Group>

        {/* Loading state */}
        {suggesting && (
          <div className="my-4 flex flex-col items-center gap-3 py-6">
            <div className="relative">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              <Bot size={16} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
            </div>
            <p className="heading-display text-[10px] tracking-[0.3em] text-primary/70 animate-pulse">
              Neural Link Active
            </p>
          </div>
        )}

        {/* Error */}
        {suggestError && (
          <div className="neon-border mx-1 rounded-xl bg-destructive/[0.06] p-4">
            <p className="heading-display text-[10px] tracking-wider text-destructive/70 mb-1">SYS_ERROR</p>
            <p className="text-sm text-destructive">{suggestError}</p>
          </div>
        )}

        {/* Results */}
        {result && result.suggestions && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between px-2 py-1">
              <p className="heading-display text-[10px] tracking-[0.2em] text-primary/50">
                Recommendations
              </p>
              <span className={`rounded-full px-2.5 py-0.5 text-[9px] heading-ui font-semibold uppercase tracking-wider ${
                result.source === 'gemini'
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
                  : 'bg-accent/15 text-accent ring-1 ring-accent/20'
              }`}>
                {result.source === 'local' ? 'Fallback' : 'Gemini Live'}
              </span>
            </div>

            {result.suggestions.map((s, i) => (
              <div
                key={`${s.title}-${i}`}
                className="neon-border glass-panel rounded-xl p-4 transition-all hover:bg-white/[0.02]"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" />
                    <div>
                      <h4 className="heading-ui text-sm font-bold text-white">
                        {s.title}
                      </h4>
                      {s.creator && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {config?.creatorLabel}: {s.creator}
                        </p>
                      )}
                    </div>
                  </div>
                  {s.genre && (
                    <span className="shrink-0 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-white/[0.06]">
                      {s.genre}
                    </span>
                  )}
                </div>
                {s.pitch && (
                  <p className="ml-6 text-[13px] leading-relaxed text-neutral-400">
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
