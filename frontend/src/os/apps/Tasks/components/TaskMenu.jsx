import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

// Kebab menu with a "Move to list" section. Recurring tasks can't change list.
export default function TaskMenu({ task, lists, onMoveToList }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const others = lists.filter((l) => l.id !== task.list_id)
  const recurring = Boolean(task.recurrence)

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`More actions for "${task.title}"`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-white/25 opacity-0 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-hover:opacity-100"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="glass-panel absolute right-0 z-20 mt-1 w-44 rounded-lg border border-white/[0.08] p-1 text-sm shadow-xl"
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Move to list
          </p>
          {recurring ? (
            <p
              className="px-2 py-1 text-[11px] text-white/40"
              title="Recurring tasks stay in their list"
            >
              Recurring tasks stay in their list
            </p>
          ) : others.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-white/40">No other lists</p>
          ) : (
            others.map((l) => (
              <button
                key={l.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onMoveToList(l.id)
                  setOpen(false)
                }}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-white/80 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                {l.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
