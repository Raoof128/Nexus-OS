import { useState, useEffect } from 'react'
import { Command } from 'cmdk'
import { Sparkles, Terminal } from 'lucide-react'
import { useBooks } from '../../hooks/useBooks'
import { useAuth } from '../../hooks/useAuth'

export default function AICmdPalette() {
  const [open, setOpen] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  
  // We need both the session and the backend hook
  const { session } = useAuth()
  const { suggestBook, loading, error } = useBooks(session)

  // Quick shortcut listener mapping Cmd/Ctrl + K
  useEffect(() => {
    const spaceHandle = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', spaceHandle)
    return () => document.removeEventListener('keydown', spaceHandle)
  }, [])

  const handleSuggest = async () => {
    setSuggestion(null)
    const res = await suggestBook()
    if (res) {
      setSuggestion(res)
    }
  }

  return (
    <>
      <div 
         className="cursor-pointer text-xs font-mono fixed bottom-6 right-6 z-50 rounded-full bg-primary/20 hover:bg-primary/40 text-primary border border-primary px-4 py-2 flex items-center gap-2 backdrop-blur-xl shadow-[0_0_15px_var(--color-primary)] transition-all animate-none hover:animate-pulse"
         onClick={() => setOpen(true)}
      >
        <Sparkles size={16} />
        Activate AI_CMD <span>[ Cmd + K ]</span>
      </div>

      <Command.Dialog 
        open={open} 
        onOpenChange={setOpen}
        label="Global AI Command Menu"
        className="fixed top-1/2 left-1/2 max-w-[640px] w-full -translate-x-1/2 -translate-y-1/2 z-[100] bg-zinc-950/90 border border-white/10 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl font-mono p-4"
        overlayClassName="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm"
      >
        <div className="flex border-b border-white/10 pb-4 mb-4" cmdk-top-bar="">
          <Terminal className="text-primary mr-3" />
          <Command.Input 
            autoFocus 
            placeholder="Type a command or search..." 
            className="w-full bg-transparent outline-none text-white font-mono placeholder-muted-foreground"
          />
        </div>

        <Command.List className="h-full overflow-y-auto max-h-[300px]">
          <Command.Empty className="py-6 text-center text-sm text-neutral-500 font-mono">No commands found.</Command.Empty>

          <Command.Group heading="Gemini 3.1 Operations" className="text-xs text-neutral-400 font-mono mb-2">
            <Command.Item 
                onSelect={handleSuggest}
                className="flex items-center gap-3 px-4 py-3 rounded-md cursor-pointer hover:bg-white/5 hover:text-primary transition-all aria-selected:bg-white/10 aria-selected:text-primary text-white text-sm my-1"
            >
              🚀 Run Intelligence Matrix // Suggest a Book
            </Command.Item>
          </Command.Group>

          {loading && (
             <div className="text-primary text-center p-4 animate-pulse uppercase tracking-wider text-xs">Processing via Neural Link...</div>
          )}

          {error && (
            <div className="text-red-500 p-4 font-mono text-sm border border-red-500/50 rounded-lg bg-red-500/10">
              ERR_CRITICAL: {error}
            </div>
          )}

          {suggestion && (
            <div className="p-4 mt-4 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="flex items-center gap-2 text-primary font-bold text-lg mb-2 capitalize">
                 <Sparkles size={18} /> {suggestion.suggestion}
              </h4>
              <p className="text-neutral-400 text-sm leading-relaxed">
                  {suggestion.reasoning}
              </p>
            </div>
          )}
        </Command.List>
      </Command.Dialog>
    </>
  )
}
