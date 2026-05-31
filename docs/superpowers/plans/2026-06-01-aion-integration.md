# Aion Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Aion (AI-powered Bible companion) as a native Nexus OS app — a single windowed app with Home/Chat/Reader views powered by Aion's own Supabase backend.

**Architecture:** `AionApp.jsx` owns a `view` state machine (`home | chat | reader`) and renders one of three view components. A separate Supabase client (`aionSupabase`) manages anonymous auth for Aion independent of Nexus OS auth. Chat streams SSE from Aion's Edge Functions; the Bible Reader queries the `bible_verses` table directly.

**Tech Stack:** React 19, Tailwind CSS v4, `@supabase/supabase-js` (already installed), Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-06-01-aion-integration-design.md`

---

## Phase 1 — Foundation

### Task 1: Env vars + vitest stubs

**Files:**
- Modify: `frontend/.env`
- Modify: `frontend/vitest.setup.js`

- [ ] **Step 1: Add Aion env vars to `frontend/.env`**

Append two lines to the existing `frontend/.env`:

```
VITE_AION_SUPABASE_URL=https://eynemyseadlkbzwtzrry.supabase.co
VITE_AION_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5bmVteXNlYWRsa2J6d3R6cnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMTgwNDMsImV4cCI6MjA5MDY5NDA0M30.pWOi6CDWA4Qw2dF-4SmtxIomVr2PFx_l8OVW3Rik3Tc
```

- [ ] **Step 2: Stub Aion env vars in vitest.setup.js**

The test environment doesn't load `.env`, so `aionSupabase.js` (which validates at import) will throw without these stubs. Add to the end of `frontend/vitest.setup.js`:

```js
vi.stubEnv('VITE_AION_SUPABASE_URL', 'https://test-aion.supabase.co')
vi.stubEnv('VITE_AION_SUPABASE_ANON_KEY', 'test-aion-anon-key')
```

- [ ] **Step 3: Verify tests still pass**

```bash
cd frontend && npm run test -- --run
```

Expected: all existing tests pass (same count as before).

- [ ] **Step 4: Commit**

```bash
git add frontend/.env frontend/vitest.setup.js
git commit -m "chore(aion): add Aion Supabase env vars + vitest stubs"
```

---

### Task 2: Static Bible data

**Files:**
- Create: `frontend/src/os/apps/Aion/lib/bibleData.js`
- Create: `frontend/src/os/apps/Aion/lib/__tests__/bibleData.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/apps/Aion/lib/__tests__/bibleData.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { BIBLE_BOOKS, OT_BOOKS, NT_BOOKS, VOTD_POOL, getVerseOfTheDay } from '../bibleData'

describe('BIBLE_BOOKS', () => {
  it('has 66 books', () => {
    expect(BIBLE_BOOKS).toHaveLength(66)
  })

  it('every book has id, name, chapters, testament', () => {
    for (const book of BIBLE_BOOKS) {
      expect(book).toHaveProperty('id')
      expect(book).toHaveProperty('name')
      expect(typeof book.chapters).toBe('number')
      expect(['OT', 'NT']).toContain(book.testament)
    }
  })
})

describe('OT_BOOKS / NT_BOOKS', () => {
  it('OT + NT = 66', () => {
    expect(OT_BOOKS.length + NT_BOOKS.length).toBe(66)
  })

  it('OT has 39 books', () => {
    expect(OT_BOOKS).toHaveLength(39)
  })

  it('NT has 27 books', () => {
    expect(NT_BOOKS).toHaveLength(27)
  })
})

describe('getVerseOfTheDay', () => {
  it('returns a verse with required fields', () => {
    const votd = getVerseOfTheDay()
    expect(votd).toHaveProperty('book_id')
    expect(votd).toHaveProperty('book_name')
    expect(typeof votd.chapter).toBe('number')
    expect(typeof votd.verse).toBe('number')
    expect(typeof votd.content).toBe('string')
    expect(votd.content.length).toBeGreaterThan(0)
  })

  it('returns deterministically for the same day', () => {
    expect(getVerseOfTheDay()).toEqual(getVerseOfTheDay())
  })

  it('VOTD_POOL has at least 15 verses', () => {
    expect(VOTD_POOL.length).toBeGreaterThanOrEqual(15)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/lib/__tests__/bibleData.test.js
```

Expected: `Cannot find module '../bibleData'`

- [ ] **Step 3: Create `frontend/src/os/apps/Aion/lib/bibleData.js`**

```js
export const BIBLE_BOOKS = [
  // Old Testament
  { id: 'GEN', name: 'Genesis', chapters: 50, testament: 'OT' },
  { id: 'EXO', name: 'Exodus', chapters: 40, testament: 'OT' },
  { id: 'LEV', name: 'Leviticus', chapters: 27, testament: 'OT' },
  { id: 'NUM', name: 'Numbers', chapters: 36, testament: 'OT' },
  { id: 'DEU', name: 'Deuteronomy', chapters: 34, testament: 'OT' },
  { id: 'JOS', name: 'Joshua', chapters: 24, testament: 'OT' },
  { id: 'JDG', name: 'Judges', chapters: 21, testament: 'OT' },
  { id: 'RUT', name: 'Ruth', chapters: 4, testament: 'OT' },
  { id: '1SA', name: '1 Samuel', chapters: 31, testament: 'OT' },
  { id: '2SA', name: '2 Samuel', chapters: 24, testament: 'OT' },
  { id: '1KI', name: '1 Kings', chapters: 22, testament: 'OT' },
  { id: '2KI', name: '2 Kings', chapters: 25, testament: 'OT' },
  { id: '1CH', name: '1 Chronicles', chapters: 29, testament: 'OT' },
  { id: '2CH', name: '2 Chronicles', chapters: 36, testament: 'OT' },
  { id: 'EZR', name: 'Ezra', chapters: 10, testament: 'OT' },
  { id: 'NEH', name: 'Nehemiah', chapters: 13, testament: 'OT' },
  { id: 'EST', name: 'Esther', chapters: 10, testament: 'OT' },
  { id: 'JOB', name: 'Job', chapters: 42, testament: 'OT' },
  { id: 'PSA', name: 'Psalms', chapters: 150, testament: 'OT' },
  { id: 'PRO', name: 'Proverbs', chapters: 31, testament: 'OT' },
  { id: 'ECC', name: 'Ecclesiastes', chapters: 12, testament: 'OT' },
  { id: 'SNG', name: 'Song of Solomon', chapters: 8, testament: 'OT' },
  { id: 'ISA', name: 'Isaiah', chapters: 66, testament: 'OT' },
  { id: 'JER', name: 'Jeremiah', chapters: 52, testament: 'OT' },
  { id: 'LAM', name: 'Lamentations', chapters: 5, testament: 'OT' },
  { id: 'EZK', name: 'Ezekiel', chapters: 48, testament: 'OT' },
  { id: 'DAN', name: 'Daniel', chapters: 12, testament: 'OT' },
  { id: 'HOS', name: 'Hosea', chapters: 14, testament: 'OT' },
  { id: 'JOL', name: 'Joel', chapters: 3, testament: 'OT' },
  { id: 'AMO', name: 'Amos', chapters: 9, testament: 'OT' },
  { id: 'OBA', name: 'Obadiah', chapters: 1, testament: 'OT' },
  { id: 'JON', name: 'Jonah', chapters: 4, testament: 'OT' },
  { id: 'MIC', name: 'Micah', chapters: 7, testament: 'OT' },
  { id: 'NAM', name: 'Nahum', chapters: 3, testament: 'OT' },
  { id: 'HAB', name: 'Habakkuk', chapters: 3, testament: 'OT' },
  { id: 'ZEP', name: 'Zephaniah', chapters: 3, testament: 'OT' },
  { id: 'HAG', name: 'Haggai', chapters: 2, testament: 'OT' },
  { id: 'ZEC', name: 'Zechariah', chapters: 14, testament: 'OT' },
  { id: 'MAL', name: 'Malachi', chapters: 4, testament: 'OT' },
  // New Testament
  { id: 'MAT', name: 'Matthew', chapters: 28, testament: 'NT' },
  { id: 'MRK', name: 'Mark', chapters: 16, testament: 'NT' },
  { id: 'LUK', name: 'Luke', chapters: 24, testament: 'NT' },
  { id: 'JHN', name: 'John', chapters: 21, testament: 'NT' },
  { id: 'ACT', name: 'Acts', chapters: 28, testament: 'NT' },
  { id: 'ROM', name: 'Romans', chapters: 16, testament: 'NT' },
  { id: '1CO', name: '1 Corinthians', chapters: 16, testament: 'NT' },
  { id: '2CO', name: '2 Corinthians', chapters: 13, testament: 'NT' },
  { id: 'GAL', name: 'Galatians', chapters: 6, testament: 'NT' },
  { id: 'EPH', name: 'Ephesians', chapters: 6, testament: 'NT' },
  { id: 'PHP', name: 'Philippians', chapters: 4, testament: 'NT' },
  { id: 'COL', name: 'Colossians', chapters: 4, testament: 'NT' },
  { id: '1TH', name: '1 Thessalonians', chapters: 5, testament: 'NT' },
  { id: '2TH', name: '2 Thessalonians', chapters: 3, testament: 'NT' },
  { id: '1TI', name: '1 Timothy', chapters: 6, testament: 'NT' },
  { id: '2TI', name: '2 Timothy', chapters: 4, testament: 'NT' },
  { id: 'TIT', name: 'Titus', chapters: 3, testament: 'NT' },
  { id: 'PHM', name: 'Philemon', chapters: 1, testament: 'NT' },
  { id: 'HEB', name: 'Hebrews', chapters: 13, testament: 'NT' },
  { id: 'JAS', name: 'James', chapters: 5, testament: 'NT' },
  { id: '1PE', name: '1 Peter', chapters: 5, testament: 'NT' },
  { id: '2PE', name: '2 Peter', chapters: 3, testament: 'NT' },
  { id: '1JN', name: '1 John', chapters: 5, testament: 'NT' },
  { id: '2JN', name: '2 John', chapters: 1, testament: 'NT' },
  { id: '3JN', name: '3 John', chapters: 1, testament: 'NT' },
  { id: 'JUD', name: 'Jude', chapters: 1, testament: 'NT' },
  { id: 'REV', name: 'Revelation', chapters: 22, testament: 'NT' },
]

export const OT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'OT')
export const NT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'NT')

export const VOTD_POOL = [
  { book_id: 'PSA', book_name: 'Psalms', chapter: 46, verse: 10, content: 'Be still, and know that I am God; I will be exalted among the nations, I will be exalted over the earth.' },
  { book_id: 'PRO', book_name: 'Proverbs', chapter: 3, verse: 5, content: 'Trust in the LORD with all your heart, and lean not on your own understanding.' },
  { book_id: 'ISA', book_name: 'Isaiah', chapter: 41, verse: 10, content: 'Do not fear, for I am with you; do not be afraid, for I am your God. I will strengthen you; I will surely help you; I will uphold you with My righteous right hand.' },
  { book_id: 'PHP', book_name: 'Philippians', chapter: 4, verse: 13, content: 'I can do all things through Christ who gives me strength.' },
  { book_id: 'JER', book_name: 'Jeremiah', chapter: 29, verse: 11, content: 'For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, to give you a future and a hope.' },
  { book_id: 'ROM', book_name: 'Romans', chapter: 8, verse: 28, content: 'And we know that God works all things together for the good of those who love Him, who are called according to His purpose.' },
  { book_id: 'PSA', book_name: 'Psalms', chapter: 23, verse: 1, content: 'The LORD is my shepherd; I shall not want.' },
  { book_id: 'JHN', book_name: 'John', chapter: 3, verse: 16, content: 'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.' },
  { book_id: 'MAT', book_name: 'Matthew', chapter: 11, verse: 28, content: 'Come to Me, all you who are weary and burdened, and I will give you rest.' },
  { book_id: 'PSA', book_name: 'Psalms', chapter: 119, verse: 105, content: 'Your word is a lamp to my feet and a light to my path.' },
  { book_id: 'ISA', book_name: 'Isaiah', chapter: 40, verse: 31, content: 'But those who wait upon the LORD will renew their strength; they will mount up with wings like eagles; they will run and not grow weary, they will walk and not faint.' },
  { book_id: 'ROM', book_name: 'Romans', chapter: 12, verse: 2, content: 'Do not be conformed to this world, but be transformed by the renewing of your mind. Then you will be able to test and approve what is the good, pleasing, and perfect will of God.' },
  { book_id: 'GAL', book_name: 'Galatians', chapter: 5, verse: 22, content: 'But the fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faithfulness,' },
  { book_id: 'HEB', book_name: 'Hebrews', chapter: 11, verse: 1, content: 'Now faith is the assurance of what we hope for and the certainty of what we do not see.' },
  { book_id: 'PSA', book_name: 'Psalms', chapter: 37, verse: 4, content: 'Delight yourself in the LORD, and He will give you the desires of your heart.' },
  { book_id: 'ECC', book_name: 'Ecclesiastes', chapter: 3, verse: 1, content: 'To everything there is a season, and a time for every purpose under heaven.' },
  { book_id: '1CO', book_name: '1 Corinthians', chapter: 13, verse: 4, content: 'Love is patient, love is kind. It does not envy, it does not boast, it is not proud.' },
  { book_id: 'JOS', book_name: 'Joshua', chapter: 1, verse: 9, content: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go.' },
  { book_id: 'PRO', book_name: 'Proverbs', chapter: 16, verse: 3, content: 'Commit your works to the LORD and your plans will be achieved.' },
  { book_id: '2TI', book_name: '2 Timothy', chapter: 1, verse: 7, content: 'For God has not given us a spirit of fear, but of power, love, and self-discipline.' },
  { book_id: 'PSA', book_name: 'Psalms', chapter: 91, verse: 1, content: 'He who dwells in the shelter of the Most High will abide in the shadow of the Almighty.' },
]

export function getVerseOfTheDay() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))
  return VOTD_POOL[dayOfYear % VOTD_POOL.length]
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/lib/__tests__/bibleData.test.js
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Aion/lib/bibleData.js frontend/src/os/apps/Aion/lib/__tests__/bibleData.test.js
git commit -m "feat(aion): static Bible data (BIBLE_BOOKS, VOTD_POOL, getVerseOfTheDay)"
```

---

### Task 3: Aion Supabase client

**Files:**
- Create: `frontend/src/os/apps/Aion/lib/aionSupabase.js`

- [ ] **Step 1: Create `frontend/src/os/apps/Aion/lib/aionSupabase.js`**

```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_AION_SUPABASE_URL
const anonKey = import.meta.env.VITE_AION_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Aion: missing VITE_AION_SUPABASE_URL or VITE_AION_SUPABASE_ANON_KEY. Add them to frontend/.env.',
  )
}

export const aionSupabase = createClient(url, anonKey, {
  auth: {
    storageKey: 'aion.supabase.auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 2: Verify existing tests still pass (env stubs cover this module)**

```bash
cd frontend && npm run test -- --run
```

Expected: all existing tests pass. If `aionSupabase` is imported in tests it won't throw because vitest.setup.js stubs the vars.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/os/apps/Aion/lib/aionSupabase.js
git commit -m "feat(aion): Aion Supabase client with namespaced auth storage"
```

---

### Task 4: `useAionAuth` hook

**Files:**
- Create: `frontend/src/os/apps/Aion/hooks/useAionAuth.js`
- Create: `frontend/src/os/apps/Aion/hooks/__tests__/useAionAuth.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/apps/Aion/hooks/__tests__/useAionAuth.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock aionSupabase before importing the hook
vi.mock('../../lib/aionSupabase', () => ({
  aionSupabase: {
    auth: {
      getSession: vi.fn(),
      signInAnonymously: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}))

import { useAionAuth } from '../useAionAuth'
import { aionSupabase } from '../../lib/aionSupabase'

const mockSession = { access_token: 'tok_abc', user: { id: 'user-1', is_anonymous: true } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAionAuth', () => {
  it('starts in loading state', () => {
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    aionSupabase.auth.signInAnonymously.mockResolvedValue({ data: { session: mockSession }, error: null })

    const { result } = renderHook(() => useAionAuth())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.session).toBeNull()
  })

  it('reuses existing session without signing in again', async () => {
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null })

    const { result } = renderHook(() => useAionAuth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.session).toEqual(mockSession)
    expect(aionSupabase.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('calls signInAnonymously when no session exists', async () => {
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    aionSupabase.auth.signInAnonymously.mockResolvedValue({ data: { session: mockSession }, error: null })

    const { result } = renderHook(() => useAionAuth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(aionSupabase.auth.signInAnonymously).toHaveBeenCalledOnce()
    expect(result.current.session).toEqual(mockSession)
  })

  it('sets error if signInAnonymously fails', async () => {
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    aionSupabase.auth.signInAnonymously.mockResolvedValue({
      data: { session: null },
      error: { message: 'Network error' },
    })

    const { result } = renderHook(() => useAionAuth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Network error')
    expect(result.current.session).toBeNull()
  })

  it('subscribes to onAuthStateChange and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    aionSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null })
    aionSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    })

    const { unmount } = renderHook(() => useAionAuth())
    await waitFor(() => {}) // let effect run
    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/hooks/__tests__/useAionAuth.test.js
```

Expected: `Cannot find module '../useAionAuth'`

- [ ] **Step 3: Create `frontend/src/os/apps/Aion/hooks/useAionAuth.js`**

```js
import { useState, useEffect } from 'react'
import { aionSupabase } from '../lib/aionSupabase'

export function useAionAuth() {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const {
          data: { session: existing },
        } = await aionSupabase.auth.getSession()

        if (existing) {
          if (mounted) setSession(existing)
        } else {
          const { data, error: signInError } = await aionSupabase.auth.signInAnonymously()
          if (signInError) throw signInError
          if (mounted) setSession(data.session)
        }
      } catch (err) {
        if (mounted) setError(err.message)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    init()

    const {
      data: { subscription },
    } = aionSupabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) setSession(newSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { session, isLoading, error }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/hooks/__tests__/useAionAuth.test.js
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Aion/hooks/useAionAuth.js frontend/src/os/apps/Aion/hooks/__tests__/useAionAuth.test.js
git commit -m "feat(aion): useAionAuth — anonymous session init + onAuthStateChange"
```

---

### Task 5: Register Aion in the app registry

**Files:**
- Modify: `frontend/src/os/stores/appRegistry.js`

- [ ] **Step 1: Add Aion import and registry entry to `appRegistry.js`**

Add the lazy import after the existing lazy imports:

```js
const AionApp = lazy(() => import('../apps/Aion/AionApp'))
```

Add `ScrollText` to the lucide import line:

```js
import {
  Activity,
  BookOpen,
  FolderOpen,
  Mail,
  MessageSquare,
  ScrollText,
  Settings,
  StickyNote,
  TerminalSquare,
} from 'lucide-react'
```

Add the registry entry in `APP_REGISTRY` after `notes`:

```js
aion: {
  id: 'aion',
  title: 'Aion',
  icon: ScrollText,
  singleton: true,
  defaultSize: { width: 900, height: 650 },
  minSize: { width: 700, height: 500 },
  component: AionApp,
},
```

Add `'aion'` to the end of `APP_ORDER`:

```js
export const APP_ORDER = [
  'media',
  'email',
  'chat',
  'terminal',
  'files',
  'settings',
  'sysmon',
  'notes',
  'aion',
]
```

- [ ] **Step 2: Verify tests still pass**

```bash
cd frontend && npm run test -- --run
```

Expected: all existing tests still pass. (AionApp.jsx doesn't exist yet but `lazy()` doesn't execute the import at registration time.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/os/stores/appRegistry.js
git commit -m "feat(aion): register Aion in app registry"
```

---

## Phase 2 — Home Screen

### Task 6: `AionApp.jsx` — root shell

**Files:**
- Create: `frontend/src/os/apps/Aion/AionApp.jsx`
- Create: `frontend/src/os/apps/Aion/__tests__/AionApp.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/apps/Aion/__tests__/AionApp.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock auth to skip async init
const mockUseAionAuth = vi.fn(() => ({ session: { access_token: 'tok' }, isLoading: false, error: null }))
vi.mock('../hooks/useAionAuth', () => ({ useAionAuth: mockUseAionAuth }))

// Mock windowStore
vi.mock('../../../stores/windowStore', () => ({
  useWindowStore: vi.fn((selector) => selector({ activeWindowId: 'aion' })),
}))

// Mock view components with simple identifiable stubs
vi.mock('../views/AionHome', () => ({
  default: ({ onNavigate }) => (
    <div data-testid="aion-home">
      <button onClick={() => onNavigate({ type: 'chat', initialMessage: 'hi' })}>go chat</button>
      <button onClick={() => onNavigate({ type: 'reader' })}>go reader</button>
    </div>
  ),
}))

vi.mock('../views/AionChat', () => ({
  default: ({ onNavigate }) => (
    <div data-testid="aion-chat">
      <button onClick={() => onNavigate({ type: 'home' })}>back</button>
    </div>
  ),
}))

vi.mock('../views/AionReader', () => ({
  default: ({ onNavigate }) => (
    <div data-testid="aion-reader">
      <button onClick={() => onNavigate({ type: 'home' })}>back</button>
    </div>
  ),
}))

import AionApp from '../AionApp'

describe('AionApp', () => {
  it('renders Home by default', () => {
    render(<AionApp windowId="aion" />)
    expect(screen.getByTestId('aion-home')).toBeDefined()
  })

  it('navigates to Chat when onNavigate called with type=chat', () => {
    render(<AionApp windowId="aion" />)
    fireEvent.click(screen.getByText('go chat'))
    expect(screen.getByTestId('aion-chat')).toBeDefined()
    expect(screen.queryByTestId('aion-home')).toBeNull()
  })

  it('navigates to Reader when onNavigate called with type=reader', () => {
    render(<AionApp windowId="aion" />)
    fireEvent.click(screen.getByText('go reader'))
    expect(screen.getByTestId('aion-reader')).toBeDefined()
  })

  it('navigates back to Home from Chat via back button', () => {
    render(<AionApp windowId="aion" />)
    fireEvent.click(screen.getByText('go chat'))
    fireEvent.click(screen.getByText('back'))
    expect(screen.getByTestId('aion-home')).toBeDefined()
  })

  it('shows loading state when auth is loading', () => {
    mockUseAionAuth.mockReturnValueOnce({ session: null, isLoading: true, error: null })
    render(<AionApp windowId="aion" />)
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('Esc key returns to Home from Chat when window is active', () => {
    render(<AionApp windowId="aion" />)
    fireEvent.click(screen.getByText('go chat'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('aion-home')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/__tests__/AionApp.test.jsx
```

Expected: `Cannot find module '../AionApp'`

- [ ] **Step 3: Create `frontend/src/os/apps/Aion/AionApp.jsx`**

(Also creates stub files for the three view components so the app renders without crashing)

First create the three stub views — they will be replaced in later tasks:

`frontend/src/os/apps/Aion/views/AionHome.jsx`:
```jsx
export default function AionHome({ onNavigate }) {
  return <div className="flex h-full items-center justify-center text-amber-400">AionHome stub</div>
}
```

`frontend/src/os/apps/Aion/views/AionChat.jsx`:
```jsx
export default function AionChat({ view, onNavigate, session }) {
  return <div className="flex h-full items-center justify-center text-amber-400">AionChat stub</div>
}
```

`frontend/src/os/apps/Aion/views/AionReader.jsx`:
```jsx
export default function AionReader({ view, onNavigate, session }) {
  return <div className="flex h-full items-center justify-center text-amber-400">AionReader stub</div>
}
```

Now create `frontend/src/os/apps/Aion/AionApp.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { useWindowStore } from '../../stores/windowStore'
import { useAionAuth } from './hooks/useAionAuth'
import AionHome from './views/AionHome'
import AionChat from './views/AionChat'
import AionReader from './views/AionReader'

export default function AionApp({ windowId }) {
  const [view, setView] = useState({ type: 'home' })
  const { session, isLoading, error } = useAionAuth()
  const activeWindowId = useWindowStore((s) => s.activeWindowId)

  const navigate = (newView) => setView(newView)

  // Esc: return to Home when this window is focused and an input is not active
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return
      if (activeWindowId !== windowId) return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      setView((prev) => (prev.type === 'home' ? prev : { type: 'home' }))
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeWindowId, windowId])

  if (isLoading) {
    return (
      <div
        role="status"
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0a0a0c]"
      >
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        <p className="font-mono text-[10px] tracking-widest text-amber-500/50 uppercase">
          Connecting...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#0a0a0c] p-6">
        <AlertTriangle className="h-8 w-8 text-amber-500/60" />
        <p className="text-center font-mono text-sm text-amber-200/60">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded border border-amber-500/30 px-4 py-2 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    )
  }

  if (view.type === 'chat') {
    return <AionChat view={view} onNavigate={navigate} session={session} />
  }
  if (view.type === 'reader') {
    return <AionReader view={view} onNavigate={navigate} session={session} />
  }
  return <AionHome onNavigate={navigate} session={session} />
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/__tests__/AionApp.test.jsx
```

Expected: 6 tests pass.

- [ ] **Step 5: Verify app appears in launcher**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` → App Launcher (Alt+L) → should show "Aion" with a scroll icon. Opening it should show the loading/error state or the stub.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/os/apps/Aion/
git commit -m "feat(aion): AionApp root shell — view state machine + auth guard + Esc"
```

---

### Task 7: `PromptPill` + `AionHome` — home screen

**Files:**
- Create: `frontend/src/os/apps/Aion/components/PromptPill.jsx`
- Replace: `frontend/src/os/apps/Aion/views/AionHome.jsx` (stub → full implementation)

- [ ] **Step 1: Create `frontend/src/os/apps/Aion/components/PromptPill.jsx`**

```jsx
export default function PromptPill({ icon: Icon, label, onPress }) {
  return (
    <button
      onClick={() => onPress(label)}
      aria-label={`Ask: ${label}`}
      className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-white/[0.03] px-3 py-1.5 text-left font-mono text-xs text-amber-200/70 transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.06] hover:text-amber-200 active:scale-95"
    >
      {Icon && <Icon className="h-3 w-3 shrink-0 text-amber-500/70" />}
      <span className="line-clamp-1">{label}</span>
    </button>
  )
}
```

- [ ] **Step 2: Replace `frontend/src/os/apps/Aion/views/AionHome.jsx` with full implementation**

```jsx
import { BookOpen, Search, Brain, Flame, Sparkles, Bird, Zap, Copy } from 'lucide-react'
import { getVerseOfTheDay } from '../lib/bibleData'
import PromptPill from '../components/PromptPill'
import { useState, useRef, useEffect } from 'react'

const SUGGESTIONS = [
  { icon: Search, label: 'Find verses with the number 444' },
  { icon: Brain, label: 'What is a stoic view on Ecclesiastes?' },
  { icon: Flame, label: "I'm feeling completely burnt out today" },
  { icon: Sparkles, label: 'What does the Bible say about new beginnings?' },
  { icon: Bird, label: 'Verses about finding peace in chaos' },
  { icon: Zap, label: 'What does Proverbs say about wisdom?' },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function AionHome({ onNavigate }) {
  const votd = getVerseOfTheDay()
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef(null)

  const handleSend = (text) => {
    const msg = (text ?? inputValue).trim()
    if (!msg) return
    onNavigate({ type: 'chat', initialMessage: msg })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0a0a0c]">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 translate-y-1/3 rounded-full bg-amber-600/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute left-0 top-0 h-48 w-48 -translate-x-1/3 -translate-y-1/3 rounded-full bg-violet-600/[0.05] blur-3xl" />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[480px] flex-col items-center px-6 py-10">
          {/* Greeting */}
          <p className="mb-5 font-mono text-[10px] tracking-[0.25em] text-amber-200/30 uppercase">
            {getGreeting()}
          </p>

          {/* Wordmark */}
          <h1 className="mb-4 font-mono text-4xl font-thin tracking-[0.45em] text-white/90">
            A I O N
          </h1>

          {/* Divider */}
          <div className="mb-4 h-px w-12 bg-amber-500/60 shadow-[0_0_8px_rgba(217,119,6,0.8)]" />

          {/* Tagline */}
          <p className="mb-6 font-mono text-xs italic text-amber-200/40">
            "Seek, and you shall find."
          </p>

          {/* VOTD card */}
          <button
            onClick={() =>
              onNavigate({ type: 'reader', bookId: votd.book_id, chapter: votd.chapter })
            }
            className="mb-4 w-full rounded-2xl border border-amber-500/25 bg-black/50 p-5 text-left transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.04]"
            aria-label={`Verse of the Day: ${votd.content} — ${votd.book_name} ${votd.chapter}:${votd.verse}. Click to read in context.`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.2em] text-amber-500 uppercase">
                Verse of the Day
              </span>
              <Sparkles className="h-3 w-3 text-amber-500/70" />
            </div>
            <p className="mb-2 font-mono text-sm italic leading-relaxed text-white/85">
              "{votd.content}"
            </p>
            <p className="text-right font-mono text-[10px] text-amber-200/50">
              — {votd.book_name} {votd.chapter}:{votd.verse}
            </p>
          </button>

          {/* Read Bible button */}
          <button
            onClick={() => onNavigate({ type: 'reader' })}
            className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/40 px-4 py-3 transition-colors hover:border-amber-500/20 hover:bg-white/[0.03]"
            aria-label="Open Bible Reader"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="flex-1 font-mono text-sm text-white/70">Read the Bible</span>
            <span className="font-mono text-xs text-white/20">→</span>
          </button>

          {/* Suggestions */}
          <div className="w-full">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="font-mono text-[9px] tracking-[0.2em] text-white/30 uppercase">
                Explore
              </span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <PromptPill key={s.label} icon={s.icon} label={s.label} onPress={handleSend} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chat input — pinned bottom */}
      <div className="border-t border-white/[0.06] bg-[#0a0a0c] px-4 py-3">
        <div className="mx-auto flex max-w-[480px] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about Scripture…"
            aria-label="Ask Aion a question"
            className="flex-1 bg-transparent font-mono text-sm text-white/80 placeholder:text-white/20 focus:outline-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim()}
            aria-label="Send message"
            className="rounded-lg bg-amber-500/20 px-2 py-1 font-mono text-xs text-amber-400 transition-colors hover:bg-amber-500/30 disabled:opacity-30"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Visually verify in browser**

With `npm run dev` running, open the Aion app — you should see the home screen with VOTD card, "Read the Bible" button, suggestion pills, and chat input.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/os/apps/Aion/components/PromptPill.jsx frontend/src/os/apps/Aion/views/AionHome.jsx
git commit -m "feat(aion): AionHome — VOTD card, prompt pills, chat input, Read Bible button"
```

---

## Phase 3 — Chat

### Task 8: `useAionChat` hook

**Files:**
- Create: `frontend/src/os/apps/Aion/hooks/useAionChat.js`
- Create: `frontend/src/os/apps/Aion/hooks/__tests__/useAionChat.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/apps/Aion/hooks/__tests__/useAionChat.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAionChat } from '../useAionChat'

const mockSession = { access_token: 'tok_abc' }

function makeSseStream(events) {
  // Build SSE text from array of {event, data} objects
  const text = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')
  const encoder = new TextEncoder()
  const chunks = [encoder.encode(text)]
  let i = 0
  return {
    getReader: () => ({
      read: vi.fn(() => {
        if (i < chunks.length) return Promise.resolve({ done: false, value: chunks[i++] })
        return Promise.resolve({ done: true, value: undefined })
      }),
    }),
  }
}

beforeEach(() => {
  vi.stubGlobal('VITE_AION_SUPABASE_URL', 'https://test.supabase.co')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAionChat', () => {
  it('starts with empty messages and not streaming', () => {
    const { result } = renderHook(() => useAionChat(mockSession))
    expect(result.current.messages).toEqual([])
    expect(result.current.isStreaming).toBe(false)
  })

  it('appends user message and empty assistant message on sendMessage', async () => {
    const stream = makeSseStream([{ event: 'done', data: {} }])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream }),
    )

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })

    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'Hello' })
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant' })
  })

  it('accumulates streamed text into the assistant message', async () => {
    const stream = makeSseStream([
      { event: 'text', data: { content: 'Hi ' } },
      { event: 'text', data: { content: 'there!' } },
      { event: 'done', data: {} },
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }))

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })

    expect(result.current.messages[1].content).toBe('Hi there!')
  })

  it('attaches verses to the correct assistant message', async () => {
    const verses = [{ id: 1, book_name: 'Psalms', chapter: 23, verse: 1, content: 'The LORD...' }]
    const stream = makeSseStream([
      { event: 'text', data: { content: 'A verse:' } },
      { event: 'verses', data: { verses } },
      { event: 'done', data: {} },
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }))

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Psalms 23', null)
    })

    expect(result.current.messages[1].verses).toEqual(verses)
  })

  it('ignores malformed SSE data without crashing', async () => {
    const encoder = new TextEncoder()
    const badChunk = encoder.encode('event: text\ndata: NOT_JSON\n\n')
    const stream = {
      getReader: () => ({
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: badChunk })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      }),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }))

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })

    // Should not throw; assistant message content stays empty
    expect(result.current.messages[1].content).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('sets error when fetch returns non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Rate limited' }),
      }),
    )

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })

    expect(result.current.error).toBe('Rate limited')
  })

  it('reset clears messages and error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'fail' }) }),
    )

    const { result } = renderHook(() => useAionChat(mockSession))
    await act(async () => {
      await result.current.sendMessage('Hello', null)
    })
    expect(result.current.error).toBe('fail')

    act(() => result.current.reset())
    expect(result.current.messages).toEqual([])
    expect(result.current.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/hooks/__tests__/useAionChat.test.js
```

Expected: `Cannot find module '../useAionChat'`

- [ ] **Step 3: Create `frontend/src/os/apps/Aion/hooks/useAionChat.js`**

```js
import { useState, useCallback, useRef, useEffect } from 'react'

const AION_URL = (import.meta.env.VITE_AION_SUPABASE_URL ?? '').replace(/\/$/, '')
const AION_KEY = import.meta.env.VITE_AION_SUPABASE_ANON_KEY ?? ''

export function useAionChat(session) {
  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const abortRef = useRef(null)

  const sendMessage = useCallback(
    async (text, convId = null) => {
      if (!session) return

      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      const uid = Date.now()
      const userMsg = { id: `u-${uid}`, role: 'user', content: text, verses: [] }
      const assistantId = `a-${uid}`
      const assistantMsg = { id: assistantId, role: 'assistant', content: '', verses: [] }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)
      setError(null)

      try {
        const response = await fetch(`${AION_URL}/functions/v1/chat`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: AION_KEY,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            message: text.trim(),
            conversation_id: convId ?? conversationId,
          }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || `HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6))
                switch (currentEvent) {
                  case 'text':
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId ? { ...m, content: m.content + data.content } : m,
                      ),
                    )
                    break
                  case 'verses':
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId ? { ...m, verses: data.verses } : m,
                      ),
                    )
                    break
                  case 'conversation':
                    setConversationId(data.id)
                    break
                  case 'error':
                    setError(data.message)
                    break
                  // Unknown events are silently ignored
                }
              } catch {
                // Skip malformed SSE data
              }
              currentEvent = ''
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setIsStreaming(false)
      }
    },
    [session, conversationId],
  )

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    setMessages([])
    setIsStreaming(false)
    setError(null)
    setConversationId(null)
  }, [])

  // Cancel in-flight request on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return { messages, sendMessage, isStreaming, error, conversationId, reset }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/hooks/__tests__/useAionChat.test.js
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Aion/hooks/useAionChat.js frontend/src/os/apps/Aion/hooks/__tests__/useAionChat.test.js
git commit -m "feat(aion): useAionChat — SSE streaming, per-message verses, AbortController"
```

---

### Task 9: `VerseCard` + `AionChat` — chat view

**Files:**
- Create: `frontend/src/os/apps/Aion/components/VerseCard.jsx`
- Replace: `frontend/src/os/apps/Aion/views/AionChat.jsx` (stub → full)

- [ ] **Step 1: Create `frontend/src/os/apps/Aion/components/VerseCard.jsx`**

```jsx
export default function VerseCard({ verse }) {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
      <p className="mb-1 font-mono text-[9px] tracking-widest text-amber-500/80 uppercase">
        {verse.book_name} {verse.chapter}:{verse.verse}
      </p>
      <p className="font-mono text-xs italic leading-relaxed text-white/70">{verse.content}</p>
    </div>
  )
}
```

- [ ] **Step 2: Replace `frontend/src/os/apps/Aion/views/AionChat.jsx` with full implementation**

```jsx
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { useAionChat } from '../hooks/useAionChat'
import VerseCard from '../components/VerseCard'

export default function AionChat({ view, onNavigate, session }) {
  const { messages, sendMessage, isStreaming, error, reset } = useAionChat(session)
  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef(null)
  const didAutoSubmitRef = useRef(false)

  // Auto-submit initial message exactly once (Strict Mode safe)
  useEffect(() => {
    if (!view.initialMessage || didAutoSubmitRef.current) return
    didAutoSubmitRef.current = true
    setInputValue(view.initialMessage)
    sendMessage(view.initialMessage, view.conversationId ?? null)
  }, [view.initialMessage, view.conversationId, sendMessage])

  // Abort on unmount
  useEffect(() => {
    return () => reset()
  }, [reset])

  // Scroll to bottom on new message content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text || isStreaming) return
    setInputValue('')
    sendMessage(text, null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Esc inside input: blur only (don't navigate home)
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.currentTarget.blur()
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0c]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <button
          onClick={() => onNavigate({ type: 'home' })}
          aria-label="Back to home"
          className="rounded p-1 text-amber-400/60 transition-colors hover:bg-white/[0.05] hover:text-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs tracking-widest text-white/40 uppercase">
          Aion · Chat
        </span>
        {isStreaming && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
            <span className="font-mono text-[9px] tracking-widest text-violet-400/60 uppercase">
              Thinking
            </span>
          </span>
        )}
      </div>

      {/* Message area */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <MessageSquare className="h-8 w-8 text-amber-500/20" />
            <p className="font-mono text-xs text-white/20">Ask anything about Scripture</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 font-mono text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-amber-500/15 text-amber-100/90'
                  : 'bg-white/[0.04] text-white/80'
              }`}
            >
              {msg.content}
              {/* Streaming cursor */}
              {msg.role === 'assistant' && isStreaming && msg === messages[messages.length - 1] && (
                <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-violet-400" />
              )}
            </div>

            {/* Verse cards attached to this assistant message */}
            {msg.role === 'assistant' && msg.verses && msg.verses.length > 0 && (
              <div className="w-full max-w-[85%] space-y-2">
                {msg.verses.map((v) => (
                  <VerseCard
                    key={`${v.book_id ?? v.book_name}-${v.chapter}-${v.verse}`}
                    verse={v}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Inline error */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2">
            <p className="font-mono text-xs text-red-400/80">{error}</p>
            <button
              onClick={() => sendMessage(messages.findLast((m) => m.role === 'user')?.content ?? '', null)}
              className="mt-1 font-mono text-[10px] text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Chat input */}
      <div className="border-t border-white/[0.06] bg-[#0a0a0c] px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about Scripture…"
            aria-label="Chat message"
            className="flex-1 bg-transparent font-mono text-sm text-white/80 placeholder:text-white/20 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            aria-label="Send"
            className="rounded-lg bg-amber-500/20 px-2 py-1 font-mono text-xs text-amber-400 hover:bg-amber-500/30 disabled:opacity-30"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Test Chat visually in browser**

Start dev server (`npm run dev`), open Aion, type a question in the home input, verify:
- Transitions to Chat view
- Message appears with streaming indicator
- Esc on empty input area blurs; Esc outside input returns Home
- Back arrow returns Home

(Full E2E streaming requires real Aion Supabase credentials. Verify the UI flow works; API errors will show the "Try again" state if credentials are placeholder.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/os/apps/Aion/components/VerseCard.jsx frontend/src/os/apps/Aion/views/AionChat.jsx
git commit -m "feat(aion): AionChat — streaming messages, per-message verse cards, auto-submit guard"
```

---

## Phase 4 — Reader

### Task 10: `useAionReader` hook

**Files:**
- Create: `frontend/src/os/apps/Aion/hooks/useAionReader.js`
- Create: `frontend/src/os/apps/Aion/hooks/__tests__/useAionReader.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/apps/Aion/hooks/__tests__/useAionReader.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/aionSupabase', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(),
  }
  return {
    aionSupabase: {
      from: vi.fn(() => mockChain),
    },
    __mockChain: mockChain,
  }
})

import { useAionReader } from '../useAionReader'
import { aionSupabase, __mockChain } from '../../lib/aionSupabase'

const sampleVerses = [
  { verse: 1, content: 'The LORD is my shepherd; I shall not want.', book_name: 'Psalms' },
  { verse: 2, content: 'He makes me lie down in green pastures.', book_name: 'Psalms' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAionReader', () => {
  it('starts in loading state when bookId and chapter are provided', () => {
    __mockChain.order.mockResolvedValue({ data: sampleVerses, error: null })
    const { result } = renderHook(() => useAionReader('PSA', 23))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.verses).toEqual([])
  })

  it('returns verses on successful fetch', async () => {
    __mockChain.order.mockResolvedValue({ data: sampleVerses, error: null })
    const { result } = renderHook(() => useAionReader('PSA', 23))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.verses).toEqual(sampleVerses)
    expect(result.current.error).toBeNull()
  })

  it('queries bible_verses with correct bookId and chapter', async () => {
    __mockChain.order.mockResolvedValue({ data: [], error: null })
    renderHook(() => useAionReader('PSA', 23))
    await waitFor(() => {})
    expect(aionSupabase.from).toHaveBeenCalledWith('bible_verses')
    expect(__mockChain.eq).toHaveBeenCalledWith('book_id', 'PSA')
    expect(__mockChain.eq).toHaveBeenCalledWith('chapter', 23)
  })

  it('sets error on fetch failure', async () => {
    __mockChain.order.mockResolvedValue({ data: null, error: { message: 'Access denied' } })
    const { result } = renderHook(() => useAionReader('PSA', 23))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Access denied')
    expect(result.current.verses).toEqual([])
  })

  it('returns empty and does not fetch when bookId is null', () => {
    const { result } = renderHook(() => useAionReader(null, null))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.verses).toEqual([])
    expect(aionSupabase.from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/hooks/__tests__/useAionReader.test.js
```

Expected: `Cannot find module '../useAionReader'`

- [ ] **Step 3: Create `frontend/src/os/apps/Aion/hooks/useAionReader.js`**

```js
import { useState, useEffect } from 'react'
import { aionSupabase } from '../lib/aionSupabase'

export function useAionReader(bookId, chapter) {
  const [verses, setVerses] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!bookId || !chapter) {
      setVerses([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    aionSupabase
      .from('bible_verses')
      .select('verse, content, book_name')
      .eq('book_id', bookId)
      .eq('chapter', Number(chapter))
      .order('verse')
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setVerses([])
        } else {
          setVerses(data ?? [])
        }
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId, chapter, retryCount])

  const refetch = () => setRetryCount((c) => c + 1)

  return { verses, isLoading, error, refetch }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npm run test -- --run src/os/apps/Aion/hooks/__tests__/useAionReader.test.js
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/os/apps/Aion/hooks/useAionReader.js frontend/src/os/apps/Aion/hooks/__tests__/useAionReader.test.js
git commit -m "feat(aion): useAionReader — bible_verses query with retry"
```

---

### Task 11: `AionReader` — Bible reader view

**Files:**
- Replace: `frontend/src/os/apps/Aion/views/AionReader.jsx` (stub → full)

- [ ] **Step 1: Replace `frontend/src/os/apps/Aion/views/AionReader.jsx` with full implementation**

```jsx
import { useState, useCallback } from 'react'
import { ArrowLeft, BookOpen, Copy, MessageSquare, RefreshCw } from 'lucide-react'
import { OT_BOOKS, NT_BOOKS } from '../lib/bibleData'
import { useAionReader } from '../hooks/useAionReader'

// ── Sub-view: Book list ─────────────────────────────────────
function BookList({ onSelectBook }) {
  const [testament, setTestament] = useState('OT')
  const books = testament === 'OT' ? OT_BOOKS : NT_BOOKS

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0c]">
      <div className="border-b border-white/[0.06] px-4 py-2.5">
        <span className="font-mono text-xs tracking-widest text-white/40 uppercase">
          Aion · Bible
        </span>
      </div>

      {/* OT / NT toggle */}
      <div className="flex gap-2 border-b border-white/[0.06] px-4 py-3">
        {['OT', 'NT'].map((t) => (
          <button
            key={t}
            onClick={() => setTestament(t)}
            className={`rounded-lg px-3 py-1 font-mono text-xs transition-colors ${
              testament === t
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {t === 'OT' ? 'Old Testament' : 'New Testament'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-1 p-3">
          {books.map((book) => (
            <button
              key={book.id}
              onClick={() => onSelectBook(book)}
              aria-label={`${book.name}, ${book.chapters} chapters`}
              className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-amber-500/20 hover:bg-amber-500/[0.04]"
            >
              <p className="font-mono text-xs text-white/80">{book.name}</p>
              <p className="font-mono text-[9px] text-white/25">
                {book.chapters} ch.
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: Chapter list ──────────────────────────────────
function ChapterList({ book, onSelectChapter, onBack }) {
  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0c]">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back to book list"
          className="rounded p-1 text-amber-400/60 hover:bg-white/[0.05] hover:text-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-white/70">{book.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-5 gap-1 p-3">
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((ch) => (
            <button
              key={ch}
              onClick={() => onSelectChapter(ch)}
              aria-label={`Chapter ${ch}`}
              className="rounded-lg border border-white/[0.05] bg-white/[0.02] py-2 font-mono text-xs text-white/60 transition-colors hover:border-amber-500/20 hover:bg-amber-500/[0.04] hover:text-amber-300"
            >
              {ch}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: Chapter viewer ────────────────────────────────
function ChapterViewer({ book, chapter, onBack, onAskAion }) {
  const { verses, isLoading, error, refetch } = useAionReader(book.id, chapter)
  const [activeVerse, setActiveVerse] = useState(null)
  const [scrollPct, setScrollPct] = useState(0)

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget
    const pct = el.scrollHeight > el.clientHeight
      ? Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100)
      : 100
    setScrollPct(pct)
  }, [])

  const handleCopy = (verse) => {
    const text = `"${verse.content}" — ${book.name} ${chapter}:${verse.verse}`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0c]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back to chapter list"
          className="rounded p-1 text-amber-400/60 hover:bg-white/[0.05] hover:text-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-white/70">
          {book.name} · Ch. {chapter}
        </span>
        {/* Scroll progress */}
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-amber-500/50 transition-all"
              style={{ width: `${scrollPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Verse list */}
      {isLoading && (
        <div className="flex flex-1 flex-col gap-2 p-4" role="status" aria-label="Loading verses">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-white/[0.04]" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="font-mono text-xs text-amber-200/40">Couldn't load chapter</p>
          <button
            onClick={refetch}
            className="flex items-center gap-2 rounded border border-amber-500/20 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="flex-1 overflow-y-auto px-5 py-4" onScroll={handleScroll}>
          {verses.map((v) => (
            <div key={v.verse} className="group mb-4">
              <button
                onClick={() => setActiveVerse(activeVerse === v.verse ? null : v.verse)}
                className="w-full text-left"
                aria-label={`Verse ${v.verse}: ${v.content}`}
              >
                <span className="mr-2 font-mono text-[10px] font-bold text-amber-500/70">
                  {v.verse}
                </span>
                <span className="font-mono text-sm leading-relaxed text-white/80">{v.content}</span>
              </button>

              {/* Inline actions revealed on click */}
              {activeVerse === v.verse && (
                <div className="mt-2 flex gap-2 pl-5">
                  <button
                    onClick={() =>
                      onAskAion(
                        `What does ${book.name} ${chapter}:${v.verse} mean? "${v.content}"`,
                      )
                    }
                    className="flex items-center gap-1.5 rounded border border-violet-500/20 bg-violet-500/[0.06] px-2 py-1 font-mono text-[10px] text-violet-300/80 hover:bg-violet-500/10"
                    aria-label={`Ask Aion about ${book.name} ${chapter}:${v.verse}`}
                  >
                    <MessageSquare className="h-2.5 w-2.5" /> Ask Aion
                  </button>
                  <button
                    onClick={() => handleCopy(v)}
                    className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-white/40 hover:bg-white/[0.05]"
                    aria-label={`Copy verse ${v.verse}`}
                  >
                    <Copy className="h-2.5 w-2.5" /> Copy
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Root AionReader ─────────────────────────────────────────
export default function AionReader({ view, onNavigate }) {
  // Deep-init: if bookId + chapter → chapter view; bookId only → chapter list; neither → book list
  const initialBook = view.bookId
    ? (OT_BOOKS.find((b) => b.id === view.bookId) ?? NT_BOOKS.find((b) => b.id === view.bookId))
    : null

  const [readerView, setReaderView] = useState(() => {
    if (initialBook && view.chapter) return { type: 'chapter', book: initialBook, chapter: view.chapter }
    if (initialBook) return { type: 'chapters', book: initialBook }
    return { type: 'books' }
  })

  const handleAskAion = (message) => onNavigate({ type: 'chat', initialMessage: message })

  if (readerView.type === 'chapter') {
    return (
      <ChapterViewer
        book={readerView.book}
        chapter={readerView.chapter}
        onBack={() => setReaderView({ type: 'chapters', book: readerView.book })}
        onAskAion={handleAskAion}
      />
    )
  }

  if (readerView.type === 'chapters') {
    return (
      <ChapterList
        book={readerView.book}
        onSelectChapter={(ch) =>
          setReaderView({ type: 'chapter', book: readerView.book, chapter: ch })
        }
        onBack={() => setReaderView({ type: 'books' })}
      />
    )
  }

  return (
    <BookList
      onSelectBook={(book) => setReaderView({ type: 'chapters', book })}
    />
  )
}
```

- [ ] **Step 2: Verify Reader visually in browser**

Open Aion → click "Read the Bible" → should show book list with OT/NT toggle. Click a book → chapter grid. Click a chapter → verse list (will show loading skeleton, then "Couldn't load chapter" + retry if Aion Supabase isn't reachable). Click a verse → inline "Ask Aion" and "Copy" buttons appear. "Ask Aion" transitions to Chat.

- [ ] **Step 3: Verify back navigation**

From chapter view → back → chapter list → back → book list → clicking anywhere does not go Home (Reader manages its own sub-navigation). Back arrow in ChapterList and ChapterViewer headers work correctly.

- [ ] **Step 4: Verify deep-link from VOTD card on Home**

Click the VOTD card on AionHome — it calls `onNavigate({ type: 'reader', bookId: 'PSA', chapter: 46 })` (for example). AionReader should open directly in chapter view for that book/chapter.

- [ ] **Step 5: Run full test suite**

```bash
cd frontend && npm run test -- --run
```

Expected: all tests pass including the new Aion tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/os/apps/Aion/views/AionReader.jsx
git commit -m "feat(aion): AionReader — book list, chapter list, chapter viewer, Ask Aion action"
```

---

## Final Checks

### Task 12: Integration verification

- [ ] **Check 1: No localStorage collision**

Open browser DevTools → Application → Local Storage. Confirm `aion.supabase.auth` exists as its own key separate from any `sb-*` Nexus OS keys.

- [ ] **Check 2: Window respects min size**

Resize the Aion window to near its minimum (700×500). Verify Home, Chat, and Reader remain usable — text doesn't overflow, inputs remain accessible.

- [ ] **Check 3: Aion is in the app launcher**

Press Alt+L → Aion appears with the ScrollText icon. Double-click the desktop icon (if present) opens the app.

- [ ] **Check 4: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Check 5: Run full test suite one final time**

```bash
cd frontend && npm run test -- --run
```

Expected: all tests pass.

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat(aion): complete Aion v1 integration — Home, Chat, Reader inside Nexus OS"
```
