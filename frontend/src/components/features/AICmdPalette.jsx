import { useState } from 'react'
import { Command } from 'cmdk'
import { Sparkles, Terminal } from 'lucide-react'
import { useSuggest } from '../../hooks/useSuggest'

export default function AICmdPalette({ open, onOpenChange }) {
  const [suggestion, setSuggestion] = useState(null)
  const { suggestBook, suggestError, suggesting } = useSuggest()

  const handleSuggest = async () => {
    const response = await suggestBook()
    if (response) {
      setSuggestion(response)
    }
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Global AI Command Menu"
      className="fixed left-1/2 top-1/2 z-[100] w-full max-w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/90 p-4 font-mono shadow-2xl backdrop-blur-xl"
      overlayClassName="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm"
    >
      <div className="mb-4 flex border-b border-white/10 pb-4">
        <Terminal className="mr-3 text-primary" />
        <Command.Input
          autoFocus
          placeholder="Type a command or search..."
          className="w-full bg-transparent font-mono text-white outline-none placeholder-muted-foreground"
        />
      </div>

      <Command.List className="h-full max-h-[300px] overflow-y-auto">
        <Command.Empty className="py-6 text-center font-mono text-sm text-neutral-500">
          No commands found.
        </Command.Empty>

        <Command.Group
          heading="Gemini 3.1 Operations"
          className="mb-2 font-mono text-xs text-neutral-400"
        >
          <Command.Item
            onSelect={handleSuggest}
            className="my-1 flex cursor-pointer items-center gap-3 rounded-md px-4 py-3 text-sm text-white transition-all hover:bg-white/5 hover:text-primary aria-selected:bg-white/10 aria-selected:text-primary"
          >
            Run Intelligence Matrix // Suggest a Book
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

        {suggestion && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="flex items-center gap-2 text-lg font-bold capitalize text-primary">
                <Sparkles size={18} /> {suggestion.suggestion}
              </h4>
              <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                {suggestion.source === 'local' ? 'Local Fallback' : 'Gemini Live'}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-400">
              {suggestion.reasoning}
            </p>
          </div>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
