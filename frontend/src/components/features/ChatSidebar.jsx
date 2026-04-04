import { useMemo, useState } from 'react'
import { FolderOpen, Loader2, MessageCircle, Plus, Trash2 } from 'lucide-react'
import { MEDIA_CONFIG, MEDIA_TYPES, TYPE_ICONS } from '../../lib/mediaConfig'
import ConfirmDialog from './ConfirmDialog'

const MEDIA_CATEGORY_COLORS = {
  book: 'text-cyan-400',
  movie: 'text-pink-400',
  anime: 'text-purple-400',
  job: 'text-amber-400',
}

const CATEGORY_CONFIG = Object.fromEntries([
  ...MEDIA_TYPES.map((type) => [
    MEDIA_CONFIG[type].label.toLowerCase(),
    { label: MEDIA_CONFIG[type].label, icon: TYPE_ICONS[type], color: MEDIA_CATEGORY_COLORS[type] },
  ]),
  ['general', { label: 'General', icon: FolderOpen, color: 'text-neutral-400' }],
])

const CATEGORIES = [...MEDIA_TYPES.map((type) => MEDIA_CONFIG[type].label.toLowerCase()), 'general']

export default function ChatSidebar({ sessions, activeSessionId, onSelect, onCreate, onDelete, isCreating }) {
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteSessionId, setDeleteSessionId] = useState(null)

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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20" aria-hidden="true">
            <MessageCircle size={12} className="text-primary" />
          </div>
          <span className="heading-display text-xs font-bold text-white">
            Nexus AI
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          title="New chat"
          aria-label="New chat"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="border-b border-white/[0.04] p-3 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Session name..."
            aria-label="Session title"
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 heading-ui text-xs text-white placeholder:text-muted-foreground/30 focus:border-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            maxLength={200}
            autoFocus
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            aria-label="Session category"
            className="w-full appearance-none rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 heading-ui text-xs text-white focus:border-primary/30 focus:outline-none"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat} className="bg-neutral-900 text-white">{CATEGORY_CONFIG[cat].label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isCreating}
            className="heading-ui w-full rounded-lg bg-primary/15 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/25 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black flex items-center justify-center gap-2"
          >
            {isCreating && <Loader2 size={12} className="animate-spin" />}
            {isCreating ? 'Initializing...' : 'Initialize Session'}
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
              <div className={`mb-1.5 flex items-center gap-1.5 px-2 heading-ui text-[10px] tracking-wider ${color} opacity-80`}>
                <Icon size={10} aria-hidden="true" />
                {label}
              </div>
              <div className="space-y-0.5">
                {items.map((session) => (
                  <div
                    key={session.id}
                    className={`group relative flex items-center rounded-lg transition-all ${
                      activeSessionId === session.id
                        ? 'bg-primary/10 ring-1 ring-primary/15'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(session.id)}
                      className={`flex-1 truncate px-3 py-2.5 text-left heading-ui text-[11px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                        activeSessionId === session.id
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-white'
                      }`}
                    >
                      {session.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteSessionId(session.id)}
                      className="mr-1 shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      aria-label={`Delete ${session.title}`}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10">
            <MessageCircle size={24} className="text-muted-foreground/40" />
            <p className="heading-ui text-[10px] text-muted-foreground/50">No sessions</p>
            <button type="button" onClick={() => setShowCreate(true)} className="mt-3 text-xs text-primary hover:text-primary/80">Create your first session</button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteSessionId !== null}
        title="Delete Session"
        message="This will permanently delete this chat session."
        onConfirm={() => { onDelete(deleteSessionId); setDeleteSessionId(null); }}
        onCancel={() => setDeleteSessionId(null)}
      />
    </div>
  )
}
