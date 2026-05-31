/**
 * Nexus Drive — a thin wrapper over the Origin Private File System (OPFS).
 *
 * The File Manager's synthetic tree (folders, names, timestamps, small text
 * content) lives in the zustand store + localStorage. That's fine for notes,
 * but localStorage caps out around 5 MB and only holds strings. OPFS gives us
 * real, origin-scoped, binary-capable, multi-hundred-MB persistent storage —
 * the proper backing for files the user imports from disk.
 *
 * Blobs are stored flat in the OPFS root, keyed by an opaque id; the file tree
 * in the store owns hierarchy + metadata and references a blob via `blobId`.
 *
 * Everything is feature-detected. Where OPFS is unavailable (older browsers,
 * jsdom in tests, some private-mode contexts) every call resolves to a safe
 * no-op / null, so callers never need to branch — they just won't get a blob.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
 */

export function isOpfsSupported() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.getDirectory === 'function'
  )
}

let rootPromise = null
async function getRoot() {
  if (!isOpfsSupported()) return null
  if (!rootPromise) {
    rootPromise = navigator.storage.getDirectory().catch(() => null)
  }
  return rootPromise
}

/** Persist `blob` under `id`. Returns true on success, false if unsupported/failed. */
export async function writeBlob(id, blob) {
  try {
    const root = await getRoot()
    if (!root) return false
    const handle = await root.getFileHandle(id, { create: true })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch {
    return false
  }
}

/** Read the blob stored under `id`, or null if missing/unsupported. */
export async function readBlob(id) {
  try {
    const root = await getRoot()
    if (!root) return null
    const handle = await root.getFileHandle(id)
    return await handle.getFile()
  } catch {
    return null
  }
}

/** Best-effort delete; swallows "not found" and unsupported. */
export async function deleteBlob(id) {
  try {
    const root = await getRoot()
    if (!root) return false
    await root.removeEntry(id)
    return true
  } catch {
    return false
  }
}

/** { usage, quota } in bytes, or null if the estimate API is unavailable. */
export async function estimateStorage() {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.estimate !== 'function'
    ) {
      return null
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}

/**
 * Ask the browser to mark our storage "persistent" (exempt from eviction under
 * pressure). Returns the resulting persisted state, or false if unsupported.
 */
export async function requestPersistentStorage() {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.persist !== 'function'
    ) {
      return false
    }
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted()
      if (already) return true
    }
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Crude text-vs-binary heuristic for choosing inline preview vs download. */
export function isTextMime(mime = '') {
  return (
    mime.startsWith('text/') || /(json|javascript|xml|csv|x-sh|x-yaml|yaml|markdown)/.test(mime)
  )
}

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}
