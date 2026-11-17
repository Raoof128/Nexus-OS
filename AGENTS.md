# AGENTS.md — Nexus OS

A Windows 7 Aero-style **browser "OS"**: a windowing desktop shell (draggable/resizable/snappable windows, taskbar, app launcher, desktop icons, lock screen, boot sequence) hosting real apps — a personal media vault (books, movies, anime, job applications) with AI recommendations, an email client, an AI chat assistant, plus utility apps (Terminal, File Manager, System Monitor, Notes, Settings).

> The product evolved from the original "Nexus Archive" single-page tabbed app into the "Nexus OS" shell. If you find docs referring to `components/features/*` or `App.jsx` "tabs", they're stale — the live structure is `frontend/src/os/*` (see Architecture below).

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS v4 + React Query + Framer Motion
- **Backend:** Python 3.12 + Litestar + Pydantic v2
- **Database/Auth:** Standalone PostgreSQL 17 and Better Auth in production. Legacy Supabase mode remains available for local testing and rollback.
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
cd frontend && npm run test:e2e     # Playwright journeys (mocked API) — `npx playwright install chromium` once

# Backend
python3 -m uvicorn backend.app:app --reload   # Dev server on :8000
python3 -m pytest                              # Run all backend tests
python3 -m ruff check backend tests            # Lint
python3 -m ruff format --check backend tests   # Format check

# Both (from root)
make lint        # Lint frontend + backend
make test        # Backend pytest + frontend Vitest
make security    # Bandit + pip-audit + npm audit (Gitleaks runs in CI only)

# Supabase local
supabase start                  # Start local Supabase (needs Docker)
supabase db reset               # Apply migrations + seed
supabase stop                   # Stop local stack

# Deploy frontend (MUST override VITE_API_URL for production)
cd frontend && VITE_API_URL=https://home-notes-app.uk/api VITE_NEXUS_AUTH=standalone npm run build && wrangler pages deploy dist --project-name nexus-archive --branch codex/bootstrap --commit-dirty=true
```

## Architecture

```
backend/
  app.py              # Litestar app + route registration
  controllers.py      # MediaController — CRUD at /media
  chat_controller.py  # ChatController — AI chat at /chat
  tasks_controller.py # TasksController — tasks/lists CRUD at /api/tasks
  tasks_service.py    # Recurrence (dateutil, schedule-based) + position math
  tasks_schemas.py    # Pydantic v2 task request models
  auth_controller.py  # AuthController — login/refresh/logout at /auth
  auth.py             # JWT middleware (HS256 + ES256 JWKS)
  config.py           # Typed settings from env (loads .env then .env.local)
  schemas.py          # Pydantic v2 request/response models
  services.py         # Supabase PostgREST client + Gemini service
  data_protection.py  # LLM input scrubbing, PII masking, takeaway encryption
  rate_limit.py       # Sliding-window rate limiter (Redis or in-memory)
  security.py         # Response security headers (CSP, etc.)
frontend/src/
  App.jsx                          # Auth gate: loading → ResetPassword / AuthPanel / <Desktop>
  main.jsx                         # React root + QueryClient provider + Sentry init
  index.css                        # Tailwind v4 + 7.css (layered) + Win7 adapter (see docs/win7-design-system.md)
  context/AuthContext.jsx          # Session state from backend cookie auth
  hooks/useMedia.js                # React Query (60s bounded polling) + optimistic updates
  hooks/useChat.js                 # Chat messages query + mutation
  hooks/useEmails.js               # Email list/search/pagination query
  hooks/useEmailActions.js         # Email mutations (star/read/move/send/AI draft)
  hooks/useAuth.js                 # Auth context consumer
  hooks/useFocusTrap.js            # Reusable modal focus trap
  lib/mediaConfig.js               # Media types, statuses, TYPE_ICONS (single source of truth)
  lib/apiClient.js                 # Fetch wrapper with cookie auth + silent refresh
  lib/realtimeClient.js            # Supabase JS client — no Realtime channels; used for the password-recovery OTP exchange
  lib/queryClient.js               # React Query client (defaults staleTime 5min, gcTime 10min; hooks override, e.g. media 60s, email 30s)
  lib/privateState.js              # Owner of browser-local data; wipes files/notes/layout when another account signs in
  lib/motion.js                    # Shared Framer Motion SPRING/DURATION/EASE tokens
  os/Desktop.jsx                   # OS shell: wallpaper, windows, taskbar, boot, lock, idle-lock
  os/stores/windowStore.js         # Window open/close/focus/move/resize/snap/minimize (zustand)
  os/stores/settingsStore.js       # Window colour (--w7-w-bg), wallpaper, UI scale (persisted)
  os/stores/notificationStore.js   # Toast + notification badge state
  os/stores/fileSystemStore.js     # Sandboxed local file tree for File Manager (persisted)
  os/stores/appRegistry.js         # APP_REGISTRY + APP_ORDER — single source for all apps
  os/hooks/useGlobalShortcuts.js   # Alt+W/M/arrows/[ ]/1-8/L window + launcher shortcuts
  os/components/Window.jsx         # Draggable/resizable window chrome (memoized)
  os/components/Taskbar.jsx        # Win7 superbar: Start orb, task buttons, tray, clock, Show desktop
  os/components/AppLauncher.jsx    # Win7 Start menu (Alt+L): programs, search, places, Lock/Log off
  os/components/AppIcon.jsx        # Original glossy SVG app icons (registry `tint`)
  os/components/DesktopIcons.jsx   # Desktop icon grid (click select / double-click open)
  os/components/ContextMenu.jsx    # Right-click desktop menu
  os/components/{BootSequence,LockScreen,SnapPreview,NotificationToast}.jsx
  os/apps/Library/                 # Media vault: LibraryApp, KanbanBoard, MediaVault,
                                   #   MediaForm, MediaDetailModal, Add/EditMediaDialog
  os/apps/Email/                   # EmailApp + FolderSidebar/EmailList/EmailReader/ComposeModal
  os/apps/Chat/                    # ChatApp, ChatSidebar, ChatWindow, (Lazy)AICmdPalette
  os/apps/Tasks/                   # Google-Tasks-style manager: lists, 1-level subtasks,
                                   #   due date/time, recurrence, star, drag, encrypted
                                   #   notes, NL quick-add, notification-center reminders
  os/apps/Auth/                    # AuthPanel (login/register/forgot), ResetPasswordPage
  os/apps/{NotesApp,TerminalApp,FileManagerApp,SystemMonitorApp,SettingsApp}.jsx
  components/ui/CyberCard.jsx      # Memoized media card with Framer Motion layoutId
  components/ui/ConfirmDialog.jsx  # Reusable portal confirm dialog (focus-trapped)
  components/ui/PasswordInput.jsx  # Password field with show/hide toggle
  components/layout/Navbar.jsx     # Top bar shown on the auth/login screen only
supabase/
  config.toml          # Local Supabase config (auth redirect URLs)
  seed.sql             # Dev user: raoof.r12@gmail.com / Dev@Nexus2026
  migrations/          # 14 migrations (media, chat, email inbox, tasks, notes, RLS hardening, …) — the schema source of truth
```

## Key Patterns

### Auth: Zero-trust cookie model

The backend manages HttpOnly Better Auth session cookies and passes the verified user UUID into PostgreSQL row-level security. `apiClient.js` handles session refresh. The legacy browser client in `realtimeClient.js` supports older Supabase recovery links in legacy builds.

### Data flow: Optimistic updates + bounded polling

1. Mutation fires → `onMutate` applies optimistic update to React Query cache
2. Server responds → `onSuccess` replaces optimistic item with server record (NO `invalidateQueries` for updates — a refetch that lands before the write commits reverts the optimistic change)
3. Freshness comes from bounded polling (`refetchInterval`, paused in background tabs), not Realtime. There is no Realtime subscription or `handleRealtimeEvent` — don't document or rely on one.

### Media types: Single source of truth

`lib/mediaConfig.js` exports `MEDIA_TYPES`, `MEDIA_CONFIG`, `TYPE_ICONS`, and `getStatusNav()`. All components import from here — never define local icon maps or status lists.

### Components: Shared form pattern

`MediaForm.jsx` is the single form used by both `AddMediaDialog` and `EditMediaDialog`. Never duplicate form fields between them.

### OS shell: App registry is the single source of truth

Every app is declared once in `os/stores/appRegistry.js` (`APP_REGISTRY` keyed by app id, `APP_ORDER` for launcher/shortcut order) with its `title`, `icon`, `singleton`, `defaultSize`, `minSize`, and lazy `component`. The taskbar, app launcher, desktop icons, global shortcuts (Alt+1-8), and `Desktop.jsx` all read from it — to add an app, register it there and nothing else needs a hardcoded list. Window lifecycle (open/focus/move/resize/snap/minimize/maximize) lives entirely in `windowStore.js`; apps render inside `<Window>` and should not manage their own positioning.

### Design system: Windows 7 Aero via 7.css

The UI is Windows 7 (Aero glass frames/taskbar, light app windows, Segoe UI 9pt). `index.css` loads the unmodified **7.css** scoped build into `@layer win7` (scoped by `<body class="win7">`), then a `win7-reset` layer (opt-outs: _classed_ buttons are reset to bare — use a bare `<button>` or `.w7-btn` for a Win7 push button; label-less checkboxes; classed listboxes) and a `nexus` adapter layer (`.nx-*` shell classes, `.w7-*` Explorer helpers), all below Tailwind `utilities`. **Read `docs/win7-design-system.md` before any UI work** — it lists the markup 7.css styles automatically, the helper classes, tokens and the dark→light conversion table. Never put `role="dialog"` on a `.window` element (7.css hides it). Verify visual changes with `npm run test:e2e` and the 7.css pixel-parity harness (`npx playwright test e2e/parity.spec.js`).

### Accessibility: one global focus ring

`index.css` defines a single app-wide `:where(...):focus-visible { outline }` Win7 dotted focus rectangle (specificity 0) so icon-only OS controls are keyboard-visible; 7.css controls draw their own. Never add `outline-none` without a replacement indicator.

## Environment Variables

### Backend (`backend/.env`)

Production standalone mode requires `NEXUS_DATABASE_URL`, `NEXUS_AUTH_URL`, `AUDIT_LOG_SALT`, and `TAKEAWAY_ENCRYPTION_KEY`. Use `NEXUS_MAIL_DATABASE_URL` when email polling is configured. `GEMINI_API_KEY` enables AI generation. Legacy mode uses `SUPABASE_URL`, `SUPABASE_AUTH_KEY`, and `SUPABASE_JWT_SECRET`.
Local override: `backend/.env.local` (gitignored, loaded second with override=True)

### Frontend (`frontend/.env`)

Production standalone builds set `VITE_API_URL` and `VITE_NEXUS_AUTH=standalone`. Legacy recovery builds use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
Optional: `VITE_SENTRY_DSN`, `VITE_SENTRY_TRACES_SAMPLE_RATE`

## Gotchas

- **Never use `invalidateQueries` in `updateMediaMutation.onSettled`** — the GET refetch races the write and reverts optimistic status changes. Use `onSuccess` with the server response instead, and roll back only the affected item on error.
- **`sanitize()` is not needed in JSX** — React already escapes text interpolation. A prior `sanitize()` function was double-encoding HTML entities (`<3` → `&lt;3`). It was removed; don't re-add it.
- **Browser-local data is per account** — File Manager tree, OPFS blobs, notes and window layout are wiped by `claimLocalState` when a different account signs in. New private localStorage keys must use the `nexus-os:filesystem` / `nexus-os:window-layout` keys or the `nexus-os:note-` / `nexus-os:notes:` prefixes (see `lib/privateState.js`), or they will leak across accounts.
- **`backend/.env.local`** overrides `backend/.env` for local Supabase credentials. Regenerate after `supabase stop && supabase start` if JWT keys rotate.
- **Seed SQL is local-only** — `supabase/seed.sql` creates a dev user. Run it only on a local Supabase database. Production accounts use Better Auth.
- **Frontend env vars must start with `VITE_`** — Vite only exposes prefixed vars to client code. Both `realtimeClient.js` and `apiClient.js` validate their required vars at import time.
- **AuthPanel registration** uses `signIn()` after successful signup, NOT `window.location.reload()`.
- **CyberCard is memoized** (name kept for history; it renders a Win7 card) with a custom comparator on item fields. If you add a new displayable field to the media model, add it to the comparator in `CyberCard.jsx`.
- **Production builds MUST set `VITE_API_URL=https://home-notes-app.uk/api`** — the local `.env` has `localhost:8000`. If you forget the override, the deployed site will try to hit localhost and all API calls fail with `ERR_CONNECTION_REFUSED`. A Cloudflare Worker (`worker/`) proxies `/api/*` to the DigitalOcean droplet (`api.home-notes-app.uk`).

## Code Style

- **Frontend:** ESLint with react-hooks plugin. No TypeScript. JSX. Tailwind utility classes. Framer Motion for animation. `import { motion as Motion }` convention.
- **Backend:** Ruff (line-length 88, select E/F/I/B). Double quotes. Python 3.12+. Pydantic v2 models with `ConfigDict(str_strip_whitespace=True)`.
- **Design:** Windows 7 Aero is mandatory — follow `docs/win7-design-system.md` (7.css controls, light window bodies, Segoe UI, sentence case). No neon, glow, scanlines, uppercase/letter-spaced labels or Orbitron/Oxanium fonts. Never ship Microsoft logos, wallpapers, icons or font files. UI artwork (icons, orb, the default `aero.svg` wallpaper) is original. The optional photo wallpapers `frontend/public/wallpapers/W1`–`W8` are owner-supplied artwork used with the owner's confirmed rights (2026-11-08); don't add other third-party artwork without the owner confirming rights.

## Testing

- Backend: `pytest` (tests/ directory). Mock Supabase client in fixtures. CI sets dummy env vars.
- Frontend: `vitest` + `@testing-library/react`. Tests live alongside source (`*.test.js`). Run with `npm run test -- --run`.
- CI: GitHub Actions runs lint + test + build + bandit + pip-audit + npm audit + gitleaks on all pushes.

## Deploy

- **Frontend → Cloudflare Pages:** Set `VITE_API_URL=https://home-notes-app.uk/api` and `VITE_NEXUS_AUTH=standalone`. Deploy to project `nexus-archive` and Pages production branch `codex/bootstrap`. GitHub Actions reads `NEXUS_AUTH_MODE` for standalone builds.
- **Backend → DigitalOcean:** The `nexus-api` container uses `/opt/nexus/standalone-release/api.env` and the `nexus-standalone` network. Nginx routes the public API to `127.0.0.1:8000`. Check `/healthz` after a release. [Production cutover and rollback](docs/migrations/supabase-to-droplet/production-cutover.md)
- **Security headers** (CSP, X-Frame-Options, etc.) live in `frontend/public/_headers`, which Cloudflare Pages applies. The old `vercel.json` is gone.
