import assert from 'node:assert/strict'
import test from 'node:test'

import worker from './index.js'

test('forwards recovery headers and returns provider redirects to the browser', async (t) => {
  const originalFetch = globalThis.fetch
  let forwarded
  globalThis.fetch = async (request) => {
    forwarded = request
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://accounts.google.com/o/oauth2/v2/auth' },
    })
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const request = new Request(
    'https://home-notes-app.uk/api/auth/reset-password',
    {
      headers: {
        'X-Recovery-Access-Token': 'access-secret',
        'X-Recovery-Refresh-Token': 'refresh-secret',
        'X-Requested-With': 'XMLHttpRequest',
        'Idempotency-Key': 'send-attempt-123',
      },
    },
  )

  const response = await worker.fetch(request, {
    BACKEND_ORIGIN: 'https://api.home-notes-app.uk',
  })

  assert.equal(forwarded.headers.get('x-recovery-access-token'), 'access-secret')
  assert.equal(forwarded.headers.get('x-recovery-refresh-token'), 'refresh-secret')
  assert.equal(forwarded.headers.get('x-requested-with'), 'XMLHttpRequest')
  assert.equal(forwarded.headers.get('idempotency-key'), 'send-attempt-123')
  assert.equal(forwarded.redirect, 'manual')
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://accounts.google.com/o/oauth2/v2/auth')
})

test('rebuilds forwarded-for from Cloudflare and ignores a spoofed value', async (t) => {
  const originalFetch = globalThis.fetch
  let forwarded
  globalThis.fetch = async (request) => {
    forwarded = request
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const request = new Request('https://home-notes-app.uk/api/healthz', {
    headers: {
      'CF-Connecting-IP': '203.0.113.10',
      'X-Forwarded-For': '198.51.100.99',
    },
  })
  await worker.fetch(request, {
    BACKEND_ORIGIN: 'https://api.home-notes-app.uk',
  })

  assert.equal(forwarded.headers.get('x-forwarded-for'), '203.0.113.10')
})

test('normalizes browser OAuth navigation to the backend controller path', async (t) => {
  const originalFetch = globalThis.fetch
  let forwarded
  globalThis.fetch = async (request) => {
    forwarded = request
    return new Response(null, { status: 302, headers: { Location: 'https://provider.example' } })
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  await worker.fetch(
    new Request('https://home-notes-app.uk/api/email/accounts/connect?provider=google'),
    { BACKEND_ORIGIN: 'https://api.home-notes-app.uk' },
  )

  assert.equal(
    new URL(forwarded.url).pathname,
    '/api/email/accounts/connect',
  )
})
