import { test as base, expect } from '@playwright/test'

// Canned API responses. Test data only — no real accounts or credentials.
export const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'test.user@example.test',
  user_metadata: { full_name: 'Test User' },
}

const now = Date.now()
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
    status: 'needs_action',
    starred: true,
    due: new Date(now + 864e5).toISOString().slice(0, 10),
    position: 0,
    parent_id: null,
  },
  {
    id: 't2',
    list_id: 'l1',
    title: 'Book dentist appointment',
    status: 'needs_action',
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
  // Supabase Realtime / Aion: refuse quietly.
  await page.route('http://127.0.0.1:8798/**', (route) => route.abort())
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
