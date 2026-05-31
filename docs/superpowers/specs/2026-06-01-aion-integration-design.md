# Aion Integration — Nexus OS

**Date:** 2026-06-01
**Status:** Approved
**Scope:** Integrate Aion (AI-powered Bible companion) as a native Nexus OS app

---

## Overview

Aion is an AI-powered Bible companion with hybrid RAG chat, a full Bible reader, and a daily verse feature. It is being re-implemented natively inside Nexus OS as a single windowed app using React + Tailwind, replacing the original React Native / Expo codebase for the desktop context.

Aion runs as a **self-contained guest app** inside Nexus OS. It manages its own anonymous Supabase session, separate from Nexus OS auth. Nexus OS only hosts the window.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Integration approach | Native React + Tailwind (not iframe) | Full OS integration, cyberpunk skin, shared window system |
| Auth model | Aion's own anonymous Supabase session | Clean boundary; Nexus OS login ≠ Aion login |
| App registration | Single "Aion" app in launcher | One window, internal navigation |
| Internal navigation | Home landing with in-place transitions (Approach C) | Preserves Aion's emotional flow; not a generic tabbed panel |
| v1 scope | Chat + Reader + VOTD | Lean MVP; streaks/bookmarks/TTS deferred to Phase 2+ |

---

## Architecture

### New environment variables

Added to `frontend/.env` (and production Cloudflare Pages env):

```
VITE_AION_SUPABASE_URL=...
VITE_AION_SUPABASE_ANON_KEY=...
```

`aionSupabase.js` validates both at import time and throws immediately when the Aion module loads. CI/deploy should also include an explicit env check so missing production variables are caught before release.

### App registration

One entry added to `os/stores/appRegistry.js`:

```js
aion: {
  title: 'Aion',
  icon: BookOpen,
  singleton: true,
  defaultSize: { width: 900, height: 650 },
  minSize: { width: 700, height: 500 },
  component: lazy(() => import('../apps/Aion/AionApp')),
}
```

### File structure

```
frontend/src/os/apps/Aion/
  AionApp.jsx               # Root: view state machine + auth guard + Esc listener
  views/
    AionHome.jsx            # VOTD + prompt pills + "Read the Bible" + chat input
    AionChat.jsx            # Streaming chat + per-message verse cards + back arrow
    AionReader.jsx          # Book list → chapter list → chapter view (local sub-state)
  components/
    VerseCard.jsx           # Inline verse citation card (amber border, book/ch/v header)
    PromptPill.jsx          # Suggestion pill button
  hooks/
    useAionAuth.js          # Anonymous Supabase session init + onAuthStateChange
    useAionChat.js          # SSE streaming chat hook (ported from Aion lib/chat.ts)
    useAionReader.js        # Fetch chapter verses from bible_verses table
  lib/
    aionSupabase.js         # Separate createClient (storageKey: 'aion.supabase.auth')
    bibleData.js            # Ported BIBLE_BOOKS, OT_BOOKS, NT_BOOKS, getVerseOfTheDay
```

### View state machine

`AionApp` owns a `view` state object. No router, no URL changes.

```js
{ type: 'home' }
{ type: 'chat', initialMessage?, conversationId? }
{ type: 'reader', bookId?, chapter? }
```

**Transitions:**

| From | To | Trigger |
|---|---|---|
| home | chat | Prompt pill click or chat input submit |
| home | reader | "Read the Bible" button |
| chat | home | Back arrow or Esc |
| reader | home | Back arrow or Esc |
| reader | chat | "Ask Aion" on a verse |

---

## Data Flow & Hooks

### `useAionAuth`

- On mount: `getSession()` → if no session, `signInAnonymously()`
- Subscribes to `onAuthStateChange` to keep `session` fresh as tokens rotate
- Returns `{ session, isLoading, error }`
- `AionApp` shows "Connecting…" spinner until `isLoading` is false

### `useAionChat`

Ported from Aion's `lib/chat.ts`. Key changes for Nexus OS:
- Uses `import.meta.env` instead of `EXPO_PUBLIC_*`
- Accepts `session` as a parameter; does not call Supabase internally
- SSE fetch headers: `Authorization`, `apikey`, `Content-Type: application/json`, `Accept: text/event-stream`
- `AbortController` stored in a ref — cancelled on unmount, window close, and new message send
- Verses stored **per message** (each assistant message owns its `verses: []`), not as a single global list

Returns: `{ sendMessage, messages, isStreaming, error, reset }`

### `useAionReader`

```js
aionSupabase
  .from('bible_verses')
  .select('verse, content, book_name')
  .eq('book_id', bookId)
  .eq('chapter', chapterNum)
  .order('verse')
```

- Requires an active anonymous session (RLS: `to authenticated, using (auth.uid() IS NOT NULL)`)
- Simple `useState + useEffect` — not wired into Nexus OS's React Query infrastructure

Returns: `{ verses, isLoading, error, refetch }`

### `bibleData.js` (static)

Direct port of Aion's `lib/bible-data.ts`. No network calls. `getVerseOfTheDay()` derives today's verse from `dayOfYear % verses.length`.

---

## UI & Visual Design

### Palette

Aion uses an **amber/gold manuscript palette** inside the Nexus OS cyberpunk shell to feel distinct:

| Token | Value | Use |
|---|---|---|
| Background | `#0a0a0c` | Window fill |
| Amber accent | `#d97706` | VOTD border, verse refs, active pills, reader button |
| Purple accent | `#7c3aed` | Divider pulse, streaming indicator |
| Content text | `#f5f0e8` (warm ivory) | Verse/message body |
| Muted text | `#a89880` | Labels, references, counts |

Ambient glows: amber radial glow bottom-center, purple glow top-left (CSS `box-shadow` / `radial-gradient`).

### `AionHome`

Centered column, max-width 480px:
1. Time-based greeting (small caps, muted)
2. `A I O N` wordmark (Orbitron thin, wide tracking) + animated amber divider
3. VOTD card (amber border, italic verse, reference, `Sparkles` icon) — clickable → Reader
4. "Read the Bible" ghost row (`BookOpen` icon)
5. `Explore` label with dividers
6. Prompt pill grid (2-column wrap, 6 suggestions)
7. Chat input pinned to window bottom

### `AionChat`

- Message area (scrollable): user messages right-aligned amber tint, assistant messages left-aligned dark glass
- Streaming: blinking cursor at end of `streamingText`; purple dot pulse in header
- `VerseCard` list below each assistant message
- `initialMessage` auto-submitted once via `useRef` guard (prevents React Strict Mode double-send)
- Back arrow top-left; title bar: `Aion · Chat`

### `AionReader`

Three sub-views via local `readerView` state:

1. **Book list** — OT/NT toggle, grid of book cards (name + chapter count)
2. **Chapter list** — back to book list, numbered chapter grid
3. **Chapter view** — back to chapter list, verse list (amber verse number + ivory content), click-to-reveal actions ("Ask Aion", "Copy"), scroll progress bar

**Deep-init logic:**
```
bookId + chapter → start in chapter view
bookId only     → start in chapter list
neither         → start in book list
```

### Interaction states

| State | Treatment |
|---|---|
| Auth loading | Centered "Connecting…" with amber spinner |
| Auth error | Error card with retry, no blocking modal |
| Chat streaming | Purple dot pulse in header, cursor at stream end |
| Chat error | Inline below last message, "Try again" link |
| Reader loading | Skeleton verse shimmer (3 lines) |
| Reader error | "Couldn't load chapter" with retry |

### Esc behaviour

- Registered on `AionApp` mount, removed on unmount
- Only fires when this window's instance ID matches `windowStore.focusedWindowId`
- Esc **inside** a chat input → blur input only (input stops propagation)
- Esc **outside** input → return to `{ type: 'home' }`

---

## Implementation Phases

### Phase 1 — Foundation
- `frontend/.env`: add Aion env vars
- `lib/aionSupabase.js`: separate client, namespaced storage, env validation
- `lib/bibleData.js`: port static data
- `hooks/useAionAuth.js`: anonymous sign-in + `onAuthStateChange`
- `appRegistry.js`: register `aion` entry

**Gate:** open window → session in `localStorage['aion.supabase.auth']`

### Phase 2 — Home screen
- `AionApp.jsx`: view state, Esc listener, session guard
- `AionHome.jsx`: VOTD card, prompt pills, reader row, chat input
- `PromptPill.jsx`

**Gate:** VOTD correct for today, submit triggers chat transition

### Phase 3 — Chat
- `hooks/useAionChat.js`: SSE fetch, 4 headers, AbortController, per-message verses
- `AionChat.jsx`: message list, streaming, back arrow
- `VerseCard.jsx`

**Gate:** full Q&A round-trip, streaming renders, verses on correct message, abort on back

### Phase 4 — Reader
- `hooks/useAionReader.js`: Supabase query
- `AionReader.jsx`: all three sub-views, deep-init, "Ask Aion" transition

**Gate:** deep-link to Psalms 23 opens directly, "Ask Aion" pre-fills chat

---

## Testing Checklist

### Auth
- [ ] Anonymous session created on first open, reused on re-open
- [ ] No localStorage collision with Nexus OS (`sb-*` vs `aion.supabase.auth`)

### Chat
- [ ] Message sent exactly once (Strict Mode guard)
- [ ] Streaming text appends correctly
- [ ] Verses attach to the correct assistant message
- [ ] Error state shows "Try again"
- [ ] AbortController cancels on: Back, window close, new send
- [ ] Malformed/unknown SSE events do not crash Chat

### Reader
- [ ] Book → chapter → verse navigation works
- [ ] Deep-init: `{ bookId: 'PSA', chapter: 23 }` opens Psalms 23 directly
- [ ] "Ask Aion" pre-populates Chat with correct template string

### Transitions
- [ ] Esc in input blurs; Esc outside returns Home
- [ ] Esc does not fire when another window is focused

### VOTD
- [ ] Verse changes day-to-day (verify with two `dayOfYear` values)

### Responsiveness
- [ ] At min window size 700×500: Home, Chat, Reader remain usable

### Accessibility
- [ ] Icon-only buttons have `aria-label`
- [ ] Reader verse actions are keyboard accessible
- [ ] Chat input: Enter sends, Shift+Enter inserts newline

### Production
- [ ] `VITE_AION_SUPABASE_URL` set in Cloudflare Pages env
- [ ] `VITE_AION_SUPABASE_ANON_KEY` set in Cloudflare Pages env
- [ ] CI/deploy script verifies both Aion env vars are present before build/release

---

## Risk Controls

| Risk | Mitigation |
|---|---|
| Aion Supabase RLS rejects anonymous reads | Confirm `bible_verses` SELECT policy targets `authenticated` role before Phase 4 |
| Edge Function CORS blocks SSE | Verify `OPTIONS` allows `authorization`, `apikey`, `x-client-info`, `content-type` in Phase 3 |
| Missing env vars in production | `aionSupabase.js` throws at import time — caught at build, not runtime |
| Token expiry mid-stream | `onAuthStateChange` keeps session fresh; `useAionChat` reads token at call time |
| Esc fires across windows | Guard uses window instance ID from `windowStore.focusedWindowId`, not hardcoded `'aion'` |

---

## Deferred (Phase 2+)

- Streak system
- Conversation history drawer
- Bookmarks and verse highlights
- Text-to-speech
- Font size / theme settings
