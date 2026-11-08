/**
 * Notes storage. A note is a document with its own id. Any Notes window can
 * open a note, and a note outlives the window that edited it.
 *
 * Everything lives in this browser and belongs to one account (see
 * lib/privateState.js), so every key uses a prefix that is wiped on an account
 * switch: 'nexus-os:notes:' (or the legacy 'nexus-os:note-').
 *
 *   nexus-os:notes:index      { version: 1, notes: [{ id, title, updatedAt }] }
 *   nexus-os:notes:<noteId>   { content }
 *   nexus-os:notes:windows    { [windowId]: noteId }   the note each window shows
 *   nexus-os:notes:pending    noteId the next Notes window should open (share target)
 *
 * The functions here touch storage only. Writes that fail throw, so the caller
 * can say so. Window rules (which note a new window gets) live in noteWindows.js.
 */
import { nanoid } from 'nanoid'
import { ownsLocalState } from '../../../lib/localOwner'

export const UNTITLED = 'Untitled'
export const INDEX_KEY = 'nexus-os:notes:index'
export const WINDOWS_KEY = 'nexus-os:notes:windows'
export const PENDING_KEY = 'nexus-os:notes:pending'

// Every note write goes through here. A tab left signed in as a previous
// account (another tab claimed the browser for a new one) must not write notes
// back; throwing surfaces as the normal "could not save" path.
function ownedSetItem(key, value) {
  if (!ownsLocalState()) throw new Error('Signed in as another account in a different tab.')
  localStorage.setItem(key, value)
}

const BODY_PREFIX = 'nexus-os:notes:'
const LEGACY_PREFIX = 'nexus-os:note-'
const RESERVED_KEYS = new Set([INDEX_KEY, WINDOWS_KEY, PENDING_KEY])
const TITLE_MAX = 80
const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/

/** A note's name: its first non-blank line, or 'Untitled'. */
export function deriveTitle(content) {
  const line = String(content ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (!line) return UNTITLED
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line
}

const noteKey = (id) => `${BODY_PREFIX}${id}`

function readRaw(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

function restoreRaw(key, raw) {
  try {
    if (raw === null) localStorage.removeItem(key)
    else ownedSetItem(key, raw)
  } catch {
    // Best effort: the failed write is already reported to the caller.
  }
}

function isIndexEntry(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    ID_PATTERN.test(entry.id) &&
    typeof entry.title === 'string' &&
    Number.isFinite(entry.updatedAt)
  )
}

// valid=false means the stored index is unreadable. Nothing is swept or
// migrated then, so no note body is ever removed on a guess.
function parseIndex(raw) {
  if (raw === null) return { valid: true, notes: [] }
  try {
    const data = JSON.parse(raw)
    if (Array.isArray(data?.notes)) {
      return { valid: true, notes: data.notes.filter(isIndexEntry) }
    }
  } catch {
    // Fall through to invalid.
  }
  return { valid: false, notes: [] }
}

function writeIndex(notes) {
  ownedSetItem(INDEX_KEY, JSON.stringify({ version: 1, notes }))
}

function bodyText(raw) {
  if (raw === null) return ''
  try {
    const data = JSON.parse(raw)
    return typeof data?.content === 'string' ? data.content : ''
  } catch {
    return ''
  }
}

function writeBody(id, content) {
  ownedSetItem(noteKey(id), JSON.stringify({ content }))
}

function readWindowLinksRaw() {
  try {
    const data = JSON.parse(readRaw(WINDOWS_KEY) ?? '{}')
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/** Which note each window shows. Empty map when nothing is linked. */
export function readWindowLinks() {
  return readWindowLinksRaw()
}

/** Replaces the window map. An empty map removes the key. */
export function writeWindowLinks(links) {
  try {
    if (Object.keys(links).length === 0) localStorage.removeItem(WINDOWS_KEY)
    else ownedSetItem(WINDOWS_KEY, JSON.stringify(links))
  } catch {
    // Storage unavailable: windows fall back to a note on their next mount.
  }
}

/** Points a window at a note. Best effort, like writeWindowLinks. */
export function linkWindow(windowId, noteId) {
  const links = readWindowLinksRaw()
  links[windowId] = noteId
  writeWindowLinks(links)
}

// Legacy 'nexus-os:note-<windowId>' keys become notes, once. A legacy note is
// linked to the window it came from, so a restored layout shows the same text.
// Empty legacy notes are dropped. Legacy keys go only after the new data is
// written, so a failed migration can be retried.
function migrateLegacyNotes() {
  let legacyKeys = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(LEGACY_PREFIX)) legacyKeys.push(key)
    }
  } catch {
    return
  }
  if (legacyKeys.length === 0) return

  const { valid, notes } = parseIndex(readRaw(INDEX_KEY))
  if (!valid) return

  const now = Date.now()
  const created = []
  const links = readWindowLinksRaw()
  const written = []
  try {
    legacyKeys.forEach((key) => {
      const content = bodyText(readRaw(key))
      if (!content.trim()) return
      const entry = { id: nanoid(12), title: deriveTitle(content), updatedAt: now }
      writeBody(entry.id, content)
      written.push(entry.id)
      created.push(entry)
      const windowId = key.slice(LEGACY_PREFIX.length)
      if (!links[windowId]) links[windowId] = entry.id
    })
    writeIndex([...created, ...notes])
  } catch {
    written.forEach((id) => removeKey(noteKey(id)))
    return
  }
  writeWindowLinks(links)
  legacyKeys.forEach(removeKey)
}

// Removes note bodies that no index entry refers to (ARCH-04: nothing orphaned).
function sweepOrphans(known) {
  const ids = new Set(known.map((n) => n.id))
  const doomed = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (
        key?.startsWith(BODY_PREFIX) &&
        !RESERVED_KEYS.has(key) &&
        !ids.has(key.slice(BODY_PREFIX.length))
      ) {
        doomed.push(key)
      }
    }
  } catch {
    return
  }
  doomed.forEach(removeKey)
}

function loadIndex() {
  migrateLegacyNotes()
  const { valid, notes } = parseIndex(readRaw(INDEX_KEY))
  if (valid) sweepOrphans(notes)
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Saved notes, newest edit first. Entries carry no content. */
export function listNotes() {
  return loadIndex()
}

/** A note with its content, or null when it does not exist. */
export function getNote(id) {
  const entry = loadIndex().find((n) => n.id === id)
  if (!entry) return null
  return { ...entry, content: bodyText(readRaw(noteKey(id))) }
}

/** Creates a note. Throws when storage refuses the write. */
export function addNote({ content = '' } = {}) {
  const notes = loadIndex()
  const entry = { id: nanoid(12), title: deriveTitle(content), updatedAt: Date.now() }
  writeBody(entry.id, content)
  try {
    writeIndex([entry, ...notes])
  } catch (error) {
    removeKey(noteKey(entry.id))
    throw error
  }
  return { ...entry, content }
}

/**
 * Saves a note's text. Unchanged text writes nothing and keeps the edit time.
 * Throws when the note is gone or storage refuses the write.
 */
export function saveNote(id, content) {
  const notes = loadIndex()
  const entry = notes.find((n) => n.id === id)
  if (!entry) throw new Error('This note was deleted.')
  const before = readRaw(noteKey(id))
  if (bodyText(before) === content) return entry

  const next = { ...entry, title: deriveTitle(content), updatedAt: Date.now() }
  writeBody(id, content)
  try {
    writeIndex(notes.map((n) => (n.id === id ? next : n)))
  } catch (error) {
    restoreRaw(noteKey(id), before)
    throw error
  }
  return next
}

/** Deletes a note and any window link to it. Throws when storage refuses. */
export function deleteNote(id) {
  const notes = loadIndex()
  writeIndex(notes.filter((n) => n.id !== id))
  removeKey(noteKey(id))
  const links = readWindowLinksRaw()
  const kept = Object.fromEntries(Object.entries(links).filter(([, noteId]) => noteId !== id))
  writeWindowLinks(kept)
}

/**
 * Creates a note from shared content and marks it as the one the next Notes
 * window opens (the Web Share Target path). The title, when given, becomes the
 * note's first line.
 */
export function createNote({ title = '', content = '' } = {}) {
  const head = String(title ?? '').trim()
  const body = String(content ?? '')
  const text = head && body ? `${head}\n\n${body}` : head || body
  const note = addNote({ content: text })
  try {
    ownedSetItem(PENDING_KEY, note.id)
  } catch {
    // The note is saved; only the auto-open is lost.
  }
  return note
}

/** Returns and clears the note marked for the next Notes window, if any. */
export function takePendingNote() {
  const id = readRaw(PENDING_KEY)
  removeKey(PENDING_KEY)
  return id && ID_PATTERN.test(id) ? id : null
}
