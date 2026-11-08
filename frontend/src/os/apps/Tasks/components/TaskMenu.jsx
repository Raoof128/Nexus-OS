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
        className="w7-toolbtn h-6 w-6 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div role="menu" className="nx-flyout absolute right-0 z-20 mt-1 w-48 p-[2px]">
          <p className="px-2 py-1 text-[11px] text-muted-foreground">Move to list</p>
          {recurring ? (
            <p
              className="px-2 py-1 text-[11px] text-muted-foreground"
              title="Recurring tasks stay in their list"
            >
              Recurring tasks stay in their list
            </p>
          ) : others.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">No other lists</p>
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
                className="nx-menuitem truncate"
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
