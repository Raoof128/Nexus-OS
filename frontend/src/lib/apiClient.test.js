import { describe, it, expect, vi, afterEach } from 'vitest'

// VITE_API_URL is stubbed to 'https://api.nexus-os.local' in vitest.setup.js.
// apiClient.js also has module-level state (refreshPromise). Use fresh imports
// where that state could interfere.
async function freshModule() {
  vi.resetModules()
  return import('./apiClient')
}

function mockFetch(overrides = {}) {
  const response = {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ result: 'ok' }),
    ...overrides,
  }
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, response }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── setAuthExpiredCallback ────────────────────────────────────────────────────

describe('setAuthExpiredCallback', () => {
  it('stores a callback that is invoked on auth expiry', async () => {
    const { setAuthExpiredCallback, apiFetch } = await freshModule()
    const onExpired = vi.fn()
    setAuthExpiredCallback(onExpired)

    // First call returns 401 (triggers refresh), refresh also returns 401 →
    // both retry=true and retry=false paths exhaust → callback fires.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({}),
      }),
    )

    await expect(apiFetch('/protected')).rejects.toThrow()
    expect(onExpired).toHaveBeenCalled()
  })

  it('expires without retrying when refresh reports no authenticated user', async () => {
    const { setAuthExpiredCallback, apiFetch } = await freshModule()
    const onExpired = vi.fn()
    setAuthExpiredCallback(onExpired)

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ detail: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ authenticated: false }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/protected')).rejects.toThrow('session has expired')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })
})

// ── apiFetch ──────────────────────────────────────────────────────────────────

describe('apiFetch', () => {
  it('makes a GET request with credentials and X-Requested-With header', async () => {
    const { apiFetch } = await freshModule()
    const { fetchMock } = mockFetch()

    await apiFetch('/media')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.nexus-os.local/media',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-Requested-With': 'XMLHttpRequest' }),
      }),
    )
  })

  it('serialises the body as JSON and sets Content-Type', async () => {
    const { apiFetch } = await freshModule()
    const { fetchMock } = mockFetch()

    await apiFetch('/media', { method: 'POST', body: { title: 'Dune' } })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ title: 'Dune' })
  })

  it('returns null for 204 No Content responses', async () => {
    const { apiFetch } = await freshModule()
    mockFetch({ ok: true, status: 204, json: vi.fn() })
    expect(await apiFetch('/media/1')).toBeNull()
  })

  it('throws a descriptive error on non-ok responses', async () => {
    const { apiFetch } = await freshModule()
    mockFetch({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ detail: 'Not found' }),
    })
    await expect(apiFetch('/media/999')).rejects.toThrow('Not found')
  })

  it('throws a timeout error when fetch is aborted', async () => {
    const { apiFetch } = await freshModule()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      }),
    )
    await expect(apiFetch('/slow')).rejects.toThrow('Request timed out')
  })
})

// ── authFetch ─────────────────────────────────────────────────────────────────

describe('authFetch', () => {
  it('makes a request without the retry-on-401 logic', async () => {
    const { authFetch } = await freshModule()
    const { fetchMock } = mockFetch()

    await authFetch('/auth/me')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.nexus-os.local/auth/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('throws immediately on 401 without attempting a token refresh', async () => {
    const { authFetch } = await freshModule()
    mockFetch({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ detail: 'Unauthorized' }),
    })
    // authFetch uses retry=false, so only ONE fetch call is made
    const fetchMock = vi.mocked(fetch)
    await expect(authFetch('/auth/me')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ── refreshSession ─────────────────────────────────────────────────────────────

describe('refreshSession', () => {
  it('POSTs to /auth/refresh', async () => {
    const { refreshSession } = await freshModule()
    const { fetchMock } = mockFetch()

    await refreshSession()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.nexus-os.local/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('deduplicates concurrent refresh calls (only one fetch)', async () => {
    const { refreshSession } = await freshModule()
    let resolveFetch
    const pendingFetch = new Promise((res) => {
      resolveFetch = res
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        pendingFetch.then(() => ({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({}),
        })),
      ),
    )

    const p1 = refreshSession()
    const p2 = refreshSession()
    resolveFetch()
    await Promise.all([p1, p2])

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('clears the dedup lock after the request completes', async () => {
    const { refreshSession } = await freshModule()
    const { fetchMock } = mockFetch()

    await refreshSession()
    await refreshSession()

    // After first refresh completes, second is a new fetch (not deduplicated)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

// ── session expiry vs. transient refresh failures (ARCH-06 / SEC-16 / ARCH-08) ─

function jsonResponse(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(body) }
}

const refreshCalls = (fetchMock) =>
  fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))

describe('session expiry', () => {
  it('keeps the session when /auth/refresh answers 503 and surfaces the original error', async () => {
    const { apiFetch, setAuthExpiredCallback } = await freshModule()
    const onExpired = vi.fn()
    setAuthExpiredCallback(onExpired)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { detail: 'Unauthorized' }))
        .mockResolvedValueOnce(jsonResponse(503, { detail: 'Service unavailable' })),
    )

    await expect(apiFetch('/media')).rejects.toThrow('Unauthorized')
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('keeps the session on a network failure during refresh', async () => {
    const { apiFetch, setAuthExpiredCallback } = await freshModule()
    const onExpired = vi.fn()
    setAuthExpiredCallback(onExpired)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { detail: 'Unauthorized' }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch')),
    )

    await expect(apiFetch('/media')).rejects.toThrow('Unauthorized')
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('keeps the session when /auth/refresh is rate limited (429)', async () => {
    const { apiFetch, setAuthExpiredCallback } = await freshModule()
    const onExpired = vi.fn()
    setAuthExpiredCallback(onExpired)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { detail: 'Unauthorized' }))
        .mockResolvedValueOnce(jsonResponse(429, { detail: 'Too many requests' })),
    )

    await expect(apiFetch('/media')).rejects.toThrow('Unauthorized')
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('expires the session when /auth/refresh rejects it with 403', async () => {
    const { apiFetch, setAuthExpiredCallback } = await freshModule()
    const onExpired = vi.fn()
    setAuthExpiredCallback(onExpired)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { detail: 'Unauthorized' }))
        .mockResolvedValueOnce(jsonResponse(403, { detail: 'Forbidden' })),
    )

    await expect(apiFetch('/media')).rejects.toThrow('session has expired')
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('retries the original request once after a successful refresh', async () => {
    const { apiFetch, setAuthExpiredCallback } = await freshModule()
    const onExpired = vi.fn()
    setAuthExpiredCallback(onExpired)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { user: { email: 'runner@nexus.net' } }))
      .mockResolvedValueOnce(jsonResponse(200, { items: [1] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/media')).resolves.toEqual({ items: [1] })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.nexus-os.local/media')
    expect(refreshCalls(fetchMock)).toHaveLength(1)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('sends concurrent 401s through one shared refresh', async () => {
    const { apiFetch } = await freshModule()
    let resolveRefresh
    const pendingRefresh = new Promise((resolve) => {
      resolveRefresh = resolve
    })
    const seen = new Set()
    const fetchMock = vi.fn((url) => {
      if (url.endsWith('/auth/refresh')) return pendingRefresh
      if (!seen.has(url)) {
        seen.add(url)
        return Promise.resolve(jsonResponse(401, { detail: 'Unauthorized' }))
      }
      return Promise.resolve(jsonResponse(200, { url }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = apiFetch('/media/a')
    const second = apiFetch('/media/b')
    await vi.waitFor(() => expect(refreshCalls(fetchMock)).toHaveLength(1))
    resolveRefresh(jsonResponse(200, { user: { email: 'runner@nexus.net' } }))

    await expect(Promise.all([first, second])).resolves.toEqual([
      { url: 'https://api.nexus-os.local/media/a' },
      { url: 'https://api.nexus-os.local/media/b' },
    ])
    expect(refreshCalls(fetchMock)).toHaveLength(1)
  })

  it('reuses a refresh that settled moments ago instead of refreshing again', async () => {
    const { apiFetch } = await freshModule()
    const seen = new Set()
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith('/auth/refresh')) return jsonResponse(200, { user: { email: 'a@b.co' } })
      if (!seen.has(url)) {
        seen.add(url)
        return jsonResponse(401, { detail: 'Unauthorized' })
      }
      return jsonResponse(200, { url })
    })
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/media/a')
    // This 401 was already in flight when the refresh settled.
    await expect(apiFetch('/media/b')).resolves.toEqual({
      url: 'https://api.nexus-os.local/media/b',
    })
    expect(refreshCalls(fetchMock)).toHaveLength(1)
  })

  it('refreshes again once the grace window has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const { apiFetch } = await freshModule()
      const seen = new Set()
      const fetchMock = vi.fn(async (url) => {
        if (url.endsWith('/auth/refresh')) return jsonResponse(200, { user: { email: 'a@b.co' } })
        if (!seen.has(url)) {
          seen.add(url)
          return jsonResponse(401, { detail: 'Unauthorized' })
        }
        return jsonResponse(200, { url })
      })
      vi.stubGlobal('fetch', fetchMock)

      await apiFetch('/media/a')
      vi.setSystemTime(Date.now() + 10_000)
      await apiFetch('/media/b')
      expect(refreshCalls(fetchMock)).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
