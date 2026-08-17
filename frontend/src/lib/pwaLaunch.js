/**
 * PWA entry points beyond a normal launch: the Web Share Target and the File
 * Handling API. Both let the host OS hand data/files to the installed app.
 *
 * Kept framework-free and feature-detected so they degrade to no-ops on the
 * web and on platforms without these APIs.
 */

/**
 * Consume a Web Share Target launch (`/?share-target=1&title=…&text=…&url=…`).
 *
 * The manifest registers a GET share target, so shared content arrives as query
 * params. The URL is scrubbed immediately, then the content is persisted through
 * the authenticated Notes API. Keeping it out of a global localStorage buffer
 * prevents a second account on the same browser from inheriting private shares.
 */
export function consumeShareTarget({ createNote, onSaved, onError } = {}) {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has('share-target')) return null

  const title = (params.get('title') || '').trim()
  const text = params.get('text') || ''
  const url = params.get('url') || ''
  const content = [text, url].filter(Boolean).join('\n').trim()

  // Shared text can be sensitive, so remove it from the address bar before
  // waiting on any network operation or opening another app.
  stripParams(['share-target', 'title', 'text', 'url'])

  if (title || content) {
    if (typeof createNote !== 'function') {
      onError?.(new Error('The Notes service is unavailable.'))
    } else {
      Promise.resolve(
        createNote({
          title: (title || 'Shared item').slice(0, 500),
          content: content.slice(0, 20_000),
          type: 'text',
        }),
      )
        .then((note) => onSaved?.(note))
        .catch((error) => onError?.(error))
    }
  }

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
