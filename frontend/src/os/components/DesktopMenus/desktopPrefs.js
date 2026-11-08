// Desktop shell preferences: icon visibility, icon sort order, renamed icon
// labels and the opt-in idle lock. These are per-browser conveniences kept in
// localStorage, never shared state, so every storage access is wrapped: the
// store can be blocked, full or hold junk, and the desktop must still work.
import { useSyncExternalStore } from 'react'

const ICONS_KEY = 'nexus.desktop.icons'
const IDLE_LOCK_KEY = 'nexus.lock.idle'
const MAX_LABEL = 60
const SORTS = ['manual', 'name']

// `revision` is bumped by Refresh so the grid re-measures its work area. It is
// never written to storage.
const DEFAULTS = Object.freeze({
  showIcons: true,
  sort: 'manual',
  hidden: Object.freeze([]),
  labels: Object.freeze({}),
  revision: 0,
})

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  const hidden = Array.isArray(raw.hidden)
    ? [...new Set(raw.hidden.filter((id) => typeof id === 'string'))]
    : []
  const labels = {}
  if (raw.labels && typeof raw.labels === 'object') {
    for (const [id, name] of Object.entries(raw.labels)) {
      if (typeof name === 'string' && name.trim()) labels[id] = name.trim().slice(0, MAX_LABEL)
    }
  }
  return {
    showIcons: raw.showIcons !== false,
    sort: SORTS.includes(raw.sort) ? raw.sort : 'manual',
    hidden,
    labels,
    revision: 0,
  }
}

function readStored() {
  try {
    const raw = window.localStorage.getItem(ICONS_KEY)
    return sanitize(raw ? JSON.parse(raw) : null)
  } catch {
    return sanitize(null)
  }
}

function persist(prefs) {
  // eslint-disable-next-line no-unused-vars -- revision is session-only
  const { revision, ...stored } = prefs
  try {
    window.localStorage.setItem(ICONS_KEY, JSON.stringify(stored))
  } catch {
    // Storage blocked or full: the change still applies for this session.
  }
}

let current = null
const listeners = new Set()

function getSnapshot() {
  if (!current) current = readStored()
  return current
}

function emit() {
  listeners.forEach((listener) => listener())
}

function commit(next, { save = true } = {}) {
  current = next
  if (save) persist(next)
  emit()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Current icon preferences, re-rendering the caller on every change. */
export function useDesktopIconPrefs() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getDesktopIconPrefs() {
  return getSnapshot()
}

/** The label shown for an app icon: the user's rename, or the app's title. */
export function iconTitle(appId, prefs, fallbackTitle = appId) {
  return prefs.labels[appId] || fallbackTitle
}

export function hideDesktopIcon(appId) {
  const cur = getSnapshot()
  if (cur.hidden.includes(appId)) return
  commit({ ...cur, hidden: [...cur.hidden, appId] })
}

export function restoreDesktopIcons() {
  const cur = getSnapshot()
  if (cur.hidden.length === 0) return
  commit({ ...cur, hidden: [] })
}

export function setDesktopIconsShown(shown) {
  const cur = getSnapshot()
  const next = shown !== false
  if (cur.showIcons === next) return
  commit({ ...cur, showIcons: next })
}

export function setDesktopIconSort(sort) {
  const cur = getSnapshot()
  if (!SORTS.includes(sort) || cur.sort === sort) return
  commit({ ...cur, sort })
}

/**
 * Store a new label. An empty name, or one equal to the app's own title,
 * removes the override so the icon goes back to the default label.
 */
export function renameDesktopIcon(appId, name, defaultTitle) {
  const cur = getSnapshot()
  const trimmed = typeof name === 'string' ? name.trim().slice(0, MAX_LABEL) : ''
  const labels = { ...cur.labels }
  if (!trimmed || trimmed === defaultTitle) delete labels[appId]
  else labels[appId] = trimmed
  const unchanged =
    Object.keys(labels).length === Object.keys(cur.labels).length &&
    Object.keys(labels).every((id) => labels[id] === cur.labels[id])
  if (unchanged) return
  commit({ ...cur, labels })
}

/**
 * Refresh: re-measure the icon grid. The in-memory preferences are kept as they
 * are, so changes still apply when storage is blocked or full (re-reading
 * storage there would silently drop them).
 */
export function refreshDesktopIcons() {
  const cur = getSnapshot()
  commit({ ...cur, revision: cur.revision + 1 }, { save: false })
}

/** Ask the icon grid to start an in-place rename (F2 / the Rename command). */
export function requestDesktopIconRename(appId) {
  window.dispatchEvent(new CustomEvent('nexus:desktop-rename', { detail: { appId } }))
}

/** Opt-in idle lock. Off unless the user has switched it on. */
export function isIdleLockEnabled() {
  try {
    return window.localStorage.getItem(IDLE_LOCK_KEY) === '1'
  } catch {
    return false
  }
}

export function setIdleLockEnabled(enabled) {
  try {
    if (enabled) window.localStorage.setItem(IDLE_LOCK_KEY, '1')
    else window.localStorage.removeItem(IDLE_LOCK_KEY)
  } catch {
    // Storage blocked: the lock stays off.
  }
  // Let the running desktop pick the change up without a reload.
  window.dispatchEvent(new CustomEvent('nexus:idle-lock-changed'))
}

/** Test helper: forget the in-memory copy so the next read hits storage. */
export function resetDesktopPrefsCacheForTests() {
  current = null
  emit()
}
