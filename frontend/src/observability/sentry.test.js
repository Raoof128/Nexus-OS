import { beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.hoisted(() => vi.fn())
vi.mock('@sentry/react', () => ({ init, ErrorBoundary: () => null }))

describe('sentry URL scrubbing', () => {
  let options

  beforeEach(async () => {
    vi.resetModules()
    init.mockClear()
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
    const { initializeSentry } = await import('./sentry')
    initializeSentry()
    options = init.mock.calls[0][0]
  })

  it('removes recovery token_hash and type from breadcrumb URLs', () => {
    const crumb = options.beforeBreadcrumb({
      category: 'fetch',
      data: { url: 'https://nexus.test/?type=recovery&token_hash=secret-hash' },
    })
    expect(crumb.data.url).not.toContain('token_hash')
    expect(crumb.data.url).not.toContain('type=recovery')
    expect(crumb.data.url).not.toContain('secret-hash')
  })

  it('scrubs the recovery parameters from the URL hash', () => {
    const crumb = options.beforeBreadcrumb({
      data: {
        url: 'https://nexus.test/#type=recovery&access_token=a&refresh_token=r&token_hash=h',
      },
    })
    expect(crumb.data.url).toBe('https://nexus.test/')
  })

  it('scrubs navigation breadcrumb from and to', () => {
    const crumb = options.beforeBreadcrumb({
      category: 'navigation',
      data: {
        from: '/?type=recovery&token_hash=from-hash',
        to: '/#access_token=to-token&type=recovery',
      },
    })
    expect(crumb.data.from).not.toContain('from-hash')
    expect(crumb.data.to).not.toContain('to-token')
    expect(crumb.data.to).not.toContain('type=recovery')
  })

  it('leaves unrelated URLs unchanged', () => {
    const crumb = options.beforeBreadcrumb({ data: { url: 'https://nexus.test/media?type=book' } })
    expect(crumb.data.url).toBe('https://nexus.test/media?type=book')
  })

  it('scrubs the event request URL', () => {
    const event = options.beforeSend({
      request: { url: 'https://nexus.test/?token_hash=event-hash', headers: {} },
    })
    expect(event.request.url).not.toContain('event-hash')
  })
})
