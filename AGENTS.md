# AGENTS.md — Nexus OS

A cyberpunk **browser "OS"**: a windowing desktop shell (draggable/resizable/snappable windows, taskbar, app launcher, desktop icons, lock screen, boot sequence) hosting real apps — a personal media vault (books, movies, anime, job applications) with AI recommendations, an email client, an AI chat assistant, plus utility apps (Terminal, File Manager, System Monitor, Notes, Settings).

> The product evolved from the original "Nexus Archive" single-page tabbed app into the "Nexus OS" shell. If you find docs referring to `components/features/*` or `App.jsx` "tabs", they're stale — the live structure is `frontend/src/os/*` (see Architecture below).

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
  App.jsx                          # Auth gate: loading → ResetPassword / AuthPanel / <Desktop>
  main.jsx                         # React root + QueryClient provider + Sentry init
  index.css                        # Tailwind v4 + cyberpunk design system + global focus ring
  context/AuthContext.jsx          # Session state from backend cookie auth
  hooks/useMedia.js                # React Query + Realtime subscription + optimistic updates
  hooks/useChat.js                 # Chat messages query + mutation
  hooks/useEmails.js               # Email list/search/pagination query
  hooks/useEmailActions.js         # Email mutations (star/read/move/send/AI draft)
  hooks/useAuth.js                 # Auth context consumer
  hooks/useFocusTrap.js            # Reusable modal focus trap
  lib/mediaConfig.js               # Media types, statuses, TYPE_ICONS (single source of truth)
  lib/apiClient.js                 # Fetch wrapper with cookie auth + silent refresh
  lib/realtimeClient.js            # Supabase Realtime client (separate from API)
  lib/queryClient.js               # React Query client (staleTime: 5min, gcTime: 10min)
  lib/motion.js                    # Shared Framer Motion SPRING/DURATION/EASE tokens
  os/Desktop.jsx                   # OS shell: wallpaper, windows, taskbar, boot, lock, idle-lock
  os/stores/windowStore.js         # Window open/close/focus/move/resize/snap/minimize (zustand)
  os/stores/settingsStore.js       # Accent, wallpaper, UI scale, scanlines/orbs (persisted)
  os/stores/notificationStore.js   # Toast + notification badge state
  os/stores/fileSystemStore.js     # Sandboxed local file tree for File Manager (persisted)
  os/stores/appRegistry.js         # APP_REGISTRY + APP_ORDER — single source for all apps
  os/hooks/useGlobalShortcuts.js   # Alt+W/M/arrows/[ ]/1-8/L window + launcher shortcuts
  os/components/Window.jsx         # Draggable/resizable window chrome (memoized)
  os/components/Taskbar.jsx        # Running-window dock + tray (clock, notif badge)
  os/components/AppLauncher.jsx    # Searchable app grid (Alt+L), Escape-to-close
  os/components/DesktopIcons.jsx   # Desktop icon grid (click select / double-click open)
  os/components/ContextMenu.jsx    # Right-click desktop menu
  os/components/{BootSequence,LockScreen,SnapPreview,NotificationToast}.jsx
  os/apps/Library/                 # Media vault: LibraryApp, KanbanBoard, MediaVault,
                                   #   MediaForm, MediaDetailModal, Add/EditMediaDialog
  os/apps/Email/                   # EmailApp + FolderSidebar/EmailList/EmailReader/ComposeModal
  os/apps/Chat/                    # ChatApp, ChatSidebar, ChatWindow, (Lazy)AICmdPalette
  os/apps/Auth/                    # AuthPanel (login/register/forgot), ResetPasswordPage
  os/apps/{NotesApp,TerminalApp,FileManagerApp,SystemMonitorApp,SettingsApp}.jsx
  components/ui/CyberCard.jsx      # Memoized media card with Framer Motion layoutId
  components/ui/ConfirmDialog.jsx  # Reusable portal confirm dialog (focus-trapped)
  components/ui/PasswordInput.jsx  # Password field with show/hide toggle
  components/layout/Navbar.jsx     # Top bar shown on the auth/login screen only
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

### OS shell: App registry is the single source of truth

Every app is declared once in `os/stores/appRegistry.js` (`APP_REGISTRY` keyed by app id, `APP_ORDER` for launcher/shortcut order) with its `title`, `icon`, `singleton`, `defaultSize`, `minSize`, and lazy `component`. The taskbar, app launcher, desktop icons, global shortcuts (Alt+1-8), and `Desktop.jsx` all read from it — to add an app, register it there and nothing else needs a hardcoded list. Window lifecycle (open/focus/move/resize/snap/minimize/maximize) lives entirely in `windowStore.js`; apps render inside `<Window>` and should not manage their own positioning.

### Accessibility: one global focus ring

`index.css` defines a single app-wide `:where(...):focus-visible { outline }` neon ring (specificity 0) so icon-only OS controls are keyboard-visible. Elements that render their own branded Tailwind `focus-visible:ring*` must also set `focus-visible:outline-none` to avoid a double ring; form inputs already do this via `focus:outline-none`.

## Environment Variables

### Backend (`backend/.env`)

Required: `SUPABASE_URL`, `SUPABASE_AUTH_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `AUDIT_LOG_SALT`
Optional: `TAKEAWAY_ENCRYPTION_KEY` (Fernet key for at-rest encryption), `REDIS_URL`, `TRUSTED_PROXY_IPS`
Local override: `backend/.env.local` (gitignored, loaded second with override=True)

### Frontend (`frontend/.env`)

Required: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
Optional: `VITE_SENTRY_DSN`, `VITE_SENTRY_TRACES_SAMPLE_RATE`, `VITE_AION_SUPABASE_URL`, `VITE_AION_SUPABASE_ANON_KEY` (required for Aion Bible companion app)

## Gotchas

- **Never use `invalidateQueries` in `updateMediaMutation.onSettled`** — causes a GET refetch that races with Realtime, reverting optimistic status changes. Use `onSuccess` with the server response instead.
- **`sanitize()` is not needed in JSX** — React already escapes text interpolation. A prior `sanitize()` function was double-encoding HTML entities (`<3` → `&lt;3`). It was removed; don't re-add it.
- **Supabase Realtime dedup must compare ALL editable fields** — status-only comparison misses edits to title/creator/etc. and causes Framer Motion layout re-triggers.
- **`backend/.env.local`** overrides `backend/.env` for local Supabase credentials. Regenerate after `supabase stop && supabase start` if JWT keys rotate.
- **Seed SQL is local-only** — `supabase/seed.sql` creates a dev user. Never run against production. Production accounts go through Supabase Auth dashboard.
- **Frontend env vars must start with `VITE_`** — Vite only exposes prefixed vars to client code. Both `realtimeClient.js` and `apiClient.js` validate their required vars at import time.
- **AuthPanel registration** uses `signIn()` after successful signup, NOT `window.location.reload()`.
- **CyberCard is memoized** with a custom comparator on item fields. If you add a new displayable field to the media model, add it to the comparator in `CyberCard.jsx`.
- **Production builds MUST set `VITE_API_URL=https://home-notes-app.uk/api`** — the local `.env` has `localhost:8000`. If you forget the override, the deployed site will try to hit localhost and all API calls fail with `ERR_CONNECTION_REFUSED`. A Cloudflare Worker (`worker/`) proxies `/api/*` to the DigitalOcean droplet (`api.home-notes-app.uk`).

## Code Style

- **Frontend:** ESLint with react-hooks plugin. No TypeScript. JSX. Tailwind utility classes. Framer Motion for animation. `import { motion as Motion }` convention.
- **Backend:** Ruff (line-length 88, select E/F/I/B). Double quotes. Python 3.12+. Pydantic v2 models with `ConfigDict(str_strip_whitespace=True)`.
- **Design:** Cyberpunk aesthetic is mandatory — neon cyan/magenta on dark, glassmorphism, Orbitron/Oxanium/JetBrains Mono fonts. No generic/minimal designs.

## Testing

- Backend: `pytest` (tests/ directory). Mock Supabase client in fixtures. CI sets dummy env vars.
- Frontend: `vitest` + `@testing-library/react`. Tests live alongside source (`*.test.js`). Run with `npm run test -- --run`.
- CI: GitHub Actions runs lint + test + build + bandit + pip-audit + npm audit + gitleaks on all pushes.

## Deploy

- **Frontend → Cloudflare Pages:** Ensure production environment variables (`VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are defined in the gitignored `frontend/.env` file. Build using `npm run build` in the `frontend` directory, then deploy with `wrangler pages deploy dist --project-name nexus-archive --branch codex/bootstrap --commit-dirty=true`. Production branch is `codex/bootstrap` (NOT `main`). Domains: `home-notes-app.uk`, `www.home-notes-app.uk`.
- **Backend → DigitalOcean:** Docker container on droplet `170.64.167.95`, behind Nginx reverse proxy (ports 80 + 443 with Cloudflare Origin Cert). DNS: `api.home-notes-app.uk` → droplet (Cloudflare-proxied). Cloudflare Worker proxies `home-notes-app.uk/api/*` → `https://api.home-notes-app.uk`. Healthcheck at `/healthz`.
- **Droplet Deployment Commands:** Deployment credentials are stored in the gitignored root `.env` file. To sync code and rebuild the backend container, execute:

  ```bash
  # Load credentials
  source .env

  # Sync backend files to droplet
  sshpass -p "$DROPLET_PASSWORD" rsync -avz --delete --exclude 'venv' --exclude '.env.production' --exclude '__pycache__' --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store' --exclude '._*' -e "ssh -o StrictHostKeyChecking=no" ./backend/ "$DROPLET_USER@$DROPLET_IP:/opt/nexus/backend/"
  sshpass -p "$DROPLET_PASSWORD" rsync -avz -e "ssh -o StrictHostKeyChecking=no" ./pyproject.toml "$DROPLET_USER@$DROPLET_IP:/opt/nexus/pyproject.toml"

  # Rebuild and run docker container on droplet
  sshpass -p "$DROPLET_PASSWORD" ssh -o StrictHostKeyChecking=no "$DROPLET_USER@$DROPLET_IP" "docker build -t nexus-api -f /opt/nexus/backend/Dockerfile /opt/nexus && docker stop nexus-api && docker rm nexus-api && docker run -d --name nexus-api -p 127.0.0.1:8000:8000 --restart unless-stopped --env-file /opt/nexus/.env.production nexus-api:latest"
  ```

- **Security headers** defined in `vercel.json` (CSP, X-Frame-Options, etc.) — NOTE: this is a legacy file from Vercel. Cloudflare Pages does NOT read `vercel.json`. These headers need to be migrated to `frontend/public/_headers` to take effect.
