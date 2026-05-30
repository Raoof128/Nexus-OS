/* Nexus OS service worker — offline app shell + static asset caching.
 *
 * Strategy:
 *   - Navigations (mode === 'navigate'): network-first, fall back to the cached
 *     app shell (index.html) so the desktop boots offline.
 *   - Hashed build assets (/assets/*): stale-while-revalidate — instant load,
 *     refreshed in the background. Safe because Vite content-hashes filenames.
 *   - Same-origin GETs for fonts/icons/wallpapers: cache-first with runtime fill.
 *   - API calls (/api/*) and all non-GET requests: never cached. The OS stays
 *     read-only offline; writes simply fail and the UI surfaces that.
 *
 * Bump CACHE_VERSION to invalidate old caches on the next activation.
 */
const CACHE_VERSION = 'v1'
const SHELL_CACHE = `nexus-os-shell-${CACHE_VERSION}`
const RUNTIME_CACHE = `nexus-os-runtime-${CACHE_VERSION}`

// Minimal shell. Hashed JS/CSS are filled in at runtime (their names are unknown
// at build time), so we only precache the stable, always-present entry points.
const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Allow the page to trigger an immediate activation after an update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

function isApiRequest(url) {
  return url.pathname.startsWith('/api/')
}

function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GETs. Everything else (API writes, cross-origin
  // font/Supabase/Sentry traffic) goes straight to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (isApiRequest(url)) return

  // SPA navigations: network-first, offline fallback to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/index.html')),
      ),
    )
    return
  }

  // Hashed build output: stale-while-revalidate.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response && response.ok) cache.put(request, response.clone())
              return response
            })
            .catch(() => cached)
          return cached || network
        }),
      ),
    )
    return
  }

  // Other same-origin GETs (favicon, wallpapers, etc.): cache-first.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
