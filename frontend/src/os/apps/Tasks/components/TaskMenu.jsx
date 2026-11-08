import { useEffect, useId, useRef, useState } from 'react'
import { List, MoreVertical } from 'lucide-react'

const ENABLED_ITEM = '[role="menuitem"]:not([aria-disabled="true"])'

// Row actions menu with a "Move to list" section. Recurring tasks, subtasks and
// tasks that have subtasks can't change list (the API answers 409). Follows the Win32 menu model: focus moves to the first item on open,
// Up/Down/Home/End move between items, Escape or Tab dismiss, and focus returns
// to the trigger.
export default function TaskMenu({ task, lists, onMoveToList, hasSubtasks = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const headingId = useId()
  const menuId = useId()

  const close = (restoreFocus) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return undefined
    menuRef.current?.querySelector(ENABLED_ITEM)?.focus()
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const onMenuKeyDown = (e) => {
    if (e.key === 'Tab') {
      // Leave the menu: dismiss and let Tab move focus onward from the trigger.
      close(true)
      return
    }
    const items = Array.from(menuRef.current?.querySelectorAll(ENABLED_ITEM) ?? [])
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement)
    let next = null
    if (e.key === 'ArrowDown') next = items[(index + 1) % items.length]
    else if (e.key === 'ArrowUp') next = items[index <= 0 ? items.length - 1 : index - 1]
    else if (e.key === 'Home') next = items[0]
    else if (e.key === 'End') next = items[items.length - 1]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  const others = lists.filter((l) => l.id !== task.list_id)
  const blockedReason = task.recurrence
    ? 'Recurring tasks stay in their list'
    : task.parent_id
      ? "Subtasks stay in their parent's list"
      : hasSubtasks
        ? 'Tasks with subtasks stay in their list'
        : null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More actions for "${task.title}"`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="w7-toolbtn h-6 w-6 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100"
      >
        <MoreVertical size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={`Actions for "${task.title}"`}
          onKeyDown={onMenuKeyDown}
          className="nx-flyout absolute right-0 z-20 mt-1 w-56 p-[2px]"
        >
          <div role="group" aria-labelledby={headingId}>
            <p id={headingId} className="px-2 pt-1 pb-1 text-[12px] text-muted-foreground">
              Move to list
            </p>
            {blockedReason && <MenuNotice>{blockedReason}</MenuNotice>}
            {!blockedReason && others.length === 0 && <MenuNotice>No other lists</MenuNotice>}
            {!blockedReason &&
              others.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    onMoveToList(l.id)
                    close(true)
                  }}
                  className="nx-menuitem"
                >
                  <span className="nx-menuitem__icon" aria-hidden="true">
                    <List size={14} />
                  </span>
                  <span className="min-w-0 truncate">{l.name}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Informational row inside the menu: a disabled menuitem, so it stays a valid
// menu child and is skipped by the arrow keys.
function MenuNotice({ children }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled="true"
      tabIndex={-1}
      className="nx-menuitem h-auto whitespace-normal text-muted-foreground aria-[disabled=true]:hover:border-transparent aria-[disabled=true]:hover:bg-none"
    >
      <span className="nx-menuitem__icon" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </button>
  )
}
