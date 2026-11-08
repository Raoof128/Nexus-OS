/**
 * Window rules for Notes: which note a window shows, and which notes are
 * already open in another window. Storage itself is in noteStore.js.
 */
import { useWindowStore } from '../../stores/windowStore'
import {
  addNote,
  linkWindow,
  listNotes,
  readWindowLinks,
  takePendingNote,
  writeWindowLinks,
} from './noteStore'

const isLive = (windowId) => Boolean(useWindowStore.getState().windows[windowId])

/** Drops links of windows that are no longer open. `keepId` is the window mounting now. */
function pruneWindowLinks(keepId) {
  const links = readWindowLinks()
  const stale = Object.keys(links).filter((id) => id !== keepId && !isLive(id))
  if (stale.length === 0) return
  stale.forEach((id) => delete links[id])
  writeWindowLinks(links)
}

/** Ids of other open Notes windows that show `noteId`. */
export function noteWindowsShowing(noteId, exceptWindowId) {
  return Object.entries(readWindowLinks())
    .filter(([windowId, id]) => id === noteId && windowId !== exceptWindowId && isLive(windowId))
    .map(([windowId]) => windowId)
}

/**
 * The note a Notes window shows when it mounts. In order:
 *   1. the note this window already showed (restored layout),
 *   2. the note marked by the share target,
 *   3. the most recently edited note that no other open window shows,
 *   4. a new blank note.
 * Returns null when storage is unavailable; the window then cannot save.
 */
export function resolveWindowNote(windowId) {
  try {
    pruneWindowLinks(windowId)
    const notes = listNotes()
    const known = new Set(notes.map((n) => n.id))
    const links = readWindowLinks()

    const linked = links[windowId]
    if (linked && known.has(linked)) return linked

    let id = null
    const pending = takePendingNote()
    if (pending && known.has(pending)) id = pending

    if (!id) {
      const taken = new Set(
        Object.entries(links)
          .filter(([other]) => other !== windowId && isLive(other))
          .map(([, noteId]) => noteId),
      )
      id = notes.find((n) => !taken.has(n.id))?.id ?? addNote().id
    }

    linkWindow(windowId, id)
    return id
  } catch {
    return null
  }
}

/** Points a window at a note (File → New, File → Open…). */
export function linkNoteToWindow(windowId, noteId) {
  linkWindow(windowId, noteId)
}

// A closed Notes window frees its note. Subscribed once, when this module loads.
useWindowStore.subscribe((state, prev) => {
  const closed = Object.keys(prev.windows).filter((id) => !state.windows[id])
  if (closed.length === 0) return
  const links = readWindowLinks()
  if (!closed.some((id) => id in links)) return
  closed.forEach((id) => delete links[id])
  writeWindowLinks(links)
})
