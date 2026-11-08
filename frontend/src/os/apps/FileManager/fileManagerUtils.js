// Pure helpers for the File Manager. No React and no store access here, so the
// rules (names, sorting, history, type labels) can be unit tested directly.

export const ROOT_PATH = '/'
export const ROOT_LABEL = 'Nexus Drive'
export const APP_TITLE = 'File Manager'
export const MAX_HISTORY = 50

export const EMPTY_SELECTION = Object.freeze({ names: [], cursor: null, anchor: null })

// Explorer type names for common extensions. Anything else reads "<EXT> File",
// which is what Windows shows for an unregistered extension.
const TYPE_NAMES = {
  txt: 'Text Document',
  pdf: 'PDF File',
  png: 'PNG image',
  jpg: 'JPEG image',
  jpeg: 'JPEG image',
  gif: 'GIF image',
  webp: 'WebP image',
}

export function buildEntryPath(parentPath, name) {
  return parentPath === ROOT_PATH ? `/${name}` : `${parentPath}/${name}`
}

export function parentPathOf(path) {
  if (path === ROOT_PATH) return null
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? ROOT_PATH : path.slice(0, cut)
}

export function pathSegments(path) {
  return path.split('/').filter(Boolean)
}

// '/documents/sub' -> ['/', '/documents', '/documents/sub']
export function pathChain(path) {
  const chain = [ROOT_PATH]
  let acc = ''
  for (const segment of pathSegments(path)) {
    acc += `/${segment}`
    chain.push(acc)
  }
  return chain
}

// Window title follows the folder: the folder name, or "File Manager" at the root.
export function folderTitle(path) {
  const segments = pathSegments(path)
  return segments.length ? segments[segments.length - 1] : APP_TITLE
}

export function typeLabel(name, isFolder) {
  if (isFolder) return 'File folder'
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'File'
  const ext = name.slice(dot + 1).toLowerCase()
  if (!ext) return 'File'
  return TYPE_NAMES[ext] ?? `${ext.toUpperCase()} File`
}

// Explorer selects the base name when renaming: everything before the last dot
// for files, the whole name for folders (and for dotfiles like ".env").
export function baseNameLength(name, isFolder) {
  if (isFolder) return name.length
  const dot = name.lastIndexOf('.')
  return dot > 0 ? dot : name.length
}

// "New folder", then "New folder (2)", "New folder (3)"... Same for files, which keep
// their extension: "New Text Document.txt", "New Text Document (2).txt".
export function nextAvailableName(base, ext, siblings) {
  let candidate = `${base}${ext}`
  let n = 2
  while (siblings.includes(candidate)) {
    candidate = `${base} (${n})${ext}`
    n += 1
  }
  return candidate
}

const INVALID_NAME_CHARS = /[\\/:*?"<>|]/

// Returns { name, error }. `error` is user-facing copy, or null when the name is usable.
// `currentName` lets a rename keep its own name without tripping the duplicate check.
export function validateEntryName(rawName, siblings, currentName = null) {
  const name = (rawName ?? '').trim()
  if (!name) return { name, error: 'Type a name.' }
  if (name === '.' || name === '..') return { name, error: 'That name is not allowed.' }
  if (INVALID_NAME_CHARS.test(name)) {
    return {
      name,
      error: 'A name can\'t contain any of these characters: \\ / : * ? " < > |',
    }
  }
  // Windows names are case-insensitive: "Notes.txt" clashes with "notes.txt".
  // The item being renamed is not its own clash, so a case-only rename still works.
  const lower = name.toLowerCase()
  if (siblings.some((s) => s !== currentName && s.toLowerCase() === lower)) {
    return { name, error: `An item named “${name}” already exists in this folder.` }
  }
  return { name, error: null }
}

// Newest change inside a folder. Folder records carry no timestamps of their own,
// so Explorer's "Date modified" for a folder is the latest change to its direct children.
export function folderModifiedAt(files, folderPath) {
  const folder = files[folderPath]
  let latest = folder?.updatedAt ?? null
  for (const child of folder?.children ?? []) {
    const entry = files[buildEntryPath(folderPath, child)]
    const stamp = entry?.updatedAt ?? entry?.createdAt ?? null
    if (stamp != null && (latest == null || stamp > latest)) latest = stamp
  }
  return latest
}

// One display row per child of the folder. Missing entries are skipped.
export function buildRows(files, folderPath) {
  const rows = []
  for (const name of files[folderPath]?.children ?? []) {
    const path = buildEntryPath(folderPath, name)
    const entry = files[path]
    if (!entry) continue
    const isFolder = entry.type === 'folder'
    rows.push({
      name,
      path,
      isFolder,
      type: typeLabel(name, isFolder),
      size: !isFolder && entry.size != null ? entry.size : null,
      modified: isFolder
        ? folderModifiedAt(files, path)
        : (entry.updatedAt ?? entry.createdAt ?? null),
    })
  }
  return rows
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Folders are always grouped first, as in Explorer. `sort.dir` only flips the order
// inside each group.
export function sortRows(rows, sort) {
  const dir = sort.dir === 'desc' ? -1 : 1
  const compare =
    {
      name: (a, b) => collator.compare(a.name, b.name),
      modified: (a, b) => (a.modified ?? 0) - (b.modified ?? 0) || collator.compare(a.name, b.name),
      type: (a, b) => collator.compare(a.type, b.type) || collator.compare(a.name, b.name),
      size: (a, b) => (a.size ?? 0) - (b.size ?? 0) || collator.compare(a.name, b.name),
    }[sort.key] ?? ((a, b) => collator.compare(a.name, b.name))
  return [...rows].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
    return dir * compare(a, b)
  })
}

export function filterRows(rows, query) {
  const needle = (query ?? '').trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((row) => row.name.toLowerCase().includes(needle))
}

// Inclusive range between two names in display order. Falls back to the target alone
// when either end is no longer visible.
export function rangeNames(visibleNames, from, to) {
  const a = visibleNames.indexOf(from)
  const b = visibleNames.indexOf(to)
  if (a < 0 || b < 0) return [to]
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return visibleNames.slice(lo, hi + 1)
}

// Back/forward history. Entries that were deleted (or are no longer folders) are
// skipped. Returns the index to move to, or null when there is nowhere to go.
export function stepHistory(nav, files, direction) {
  let i = nav.index + direction
  while (i >= 0 && i < nav.entries.length && files[nav.entries[i]]?.type !== 'folder') {
    i += direction
  }
  return i >= 0 && i < nav.entries.length ? i : null
}

export function formatModified(stamp) {
  if (stamp == null) return '—'
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}
