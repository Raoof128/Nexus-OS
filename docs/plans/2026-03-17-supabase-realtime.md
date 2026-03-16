# Supabase Realtime Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Live-sync media changes to the frontend via Supabase Realtime WebSockets so the Kanban board updates instantly without page reloads.

**Architecture:** Add `@supabase/supabase-js` to the frontend, used exclusively for Realtime subscriptions. The backend `/auth/session` (and login/register/refresh) responses are extended with the raw Supabase access token so the Realtime client can authenticate via RLS. A `handleRealtimeSync` function directly patches the React Query cache on INSERT/UPDATE/DELETE events, with shallow equality deduplication to prevent flicker from optimistic updates.

**Tech Stack:** `@supabase/supabase-js`, React Query `setQueryData`, Supabase Postgres Changes, Framer Motion (existing `layoutId` handles animations automatically)

---

### Task 1: Install `@supabase/supabase-js` and add env vars

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/.env`

**Step 1: Install the package**

Run: `cd frontend && npm install @supabase/supabase-js`
Expected: Package added to `dependencies` in `package.json`

**Step 2: Add env vars to `.env`**

Add these two lines to `frontend/.env`:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

The actual production values will be set in Cloudflare Pages environment variables. The `.env` file is for local dev only.

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.env
git commit -m "chore: add @supabase/supabase-js and realtime env vars"
```

---

### Task 2: Create `realtimeClient.js`

**Files:**
- Create: `frontend/src/lib/realtimeClient.js`
- Create: `frontend/src/lib/realtimeClient.test.js`

**Step 1: Write the failing test**

Create `frontend/src/lib/realtimeClient.test.js`:

```javascript
import { describe, expect, it, vi } from 'vitest'

// Mock @supabase/supabase-js before importing
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ realtime: { setAuth: vi.fn() } })),
}))

describe('realtimeClient', () => {
  it('exports a supabase client instance', async () => {
    const { realtimeClient } = await import('./realtimeClient')
    expect(realtimeClient).toBeDefined()
    expect(realtimeClient.realtime).toBeDefined()
  })

  it('calls createClient with env vars', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    expect(createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        realtime: expect.objectContaining({
          params: expect.objectContaining({ eventsPerSecond: 10 }),
        }),
      })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/realtimeClient.test.js`
Expected: FAIL — module `./realtimeClient` not found

**Step 3: Write the implementation**

Create `frontend/src/lib/realtimeClient.js`:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const realtimeClient = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/realtimeClient.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/realtimeClient.js frontend/src/lib/realtimeClient.test.js
git commit -m "feat(realtime): add Supabase Realtime client module"
```

---

### Task 3: Backend — include `access_token` in session responses

The backend needs to return the raw Supabase access token alongside the session data so the frontend can authenticate the Realtime WebSocket. The access token is already available — it's the cookie value itself. We just need to include it in the JSON response.

**Files:**
- Modify: `backend/schemas.py:45-49` — add `access_token` field to `AuthSessionResponse`
- Modify: `backend/auth_controller.py:60-70` — pass the token into the response builder

**Step 1: Add `access_token` field to `AuthSessionResponse`**

In `backend/schemas.py`, modify the `AuthSessionResponse` class:

```python
class AuthSessionResponse(BaseModel):
    """Frontend-safe session snapshot."""

    user: SessionUser
    expires_at: int | None = None
    access_token: str | None = None
```

**Step 2: Pass the token through in `_build_session_response`**

In `backend/auth_controller.py`, modify the `_build_session_response` function:

```python
def _build_session_response(access_token: str) -> AuthSessionResponse:
    """Derive a frontend-safe session snapshot from a Supabase access token."""

    payload = decode_supabase_token(access_token)
    return AuthSessionResponse(
        user=SessionUser(
            id=payload.get("sub", ""),
            email=payload.get("email"),
        ),
        expires_at=payload.get("exp"),
        access_token=access_token,
    )
```

This single change flows through to ALL endpoints that call `_build_session_response`: `/auth/session`, `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/reset-password`.

**Step 3: Run backend tests (if any)**

Run: `cd /Users/raoof.r12/Desktop/Raouf/Nexus && python -m pytest backend/ -v 2>/dev/null || echo "No backend tests configured"`
Expected: Tests pass or no tests to run

**Step 4: Commit**

```bash
git add backend/schemas.py backend/auth_controller.py
git commit -m "feat(auth): include access_token in session response for Realtime auth"
```

---

### Task 4: Frontend — pass `access_token` through auth context

The `AuthContext` already stores the full session response object, so `session.access_token` will be automatically available once the backend returns it. However, we should verify this and ensure the token refreshes properly.

**Files:**
- Modify: `frontend/src/context/AuthContext.jsx` — no code changes needed (session object already stored as-is), but verify the flow

**Step 1: Verify the auth flow passes through the token**

Read `frontend/src/context/AuthContext.jsx` and confirm:
- `loadCurrentSession()` calls `authFetch('/auth/session')` and returns the full response → stored in `setSession(currentSession)` ✓
- `signIn` calls `authFetch('/auth/login', ...)` and stores the full response → `setSession(authenticatedSession)` ✓
- The session object is passed through `AuthContext.Provider` to all consumers ✓

The `access_token` field will be available at `session.access_token` in any component that calls `useAuth()`.

**Step 2: Commit** (only if changes were needed — skip if no changes)

No commit needed for this task — the existing code already passes the full session object through.

---

### Task 5: Frontend — add Realtime subscription to `useMedia` hook

This is the core task. Add a `useEffect` to `useMedia` that subscribes to Postgres Changes on the `media` table and directly mutates the React Query cache.

**Files:**
- Modify: `frontend/src/hooks/useMedia.js:1-100`
- Create: `frontend/src/hooks/useRealtimeSync.test.js`

**Step 1: Write the failing tests**

Create `frontend/src/hooks/useRealtimeSync.test.js`:

```javascript
import { describe, expect, it } from 'vitest'
import { handleRealtimeEvent } from '../hooks/useMedia'

describe('handleRealtimeEvent', () => {
  const existingItems = [
    { id: '1', title: 'Dune', type: 'book', status: 'Reading' },
    { id: '2', title: '1984', type: 'book', status: 'To Read' },
  ]

  it('prepends new item on INSERT', () => {
    const newItem = { id: '3', title: 'Foundation', type: 'book', status: 'To Read' }
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'INSERT',
      new: newItem,
      old: {},
    })
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(newItem)
  })

  it('replaces matching item on UPDATE', () => {
    const updated = { ...existingItems[0], status: 'Finished' }
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'UPDATE',
      new: updated,
      old: existingItems[0],
    })
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('Finished')
  })

  it('skips UPDATE when data is identical (deduplication)', () => {
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'UPDATE',
      new: existingItems[0],
      old: existingItems[0],
    })
    // Returns the same reference when nothing changed
    expect(result).toBe(existingItems)
  })

  it('removes item on DELETE', () => {
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'DELETE',
      new: {},
      old: { id: '1' },
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('skips INSERT if item already exists (deduplication)', () => {
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'INSERT',
      new: existingItems[0],
      old: {},
    })
    expect(result).toHaveLength(2)
  })

  it('returns oldData for unknown event types', () => {
    const result = handleRealtimeEvent(existingItems, {
      eventType: 'UNKNOWN',
      new: {},
      old: {},
    })
    expect(result).toBe(existingItems)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useRealtimeSync.test.js`
Expected: FAIL — `handleRealtimeEvent` is not exported from `../hooks/useMedia`

**Step 3: Implement `handleRealtimeEvent` and add the subscription**

Modify `frontend/src/hooks/useMedia.js` to the following complete file:

```javascript
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import { realtimeClient } from '../lib/realtimeClient'

function getMediaQueryKey(session, type) {
  return ['media', session?.user?.id ?? 'anonymous', type]
}

/**
 * Pure function that applies a Realtime event to the current cache.
 * Exported for unit testing.
 */
export function handleRealtimeEvent(oldData, payload) {
  const { eventType } = payload
  const newItem = payload.new
  const oldItem = payload.old

  switch (eventType) {
    case 'INSERT': {
      // Skip if optimistic update already added this item
      if (oldData.some((item) => item.id === newItem.id)) {
        return oldData
      }
      return [newItem, ...oldData]
    }
    case 'UPDATE': {
      const existing = oldData.find((item) => item.id === newItem.id)
      // Shallow equality dedup — skip if optimistic update already applied
      if (existing && JSON.stringify(existing) === JSON.stringify(newItem)) {
        return oldData
      }
      return oldData.map((item) => (item.id === newItem.id ? newItem : item))
    }
    case 'DELETE': {
      return oldData.filter((item) => item.id !== oldItem.id)
    }
    default:
      return oldData
  }
}

export function useMedia(session, type = 'book') {
  const queryClient = useQueryClient()
  const mediaQueryKey = getMediaQueryKey(session, type)
  const isAuthenticated = Boolean(session?.user?.id)
  const accessToken = session?.access_token

  const mediaQuery = useQuery({
    queryKey: mediaQueryKey,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => apiFetch(`/media?type=${type}`),
  })

  // --- Supabase Realtime subscription ---
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    realtimeClient.realtime.setAuth(accessToken)

    const channel = realtimeClient
      .channel(`media-sync-${type}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'media',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const targetType = payload.new?.type || payload.old?.type
          if (targetType !== type) return

          queryClient.setQueryData(
            mediaQueryKey,
            (current) => handleRealtimeEvent(current ?? [], payload),
          )
        },
      )
      .subscribe()

    return () => {
      realtimeClient.removeChannel(channel)
    }
  }, [isAuthenticated, accessToken, type, session?.user?.id, mediaQueryKey, queryClient])

  const addMediaMutation = useMutation({
    mutationFn: (data) =>
      apiFetch('/media', {
        method: 'POST',
        body: { ...data, type },
      }),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: mediaQueryKey })
      const previous = queryClient.getQueryData(mediaQueryKey) ?? []
      const optimistic = {
        ...data,
        type,
        id: `optimistic-${Date.now()}`,
      }
      queryClient.setQueryData(mediaQueryKey, [...previous, optimistic])
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, context?.previous ?? [])
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mediaQueryKey })
    },
  })

  const updateMediaMutation = useMutation({
    mutationFn: ({ mediaId, data }) =>
      apiFetch(`/media/${mediaId}`, {
        method: 'PUT',
        body: data,
      }),
    onMutate: async ({ mediaId, data }) => {
      await queryClient.cancelQueries({ queryKey: mediaQueryKey })
      const previous = queryClient.getQueryData(mediaQueryKey) ?? []
      queryClient.setQueryData(
        mediaQueryKey,
        previous.map((item) =>
          item.id === mediaId ? { ...item, ...data } : item,
        ),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, context?.previous ?? [])
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mediaQueryKey })
    },
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (mediaId) =>
      apiFetch(`/media/${mediaId}`, { method: 'DELETE' }),
    onMutate: async (mediaId) => {
      await queryClient.cancelQueries({ queryKey: mediaQueryKey })
      const previous = queryClient.getQueryData(mediaQueryKey) ?? []
      queryClient.setQueryData(
        mediaQueryKey,
        previous.filter((item) => item.id !== mediaId),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, context?.previous ?? [])
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mediaQueryKey })
    },
  })

  return {
    items: mediaQuery.data ?? [],
    loading: mediaQuery.isPending || mediaQuery.isFetching || addMediaMutation.isPending,
    error: mediaQuery.error?.message ?? addMediaMutation.error?.message ?? null,
    refetch: mediaQuery.refetch,
    addMedia: addMediaMutation.mutateAsync,
    updateMedia: updateMediaMutation.mutateAsync,
    deleteMedia: deleteMediaMutation.mutateAsync,
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useRealtimeSync.test.js`
Expected: PASS — all 6 tests green

**Step 5: Run ALL tests to make sure nothing broke**

Run: `cd frontend && npx vitest run`
Expected: All tests pass (including existing `mediaConfig.test.js`)

**Step 6: Commit**

```bash
git add frontend/src/hooks/useMedia.js frontend/src/hooks/useRealtimeSync.test.js
git commit -m "feat(realtime): add live Supabase Realtime sync to useMedia hook"
```

---

### Task 6: Enable Supabase Realtime on the `media` table

Supabase Realtime requires the `media` table to have replication enabled. This is a one-time database configuration.

**Files:**
- None (SQL executed in Supabase dashboard or via migration)

**Step 1: Run this SQL in the Supabase SQL editor**

```sql
-- Enable Realtime for the media table
ALTER PUBLICATION supabase_realtime ADD TABLE media;
```

You can run this in the Supabase Dashboard → SQL Editor, or via the Supabase CLI:

```bash
supabase db execute --sql "ALTER PUBLICATION supabase_realtime ADD TABLE media;"
```

**Step 2: Verify Realtime is enabled**

In the Supabase Dashboard → Database → Replication, confirm the `media` table is listed under the `supabase_realtime` publication.

---

### Task 7: Set production env vars in Cloudflare Pages

**Files:**
- None (Cloudflare dashboard configuration)

**Step 1: Get your Supabase project URL and anon key**

Go to Supabase Dashboard → Settings → API. Copy:
- **Project URL** (e.g., `https://abc123.supabase.co`)
- **anon public key** (starts with `eyJ...`)

**Step 2: Add env vars to Cloudflare Pages**

Via Cloudflare dashboard or CLI:

```bash
# If using wrangler for Pages (otherwise use dashboard)
# Cloudflare Pages → Settings → Environment variables → Production
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

These must be set as build-time variables (prefixed with `VITE_`) so Vite inlines them during the build.

**Step 3: Trigger a rebuild**

Push the changes from Tasks 1-5 to trigger a new Cloudflare Pages build, or manually trigger a rebuild in the dashboard.

**Step 4: Verify in production**

1. Open the app at `home-notes-app.uk`
2. Open browser DevTools → Network → WS tab
3. Confirm a WebSocket connection to `wss://your-project-ref.supabase.co/realtime/...` is active
4. Change a media status → confirm no page reload needed
5. Open a second browser tab → change status in one tab → confirm the other tab updates within ~1 second
