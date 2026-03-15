const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error('Missing required environment variable: VITE_API_URL')
}

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
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
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
