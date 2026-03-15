import { useMemo, useState } from 'react'
import { BookOpen, Film, FolderOpen, MessageCircle, Plus, Sparkles, Trash2 } from 'lucide-react'

const CATEGORY_CONFIG = {
  books: { label: 'Books', icon: BookOpen, color: 'text-cyan-400' },
  movies: { label: 'Movies', icon: Film, color: 'text-pink-400' },
  anime: { label: 'Anime', icon: Sparkles, color: 'text-purple-400' },
  general: { label: 'General', icon: FolderOpen, color: 'text-neutral-400' },
}

const CATEGORIES = ['books', 'movies', 'anime', 'general']

export default function ChatSidebar({ sessions, activeSessionId, onSelect, onCreate, onDelete }) {
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [showCreate, setShowCreate] = useState(false)

  const grouped = useMemo(() => {
    const groups = {}
    for (const cat of CATEGORIES) {
      groups[cat] = sessions.filter((s) => s.category === cat)
    }
    return groups
  }, [sessions])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await onCreate({ title: newTitle.trim(), category: newCategory })
    setNewTitle('')
    setShowCreate(false)
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-white/[0.04] glass-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
            <MessageCircle size={12} className="text-primary" />
          </div>
          <span className="heading-display text-xs font-bold text-white">
            Nexus AI
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-primary/10 p-1.5 text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/20 hover:shadow-[0_0_10px_hsl(var(--neon-cyan)/0.15)]"
          title="New chat"
          aria-label="New chat"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="border-b border-white/[0.04] p-3 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="nexus:// session name..."
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 heading-ui text-xs text-white placeholder:text-muted-foreground/30 focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20"
            maxLength={200}
            autoFocus
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 heading-ui text-xs text-white focus:border-primary/30 focus:outline-none"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="heading-ui w-full rounded-lg bg-primary/15 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/25"
          >
            Initialize Session
          </button>
        </form>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
        {CATEGORIES.map((cat) => {
          const items = grouped[cat]
          if (!items || items.length === 0) return null
          const { label, icon: Icon, color } = CATEGORY_CONFIG[cat]
          return (
            <div key={cat}>
              <div className={`mb-1.5 flex items-center gap-1.5 px-2 heading-display text-[9px] tracking-[0.2em] ${color} opacity-60`}>
                <Icon size={9} />
                {label}
              </div>
              <div className="space-y-0.5">
                {items.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onSelect(session.id)}
                    className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-all ${
                      activeSessionId === session.id
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/15'
                        : 'text-muted-foreground hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <span className="truncate heading-ui text-[11px]">{session.title}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(session.id) }}
                      className="ml-1 shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100 hover:text-destructive"
                      aria-label="Delete session"
                    >
                      <Trash2 size={10} />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 opacity-30">
            <MessageCircle size={24} className="text-muted-foreground" />
            <p className="heading-ui text-[10px] text-muted-foreground">No sessions</p>
          </div>
        )}
      </div>
    </div>
  )
}
