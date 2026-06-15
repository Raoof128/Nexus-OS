import { useRef, useState } from 'react'
import { Reorder } from 'framer-motion'
import { Check, ListChecks, Plus, Star, Trash2, X } from 'lucide-react'
import { between } from '../lib/position'

// Drag-reorderable list of task lists. Local order is held in state for smooth
// dragging; the caller's `key` (from the server id set) re-initialises it when the
// lists change, so no state-sync effect is needed (mirrors ReorderableTasks).
function ReorderableLists({ lists, activeListId, starredActive, onSelect, onDelete, onReorder }) {
  const [order, setOrder] = useState(lists)

  const handleDragEnd = (list) => {
    const idx = order.findIndex((l) => l.id === list.id)
    if (idx === -1) return
    const prev = order[idx - 1]?.position ?? null
    const next = order[idx + 1]?.position ?? null
    onReorder(list.id, between(prev, next))
  }

  return (
    <Reorder.Group
      axis="y"
      values={order}
      onReorder={setOrder}
      as="ul"
      role="list"
      className="flex flex-col gap-0.5"
    >
      {order.map((list) => {
        const active = !starredActive && list.id === activeListId
        return (
          <Reorder.Item
            key={list.id}
            value={list}
            role="listitem"
            onDragEnd={() => handleDragEnd(list)}
            className="group flex items-center"
          >
            <button
              type="button"
              data-list-btn
              onClick={() => onSelect(list.id)}
              aria-current={active ? 'true' : undefined}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              <ListChecks size={15} className="shrink-0 opacity-70" />
              <span className="truncate">{list.name}</span>
            </button>
            <button
              type="button"
              aria-label={`Delete list "${list.name}"`}
              onClick={() => onDelete(list)}
              className="shrink-0 rounded p-1 text-white/20 opacity-0 transition-colors hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </Reorder.Item>
        )
      })}
    </Reorder.Group>
  )
}

// Left rail: task lists + a cross-cutting "Starred" filter. List CRUD handlers
// are passed in from TasksApp so the sidebar stays presentational.
export default function ListSidebar({
  lists,
  activeListId,
  starredActive,
  onSelect,
  onToggleStarred,
  onCreate,
  onDelete,
  onReorder,
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const navRef = useRef(null)

  const submitCreate = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    setCreating(false)
  }

  // Roving arrow-key navigation between list buttons.
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(navRef.current?.querySelectorAll('[data-list-btn]') || [])
    const idx = items.indexOf(document.activeElement)
    if (idx === -1) return
    e.preventDefault()
    const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1
    items[(next + items.length) % items.length]?.focus()
  }

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-white/[0.06] bg-black/20">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="heading-display text-sm text-primary">Tasks</span>
        <button
          type="button"
          aria-label="New list"
          onClick={() => setCreating((v) => !v)}
          className="rounded p-1 text-white/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Plus size={16} />
        </button>
      </div>

      <button
        type="button"
        onClick={onToggleStarred}
        aria-pressed={starredActive}
        className={`mx-2 mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
          starredActive
            ? 'bg-primary/15 text-primary'
            : 'text-white/70 hover:bg-white/[0.04]'
        }`}
      >
        <Star size={15} fill={starredActive ? 'currentColor' : 'none'} />
        Starred
      </button>

      <div className="mx-2 my-1 h-px bg-white/[0.06]" />

      <nav
        ref={navRef}
        onKeyDown={onKeyDown}
        aria-label="Task lists"
        className="flex-1 overflow-y-auto px-2 pb-2"
      >
        <ReorderableLists
          key={lists.map((l) => l.id).join(',')}
          lists={lists}
          activeListId={activeListId}
          starredActive={starredActive}
          onSelect={onSelect}
          onDelete={onDelete}
          onReorder={onReorder}
        />

        {creating && (
          <form onSubmit={submitCreate} className="mt-2 flex items-center gap-1 px-1">
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
              placeholder="List name"
              aria-label="New list name"
              className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
            <button
              type="submit"
              aria-label="Create list"
              className="rounded p-1 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Check size={15} />
            </button>
            <button
              type="button"
              aria-label="Cancel new list"
              onClick={() => setCreating(false)}
              className="rounded p-1 text-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <X size={15} />
            </button>
          </form>
        )}
      </nav>
    </aside>
  )
}
