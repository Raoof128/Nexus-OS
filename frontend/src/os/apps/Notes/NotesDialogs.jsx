import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { formatDateTime } from './noteUtils'

/**
 * A Win7 message window laid over the note, inside the Notes window. The
 * role="dialog" sits on a wrapper because 7.css hides `.window[role=dialog]`.
 */
function NotesDialogFrame({ id, title, onClose, maxWidth = 'max-w-[340px]', children }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
        className={`w-full ${maxWidth}`}
      >
        <div className="window active">
          <div className="title-bar">
            <div id={`${id}-title`} className="title-bar-text">
              {title}
            </div>
            <div className="title-bar-controls">
              <button type="button" className="is-close" aria-label="Close" onClick={onClose} />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * Edit → Find…. Searches the note from the caret, wrapping at the end. The
 * parent owns the result message and selects the match.
 */
export function NotesFindDialog({ initialQuery, message, onFindNext, onClose }) {
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <NotesDialogFrame id="notes-find" title="Find" onClose={onClose}>
      <form
        className="window-body has-space"
        onSubmit={(e) => {
          e.preventDefault()
          if (query) onFindNext(query)
        }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor="notes-find-input" className="shrink-0">
            Find what:
          </label>
          <input
            id="notes-find-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1"
          />
        </div>
        {message && (
          <p role="status" className="mt-2 text-[12px] text-foreground">
            {message}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button type="submit" className="w7-btn default" disabled={!query}>
            Find next
          </button>
          <button type="button" className="w7-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </NotesDialogFrame>
  )
}

/**
 * File → Open…. Lists the saved notes, newest edit first. Enter or double-click
 * opens; Delete asks the parent to confirm. Arrow keys, Home and End move the
 * selection. A note open in another Notes window is opened there instead.
 */
export function NotesOpenDialog({
  notes,
  currentId,
  error,
  isOpenElsewhere,
  onOpen,
  onDelete,
  onClose,
}) {
  const trapRef = useFocusTrap(true)
  const optionRefs = useRef({})
  // The selection starts on the note in this window. If that note has gone
  // (deleted), the first note is selected instead.
  const [selectedId, setSelectedId] = useState(currentId)
  const effectiveId = notes.some((n) => n.id === selectedId) ? selectedId : (notes[0]?.id ?? null)
  const selected = notes.find((n) => n.id === effectiveId) ?? null
  const selectedElsewhere = selected ? isOpenElsewhere(selected.id) : false

  const select = (index) => {
    const note = notes[Math.min(notes.length - 1, Math.max(0, index))]
    if (!note) return
    setSelectedId(note.id)
    optionRefs.current[note.id]?.focus()
  }

  const handleOptionKey = (e) => {
    const index = Math.max(
      0,
      notes.findIndex((n) => n.id === effectiveId),
    )
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        select(index + 1)
        return
      case 'ArrowUp':
        e.preventDefault()
        select(index - 1)
        return
      case 'Home':
        e.preventDefault()
        select(0)
        return
      case 'End':
        e.preventDefault()
        select(notes.length - 1)
        return
      case 'Enter':
        e.preventDefault()
        if (selected) onOpen(selected.id)
        return
      case 'Delete':
        e.preventDefault()
        if (selected && !selectedElsewhere) onDelete(selected)
        return
      default:
    }
  }

  return (
    <NotesDialogFrame id="notes-open" title="Open" maxWidth="max-w-[380px]" onClose={onClose}>
      <div ref={trapRef} className="window-body has-space">
        <ul
          role="listbox"
          aria-label="Saved notes"
          className="h-[180px] overflow-y-auto bg-white text-[12px]"
        >
          {notes.map((note) => {
            const isSelected = note.id === effectiveId
            const elsewhere = isOpenElsewhere(note.id)
            return (
              <li
                key={note.id}
                ref={(el) => {
                  optionRefs.current[note.id] = el
                }}
                role="option"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-autofocus={isSelected || undefined}
                onClick={() => setSelectedId(note.id)}
                onDoubleClick={() => onOpen(note.id)}
                onKeyDown={handleOptionKey}
                className="w7-item flex min-w-0 items-baseline justify-between gap-3 px-2 py-1"
              >
                <span className="min-w-0 truncate">{note.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {elsewhere ? 'Open in another window · ' : ''}
                  {formatDateTime(new Date(note.updatedAt))}
                </span>
              </li>
            )
          })}
        </ul>
        {notes.length === 0 && (
          <p className="mt-2 text-[12px] text-foreground">No saved notes yet.</p>
        )}
        {selectedElsewhere && (
          <p className="mt-2 text-[12px] text-foreground">
            This note is open in another Notes window. Open switches to that window. Close it there
            to delete the note.
          </p>
        )}
        {error && (
          <p role="alert" className="w7-error mt-2 text-[12px]">
            {error}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="w7-btn default"
            disabled={!selected}
            onClick={() => selected && onOpen(selected.id)}
          >
            Open
          </button>
          <button
            type="button"
            className="w7-btn"
            disabled={!selected || selectedElsewhere}
            onClick={() => selected && onDelete(selected)}
          >
            Delete
          </button>
          <button type="button" className="w7-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </NotesDialogFrame>
  )
}

/** Help → About Notes…. Lists the keyboard shortcuts the editor supports. */
export function NotesAboutDialog({ onClose }) {
  return (
    <NotesDialogFrame id="notes-about" title="About Notes" onClose={onClose}>
      <div className="window-body has-space">
        <p className="text-[12px] text-foreground">
          Notes is a plain-text editor with a Markdown preview. Your note saves in this browser as
          you type.
        </p>
        <dl className="mt-2 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="font-semibold">F5</dt>
          <dd>Insert the time and date</dd>
          <dt className="font-semibold">Ctrl+F</dt>
          <dd>Find</dd>
          <dt className="font-semibold">Ctrl+S</dt>
          <dd>Save now</dd>
          <dt className="font-semibold">Esc</dt>
          <dd>Close a menu or dialog</dd>
        </dl>
        <div className="mt-3 flex justify-end">
          <button type="button" className="w7-btn default" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </NotesDialogFrame>
  )
}
