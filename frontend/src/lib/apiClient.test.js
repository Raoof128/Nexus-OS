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
