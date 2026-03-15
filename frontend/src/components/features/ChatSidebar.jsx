import { useMemo, useState } from 'react'
import { BookOpen, Film, FolderOpen, MessageCircle, Plus, Sparkles, Trash2 } from 'lucide-react'

const CATEGORY_CONFIG = {
  books: { label: 'Books', icon: BookOpen },
  movies: { label: 'Movies', icon: Film },
  anime: { label: 'Anime', icon: Sparkles },
  general: { label: 'General', icon: FolderOpen },
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
    <div className="flex h-full w-full flex-col border-r border-white/5 bg-black/40 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 p-4">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-primary" />
          <span className="font-mono text-sm font-bold uppercase tracking-wider text-white">
            Nexus AI
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-primary/10 p-1.5 text-primary transition-colors hover:bg-primary/20"
          title="New chat"
          aria-label="New chat"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="border-b border-white/5 p-3 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Chat title..."
            className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-1.5 font-mono text-xs text-white placeholder:text-white/20 focus:border-primary focus:outline-none"
            maxLength={200}
            autoFocus
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-1.5 font-mono text-xs text-white focus:border-primary focus:outline-none"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="w-full rounded-md bg-primary/20 py-1.5 font-mono text-[10px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/30"
          >
            Create Session
          </button>
        </form>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
        {CATEGORIES.map((cat) => {
          const items = grouped[cat]
          if (!items || items.length === 0) return null
          const { label, icon: Icon } = CATEGORY_CONFIG[cat]
          return (
            <div key={cat}>
              <div className="mb-1 flex items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <Icon size={10} />
                {label}
              </div>
              {items.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelect(session.id)}
                  className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors ${
                    activeSessionId === session.id
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="truncate">{session.title}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(session.id) }}
                    className="ml-1 shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    aria-label="Delete session"
                  >
                    <Trash2 size={10} />
                  </button>
                </button>
              ))}
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div className="p-4 text-center font-mono text-xs text-muted-foreground opacity-50">
            No conversations yet
          </div>
        )}
      </div>
    </div>
  )
}
