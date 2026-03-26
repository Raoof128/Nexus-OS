# CLAUDE.md — Nexus Archive

Personal media vault (books, movies, anime, job applications) with AI recommendations. Cyberpunk aesthetic.

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS v4 + React Query + Framer Motion
- **Backend:** Python 3.12 + Litestar + Pydantic v2
- **Database/Auth:** Supabase (Postgres + Auth + Realtime)
- **AI:** Google Gemini (recommendations + chat)
- **Deploy:** Cloudflare Pages (frontend), DigitalOcean droplet (backend API)

## Commands

```bash
# Frontend
cd frontend && npm run dev          # Dev server on :5173
cd frontend && npm run build        # Production build → dist/
cd frontend && npm run lint         # ESLint
cd frontend && npm run test         # Vitest (run once)
cd frontend && npm run test:watch   # Vitest (watch mode)

# Backend
python3 -m uvicorn backend.app:app --reload   # Dev server on :8000
python3 -m pytest                              # Run all backend tests
python3 -m ruff check backend tests            # Lint
python3 -m ruff format --check backend tests   # Format check

# Both (from root)
make lint        # Lint frontend + backend
make test        # Backend tests only
make security    # Bandit + pip-audit + npm audit

# Supabase local
supabase start                  # Start local Supabase (needs Docker)
supabase db reset               # Apply migrations + seed
supabase stop                   # Stop local stack

# Deploy frontend (MUST override VITE_API_URL for production)
cd frontend && VITE_API_URL=https://home-notes-app.uk/api npm run build && wrangler pages deploy dist --project-name nexus-archive --branch codex/bootstrap --commit-dirty=true
```

## Architecture

```
backend/
  app.py              # Litestar app + route registration
  controllers.py      # MediaController — CRUD at /media
  chat_controller.py  # ChatController — AI chat at /chat
  auth_controller.py  # AuthController — login/refresh/logout at /auth
  auth.py             # JWT middleware (HS256 + ES256 JWKS)
  config.py           # Typed settings from env (loads .env then .env.local)
  schemas.py          # Pydantic v2 request/response models
  services.py         # Supabase PostgREST client + Gemini service
  data_protection.py  # LLM input scrubbing, PII masking, takeaway encryption
  rate_limit.py       # Sliding-window rate limiter (Redis or in-memory)
  security.py         # Response security headers (CSP, etc.)
frontend/src/
  App.jsx                          # Main app — tabs, routing, state
  hooks/useMedia.js                # React Query + Realtime subscription + optimistic updates
  hooks/useChat.js                 # Chat messages query + mutation
  hooks/useAuth.js                 # Auth context consumer
  hooks/useFocusTrap.js            # Reusable modal focus trap
  lib/mediaConfig.js               # Media types, statuses, TYPE_ICONS (single source of truth)
  lib/apiClient.js                 # Fetch wrapper with cookie auth + silent refresh
  lib/realtimeClient.js            # Supabase Realtime client (separate from API)
  lib/queryClient.js               # React Query client (staleTime: 5min, gcTime: 10min)
  context/AuthContext.jsx           # Session state from backend cookie auth
  components/features/CyberCard.jsx       # Memoized media card with Framer Motion layoutId
  components/features/KanbanBoard.jsx     # Status-column grid (memoized)
  components/features/MediaVault.jsx      # Full table view with search (memoized)
  components/features/MediaDetailModal.jsx # Shared-element detail modal
  components/features/MediaForm.jsx       # Shared form for Add + Edit dialogs
  components/features/ConfirmDialog.jsx   # Reusable delete confirmation
  components/features/AddMediaDialog.jsx  # FAB + create form
  components/features/EditMediaDialog.jsx # Edit form (controlled by parent)
  components/features/AuthPanel.jsx       # Login/register/forgot sliding panels
  components/features/ChatLayout.jsx      # Chat sidebar + window (lazy-loaded)
  components/features/AICmdPalette.jsx    # Cmd+K AI suggestions (lazy-loaded)
supabase/
  config.toml          # Local Supabase config (auth redirect URLs)
  seed.sql             # Dev user: raoof.r12@gmail.com / Dev@Nexus2026
  migrations/          # 4 migrations: books → unified media → chat → realtime
```

## Key Patterns

### Auth: Zero-trust cookie model
Backend manages HttpOnly cookies. Frontend never touches tokens directly. `apiClient.js` handles 401 → silent refresh → retry automatically. Supabase JS SDK is only used for Realtime subscriptions (separate client in `realtimeClient.js`), NOT for auth.

### Data flow: Optimistic + Realtime
1. Mutation fires → `onMutate` applies optimistic update to React Query cache
2. Server responds → `onSuccess` replaces optimistic item with server record (NO `invalidateQueries` for updates — this was a deliberate fix to prevent a race condition with Realtime)
3. Supabase Realtime fires → `handleRealtimeEvent` deduplicates by comparing ALL user-visible fields (status, title, creator, genre, rating, takeaway, sub_info)

### Media types: Single source of truth
`lib/mediaConfig.js` exports `MEDIA_TYPES`, `MEDIA_CONFIG`, `TYPE_ICONS`, and `getStatusNav()`. All components import from here — never define local icon maps or status lists.

### Components: Shared form pattern
`MediaForm.jsx` is the single form used by both `AddMediaDialog` and `EditMediaDialog`. Never duplicate form fields between them.

## Environment Variables

### Backend (`backend/.env`)
Required: `SUPABASE_URL`, `SUPABASE_AUTH_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `AUDIT_LOG_SALT`
Optional: `TAKEAWAY_ENCRYPTION_KEY` (Fernet key for at-rest encryption), `REDIS_URL`, `TRUSTED_PROXY_IPS`
Local override: `backend/.env.local` (gitignored, loaded second with override=True)

### Frontend (`frontend/.env`)
Required: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
Optional: `VITE_SENTRY_DSN`, `VITE_SENTRY_TRACES_SAMPLE_RATE`

## Gotchas

- **Never use `invalidateQueries` in `updateMediaMutation.onSettled`** — causes a GET refetch that races with Realtime, reverting optimistic status changes. Use `onSuccess` with the server response instead.
- **`sanitize()` is not needed in JSX** — React already escapes text interpolation. A prior `sanitize()` function was double-encoding HTML entities (`<3` → `&lt;3`). It was removed; don't re-add it.
- **Supabase Realtime dedup must compare ALL editable fields** — status-only comparison misses edits to title/creator/etc. and causes Framer Motion layout re-triggers.
- **`backend/.env.local`** overrides `backend/.env` for local Supabase credentials. Regenerate after `supabase stop && supabase start` if JWT keys rotate.
- **Seed SQL is local-only** — `supabase/seed.sql` creates a dev user. Never run against production. Production accounts go through Supabase Auth dashboard.
- **Frontend env vars must start with `VITE_`** — Vite only exposes prefixed vars to client code. Both `realtimeClient.js` and `apiClient.js` validate their required vars at import time.
- **AuthPanel registration** uses `signIn()` after successful signup, NOT `window.location.reload()`.
- **CyberCard is memoized** with a custom comparator on item fields. If you add a new displayable field to the media model, add it to the comparator in `CyberCard.jsx`.
- **Production builds MUST set `VITE_API_URL=https://home-notes-app.uk/api`** — the local `.env` has `localhost:8000`. If you forget the override, the deployed site will try to hit localhost and all API calls fail with `ERR_CONNECTION_REFUSED`. A Cloudflare Worker (`worker/`) proxies `/api/*` to Render.

## Code Style

- **Frontend:** ESLint with react-hooks plugin. No TypeScript. JSX. Tailwind utility classes. Framer Motion for animation. `import { motion as Motion }` convention.
- **Backend:** Ruff (line-length 88, select E/F/I/B). Double quotes. Python 3.12+. Pydantic v2 models with `ConfigDict(str_strip_whitespace=True)`.
- **Design:** Cyberpunk aesthetic is mandatory — neon cyan/magenta on dark, glassmorphism, Orbitron/Oxanium/JetBrains Mono fonts. No generic/minimal designs.

## Testing

- Backend: `pytest` (tests/ directory). Mock Supabase client in fixtures. CI sets dummy env vars.
- Frontend: `vitest` + `@testing-library/react`. Tests live alongside source (`*.test.js`). Run with `npm run test -- --run`.
- CI: GitHub Actions runs lint + test + build + bandit + pip-audit + npm audit + gitleaks on all pushes.

## Deploy

- **Frontend → Cloudflare Pages:** Build with `VITE_API_URL=https://home-notes-app.uk/api`, then `wrangler pages deploy dist --project-name nexus-archive --branch codex/bootstrap --commit-dirty=true`. Production branch is `codex/bootstrap` (NOT `main`). Domains: `home-notes-app.uk`, `www.home-notes-app.uk`.
- **Backend → DigitalOcean:** Docker container on droplet `170.64.167.95`, behind Nginx reverse proxy (ports 80 + 443 with Cloudflare Origin Cert). DNS: `api.home-notes-app.uk` → droplet (Cloudflare-proxied). Cloudflare Worker proxies `home-notes-app.uk/api/*` → `https://api.home-notes-app.uk`. Healthcheck at `/healthz`.
- **Security headers** defined in `vercel.json` (CSP, X-Frame-Options, etc.) — this file is still used by Cloudflare Pages for header configuration.
