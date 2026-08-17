import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  Bell,
  Bold,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  Grid2X2,
  Heading1,
  Heading2,
  Indent,
  Italic,
  List,
  ListChecks,
  MoreHorizontal,
  Outdent,
  Palette,
  Pin,
  PinOff,
  Plus,
  Search,
  StickyNote,
  Tag,
  Trash2,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import { apiFetch } from '../../lib/apiClient'
import { useFocusTrap } from '../../hooks/useFocusTrap'

const COLORS = [
  ['default', 'Default', 'border-primary/20 bg-black/25'],
  ['Coral', 'Coral', 'border-rose-400/30 bg-rose-500/12'],
  ['Peach', 'Peach', 'border-orange-300/30 bg-orange-400/12'],
  ['Sand', 'Sand', 'border-amber-200/30 bg-amber-300/12'],
  ['Mint', 'Mint', 'border-emerald-300/30 bg-emerald-400/12'],
  ['Sage', 'Sage', 'border-lime-300/25 bg-lime-400/10'],
  ['Fog', 'Fog', 'border-cyan-200/25 bg-cyan-200/10'],
  ['Storm', 'Storm', 'border-sky-400/25 bg-sky-500/12'],
  ['Dusk', 'Dusk', 'border-violet-400/30 bg-violet-500/14'],
  ['Blossom', 'Blossom', 'border-fuchsia-300/30 bg-fuchsia-400/12'],
  ['Clay', 'Clay', 'border-red-300/25 bg-red-400/10'],
  ['Chalk', 'Chalk', 'border-white/25 bg-white/[0.08]'],
]

const BACKGROUNDS = [
  ['Groceries', 'linear-gradient(135deg, rgba(52,211,153,.16), rgba(8,47,73,.2))'],
  ['Food', 'linear-gradient(135deg, rgba(251,146,60,.15), rgba(190,24,93,.12))'],
  ['Music', 'radial-gradient(circle at top right, rgba(217,70,239,.2), transparent 45%)'],
  ['Recipes', 'linear-gradient(135deg, rgba(250,204,21,.13), rgba(236,72,153,.1))'],
  ['Notes', 'repeating-linear-gradient(0deg, rgba(255,255,255,.055) 0 1px, transparent 1px 26px)'],
  ['Places', 'radial-gradient(circle at 20% 10%, rgba(34,211,238,.18), transparent 38%)'],
  ['Travel', 'linear-gradient(120deg, rgba(59,130,246,.17), rgba(16,185,129,.1))'],
  ['Video', 'linear-gradient(135deg, rgba(99,102,241,.18), rgba(244,63,94,.1))'],
  ['Celebration', 'radial-gradient(circle at 80% 20%, rgba(250,204,21,.22), transparent 32%)'],
]

const NOTE_FILTERS = {
  home: { archived: false, trashed: false },
  archive: { archived: true, trashed: false },
  trash: { archived: false, trashed: true },
}

const HASHTAG_RE = /(^|\s)#([a-z0-9][a-z0-9_-]{0,48})/gi

function noteTitle(note) {
  return note?.title_encrypted || note?.title || ''
}

function noteBody(note) {
  return note?.content_encrypted || note?.content || ''
}

function itemText(item) {
  return item?.text_encrypted || item?.text || ''
}

function normalizeLabelName(value) {
  return value.trim().replace(/^#+/, '').trim()
}

function labelsFor(note) {
  const found = new Map()
  for (const label of note?.labels || []) {
    const name = normalizeLabelName(label.name || label)
    if (name) found.set(name.toLowerCase(), name)
  }
  for (const source of [noteTitle(note), noteBody(note)]) {
    for (const match of source.matchAll(HASHTAG_RE)) {
      found.set(match[2].toLowerCase(), match[2].toLowerCase())
    }
  }
  return [...found.values()].sort((a, b) => a.localeCompare(b))
}

function colorClass(color) {
  return COLORS.find(([id]) => id === color)?.[2] || COLORS[0][2]
}

function notesKey(view) {
  return ['notes', view]
}

function notesPath(view, archivedOverride) {
  const filter = NOTE_FILTERS[view] || NOTE_FILTERS.home
  const params = new URLSearchParams({
    archived: String(archivedOverride ?? filter.archived),
    trashed: String(filter.trashed),
  })
  return `/notes?${params.toString()}`
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
}

function fromDateTimeLocal(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function positionBetween(previous, next, fallback = 1) {
  if (previous && next) return ((previous.position || 0) + (next.position || 0)) / 2
  if (previous) return (previous.position || 0) + 1
  if (next) return (next.position || 0) - 1
  return fallback
}

function isTypingTarget(target) {
  return Boolean(
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
  )
}

function useNotes(view) {
  return useQuery({
    queryKey: notesKey(view),
    queryFn: async () => {
      if (view !== 'trash') return apiFetch(notesPath(view))
      const [activeTrash, archivedTrash] = await Promise.all([
        apiFetch(notesPath(view, false)),
        apiFetch(notesPath(view, true)),
      ])
      return [...(activeTrash || []), ...(archivedTrash || [])]
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

function useNoteLabels() {
  return useQuery({
    queryKey: ['notes', 'labels'],
    queryFn: () => apiFetch('/notes/labels'),
    refetchOnWindowFocus: true,
  })
}

function useNoteItems(noteId, enabled) {
  return useQuery({
    queryKey: ['notes', noteId, 'items'],
    enabled: Boolean(noteId && enabled),
    queryFn: () => apiFetch(`/notes/${noteId}/items`),
    refetchOnWindowFocus: true,
  })
}

function useNoteMutations(view) {
  const qc = useQueryClient()
  const invalidateNotes = () => qc.invalidateQueries({ queryKey: ['notes'] })

  return {
    createNote: useMutation({
      mutationFn: (body) => apiFetch('/notes', { method: 'POST', body }),
      onSettled: invalidateNotes,
    }),
    updateNote: useMutation({
      mutationFn: ({ id, body }) => apiFetch(`/notes/${id}`, { method: 'PATCH', body }),
      onSettled: invalidateNotes,
    }),
    pinNote: useMutation({
      mutationFn: ({ id, pinned }) =>
        apiFetch(`/notes/${id}/pin`, { method: 'POST', body: { pinned } }),
      onMutate: async ({ id, pinned }) => {
        await qc.cancelQueries({ queryKey: notesKey(view) })
        const previous = qc.getQueryData(notesKey(view))
        qc.setQueryData(notesKey(view), (old = []) =>
          old.map((note) => (note.id === id ? { ...note, pinned } : note)),
        )
        return { previous }
      },
      onError: (_error, _vars, ctx) =>
        ctx?.previous && qc.setQueryData(notesKey(view), ctx.previous),
      onSettled: invalidateNotes,
    }),
    archiveNote: useMutation({
      mutationFn: ({ id, archived }) =>
        apiFetch(`/notes/${id}/archive`, { method: 'POST', body: { archived } }),
      onSettled: invalidateNotes,
    }),
    deleteNote: useMutation({
      mutationFn: (id) => apiFetch(`/notes/${id}`, { method: 'DELETE' }),
      onSettled: invalidateNotes,
    }),
    restoreNote: useMutation({
      mutationFn: (id) => apiFetch(`/notes/${id}/restore`, { method: 'POST' }),
      onSettled: invalidateNotes,
    }),
    copyNote: useMutation({
      mutationFn: (id) => apiFetch(`/notes/${id}/copy`, { method: 'POST' }),
      onSettled: invalidateNotes,
    }),
    addItem: useMutation({
      mutationFn: ({ noteId, text }) =>
        apiFetch(`/notes/${noteId}/items`, { method: 'POST', body: { text } }),
      onSettled: (_data, _error, vars) => {
        qc.invalidateQueries({ queryKey: ['notes', vars?.noteId, 'items'] })
      },
    }),
    updateItem: useMutation({
      mutationFn: ({ itemId, body }) =>
        apiFetch(`/notes/items/${itemId}`, { method: 'PATCH', body }),
      onSettled: (_data, _error, vars) => {
        qc.invalidateQueries({ queryKey: ['notes', vars?.noteId, 'items'] })
      },
    }),
    moveItem: useMutation({
      mutationFn: ({ itemId, body }) =>
        apiFetch(`/notes/items/${itemId}/move`, { method: 'POST', body }),
      onSettled: (_data, _error, vars) => {
        qc.invalidateQueries({ queryKey: ['notes', vars?.noteId, 'items'] })
      },
    }),
    deleteItem: useMutation({
      mutationFn: ({ itemId }) => apiFetch(`/notes/items/${itemId}`, { method: 'DELETE' }),
      onSettled: (_data, _error, vars) => {
        qc.invalidateQueries({ queryKey: ['notes', vars?.noteId, 'items'] })
      },
    }),
  }
}

function IconButton({ label, onClick, children, active = false, disabled = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={`rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-35 ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-white/52 hover:bg-white/[0.06] hover:text-primary'
      }`}
    >
      {children}
    </button>
  )
}

function Swatches({ value, onChange, compact = false }) {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Note colors">
      {COLORS.map(([id, label, classes]) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={`Use ${label} color`}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} rounded-full border ${classes} ${
            value === id ? 'ring-2 ring-primary/70' : 'hover:ring-1 hover:ring-white/40'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70`}
        />
      ))}
    </div>
  )
}

function BackgroundPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-md border px-2 py-1 text-left text-[10px] ${
          value ? 'border-white/[0.08] text-white/50' : 'border-primary/40 text-primary'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60`}
      >
        None
      </button>
      {BACKGROUNDS.map(([id, style]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          style={{ background: style }}
          className={`rounded-md border px-2 py-1 text-left text-[10px] text-white/80 ${
            value === id ? 'border-primary/60' : 'border-white/[0.08]'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60`}
        >
          {id}
        </button>
      ))}
    </div>
  )
}

function LabelPicker({ labels, value, onChange, compact = false }) {
  const [draft, setDraft] = useState('')
  const selected = new Set(value.map((name) => name.toLowerCase()))

  const toggle = (name) => {
    const key = name.toLowerCase()
    onChange(
      selected.has(key) ? value.filter((item) => item.toLowerCase() !== key) : [...value, name],
    )
  }

  const addDraft = () => {
    const name = normalizeLabelName(draft)
    if (!name) return
    if (!selected.has(name.toLowerCase())) onChange([...value, name])
    setDraft('')
  }

  return (
    <div
      className={compact ? 'space-y-2' : 'rounded-lg border border-white/[0.08] bg-black/20 p-2'}
    >
      <div className="flex items-center gap-2">
        <Tag size={13} className="text-primary/70" />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addDraft()
            }
          }}
          placeholder="Add label"
          aria-label="Add label"
          className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        />
        <button
          type="button"
          onClick={addDraft}
          className="rounded-md border border-primary/30 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Add
        </button>
      </div>
      {labels.length ? (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((label) => {
            const name = label.name || label
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                aria-pressed={selected.has(name.toLowerCase())}
                className={`rounded-full border px-2 py-0.5 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  selected.has(name.toLowerCase())
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-white/[0.08] text-white/55 hover:text-white'
                }`}
              >
                #{name}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function FormatToolbar({ onFormat }) {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Formatting controls">
      {[
        ['Bold', Bold, 'bold'],
        ['Italic', Italic, 'italic'],
        ['Underline', Underline, 'underline'],
        ['Heading 1', Heading1, 'h1'],
        ['Heading 2', Heading2, 'h2'],
      ].map(([label, Icon, mode]) => (
        <IconButton key={mode} label={label} onClick={() => onFormat(mode)}>
          <Icon size={14} />
        </IconButton>
      ))}
    </div>
  )
}

function QuickCapture({ onCreate, labels, disabled }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState('text')
  const [color, setColor] = useState('default')
  const [noteLabels, setNoteLabels] = useState([])
  const [reminderAt, setReminderAt] = useState('')
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim() && !content.trim()) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      await onCreate({
        title: title.trim() || null,
        content: content.trim() || null,
        type,
        color,
        background: null,
        labels: noteLabels,
        reminder_at: fromDateTimeLocal(reminderAt),
      })
      setTitle('')
      setContent('')
      setType('text')
      setColor('default')
      setNoteLabels([])
      setReminderAt('')
      setOpen(false)
    } catch (error) {
      setSubmitError(error?.message || 'Unable to create note')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="glass-panel mx-auto w-full max-w-3xl rounded-xl border border-primary/20 p-3 shadow-[0_0_30px_rgba(34,211,238,.08)]"
    >
      <div className="flex items-center gap-2">
        <Plus size={16} className="text-primary" />
        <input
          value={title}
          onFocus={() => setOpen(true)}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Take a note..."
          aria-label="New note title"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
        />
        <button
          type="button"
          aria-label="Create checklist note"
          aria-pressed={type === 'list'}
          onClick={() => {
            setOpen(true)
            setType((current) => (current === 'list' ? 'text' : 'list'))
          }}
          className={`rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
            type === 'list' ? 'bg-primary/15 text-primary' : 'text-white/45 hover:text-white'
          }`}
        >
          <ListChecks size={16} />
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          {submitError ? (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {submitError}
            </p>
          ) : null}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              type === 'list' ? 'Add checklist details or #labels' : 'Write a note or add #labels'
            }
            aria-label="New note body"
            rows={3}
            className="w-full resize-none rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
          <div className="grid gap-3 @md:grid-cols-[1fr_auto]">
            <LabelPicker labels={labels} value={noteLabels} onChange={setNoteLabels} compact />
            <label className="flex items-center gap-2 text-[11px] text-white/55">
              <Bell size={13} className="text-primary/70" />
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                aria-label="New note reminder"
                className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Swatches value={color} onChange={setColor} compact />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={disabled || submitting || (!title.trim() && !content.trim())}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-40"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  )
}

function NoteCard({
  note,
  focused,
  selected,
  onFocusNote,
  onOpen,
  onPin,
  onArchive,
  onDelete,
  onRestore,
  onCopy,
  onToggleSelect,
  viewMode,
  view,
}) {
  const labels = labelsFor(note)
  const background = BACKGROUNDS.find(([id]) => id === note.background)?.[1]
  const isTrash = view === 'trash'

  return (
    <article
      data-note-id={note.id}
      tabIndex={0}
      onFocus={() => onFocusNote(note.id)}
      className={`group mb-3 break-inside-avoid rounded-xl border p-3 text-left transition-all hover:border-primary/35 hover:shadow-[0_0_24px_rgba(34,211,238,.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${colorClass(
        note.color,
      )} ${selected || focused ? 'ring-2 ring-primary/60' : ''} ${
        viewMode === 'list' ? 'mx-auto max-w-3xl' : ''
      }`}
      style={background ? { backgroundImage: background } : undefined}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/45">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(note.id)}
            aria-label={`Select note "${noteTitle(note) || 'Untitled'}"`}
            className="accent-cyan-300"
          />
          Select
        </label>
        {note.pinned ? (
          <Pin size={14} className="shrink-0 text-primary" fill="currentColor" />
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onOpen(note)}
        className="block w-full rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <h3 className="heading-ui min-w-0 text-sm font-semibold text-white">
          {noteTitle(note) || 'Untitled'}
        </h3>
        {note.type === 'list' ? (
          <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-white/55">
            <ListChecks size={13} />
            Checklist note
          </p>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/68 line-clamp-6">
            {noteBody(note) || 'No body'}
          </p>
        )}
      </button>

      {labels.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary/80"
            >
              #{label}
            </span>
          ))}
        </div>
      ) : null}

      {note.reminder_at ? (
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-amber-200/80">
          <Bell size={12} />
          {new Date(note.reminder_at).toLocaleString()}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 opacity-75 transition-opacity group-hover:opacity-100">
        <div className="font-mono text-[9px] uppercase tracking-wider text-white/35">
          {note.updated_at ? new Date(note.updated_at).toLocaleDateString() : 'Draft'}
        </div>
        <div className="flex items-center gap-1">
          {isTrash ? (
            <IconButton label="Restore note" onClick={() => onRestore(note.id)}>
              <Undo2 size={14} />
            </IconButton>
          ) : (
            <>
              <IconButton
                label={note.pinned ? 'Unpin note' : 'Pin note'}
                onClick={() => onPin(note)}
              >
                {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </IconButton>
              <IconButton
                label={note.archived ? 'Unarchive note' : 'Archive note'}
                onClick={() => onArchive(note)}
              >
                {note.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </IconButton>
              <IconButton label="Copy note" onClick={() => onCopy(note.id)}>
                <Copy size={14} />
              </IconButton>
              <IconButton label="Move to trash" onClick={() => onDelete(note.id)}>
                <Trash2 size={14} />
              </IconButton>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function BulkToolbar({
  selectedNotes,
  labels,
  onClear,
  onBulkColor,
  onBulkLabels,
  onBulkPin,
  onBulkArchive,
  onBulkDelete,
}) {
  const [labelDraft, setLabelDraft] = useState([])
  if (!selectedNotes.length) return null
  const allPinned = selectedNotes.every((note) => note.pinned)
  const allArchived = selectedNotes.every((note) => note.archived)

  return (
    <div className="sticky top-0 z-10 mb-3 rounded-xl border border-primary/25 bg-black/80 p-3 shadow-[0_0_30px_rgba(34,211,238,.12)] backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-primary">{selectedNotes.length} selected</span>
        <Swatches value="default" compact onChange={onBulkColor} />
        <LabelPicker labels={labels} value={labelDraft} onChange={setLabelDraft} compact />
        <button
          type="button"
          onClick={() => {
            onBulkLabels(labelDraft)
            setLabelDraft([])
          }}
          className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Apply labels
        </button>
        <IconButton
          label={allPinned ? 'Unpin selected' : 'Pin selected'}
          onClick={() => onBulkPin(!allPinned)}
        >
          {allPinned ? <PinOff size={15} /> : <Pin size={15} />}
        </IconButton>
        <IconButton
          label={allArchived ? 'Unarchive selected' : 'Archive selected'}
          onClick={() => onBulkArchive(!allArchived)}
        >
          {allArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        </IconButton>
        <IconButton label="Trash selected" onClick={onBulkDelete}>
          <Trash2 size={15} />
        </IconButton>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs text-white/55 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

function NoteEditor({ note, labels, onClose, onSave, mutations }) {
  const [title, setTitle] = useState(noteTitle(note))
  const [content, setContent] = useState(noteBody(note))
  const [color, setColor] = useState(note.color || 'default')
  const [background, setBackground] = useState(note.background || null)
  const [noteLabels, setNoteLabels] = useState(labelsFor(note))
  const [reminderAt, setReminderAt] = useState(toDateTimeLocal(note.reminder_at))
  const [newItem, setNewItem] = useState('')
  const [dragItemId, setDragItemId] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)
  const trapRef = useFocusTrap(true)
  const { data: items = [], isLoading } = useNoteItems(note.id, note.type === 'list')

  const save = async () => {
    setSaveError(null)
    setSaving(true)
    try {
      await onSave(note.id, {
        title: title.trim() || null,
        content: content.trim() || null,
        color,
        background,
        labels: noteLabels,
        reminder_at: fromDateTimeLocal(reminderAt),
      })
      onClose()
    } catch (error) {
      setSaveError(error?.message || 'Unable to update note')
    } finally {
      setSaving(false)
    }
  }

  const applyFormat = (mode) => {
    const input = textareaRef.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    const selected = content.slice(start, end) || 'text'
    const wrappers = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      underline: ['<u>', '</u>'],
      h1: ['# ', ''],
      h2: ['## ', ''],
    }
    const [prefix, suffix] = wrappers[mode]
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`
    setContent(next)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    })
  }

  const orderedItems = useMemo(() => {
    const active = items.filter((item) => !item.checked)
    const checked = items.filter((item) => item.checked)
    return [...active, ...checked].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1
      return (a.position || 0) - (b.position || 0)
    })
  }, [items])

  const moveItem = (item, direction) => {
    const index = orderedItems.findIndex((candidate) => candidate.id === item.id)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedItems.length) return
    const reordered = [...orderedItems]
    const [moving] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moving)
    mutations.moveItem.mutate({
      noteId: note.id,
      itemId: item.id,
      body: {
        position: positionBetween(
          reordered[targetIndex - 1],
          reordered[targetIndex + 1],
          item.position || 1,
        ),
      },
    })
  }

  const dropOn = (target) => {
    const source = orderedItems.find((item) => item.id === dragItemId)
    if (!source || source.id === target.id) return
    const targetIndex = orderedItems.findIndex((item) => item.id === target.id)
    mutations.moveItem.mutate({
      noteId: note.id,
      itemId: source.id,
      body: {
        position: positionBetween(orderedItems[targetIndex - 1], target, source.position || 1),
      },
    })
    setDragItemId(null)
  }

  const uncheckAll = () => {
    orderedItems
      .filter((item) => item.checked)
      .forEach((item) =>
        mutations.updateItem.mutate({ noteId: note.id, itemId: item.id, body: { checked: false } }),
      )
  }

  const deleteChecked = () => {
    orderedItems
      .filter((item) => item.checked)
      .forEach((item) => mutations.deleteItem.mutate({ noteId: note.id, itemId: item.id }))
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '8') {
      e.preventDefault()
      onSave(note.id, { type: note.type === 'list' ? 'text' : 'list' })
      onClose()
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm">
      <section
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-title"
        onKeyDown={onKeyDown}
        className={`glass-panel flex max-h-full w-full max-w-2xl flex-col rounded-xl border p-4 ${colorClass(color)}`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="note-editor-title" className="heading-display text-sm text-primary">
            Edit note
          </h2>
          <button
            type="button"
            aria-label="Close editor"
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X size={16} />
          </button>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          aria-label="Note title"
          className="mt-3 bg-transparent text-lg font-semibold text-white placeholder:text-white/30 focus:outline-none"
        />
        {saveError ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {saveError}
          </p>
        ) : null}

        {note.type === 'list' ? (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-2 flex flex-wrap items-center gap-1">
              <IconButton
                label="Hide checkboxes"
                onClick={() => {
                  onSave(note.id, { type: 'text' })
                  onClose()
                }}
              >
                <CheckSquare size={14} />
              </IconButton>
              <button
                type="button"
                onClick={uncheckAll}
                className="rounded-md px-2 py-1 text-[11px] text-white/55 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                Uncheck all
              </button>
              <button
                type="button"
                onClick={deleteChecked}
                className="rounded-md px-2 py-1 text-[11px] text-red-200/80 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
              >
                Delete checked
              </button>
            </div>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading checklist...</p>
            ) : null}
            {orderedItems.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDragItemId(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(item)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                  item.checked ? 'text-white/35 line-through' : 'text-white/80'
                }`}
                style={{ paddingLeft: item.parent_id ? 28 : 8 }}
              >
                <MoreHorizontal size={13} className="cursor-grab text-white/25" />
                <input
                  type="checkbox"
                  aria-label={`Mark "${itemText(item) || 'checklist item'}" complete`}
                  checked={item.checked}
                  onChange={(e) =>
                    mutations.updateItem.mutate({
                      noteId: note.id,
                      itemId: item.id,
                      body: { checked: e.target.checked },
                    })
                  }
                  className="accent-cyan-300"
                />
                <input
                  value={itemText(item)}
                  onChange={(e) =>
                    mutations.updateItem.mutate({
                      noteId: note.id,
                      itemId: item.id,
                      body: { text: e.target.value },
                    })
                  }
                  aria-label="Checklist item text"
                  className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                />
                <IconButton
                  label="Move item up"
                  disabled={index === 0}
                  onClick={() => moveItem(item, 'up')}
                >
                  <ChevronUp size={13} />
                </IconButton>
                <IconButton
                  label="Move item down"
                  disabled={index === orderedItems.length - 1}
                  onClick={() => moveItem(item, 'down')}
                >
                  <ChevronDown size={13} />
                </IconButton>
                <IconButton
                  label="Indent item"
                  disabled={index === 0 || Boolean(item.parent_id)}
                  onClick={() =>
                    mutations.moveItem.mutate({
                      noteId: note.id,
                      itemId: item.id,
                      body: { parent_id: orderedItems[index - 1]?.id },
                    })
                  }
                >
                  <Indent size={13} />
                </IconButton>
                <IconButton
                  label="Outdent item"
                  disabled={!item.parent_id}
                  onClick={() =>
                    mutations.moveItem.mutate({
                      noteId: note.id,
                      itemId: item.id,
                      body: { parent_id: null },
                    })
                  }
                >
                  <Outdent size={13} />
                </IconButton>
                <IconButton
                  label="Delete checklist item"
                  onClick={() => mutations.deleteItem.mutate({ noteId: note.id, itemId: item.id })}
                >
                  <X size={13} />
                </IconButton>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newItem.trim()) return
                mutations.addItem.mutate({ noteId: note.id, text: newItem.trim() })
                setNewItem('')
              }}
              className="mt-2 flex items-center gap-2"
            >
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="List item"
                aria-label="New checklist item"
                className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <button
                type="submit"
                className="rounded-lg border border-primary/30 px-3 py-2 text-xs text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                Add
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between gap-2">
              <FormatToolbar onFormat={applyFormat} />
              <IconButton
                label="Show checkboxes"
                onClick={() => {
                  onSave(note.id, { type: 'list' })
                  onClose()
                }}
              >
                <CheckSquare size={14} />
              </IconButton>
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Note"
              aria-label="Note body"
              rows={8}
              className="mt-2 min-h-0 flex-1 resize-none rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-sm leading-relaxed text-white/80 placeholder:text-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </>
        )}

        <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-3">
          <div className="grid gap-3 @md:grid-cols-2">
            <LabelPicker labels={labels} value={noteLabels} onChange={setNoteLabels} />
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-2">
                <Bell size={13} />
                Reminder
              </span>
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                aria-label="Reminder"
                className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm normal-case tracking-normal text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
          </div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Palette size={13} />
            Color
          </div>
          <Swatches value={color} onChange={setColor} />
          <BackgroundPicker value={background} onChange={setBackground} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs text-white/60 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-black hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default function NotesApp() {
  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const [view, setView] = useState('home')
  const [viewMode, setViewMode] = useState('grid')
  const [query, setQuery] = useState('')
  const [activeLabel, setActiveLabel] = useState(null)
  const [editing, setEditing] = useState(null)
  const [focusedId, setFocusedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const { data: notes = [], isLoading, error } = useNotes(view)
  const { data: serverLabels = [] } = useNoteLabels()
  const mutations = useNoteMutations(view)

  const allLabels = useMemo(() => {
    const found = new Map()
    for (const label of serverLabels) found.set(label.name.toLowerCase(), label.name)
    notes.forEach((note) =>
      labelsFor(note).forEach((label) => found.set(label.toLowerCase(), label)),
    )
    return [...found.values()].sort((a, b) => a.localeCompare(b))
  }, [notes, serverLabels])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return notes
      .filter((note) => {
        const labels = labelsFor(note)
        if (
          activeLabel &&
          !labels.some((label) => label.toLowerCase() === activeLabel.toLowerCase())
        )
          return false
        if (!needle) return true
        return [
          noteTitle(note),
          noteBody(note),
          note.color,
          note.background,
          note.type,
          labels.join(' '),
          note.reminder_at,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.position || 0) - (b.position || 0))
  }, [notes, query, activeLabel])

  const selectedNotes = useMemo(
    () => notes.filter((note) => selectedIds.has(note.id)),
    [notes, selectedIds],
  )
  const pinned = filtered.filter((note) => note.pinned)
  const others = filtered.filter((note) => !note.pinned)
  const currentTitle = view === 'archive' ? 'Archive' : view === 'trash' ? 'Trash' : 'Notes'
  const focusedNote = filtered.find((note) => note.id === focusedId) || filtered[0] || null

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const focusByIndex = useCallback(
    (index) => {
      if (!filtered.length) return
      const bounded = (index + filtered.length) % filtered.length
      const note = filtered[bounded]
      setFocusedId(note.id)
      requestAnimationFrame(() => {
        rootRef.current?.querySelector(`[data-note-id="${note.id}"]`)?.focus()
      })
    },
    [filtered],
  )

  useEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    const onKey = (e) => {
      if (editing || isTypingTarget(e.target)) {
        if (e.key === '/' && !editing) e.preventDefault()
        return
      }
      const index = filtered.findIndex((note) => note.id === (focusedId || focusedNote?.id))
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'j') {
        e.preventDefault()
        focusByIndex(index + 1)
      } else if (e.key === 'k') {
        e.preventDefault()
        focusByIndex(index - 1)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setViewMode((mode) => (mode === 'grid' ? 'list' : 'grid'))
      } else if ((e.key === 'Enter' || e.key === ' ') && focusedNote) {
        e.preventDefault()
        setEditing(focusedNote)
      } else if (e.key === 'x' && focusedNote) {
        e.preventDefault()
        toggleSelected(focusedNote.id)
      } else if (e.key === 'f' && focusedNote) {
        e.preventDefault()
        mutations.pinNote.mutate({ id: focusedNote.id, pinned: !focusedNote.pinned })
      } else if (e.key === 'e' && focusedNote) {
        e.preventDefault()
        mutations.archiveNote.mutate({ id: focusedNote.id, archived: !focusedNote.archived })
      } else if ((e.key === '#' || e.key === 'd') && focusedNote) {
        e.preventDefault()
        mutations.deleteNote.mutate(focusedNote.id)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [editing, filtered, focusByIndex, focusedId, focusedNote, mutations])

  const bulkUpdate = async (buildBody) => {
    await Promise.all(
      selectedNotes.map((note) =>
        mutations.updateNote.mutateAsync({ id: note.id, body: buildBody(note) }),
      ),
    )
    setSelectedIds(new Set())
  }

  const bulkLabels = (labels) => {
    if (!labels.length) return
    bulkUpdate((note) => ({ labels: [...new Set([...labelsFor(note), ...labels])] }))
  }

  const noteActions = {
    onOpen: setEditing,
    onFocusNote: setFocusedId,
    onPin: (note) => mutations.pinNote.mutate({ id: note.id, pinned: !note.pinned }),
    onArchive: (note) => mutations.archiveNote.mutate({ id: note.id, archived: !note.archived }),
    onDelete: (id) => mutations.deleteNote.mutate(id),
    onRestore: (id) => mutations.restoreNote.mutate(id),
    onCopy: (id) => mutations.copyNote.mutate(id),
    onToggleSelect: toggleSelected,
  }

  const renderSection = (title, list) =>
    list.length ? (
      <section className="mb-5">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">
          {title}
        </h3>
        <div
          className={
            viewMode === 'grid' ? 'columns-1 gap-3 @md:columns-2 @xl:columns-3' : 'space-y-3'
          }
        >
          {list.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              viewMode={viewMode}
              view={view}
              focused={focusedId === note.id}
              selected={selectedIds.has(note.id)}
              {...noteActions}
            />
          ))}
        </div>
      </section>
    ) : null

  return (
    <div ref={rootRef} className="relative flex h-full w-full overflow-hidden text-white">
      <div
        className="contents"
        inert={editing ? true : undefined}
        aria-hidden={editing ? 'true' : undefined}
      >
        <aside className="hidden w-48 shrink-0 border-r border-white/[0.06] bg-black/20 p-3 @lg:block">
          <div className="heading-display mb-4 flex items-center gap-2 text-primary">
            <StickyNote size={17} />
            Notes
          </div>
          <nav className="space-y-1" aria-label="Notes views">
            {[
              ['home', StickyNote, 'Notes'],
              ['archive', Archive, 'Archive'],
              ['trash', Trash2, 'Trash'],
            ].map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setView(id)
                  setActiveLabel(null)
                  setSelectedIds(new Set())
                }}
                aria-current={view === id ? 'page' : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  view === id
                    ? 'bg-primary/15 text-primary'
                    : 'text-white/65 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
          {allLabels.length ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-white/35">
                <Tag size={12} />
                Labels
              </div>
              <div className="space-y-1">
                {allLabels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActiveLabel((current) => (current === label ? null : label))}
                    aria-pressed={activeLabel === label}
                    className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      activeLabel === label
                        ? 'bg-primary/15 text-primary'
                        : 'text-white/55 hover:text-white'
                    }`}
                  >
                    #{label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-black/15 px-3 py-2">
            <h2 className="heading-display mr-auto text-base text-white">{currentTitle}</h2>
            <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-1.5 @sm:max-w-sm">
              <Search size={14} className="text-white/35" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes"
                aria-label="Search notes"
                className="min-w-0 flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/30 focus:outline-none"
              />
            </label>
            <button
              type="button"
              aria-label={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              onClick={() => setViewMode((mode) => (mode === 'grid' ? 'list' : 'grid'))}
              className="rounded-lg p-2 text-white/55 hover:bg-white/[0.06] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {viewMode === 'grid' ? <List size={16} /> : <Grid2X2 size={16} />}
            </button>
            <nav
              aria-label="Mobile notes views"
              className="flex w-full items-center gap-1 overflow-x-auto @lg:hidden"
            >
              {[
                ['home', 'Notes'],
                ['archive', 'Archive'],
                ['trash', 'Trash'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setView(id)
                    setActiveLabel(null)
                    setSelectedIds(new Set())
                  }}
                  aria-current={view === id ? 'page' : undefined}
                  className={`min-h-11 rounded-lg px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    view === id ? 'bg-primary/15 text-primary' : 'text-white/65 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
              {allLabels.length ? (
                <select
                  value={activeLabel || ''}
                  onChange={(event) => setActiveLabel(event.target.value || null)}
                  aria-label="Filter notes by label"
                  className="ml-auto min-h-11 min-w-28 rounded-lg border border-white/[0.08] bg-black/40 px-2 text-xs text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <option value="">All labels</option>
                  {allLabels.map((label) => (
                    <option key={label} value={label} className="bg-zinc-900">
                      #{label}
                    </option>
                  ))}
                </select>
              ) : null}
            </nav>
          </header>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-3 @sm:p-4">
            <BulkToolbar
              selectedNotes={selectedNotes}
              labels={allLabels}
              onClear={() => setSelectedIds(new Set())}
              onBulkColor={(color) => bulkUpdate(() => ({ color }))}
              onBulkLabels={bulkLabels}
              onBulkPin={async (pinned) => {
                await Promise.all(
                  selectedNotes.map((note) =>
                    mutations.pinNote.mutateAsync({ id: note.id, pinned }),
                  ),
                )
                setSelectedIds(new Set())
              }}
              onBulkArchive={async (archived) => {
                await Promise.all(
                  selectedNotes.map((note) =>
                    mutations.archiveNote.mutateAsync({ id: note.id, archived }),
                  ),
                )
                setSelectedIds(new Set())
              }}
              onBulkDelete={async () => {
                await Promise.all(
                  selectedNotes.map((note) => mutations.deleteNote.mutateAsync(note.id)),
                )
                setSelectedIds(new Set())
              }}
            />

            {view === 'home' ? (
              <QuickCapture
                labels={allLabels}
                disabled={mutations.createNote.isPending}
                onCreate={(payload) => mutations.createNote.mutateAsync(payload)}
              />
            ) : null}

            {error ? (
              <div className="mx-auto mt-6 max-w-xl rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
                {error.message || 'Unable to load notes.'}
              </div>
            ) : isLoading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading notes...</p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                <StickyNote size={32} className="opacity-35" />
                <p className="text-sm">
                  {query || activeLabel
                    ? 'No matching notes.'
                    : `No ${currentTitle.toLowerCase()} yet.`}
                </p>
              </div>
            ) : (
              <div className="mx-auto mt-4 w-full max-w-6xl">
                {renderSection('Pinned', pinned)}
                {renderSection(pinned.length ? 'Others' : currentTitle, others)}
              </div>
            )}
          </div>
        </main>
      </div>

      {editing ? (
        <NoteEditor
          key={editing.id}
          note={editing}
          labels={allLabels}
          mutations={mutations}
          onClose={() => setEditing(null)}
          onSave={(id, body) => mutations.updateNote.mutateAsync({ id, body })}
        />
      ) : null}
    </div>
  )
}
