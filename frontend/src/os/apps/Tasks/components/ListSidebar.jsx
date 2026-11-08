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
              aria-current={active ? 'page' : undefined}
              className="w7-item flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
            >
              <ListChecks size={16} className="shrink-0 text-[#3d5a80]" />
              <span className="truncate">{list.name}</span>
            </button>
            <button
              type="button"
              aria-label={`Delete list "${list.name}"`}
              title={`Delete list "${list.name}"`}
              onClick={() => onDelete(list)}
              className="w7-toolbtn w7-toolbtn--danger ml-0.5 shrink-0 px-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
    <aside className="w7-navpane flex w-52 shrink-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="w7-subheading">Task lists</span>
        <button
          type="button"
          aria-label="New list"
          title="New list"
          aria-expanded={creating}
          onClick={() => setCreating((v) => !v)}
          className="w7-toolbtn"
        >
          <Plus size={16} />
          <span>New list</span>
        </button>
      </div>

      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={onToggleStarred}
          aria-pressed={starredActive}
          className="w7-item flex w-full items-center gap-2 px-2 py-1 text-left"
          aria-current={starredActive ? 'page' : undefined}
        >
          <Star
            size={16}
            className="shrink-0 text-amber-500"
            fill={starredActive ? 'currentColor' : 'none'}
          />
          Starred
        </button>
      </div>

      <div className="mx-3 my-1 h-px bg-[#d6e5f5]" />

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
              className="min-w-0 flex-1"
            />
            <button
              type="submit"
              aria-label="Create list"
              title="Create list"
              className="w7-toolbtn h-6 w-6 px-0"
            >
              <Check size={15} />
            </button>
            <button
              type="button"
              aria-label="Cancel new list"
              title="Cancel"
              onClick={() => setCreating(false)}
              className="w7-toolbtn h-6 w-6 px-0"
            >
              <X size={15} />
            </button>
          </form>
        )}
      </nav>
    </aside>
  )
}
