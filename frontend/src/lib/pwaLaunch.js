/**
 * PWA entry points beyond a normal launch: the Web Share Target and the File
 * Handling API. Both let the host OS hand data/files to the installed app.
 *
 * Kept framework-free and feature-detected so they degrade to no-ops on the
 * web and on platforms without these APIs.
 */

const NOTES_KEY = 'nexus-os:notes'

/**
 * Consume a Web Share Target launch (`/?share-target=1&title=…&text=…&url=…`).
 *
 * The manifest registers a GET share target, so shared content arrives as query
 * params. We append it to the Notes buffer (the natural inbox for stray text)
 * and return the app id to open, or null if this wasn't a share launch. The
 * share params are stripped from the URL so a refresh won't re-import.
 */
export function consumeShareTarget() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has('share-target')) return null

  const title = params.get('title') || ''
  const text = params.get('text') || ''
  const url = params.get('url') || ''
  const shared = [title, text, url].filter(Boolean).join('\n').trim()

  if (shared) {
    try {
      const existing = localStorage.getItem(NOTES_KEY) || ''
      const stamp = new Date().toLocaleString()
      const block = `── Shared ${stamp} ──\n${shared}\n`
      localStorage.setItem(NOTES_KEY, existing ? `${existing}\n\n${block}` : block)
    } catch {
      // Storage full — drop the share rather than crash the boot sequence.
    }
  }

  stripParams(['share-target', 'title', 'text', 'url'])
  return 'notes'
}

/**
 * Wire the File Handling API. When the OS launches the PWA to open registered
 * file types, `launchQueue` delivers FileSystemFileHandles. We import each into
 * the Drive's /downloads folder (OPFS-backed) and open the File Manager.
 *
 * `importFile(parentPath, file)` resolves to the new path or null. No-ops where
 * `launchQueue` is unavailable.
 */
export function consumeFileHandlers({ openApp, importFile }) {
  if (typeof window === 'undefined' || !('launchQueue' in window)) return

  if (new URLSearchParams(window.location.search).has('file-handler')) {
    stripParams(['file-handler'])
  }

  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams?.files?.length) return
    let imported = false
    for (const handle of launchParams.files) {
      try {
        const file = await handle.getFile()
        const path = await importFile('/downloads', file)
        if (path) imported = true
      } catch {
        // Skip any file we can't read; one bad handle shouldn't sink the rest.
      }
    }
    if (imported) openApp('files')
  })
}

function stripParams(keys) {
  const params = new URLSearchParams(window.location.search)
  for (const k of keys) params.delete(k)
  const qs = params.toString()
  window.history.replaceState(
    {},
    '',
    window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
  )
}
