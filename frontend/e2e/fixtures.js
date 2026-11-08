import { test as base, expect } from '@playwright/test'

// Canned API responses. Test data only — no real accounts or credentials.
export const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'test.user@example.test',
  user_metadata: { full_name: 'Test User' },
}

// Fixture timestamps are anchored to a fixed instant, not the wall clock, so
// anything the UI derives from them ("Yesterday", clock times) is stable. The
// visual suite freezes the browser clock to this same instant.
export const FIXTURE_NOW = Date.UTC(2026, 10, 8, 9, 30)
const now = FIXTURE_NOW
const MEDIA = {
  book: [
    {
      id: 'b1',
      type: 'book',
      title: 'The Left Hand of Darkness',
      creator: 'Ursula K. Le Guin',
      genre: 'Science fiction',
      status: 'Reading',
      rating: 5,
      sub_info: '304',
      takeaway: '',
      created_at: new Date(now - 864e5).toISOString(),
    },
    {
      id: 'b2',
      type: 'book',
      title: 'A Wizard of Earthsea',
      creator: 'Ursula K. Le Guin',
      genre: 'Fantasy',
      status: 'Finished',
      rating: 4,
      sub_info: '183',
      takeaway: '',
      created_at: new Date(now - 2 * 864e5).toISOString(),
    },
    {
      id: 'b3',
      type: 'book',
      title: 'Piranesi',
      creator: 'Susanna Clarke',
      genre: 'Fantasy',
      status: 'To Read',
      rating: 0,
      sub_info: '272',
      takeaway: '',
      created_at: new Date(now - 3 * 864e5).toISOString(),
    },
  ],
  movie: [
    {
      id: 'm1',
      type: 'movie',
      title: 'Arrival',
      creator: 'Denis Villeneuve',
      genre: 'Drama',
      status: 'Finished',
      rating: 5,
      sub_info: '2016',
      takeaway: '',
      created_at: new Date(now).toISOString(),
    },
  ],
  anime: [],
  job: [
    {
      id: 'j1',
      type: 'job',
      title: 'Frontend Engineer',
      creator: 'Example Pty Ltd',
      genre: 'Sydney',
      status: 'Applied',
      rating: 0,
      sub_info: '',
      takeaway: '',
      created_at: new Date(now).toISOString(),
    },
  ],
}

const TASK_LISTS = [
  { id: 'l1', name: 'My Tasks', position: 0 },
  { id: 'l2', name: 'Groceries', position: 1 },
]
const TASK_ITEMS = [
  {
    id: 't1',
    list_id: 'l1',
    title: 'Renew passport',
    status: 'needsAction',
    starred: true,
    due: new Date(now + 864e5).toISOString().slice(0, 10),
    position: 0,
    parent_id: null,
  },
  {
    id: 't2',
    list_id: 'l1',
    title: 'Book dentist appointment',
    status: 'needsAction',
    starred: false,
    position: 1,
    parent_id: null,
  },
  {
    id: 't3',
    list_id: 'l1',
    title: 'Pay electricity bill',
    status: 'completed',
    starred: false,
    position: 2,
    parent_id: null,
  },
]

const EMAILS = [
  {
    id: 'e1',
    user_id: USER.id,
    account_id: 'a1',
    folder: 'inbox',
    from_name: 'Sydney Library',
    from_address: 'notices@library.example',
    subject: 'Your reservation is ready',
    snippet: 'The book you reserved is waiting at the front desk.',
    provider_date: new Date(now - 36e5).toISOString(),
    is_read: false,
    is_starred: true,
  },
  {
    id: 'e2',
    user_id: USER.id,
    account_id: 'a1',
    folder: 'inbox',
    from_name: 'Example Pty Ltd',
    from_address: 'careers@example.test',
    subject: 'Interview availability',
    snippet: 'Thanks for applying for the Frontend Engineer role…',
    provider_date: new Date(now - 864e5).toISOString(),
    is_read: true,
    is_starred: false,
  },
]
const VERSES = [1, 2, 3, 4, 5].map((v) => ({
  id: `jhn-1-${v}`,
  book_id: 'JHN',
  book: 'John',
  chapter: 1,
  verse: v,
  content: [
    'In the beginning was the Word, and the Word was with God, and the Word was God.',
    'He was with God in the beginning.',
    'Through Him all things were made, and without Him nothing was made that has been made.',
    'In Him was life, and that life was the light of men.',
    'The Light shines in the darkness, and the darkness has not overcome it.',
  ][v - 1],
}))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'anon-e2e', role: 'authenticated', exp: Math.floor(now / 1000) + 3600 })}.e2e`
const SUPABASE_SESSION = {
  access_token: FAKE_JWT,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(now / 1000) + 3600,
  refresh_token: 'e2e-refresh',
  user: {
    id: 'anon-e2e',
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: true,
    app_metadata: {},
    user_metadata: {},
  },
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

export async function mockApi(page, { authenticated = true } = {}) {
  await page.route('http://127.0.0.1:8799/**', (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    const method = req.method()
    if (p === '/auth/session') {
      return authenticated
        ? json(route, { user: USER, expires_at: Math.floor(now / 1000) + 3600 })
        : json(route, { detail: 'Not authenticated' }, 401)
    }
    if (p === '/auth/refresh') return json(route, { detail: 'Not authenticated' }, 401)
    if (p === '/auth/login')
      return json(route, { user: USER, expires_at: Math.floor(now / 1000) + 3600 })
    if (p === '/auth/logout') return json(route, { ok: true })
    if (p === '/media' && method === 'GET') {
      const type = url.searchParams.get('type')
      return json(route, type ? (MEDIA[type] ?? []) : Object.values(MEDIA).flat())
    }
    if (p === '/api/email/messages' && method === 'GET')
      return json(route, { items: EMAILS, next_cursor: null })
    if (p === '/api/tasks/lists' && method === 'GET') return json(route, TASK_LISTS)
    const m = p.match(/^\/api\/tasks\/lists\/([^/]+)\/items$/)
    if (m && method === 'GET')
      return json(
        route,
        TASK_ITEMS.filter((t) => t.list_id === m[1]),
      )
    if (method === 'GET') return json(route, [])
    return json(route, {})
  })
  // Supabase (PostgREST reads, anonymous Aion auth). Realtime sockets are
  // refused; everything else gets canned rows.
  await page.route('http://127.0.0.1:8798/**', (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname
    if (p === '/auth/v1/signup' || p === '/auth/v1/token') {
      return json(route, SUPABASE_SESSION)
    }
    if (p === '/auth/v1/user') return json(route, SUPABASE_SESSION.user)
    if (p === '/rest/v1/nexus_emails') return json(route, EMAILS)
    if (p === '/rest/v1/bible_verses') return json(route, VERSES)
    if (p.startsWith('/rest/v1/')) return json(route, [])
    return route.abort()
  })
  await page.route('ws://127.0.0.1:8798/**', (route) => route.abort())
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      // Skip the boot animation; start from a clean, deterministic desktop.
      if (!sessionStorage.getItem('__e2e_init')) {
        sessionStorage.setItem('__e2e_init', '1')
        sessionStorage.setItem('nexus_booted', '1')
        localStorage.clear()
      }
    })
    await mockApi(page)
    await provide(page)
  },
})

export { expect }
