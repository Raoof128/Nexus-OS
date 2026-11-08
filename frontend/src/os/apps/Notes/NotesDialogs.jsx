import { useEffect, useRef, useState } from 'react'

/**
 * A Win7 message window laid over the note, inside the Notes window. The
 * role="dialog" sits on a wrapper because 7.css hides `.window[role=dialog]`.
 */
function NotesDialogFrame({ id, title, onClose, children }) {
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
        className="w-full max-w-[340px]"
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
