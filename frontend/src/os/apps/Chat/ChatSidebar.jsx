import { useMemo, useState } from 'react'
import { ChevronDown, FolderOpen, MessageCircle, Plus, Trash2 } from 'lucide-react'
import { MEDIA_CONFIG, MEDIA_TYPES, TYPE_ICONS } from '../../../lib/mediaConfig'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'

const CATEGORY_CONFIG = Object.fromEntries([
  ...MEDIA_TYPES.map((type) => [
    MEDIA_CONFIG[type].label.toLowerCase(),
    { label: MEDIA_CONFIG[type].label, icon: TYPE_ICONS[type] },
  ]),
  ['general', { label: 'General', icon: FolderOpen }],
])

const CATEGORIES = [...MEDIA_TYPES.map((type) => MEDIA_CONFIG[type].label.toLowerCase()), 'general']

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
  isCreating,
}) {
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
    <div className="flex h-full w-full flex-col w7-navpane">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border p-2">
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="w7-btn"
          aria-expanded={showCreate}
        >
          <Plus size={14} aria-hidden="true" />
          New conversation
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-2 border-b border-border p-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Conversation title"
            aria-label="Conversation title"
            className="w-full"
            maxLength={200}
            autoFocus
          />
          <div className="relative">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              aria-label="Conversation category"
              className="w-full"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_CONFIG[cat].label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={isCreating} className="w7-btn default w-full">
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {/* Session list */}
      <div className="flex-1 space-y-3 overflow-y-auto p-2">
        {CATEGORIES.map((cat) => {
          const items = grouped[cat]
          if (!items || items.length === 0) return null
          const { label, icon: Icon } = CATEGORY_CONFIG[cat]
          return (
            <div key={cat}>
              <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                <Icon size={12} aria-hidden="true" />
                {label}
              </div>
              <div className="space-y-0.5">
                {items.map((session) => {
                  const isActive = activeSessionId === session.id
                  return (
                    <div key={session.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSelect(session.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className="w7-item min-w-0 flex-1 truncate px-2 py-1 text-left text-[12px]"
                      >
                        {session.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteSessionId(session.id)}
                        className="w7-toolbtn w7-toolbtn--danger shrink-0 text-muted-foreground"
                        aria-label={`Delete ${session.title}`}
                        title="Delete conversation"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
            <MessageCircle size={24} className="text-[#3d5a80]" aria-hidden="true" />
            <p className="text-[12px] text-muted-foreground">
              No conversations yet. Start one to ask the assistant anything.
            </p>
            <button type="button" onClick={() => setShowCreate(true)} className="w7-btn">
              New conversation
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteSessionId !== null}
        title="Delete conversation"
        message="This will permanently delete this conversation."
        onConfirm={() => {
          onDelete(deleteSessionId)
          setDeleteSessionId(null)
        }}
        onCancel={() => setDeleteSessionId(null)}
      />
    </div>
  )
}
