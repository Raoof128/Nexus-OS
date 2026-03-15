const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error('Missing required environment variable: VITE_API_URL')
}

async function extractError(response) {
  try {
    const payload = await response.json()
    return payload.detail || payload.message || `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
}

export async function apiFetch(path, { session, method = 'GET', body } = {}) {
  if (!session?.access_token) {
    throw new Error('Missing authenticated session')
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw new Error(await extractError(response))
  }

  return response.json()
}
