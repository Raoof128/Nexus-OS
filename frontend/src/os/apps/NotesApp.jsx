import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import NotesMenuBar from './Notes/NotesMenuBar'
import { NotesAboutDialog, NotesFindDialog } from './Notes/NotesDialogs'
import { renderMarkdown } from './Notes/markdown'
import {
  findInText,
  formatDateTime,
  insertAt,
  readNotesPrefs,
  writeNotesPrefs,
} from './Notes/noteUtils'

const SAVE_DEBOUNCE_MS = 500

export default function NotesApp({ windowId }) {
  const storageKey = `nexus-os:note-${windowId}`
  const [content, setContent] = useState('')
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

  const textareaRef = useRef(null)
  const saveTimeout = useRef(null)
  const pendingText = useRef(null)
  // Where the caret should land after Time/Date is inserted.
  const pendingCaret = useRef(null)

  // Load on mount
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const saved = JSON.parse(raw)
          if (saved.content) setContent(saved.content)
        }
      } catch {
        // Corrupt data
      }
    })
  }, [storageKey])

  const persist = useCallback(
    (text) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ content: text }))
        return true
      } catch {
        // Storage full or unavailable
        return false
      }
    },
    [storageKey],
  )

  // A typed change is saved after a short pause. Leaving the note saves at once.
  const scheduleSave = useCallback(
    (text) => {
      pendingText.current = text
      setSaveState('pending')
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => {
        saveTimeout.current = null
        const latest = pendingText.current
        pendingText.current = null
        setSaveState(persist(latest) ? 'saved' : 'error')
      }, SAVE_DEBOUNCE_MS)
    },
    [persist],
  )

  const saveNow = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = null
    pendingText.current = null
    setSaveState(persist(content) ? 'saved' : 'error')
  }

  // Clear the timer on unmount, saving any change still waiting for it.
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      if (pendingText.current !== null) persist(pendingText.current)
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
    scheduleSave(text)
  }

  const handleChange = (e) => applyContent(e.target.value)

  const focusEditor = () => {
    if (!preview) textareaRef.current?.focus()
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

  const editing = !preview
  const menus = [
    {
      id: 'file',
      label: 'File',
      items: [
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
      {aboutOpen && <NotesAboutDialog onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
