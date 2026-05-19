# Supabase Realtime Integration

## Problem

Media changes require a page reload to appear. The Kanban board feels static — no live sync between database state and UI.

## Approach: Direct Supabase Realtime client (Option A)

Chosen over:

- **B (Backend SSE):** Over-engineered. Adds latency and maintenance surface by proxying Realtime through Litestar.
- **C (Polling):** 5-second delay kills the "living system" feel. Noisy, inefficient.

## Design

### Architecture

Add `@supabase/supabase-js` to frontend, used exclusively for Realtime subscriptions. All mutations still go through `apiFetch()` → Cloudflare Worker → Litestar. Realtime is read-only.

Data flow:

```
Supabase DB change → Realtime WebSocket → handleRealtimeSync()
  → direct React Query cache mutation → Framer Motion animates layout
```

### Auth for Realtime (Option B: token in session response)

Backend `/auth/me` returns `supabase_token` alongside existing session data. Frontend passes it to `realtime.realtime.setAuth()` so the WebSocket connection respects RLS (`auth.uid() = user_id`).

Chosen over:

- **A (Separate endpoint):** Extra round-trip for no benefit.
- **C (Skip RLS):** Security nightmare — leaks other users' changes over the wire.

### Cache Update Strategy (Option B: Direct mutation)

`handleRealtimeSync` uses `queryClient.setQueryData()` to directly patch the React Query cache:

- **INSERT:** Prepend new item to list
- **UPDATE:** Map-replace matching item (with shallow equality dedup via `JSON.stringify`)
- **DELETE:** Filter out by `oldItem.id`

Chosen over:

- **A (Invalidate + refetch):** Adds network round-trip, defeats instant benefit.
- **C (Hybrid):** Unnecessary complexity for simple flat objects.

### Deduplication (Option B: Shallow equality)

When optimistic update already patched the cache, the Realtime event arrives with identical data. `JSON.stringify` comparison skips redundant updates, preventing flicker. No mutation tracking needed — this is a single-user personal tracker.

### Realtime Client

`frontend/src/lib/realtimeClient.js` — lightweight Supabase client initialized with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Only exports the client for Realtime use.

### Security

- Anon key safe to expose (RLS enforces user isolation)
- `supabase_token` stored in React state only (never localStorage)
- CSP headers must allow `wss://*.supabase.co`
- Token refreshes when `/auth/me` is re-called

## Files Touched

| File                                 | Change                                         |
| ------------------------------------ | ---------------------------------------------- |
| `frontend/src/lib/realtimeClient.js` | Create: Supabase client for Realtime only      |
| `frontend/src/hooks/useMedia.js`     | Add Realtime subscription + handleRealtimeSync |
| `frontend/src/hooks/useAuth.js`      | Pass supabase_token from session               |
| `frontend/.env`                      | Add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  |
| Backend auth endpoint                | Include supabase_token in session response     |

5 files modified/created.

## Unchanged

- All API mutations (still through apiFetch → Worker → Litestar)
- Optimistic updates (still work, Realtime confirms/corrects)
- Framer Motion animations (layoutId already on cards, cache updates trigger layout animations)
- CyberCard, MediaVault, MediaDetailModal (render from React Query cache, no changes needed)
