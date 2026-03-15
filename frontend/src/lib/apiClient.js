const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error('Missing required environment variable: VITE_API_URL')
}

const REQUEST_TIMEOUT_MS = 30_000

let refreshPromise = null

async function extractError(response) {
  try {
    const payload = await response.json()
    return payload.detail || payload.message || `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
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
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401 && retry && !path.startsWith('/auth/')) {
      await refreshSession()
      return request(path, { method, body, headers }, false)
    }

    if (!response.ok) {
      throw new Error(await extractError(response))
    }

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

export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = request('/auth/refresh', { method: 'POST' }, false).finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

export function authFetch(path, options) {
  return request(path, options, false)
}

export function apiFetch(path, options) {
  return request(path, options, true)
}
