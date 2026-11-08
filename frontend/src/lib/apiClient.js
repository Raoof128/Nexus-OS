let onAuthExpired = null
export function setAuthExpiredCallback(cb) {
  onAuthExpired = cb
}

const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error('Missing required environment variable: VITE_API_URL')
}

const REQUEST_TIMEOUT_MS = 30_000
// A 401 that arrives this soon after a successful refresh reuses that refresh
// instead of starting another one (the cookies were just rotated).
const REFRESH_GRACE_MS = 2_000
const EXPIRED_MESSAGE = 'Your session has expired. Please log in again.'

let refreshPromise = null
let lastRefresh = null // { result, settledAt } of the most recent successful refresh

async function extractError(response) {
  try {
    const payload = await response.json()
    return payload.detail || payload.message || `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
}

// Error for a non-2xx response. `status` lets callers tell a rejected session
// (401/403) apart from transient failures (5xx, 429, network).
async function httpError(response) {
  const error = new Error(await extractError(response))
  error.status = response.status
  return error
}

// Only the server rejecting the session counts as expiry. Anything else
// (network failure, timeout, 5xx, 429) leaves the session in place.
function isSessionRejection(error) {
  return error?.status === 401 || error?.status === 403
}

function expireSession() {
  lastRefresh = null
  onAuthExpired?.()
  return new Error(EXPIRED_MESSAGE)
}

async function request(path, { method = 'GET', body, headers = {} } = {}, retry = true) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (
      response.status === 401 &&
      retry &&
      !path.startsWith('/auth/') &&
      path !== '/auth/refresh'
    ) {
      const originalError = await httpError(response)
      let refreshed
      try {
        refreshed = await refreshSession()
      } catch (refreshError) {
        if (!isSessionRejection(refreshError)) {
          // Transient: the session is still valid as far as we know. Fail this
          // request with its own error; the next request retries the refresh.
          throw originalError
        }
        throw expireSession()
      }
      if (!refreshed?.user) {
        throw expireSession()
      }
      // retry=false guarantees we can't recurse on a second 401
      return request(path, { method, body, headers }, false)
    }

    // A 401 on the retry right after a successful refresh means even the new
    // session is rejected. Expire instead of leaving the UI signed in with a
    // session that fails (and refreshes) on every request.
    if (response.status === 401 && !retry && !path.startsWith('/auth/')) {
      throw expireSession()
    }

    if (!response.ok) {
      throw await httpError(response)
    }

    if (response.status === 204) return null
    return response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function refreshSession() {
  if (refreshPromise) return refreshPromise

  if (lastRefresh && Date.now() - lastRefresh.settledAt < REFRESH_GRACE_MS) {
    return Promise.resolve(lastRefresh.result)
  }

  refreshPromise = request('/auth/refresh', { method: 'POST' }, false)
    .then((result) => {
      lastRefresh = result?.user ? { result, settledAt: Date.now() } : null
      return result
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export function authFetch(path, options) {
  return request(path, options, false)
}

export function apiFetch(path, options) {
  return request(path, options, true)
}
