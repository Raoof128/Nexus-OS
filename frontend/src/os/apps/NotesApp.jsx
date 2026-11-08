import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useWindowStore } from '../stores/windowStore'
import NotesMenuBar from './Notes/NotesMenuBar'
import { NotesAboutDialog, NotesFindDialog, NotesOpenDialog } from './Notes/NotesDialogs'
import { renderMarkdown } from './Notes/markdown'
import { addNote, deleteNote, deriveTitle, getNote, listNotes, saveNote } from './Notes/noteStore'
import { linkNoteToWindow, noteWindowsShowing, resolveWindowNote } from './Notes/noteWindows'
import {
  findInText,
  formatDateTime,
  insertAt,
  readNotesPrefs,
  writeNotesPrefs,
} from './Notes/noteUtils'

const SAVE_DEBOUNCE_MS = 500

/**
 * One Notes window shows one note. The note lives in storage under its own id
 * (Notes/noteStore.js), so closing the window keeps it. File → New and File →
 * Open… switch this window to another note.
 */
export default function NotesApp({ windowId }) {
  // Which note this window shows is decided once, on mount.
  const [initial] = useState(() => {
    const id = resolveWindowNote(windowId)
    const note = id ? getNote(id) : null
    return { id, content: note?.content ?? '' }
  })
  const [noteId, setNoteId] = useState(initial.id)
  const [content, setContent] = useState(initial.content)
  // View → Edit / Markdown preview. Preview is an extra mode, not Notepad's default.
  const [preview, setPreview] = useState(false)
  // Format → Word wrap / Monospace font.
  const [prefs, setPrefs] = useState(() => readNotesPrefs())
  // 'saved' | 'pending' | 'error'
  const [saveState, setSaveState] = useState('saved')
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findMessage, setFindMessage] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [openDialogOpen, setOpenDialogOpen] = useState(false)
  const [notesList, setNotesList] = useState([])
  const [openError, setOpenError] = useState('')
  // The note waiting for confirmation before it is deleted.
  const [deleteTarget, setDeleteTarget] = useState(null)
  const focusWindow = useWindowStore((s) => s.focusWindow)

  const textareaRef = useRef(null)
  const saveTimeout = useRef(null)
  // { id, text } while a typed change waits for the save timer.
  const pendingSave = useRef(null)
  // Where the caret should land after Time/Date is inserted.
  const pendingCaret = useRef(null)

  const persist = useCallback((id, text) => {
    if (!id) return false
    try {
      saveNote(id, text)
      return true
    } catch {
      // Storage full, or the note was deleted elsewhere
      return false
    }
  }, [])

  // A typed change is saved after a short pause. Leaving the note saves at once.
  const scheduleSave = (id, text) => {
    pendingSave.current = { id, text }
    setSaveState('pending')
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveTimeout.current = null
      const latest = pendingSave.current
      pendingSave.current = null
      if (latest) setSaveState(persist(latest.id, latest.text) ? 'saved' : 'error')
    }, SAVE_DEBOUNCE_MS)
  }

  const saveNow = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = null
    pendingSave.current = null
    setSaveState(persist(noteId, content) ? 'saved' : 'error')
  }

  // Writes a change still waiting for the timer. False when it could not be saved.
  const flushPendingSave = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = null
    const pending = pendingSave.current
    pendingSave.current = null
    return pending ? persist(pending.id, pending.text) : true
  }

  // Clear the timer on unmount, saving any change still waiting for it.
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      if (pendingSave.current) persist(pendingSave.current.id, pendingSave.current.text)
    }
  }, [persist])

  // Put the caret after an inserted Time/Date stamp, once the text has changed.
  useLayoutEffect(() => {
    const ta = textareaRef.current
    if (pendingCaret.current === null || !ta) return
    ta.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  }, [content])

  const applyContent = (text) => {
    setContent(text)
    scheduleSave(noteId, text)
  }

  const handleChange = (e) => applyContent(e.target.value)

  const focusEditor = () => {
    if (!preview) textareaRef.current?.focus()
  }

  // Shows another note in this window. Returns false, and keeps the current
  // note, when the current note's last edit could not be saved.
  const leaveCurrentNote = () => {
    if (flushPendingSave()) return true
    setSaveState('error')
    return false
  }

  const showNote = (id, text) => {
    setNoteId(id)
    setContent(text)
    setSaveState('saved')
    setPreview(false)
  }

  const newNote = ({ focus = true } = {}) => {
    if (!leaveCurrentNote()) return
    let note
    try {
      note = addNote({ content: '' })
    } catch {
      setSaveState('error')
      return
    }
    linkNoteToWindow(windowId, note.id)
    showNote(note.id, '')
    if (focus) requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const openNote = (id) => {
    if (id === noteId) return true
    if (!leaveCurrentNote()) return false
    const next = getNote(id)
    if (!next) return false
    linkNoteToWindow(windowId, id)
    showNote(id, next.content)
    return true
  }

  const openDialogNow = () => {
    setOpenError('')
    setNotesList(listNotes())
    setOpenDialogOpen(true)
  }

  // Focus goes back to the editor after the dialog unmounts, since the focus
  // trap restores focus to the menu title on unmount. Deferred so it wins.
  const closeOpenDialog = () => {
    setOpenDialogOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const chooseNote = (id) => {
    const elsewhere = noteWindowsShowing(id, windowId)
    if (elsewhere.length > 0) {
      // Already open in another window: switch to that window, never two editors on one note.
      setOpenDialogOpen(false)
      focusWindow(elsewhere[0])
      return
    }
    if (openNote(id)) closeOpenDialog()
    else setOpenError('This note could not be opened. Try again.')
  }

  const requestDelete = (note) => {
    if (noteWindowsShowing(note.id, windowId).length > 0) return
    setOpenError('')
    setDeleteTarget(note)
  }

  const confirmDelete = () => {
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    if (target.id === noteId) {
      // The note is going away, so its unsaved text must not be written back.
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = null
      pendingSave.current = null
    }
    try {
      deleteNote(target.id)
    } catch {
      setOpenError('This note could not be deleted. Try again.')
      setNotesList(listNotes())
      return
    }
    // Deleting this window's own note leaves it on a fresh blank note.
    if (target.id === noteId) newNote({ focus: false })
    setNotesList(listNotes())
  }

  const openFind = () => {
    if (preview) return
    setFindMessage('')
    setFindOpen(true)
  }

  const findNext = (query) => {
    setFindQuery(query)
    const ta = textareaRef.current
    if (!ta) return
    const from = ta.selectionEnd ?? 0
    const index = findInText(content, query, from)
    if (index === -1) {
      setFindMessage(`Cannot find "${query}"`)
      return
    }
    setFindMessage('')
    // Selecting text needs the note focused; hand focus back to the dialog so
    // Enter keeps working for the next match.
    ta.focus()
    ta.setSelectionRange(index, index + query.length)
    document.getElementById('notes-find-input')?.focus()
  }

  const closeFind = () => {
    setFindOpen(false)
    focusEditor()
  }

  const togglePref = (key) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    writeNotesPrefs(next)
  }

  const insertDateTime = () => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? content.length
    const end = ta.selectionEnd ?? start
    const stamp = formatDateTime(new Date())
    pendingCaret.current = start + stamp.length
    applyContent(insertAt(content, start, end, stamp))
  }

  const handleEditorKeyDown = (e) => {
    const withCtrl = e.ctrlKey || e.metaKey
    if (e.key === 'F5') {
      // Stop the browser reloading the whole desktop.
      e.preventDefault()
      insertDateTime()
    } else if (withCtrl && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      openFind()
    } else if (withCtrl && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      saveNow()
    }
  }

  const charCount = content.length
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0
  const title = deriveTitle(content)

  const editing = !preview
  const menus = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New', onSelect: () => newNote() },
        { id: 'open', label: 'Open…', divider: true, onSelect: openDialogNow },
        {
          id: 'save',
          label: 'Save',
          shortcut: 'Ctrl+S',
          onSelect: () => {
            saveNow()
            focusEditor()
          },
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'undo',
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          disabled: !editing,
          onSelect: () => {
            focusEditor()
            document.execCommand('undo')
          },
        },
        {
          id: 'cut',
          label: 'Cut',
          shortcut: 'Ctrl+X',
          disabled: !editing,
          divider: true,
          onSelect: () => {
            focusEditor()
            document.execCommand('cut')
          },
        },
        {
          id: 'copy',
          label: 'Copy',
          shortcut: 'Ctrl+C',
          disabled: !editing,
          onSelect: () => {
            focusEditor()
            document.execCommand('copy')
          },
        },
        {
          id: 'select-all',
          label: 'Select all',
          shortcut: 'Ctrl+A',
          disabled: !editing,
          divider: true,
          onSelect: () => {
            focusEditor()
            textareaRef.current?.select()
          },
        },
        {
          id: 'time-date',
          label: 'Time/Date',
          shortcut: 'F5',
          disabled: !editing,
          onSelect: () => {
            focusEditor()
            insertDateTime()
          },
        },
        {
          id: 'find',
          label: 'Find…',
          shortcut: 'Ctrl+F',
          disabled: !editing,
          divider: true,
          onSelect: openFind,
        },
      ],
    },
    {
      id: 'format',
      label: 'Format',
      items: [
        {
          id: 'word-wrap',
          label: 'Word wrap',
          checked: prefs.wordWrap,
          onSelect: () => togglePref('wordWrap'),
        },
        {
          id: 'monospace',
          label: 'Monospace font',
          checked: prefs.monospace,
          onSelect: () => togglePref('monospace'),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'view-edit',
          label: 'Edit',
          checked: editing,
          onSelect: () => {
            setPreview(false)
            requestAnimationFrame(() => textareaRef.current?.focus())
          },
        },
        {
          id: 'view-preview',
          label: 'Markdown preview',
          checked: preview,
          onSelect: () => setPreview(true),
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [{ id: 'about', label: 'About Notes…', onSelect: () => setAboutOpen(true) }],
    },
  ]

  const saveLabel =
    saveState === 'pending'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Couldn’t save. Storage is full.'
        : 'Saved'

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white">
      <NotesMenuBar menus={menus} />

      {/* Content */}
      {preview ? (
        content.trim() ? (
          <div
            className="flex-1 overflow-y-auto bg-white p-3 text-[13px] leading-relaxed text-foreground"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-white p-4 text-center">
            <Eye size={24} className="text-muted-foreground" aria-hidden="true" />
            <p className="text-[12px] text-muted-foreground">
              Nothing to preview yet. Choose View, then Edit, to start writing.
            </p>
          </div>
        )
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleEditorKeyDown}
          placeholder="Start typing…"
          aria-label="Note editor"
          wrap={prefs.wordWrap ? 'soft' : 'off'}
          className={`flex-1 resize-none text-[13px] leading-relaxed ${
            prefs.monospace ? 'font-mono' : ''
          } ${prefs.wordWrap ? '' : 'whitespace-pre'}`}
          spellCheck={false}
        />
      )}

      {/* Status bar */}
      <div className="status-bar shrink-0">
        <p className="status-bar-field min-w-0 flex-1 truncate" title={title}>
          {title}
        </p>
        <p className="status-bar-field">
          {wordCount} {wordCount === 1 ? 'word' : 'words'} · {charCount}{' '}
          {charCount === 1 ? 'character' : 'characters'}
        </p>
        <p className="status-bar-field" role="status" aria-live="polite">
          {saveLabel}
        </p>
      </div>

      {findOpen && (
        <NotesFindDialog
          initialQuery={findQuery}
          message={findMessage}
          onFindNext={findNext}
          onClose={closeFind}
        />
      )}
      {openDialogOpen && (
        <NotesOpenDialog
          notes={notesList}
          currentId={noteId}
          error={openError}
          isOpenElsewhere={(id) => noteWindowsShowing(id, windowId).length > 0}
          onOpen={chooseNote}
          onDelete={requestDelete}
          onClose={closeOpenDialog}
        />
      )}
      {/* Outside the dialogs above, so Escape here does not also close them. */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        id="notes-delete"
        title="Delete note"
        message={
          deleteTarget
            ? `Delete “${deleteTarget.title}”? It is removed from this browser and can't be recovered.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      {aboutOpen && <NotesAboutDialog onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
