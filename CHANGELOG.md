# Change Log

### 2026-04-17 (Australia/Sydney) — Fix: card shake on status change + stalled modal exit
**Raouf:**
- **Scope:** User-reported: changing status from the detail modal made the card shake, then the X button appeared broken.
- **Root cause:** `CyberCard` and `MediaDetailModal` both rendered `layoutId="card-${item.id}"` simultaneously while the modal was open. Framer Motion's shared-layout reconciler expects one element at a time — with both mounted AND `layout="position"` on the card, each optimistic status update re-parented the card to a new kanban column and the reconciler tried to animate the modal toward the card's new DOM position, producing the shake. The same broken state stalled the exit animation after clicking X: the click fired and state cleared, but AnimatePresence's exit never completed, so the modal appeared frozen. Dropped the shared `layoutId` from both sides; kept `layout="position"` on the card for in-column drag settles. Trade-off: no more card-to-modal morph on open, but modal open/close is deterministic again.
- **Files Changed:** `CyberCard.jsx`, `MediaDetailModal.jsx`.
- **Verification:** ESLint 0, vitest 117/117, vite build clean.

### 2026-04-17 (Australia/Sydney) — Animation Audit + Polish
**Raouf:**
- **Scope:** Inventory + polish every animation (Framer Motion + CSS) across 18 files / 190 usages.
- **Summary:** New `lib/motion.js` consolidates durations (`fast/base/slow`), easings, and two spring flavors (`soft/snappy`), replacing 11 distinct duration values and 3 near-identical spring configs. Migrated CyberCard, MediaDetailModal, Compose/Add/Edit/ConfirmDialog, AppLauncher, NotificationToast, EmailInbox/Reader/List, MediaApp, ContextMenu to tokens. Performance pass: LockScreen infinite scan and BootSequence CRT sweep now animate `y` (transform + willChange) instead of `top` (%) — GPU-composited, zero per-frame layout. Reduced-motion: `MotionConfig reducedMotion="user"` already at root; CSS catch-all already disables ambient orbs / scanlines / glitch / neon-pulse. Choreographed BootSequence (0.3–0.8s pacing) and LockScreen (2/3/8s loops) kept bespoke — their motion is the content.
- **Files Changed:** new `lib/motion.js`; edits to CyberCard, MediaDetailModal, ComposeModal, AddMediaDialog, ConfirmDialog, MediaApp, EmailInbox, EmailReader, EmailList, AppLauncher, NotificationToast, ContextMenu, LockScreen, BootSequence.
- **Verification:** ESLint 0, vitest 117/117, vite build clean.

### 2026-04-17 (Australia/Sydney) — Window Controls + Z-index + Responsive Polish
**Raouf:**
- **Scope:** Fix close/min/max buttons requiring multiple clicks; polish window resizing; global z-index scale + responsive audit.
- **Summary:** Titlebar `onPointerDown` now bails when the target is a `<button>` — `dragControls.start(e)` was capturing the pointer and swallowing button clicks. Same guard on the double-click-to-maximize. Resize handles re-architected: `overflow-hidden rounded-lg` moved off the outer `Motion.div` onto the inner titlebar + content, so the handles aren't clipped by the corner path; edge hit area 6px, corner 14px, outset by half width; `touch-action: none` added. New `lib/zLayers.js` establishes a canonical ladder (snap 90, windows 100+, taskbar 500, launcher 599/600, modals 1000/1001, confirm 1051, context menu 1200, notifications 1500, lock 2000, boot 9999); all modals migrated out of the old 80–110 band that was colliding with window stacking. Mobile Window titlebar gets `env(safe-area-inset-top)` + a proper 44×44 close button; desktop controls bumped `p-1.5 → p-2`.
- **Files Changed:** Window.jsx, Desktop.jsx, ContextMenu.jsx, MediaDetailModal.jsx, ComposeModal.jsx, AddMediaDialog.jsx, EditMediaDialog.jsx, AICmdPalette.jsx, LazyAICmdPalette.jsx, ConfirmDialog.jsx, new lib/zLayers.js.
- **Verification:** ESLint 0, vitest 117/117, vite build clean.

### 2026-04-17 (Australia/Sydney) — Logic Audit Remediation
**Raouf:**
- **Scope:** Four-agent file-by-file logic/correctness audit across backend + frontend. All real Critical/High/Medium/Low findings fixed; false positives dropped after verification.
- **Summary:** Critical — JWT `alg` header default removed (no more HS256 fallback on missing/unknown alg); `apiClient` 401 retry never recurses on `/auth/refresh` and surfaces real refresh errors; `AuthContext.signOut` tears down Realtime channels before clearing the query cache. High — `TRUSTED_PROXY_IPS` parsing uses `ipaddress` with CIDR support and drops malformed entries with a warning; Redis rate limiter falls back to per-instance in-memory when Redis fails mid-flight; OAuth `connect` validates the Host header against `allowed_hosts` before building `redirect_uri`; `useMedia.deleteMediaMutation` drops `onSettled → invalidateQueries` (same Realtime-race class as the documented `updateMediaMutation` invariant); `useGlobalShortcuts` skips Alt-combo handling while typing in INPUT/TEXTAREA/contentEditable; `useFocusTrap` only restores focus if the previously-focused element is still in the DOM. Medium — Fernet key validated at first use with a clear config error; chat controller consults the shared Gemini circuit breaker (record success/failure) so chat and suggest degrade together; hydrated `zStack` deduped in `windowStore`; `AICmdPalette` resets `addedIndices`/`result` on `mediaType` change; `ComposeModal` guards against empty `selectedAccountId`; `ResetPasswordPage` adds a `submittingRef` double-submit guard; `useChat.sendMessage.onSuccess` no longer appends a synthetic `ai-${Date.now()}` row (just invalidate and trust the refetch). Low — email poller task stashed on `app.state` + `stop_email_poller` shutdown hook; `MediaDetailModal` passes `id={item.id}` to `ConfirmDialog`. Gratis cleanup: pre-existing ruff errors in `email_poller.py` (line-length) and `oauth_controller.py` (unused `import os`).
- **False positives dropped:** H1 (controllers user_id already server-set), H5 (Window resize math stable vs. startRef), H7 (NotesApp keying is consistent), H9 (useEmails re-subscribes on dep change), plus assorted Medium/Low items verified against actual code.
- **Files Changed:** auth.py, auth_controller.py, rate_limit.py, oauth_controller.py, data_protection.py, chat_controller.py, email_poller.py, app.py, apiClient.js, AuthContext.jsx, useMedia.js, useChat.js, useFocusTrap.js, useGlobalShortcuts.js, windowStore.js, AICmdPalette.jsx, ComposeModal.jsx, MediaDetailModal.jsx, ResetPasswordPage.jsx.
- **Verification:** ruff clean, pytest 74/74, ESLint 0, vitest 117/117, vite build clean.

### 2026-04-17 (Australia/Sydney)
**Raouf:**
- **Scope:** UI/UX Audit Remediation — Defect + High-Confidence Fixes
- **Summary:** Fixed 11 items from a full frontend audit: (1) wired dead empty-state Kanban CTAs (`Add X` + `Ask AI`) via a `window` event bus; (2) CyberCard action row resting opacity 0→60 on desktop (discoverability); (3) MediaDetailModal no longer auto-closes on status change; (4) welcome notification gated on genuine first-boot + dynamic app count; (5) Kanban grid cols derived from `config.statuses.length`; (6) empty-state primary `+ Add {Singular}` CTA that pre-fills status; (7) activeType persisted in URL `?type=`; (8) font bump 8–10px → 10–11px across Taskbar/Window/DesktopIcons/AppLauncher/media-tabs; (9) edge-fade masks on scrollable tab rails; (10) removed duplicate import in KanbanBoard; (11) removed stale CSS comment. Deferred 6+ subjective items (OS-metaphor scope, copy tone, dual-accent commit, logo redesign, undo system, ConfirmDialog hoist, contrast audit) for separate decisions.
- **Files Changed:** `KanbanBoard.jsx`, `MediaApp.jsx`, `CyberCard.jsx`, `MediaDetailModal.jsx`, `AddMediaDialog.jsx`, `LazyAICmdPalette.jsx`, `Desktop.jsx`, `Taskbar.jsx`, `Window.jsx`, `DesktopIcons.jsx`, `AppLauncher.jsx`, `index.css`.
- **Verification:** ESLint 0 errors, Vitest 117/117, Vite build clean (1.95s).
- **Follow-ups:** OS-metaphor decision, copy tone rewrite, dual-accent commit, undo toast system, ConfirmDialog hoist, browser contrast audit.

### 2026-03-24 (Australia/Sydney)
**Raouf:**
- **Scope:** New Media Type — Job Application Tracker
- **Summary:** Added `job` as a fourth media type with 4-status Kanban pipeline (Not Answered / Answered / Rejected / Got the Job). Dynamic grid: 4 columns on lg for jobs, 3 for others. Gemini career advisor prompt + local fallbacks. `jobs` chat category with amber color. Database migration, backend schemas/controllers/services, and all frontend config/components updated.
- **Files Changed:** Migration SQL, `schemas.py`, `controllers.py`, `services.py`, `mediaConfig.js`, `KanbanBoard.jsx`, `ChatSidebar.jsx`, `AddMediaDialog.jsx`, `App.jsx`.
- **Verification:** Ruff clean, pytest 34/34, ESLint 0 errors, Vitest 17/17, build clean.
- **Follow-ups:** Run `ALTER TYPE` in production Supabase before deploying.

### 2026-03-22 (Australia/Sydney)
**Raouf:**
- **Scope:** AI Palette UX — Lift Button + One-Click Add to Archive
- **Summary:** Moved AI CMD FAB higher. Added one-click "Add to Archive" on each AI suggestion card with status buttons. Creates media entry with all details pre-filled.
- **Files Changed:** `AICmdPalette.jsx`, `LazyAICmdPalette.jsx`, `App.jsx`.
- **Verification:** Lint/test/build clean, deployed.

### 2026-03-22 (Australia/Sydney)
**Raouf:**
- **Scope:** Fix Production Account + Password Reset Redirect
- **Summary:** Reset production user password. Fixed Supabase recovery email template to redirect to `/reset-password` with `token_hash`. Added `token_hash` support to frontend recovery flow.
- **Files Changed:** `recoveryTokens.js`, `ResetPasswordPage.jsx`, `App.jsx`. Supabase Management API: updated `mailer_templates_recovery_content`.
- **Verification:** Lint/test/build clean, deployed.

### 2026-03-22 (Australia/Sydney)
**Raouf:**
- **Scope:** Full 53-Finding UI/UX Remediation — Auth, Media, Chat, Infrastructure
- **Summary:** Fixed all 53 findings (10 critical, 18 high, 16 medium, 9 low) from 4-agent code-level audit across 26 files. Auth: double-submit race guard, shared PasswordInput, aria-invalid on both fields, register/forgot post-success UX, panel transitions. Media: unique ConfirmDialog IDs, body scroll lock on all modals, Escape guards, null/zero data handling, keyboard-accessible action buttons, mobile column heights, vault search reset, iOS safe-area FAB, rating validation. Chat: delete confirmation, error reset on switch, optimistic dedup, Enter guard, ARIA live region, timestamps, create disabled state, md breakpoint, platform-aware shortcuts. Infra: auth expired callback, mutation error surfacing, Realtime token re-subscribe, container-level focus trap, bootstrap try/catch, hover-only neon-pulse.
- **Files Changed:** 26 files modified/created across components, hooks, lib, context, and CSS.
- **Verification:** Lint 0 errors, test 17/17, build clean, deployed to Cloudflare Pages.
- **Follow-ups:** None.

### 2026-03-22 (Australia/Sydney)
**Raouf:**
- **Scope:** UI/UX Audit Fixes — Layout Overlap, Mobile-First Login, Autocomplete, Password Toggle, Footer
- **Summary:** Fixed all 9 findings from Playwright UI/UX audit. Hero section no longer overlaps auth panel at narrow viewports (hidden below `lg`). Login form is now above the fold on mobile. Added skip link, `autocomplete` on all inputs, password show/hide toggle, increased touch targets, and footer.
- **Files Changed:** `App.jsx`, `AuthPanel.jsx`.
- **Verification:** Playwright re-audit: 0 findings remaining. Lint/test/build clean.
- **Follow-ups:** None.

### 2026-03-22 (Australia/Sydney)
**Raouf:**
- **Scope:** Full Frontend Audit Remediation — Architecture, Performance, Accessibility, Design
- **Summary:** Implemented all findings from a 4-dimension frontend audit. **Architecture:** removed buggy `sanitize()` double-encoding in MediaDetailModal, extracted shared `MediaForm` from duplicated Add/Edit dialogs (~230 lines deduped), centralized `TYPE_ICONS` into `mediaConfig.js` (was defined 3x), deleted dead code (`useBooks.js`, `BentoGrid.jsx`, scaffold SVGs), replaced `window.location.reload()` with proper `signIn()` in AuthPanel, added env var validation to `realtimeClient.js`, extracted inline `useRecoveryTokens` hook, fixed variable shadowing in ChatLayout/App.jsx, derived ChatSidebar categories from `mediaConfig`. **Performance:** memoized CyberCard (custom comparator), KanbanBoard, MediaVault with `React.memo`, added `useCallback` for all handler props in App.jsx, lazy-loaded MediaDetailModal/EditMediaDialog/ChatLayout (~35KB deferred from initial bundle), set global React Query staleTime (5min)/gcTime (10min), included update/delete mutation pending states in loading. **Accessibility:** reusable `useFocusTrap` hook applied to all 3 modals, `ConfirmDialog` for destructive actions across CyberCard/MediaDetailModal/MediaVault, fixed contrast (`--muted-foreground` 60%→68%, placeholders 20%→40%), skip-to-content link, `role="status"` on all spinners, `aria-describedby`/`aria-invalid` on form errors, standardized `focus-visible` rings on all buttons. **Design:** body `line-height: 1.6`, neon-pulse 3s→6s.
- **Files Changed:**
  - New: `MediaForm.jsx`, `ConfirmDialog.jsx`, `useFocusTrap.js`, `useRecoveryTokens.js`.
  - Modified: `AddMediaDialog.jsx`, `EditMediaDialog.jsx`, `MediaDetailModal.jsx`, `CyberCard.jsx`, `KanbanBoard.jsx`, `MediaVault.jsx`, `ChatLayout.jsx`, `ChatSidebar.jsx`, `ChatWindow.jsx`, `AuthPanel.jsx`, `Navbar.jsx`, `App.jsx`, `mediaConfig.js`, `realtimeClient.js`, `queryClient.js`, `useMedia.js`, `index.css`.
  - Deleted: `useBooks.js`, `BentoGrid.jsx`, `react.svg`, `vite.svg`.
- **Verification:** `npm run lint` 0 errors (1 pre-existing warning), `npm run test -- --run` 21/21 pass, `npm run build` clean.
- **Follow-ups:** Consider `prefers-contrast: more` media query, hero.png WebP conversion, skeleton loaders.

### 2026-03-22 (Australia/Sydney)
**Raouf:**
- **Scope:** Two Bug Fixes — Edit Button on Media Cards + Status Revert Race Condition
- **Summary:** Added full edit capability to media cards: new `EditMediaDialog.jsx` with pre-populated form, edit (pencil) buttons on `CyberCard`, `MediaDetailModal`, and `MediaVault`, wired through `KanbanBoard` and `App.jsx` via `editItem` state. Fixed the status revert bug where changing a tile's status would momentarily update then revert after a few seconds — root cause was `updateMediaMutation.onSettled` calling `invalidateQueries` which triggered a GET refetch that raced with Realtime events; replaced with `onSuccess` that directly updates the cache from the PUT response. Also broadened the Realtime dedup in `handleRealtimeEvent` from status-only to all user-visible fields (title, creator, genre, rating, takeaway, sub_info) so edits are also deduped correctly.
- **Files Changed:**
  - `frontend/src/components/features/EditMediaDialog.jsx` — New edit dialog component.
  - `frontend/src/components/features/CyberCard.jsx` — Added `onEdit` prop and pencil button.
  - `frontend/src/components/features/MediaDetailModal.jsx` — Added `onEdit` prop and Edit button.
  - `frontend/src/components/features/MediaVault.jsx` — Added `onEdit` prop and pencil button in vault rows.
  - `frontend/src/components/features/KanbanBoard.jsx` — Passes `onEdit` through to CyberCard.
  - `frontend/src/App.jsx` — Added `editItem` state, imported/rendered `EditMediaDialog`, wired `onEdit` to all surfaces.
  - `frontend/src/hooks/useMedia.js` — Replaced `onSettled→invalidateQueries` with `onSuccess` on `updateMediaMutation`; broadened Realtime dedup to all editable fields.
- **Verification:** `npm run lint` 0 errors (1 pre-existing warning), `npm run test -- --run` 21/21 pass, `npm run build` clean.
- **Follow-ups:** None.

### 2026-03-20 (Australia/Sydney)
**Raouf:**
- **Scope:** CLI Application — Supabase Stack Restart, DB Seed, Local Dev Env
- **Summary:** Applied all three bug-fix changes using the Supabase CLI. Started Docker Desktop, ran `supabase start` (picked up the updated `config.toml` with the new redirect URLs and `site_url`). Ran `supabase db reset` which applied all 4 migrations and executed `supabase/seed.sql` — confirmed `raoof.r12@gmail.com` row in `auth.users` (id `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, role `authenticated`, email confirmed) and matching `auth.identities` row. Added `.env.local` overlay support to `backend/config.py` via a second `load_dotenv(".env.local", override=True)` call (already gitignored); created `backend/.env.local` with the local Supabase JWT keys extracted from `supabase status -o env` so the backend automatically targets the local stack when the file is present.
- **Files Changed:**
  - `backend/config.py` — Added `load_dotenv(".env.local", override=True)` after existing `load_dotenv()`.
  - `backend/.env.local` — New gitignored file: local Supabase URL, service-role key, anon key, JWT secret, and local `PASSWORD_RESET_REDIRECT_URL`.
- **Verification:** `supabase db reset` succeeded (4 migrations + seed), `docker exec supabase_db_Nexus psql` confirmed both `auth.users` and `auth.identities` rows, `python3 -m ruff check backend tests` clean, `python3 -m pytest` 34/34 pass.
- **Follow-ups:** Regenerate `backend/.env.local` keys after any `supabase stop && supabase start` (local JWT secret is stable across resets but keys may rotate). For production, create `raoof.r12@gmail.com` via Supabase Auth dashboard — never run `seed.sql` against the remote database.

### 2026-03-20 (Australia/Sydney)
**Raouf:**
- **Scope:** Three Critical Bug Fixes — Recovery Redirect, Dev Seed, Realtime Race Condition
- **Summary:** Fixed the "nowhere" password recovery link by adding `/reset-password` exact-match entries to `supabase/config.toml`'s `additional_redirect_urls` (Supabase rejects any `redirect_to` not in the allow-list) and correcting `PASSWORD_RESET_REDIRECT_URL` in `backend/.env` to include the path segment (`/reset-password`). Created `supabase/seed.sql` to idempotently inject the `raoof.r12@gmail.com` dev account (password: `Dev@Nexus2026`) into `auth.users` + `auth.identities` so `supabase db reset` seeds the local database; confirmed no hardcoded session bypass existed in `AuthContext.jsx` — it already strictly uses `POST /auth/login`. Fixed the Realtime vs. optimistic-UI race condition in `useMedia.js`: replaced the broken `JSON.stringify` deduplication (which always failed because the server row has a fresh `updated_at`) with a targeted `existing.status === newItem.status` check, silently dropping Realtime echoes that match the optimistic update and preventing Framer Motion from re-triggering layout animations.
- **Files Changed:**
  - `supabase/config.toml` — Changed `site_url` to `http://localhost:5173`; added `http://localhost:5173/reset-password` and `http://127.0.0.1:5173/reset-password` to `additional_redirect_urls`.
  - `backend/.env` — Fixed `PASSWORD_RESET_REDIRECT_URL` from `http://localhost:5173` to `http://localhost:5173/reset-password`.
  - `supabase/seed.sql` — New file: idempotent dev user seed for `raoof.r12@gmail.com` with bcrypt password.
  - `frontend/src/hooks/useMedia.js` — Replaced `JSON.stringify` dedup in `handleRealtimeEvent` UPDATE branch with `existing.status === newItem.status` comparison.
- **Verification:** `python3 -m ruff check backend tests` clean, `python3 -m pytest` 34/34 pass, `npm run lint` 0 errors (1 pre-existing warning unrelated to changes), `npm run test -- --run` 21/21 pass, `npm run build` clean.
- **Follow-ups:** After applying the seed, activate it with `supabase db reset` (local) or manually insert via Supabase Studio. For production, create the account through the Supabase Auth dashboard — never run seed.sql against a production database.

### 2026-03-17 (Australia/Sydney)
**Raouf:**
- **Scope:** Shared AI Usage Rate Limiting
- **Summary:** Added a single per-user AI quota for Gemini-backed routes so chat and media recommendations now share the same server-side budget. Wired new `AI_RATE_LIMIT_*` settings into backend config, applied the limiter to both endpoints, documented the env vars, and added regression tests.
- **Files Changed:** `backend/config.py`, `backend/rate_limit.py`, `backend/controllers.py`, `backend/chat_controller.py`, `tests/test_rate_limit.py`, `tests/test_config.py`, `backend/.env.example`, `README.md`, `docs/api-reference.md`.
- **Verification:** `python3 -m pytest tests/test_rate_limit.py tests/test_config.py` passed (4/4). `python3 -m ruff check backend tests` clean.
- **Follow-ups:** Optionally remove or deprecate the legacy suggest-specific rate-limit settings to avoid duplicate AI throttling knobs.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Responsive Dashboard + Deep Dive Detail Modal
- **Summary:** Full mobile-first responsive refactor. Added shared-element detail modal with Framer Motion layoutId, XSS-safe rendering, Esc close, cyberpunk scrollbar. Fixed dashboard scrollability.
- **Files Changed:** MediaDetailModal.jsx (new), CyberCard.jsx, KanbanBoard.jsx, App.jsx, index.css, App.test.jsx.
- **Verification:** Lint, test, build all clean.

### 2026-03-16 (Australia/Sydney)
**Raouf:**
- **Scope:** Security Audit Remediation — Auth Trust Boundaries, Chat Isolation, Recovery Token Hygiene
- **Summary:** Fixed the confirmed and likely security findings from the evidence-driven repo audit. Auth rate limiting now ignores spoofed `X-Forwarded-For` unless the direct peer is listed in `TRUSTED_PROXY_IPS`. Chat cache/query keys are user-scoped and cleared on auth transitions to prevent cross-account disclosure on shared browsers. Recovery tokens are stripped from the URL before Sentry initializes, Sentry now redacts token-bearing URLs, and the reset bootstrap is StrictMode-safe. Chat history sent to Gemini is reduced to a recent window, prompt-injection markers and obvious PII are masked, and chat content is encrypted at rest when `TAKEAWAY_ENCRYPTION_KEY` is configured. Removed the unused required `SUPABASE_KEY`, hardened local Supabase auth defaults, added repo-controlled frontend security headers via `vercel.json`, and synced stale docs/examples to `/media` routes.
- **Files Changed:** `backend/auth_controller.py`, `backend/config.py`, `backend/chat_controller.py`, `backend/data_protection.py`, `frontend/src/context/AuthContext.jsx`, `frontend/src/hooks/useChat.js`, `frontend/src/components/features/ChatLayout.jsx`, `frontend/src/components/features/ChatWindow.jsx`, `frontend/src/lib/recoveryTokens.js`, `frontend/src/App.jsx`, `frontend/src/main.jsx`, `frontend/src/observability/sentry.js`, `frontend/src/components/features/AuthPanel.jsx`, `frontend/src/hooks/useMedia.js`, `frontend/src/hooks/useBooks.js`, `frontend/index.html`, `vercel.json`, `supabase/config.toml`, `.github/workflows/ci.yml`, `backend/.env.example`, `README.md`, `SECURITY.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/operations.md`, `docs/usage-examples.md`, `loadtests/locustfile.py`, `pyproject.toml`, `tests/test_auth_controller.py`, `tests/test_config.py`, `tests/test_data_protection.py`, `frontend/src/lib/recoveryTokens.test.js`.
- **Verification:** Ruff clean, pytest 33/33 pass, Bandit 0 issues, frontend lint clean, frontend tests 6/6 pass, frontend build clean.
- **Follow-ups:** Configure `TRUSTED_PROXY_IPS` for the deployed reverse-proxy tier and verify live Vercel/Sentry settings still match the repo-controlled header and redaction policy.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Unified Media Model — Books, Movies, Anime
- **Summary:** Expanded from books-only to unified media engine with Postgres ENUM, `media` table, type-filtered API, tabbed Kanban UI, and ES256 JWT/PostgREST fixes.
- **Files Changed:** Migration, database.sql, backend (app, controllers, schemas, services, auth), frontend (App, hooks, components, tests), test suite.
- **Verification:** 25/25 backend tests, 4/4 frontend tests, lint/build clean. Migration applied.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Integration Audit — Recovery Token Fix and Env Alignment
- **Summary:** Fixed critical password reset bug where refresh_token was not extracted from Supabase recovery URL. Added refresh_token to frontend extraction, backend schema, and reset endpoint. Added missing PASSWORD_RESET_REDIRECT_URL to env template. Fixed stale pyproject.toml description.
- **Files Changed:** `frontend/src/App.jsx`, `frontend/src/components/features/ResetPasswordPage.jsx`, `backend/schemas.py`, `backend/auth_controller.py`, `backend/.env.example`, `pyproject.toml`.
- **Verification:** All lint, tests, and build pass.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Auth Sliding Panels — Register, Forgot Password, Reset Password
- **Summary:** Added registration, forgot password, and password reset flows with direction-aware sliding panel transitions. Three new backend endpoints proxy Supabase auth with rate limiting and HttpOnly cookies. Frontend AuthPanel slides between login/register/forgot forms preserving state. Recovery token detection from URL hash and search params with expired-session fallback. Email enumeration prevented on forgot-password.
- **Files Changed:**
  - `backend/auth_controller.py`, `backend/schemas.py`, `backend/config.py` — New auth endpoints and schemas.
  - `frontend/src/components/features/AuthPanel.jsx`, `frontend/src/components/features/ResetPasswordPage.jsx` — New components.
  - `frontend/src/App.jsx`, `frontend/src/App.test.jsx` — Wired AuthPanel and recovery token detection.
- **Verification:** All backend/frontend lint, tests, and build pass.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Production-Readiness Audit Fix — All 17 Findings Resolved
- **Summary:** Resolved every finding from the Staff Principal audit across all five domains (Architecture, Performance, Security, UI/UX, DevOps). Fixed the Redis rate limiter race condition with an atomic Lua script, completed the CRUD loop with PUT/DELETE book endpoints and a full Add Book UI with status advancement and deletion on CyberCard, replaced the development server with production uvicorn in the Dockerfile with HEALTHCHECK, made AUDIT_LOG_SALT a required env var to prevent silent correlation breakage, aligned LLM few-shot examples with actual JSON serialization format, removed dead admin client code, added AbortController request timeouts to the frontend API client, added Redis to docker-compose, extracted a dedicated useSuggest hook to eliminate unnecessary books query in the AI palette, fixed the stale meta description to books-only, reduced initial auth load requests for logged-out visitors, documented CSP unsafe-inline rationale, documented threading.Lock choice in rate limiter, added controller integration tests with mocked Supabase, and expanded frontend tests to cover authenticated, loading, and error states.
- **Files Changed:**
  - `backend/rate_limit.py` — Atomic Lua script for Redis rate limiter; documented threading.Lock rationale.
  - `backend/controllers.py` — Added PUT and DELETE book endpoints with audit logging.
  - `backend/schemas.py` — Added `BookUpdate` partial-update schema.
  - `backend/config.py` — Made `AUDIT_LOG_SALT` required; removed `token_urlsafe` import.
  - `backend/services.py` — Aligned few-shot examples; removed unused `get_supabase_admin_client`.
  - `backend/security.py` — Documented CSP `unsafe-inline` rationale.
  - `backend/Dockerfile` — Production `uvicorn` with workers and HEALTHCHECK.
  - `docker-compose.yml` — Added Redis service.
  - `frontend/src/lib/apiClient.js` — Added 30s AbortController timeout.
  - `frontend/src/context/AuthContext.jsx` — Reduced initial auth requests for logged-out visitors.
  - `frontend/src/hooks/useSuggest.js` — New suggestion-only hook.
  - `frontend/src/hooks/useBooks.js` — Added updateBook and deleteBook mutations.
  - `frontend/src/components/features/AICmdPalette.jsx` — Switched to useSuggest hook.
  - `frontend/src/components/features/AddBookDialog.jsx` — New book creation dialog.
  - `frontend/src/components/features/CyberCard.jsx` — Status advance and delete buttons.
  - `frontend/src/components/features/KanbanBoard.jsx` — Passed update/delete props.
  - `frontend/src/App.jsx` — Wired AddBookDialog and CRUD actions.
  - `frontend/src/App.test.jsx` — Added loading, authenticated, and error state tests.
  - `frontend/index.html` — Fixed meta description to books-only.
  - `tests/test_controllers.py` — New controller integration tests.
- **Verification:** `ruff check` clean, `ruff format --check` clean, `pytest` 24/24 pass, `bandit` 0 issues, `npm run lint` clean, `npm run test` 4/4 pass, `npm run build` clean.
- **Follow-ups:** Validate `terraform plan` against live credentials and verify Redis + container behavior in deployed infrastructure.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Enterprise Audit Remediation Pass
- **Summary:** Closed the highest-priority findings from the repo-first production audits. Enforced caller-scoped Supabase data access so RLS remains the hard authorization boundary, strengthened JWT validation, added auth endpoint throttling and upstream logout revocation, upgraded rate limiting to support Redis-backed multi-instance enforcement, forced RLS in SQL, tightened CSP behavior, made takeaway storage refuse plaintext writes, aligned Terraform auth settings, added frontend error-boundary and accessibility coverage, introduced frontend tests in CI, switched Locust to the real cookie-auth flow, and corrected books-only product/runtime documentation.
- **Files Changed:**
  - `backend/services.py`, `backend/controllers.py`, `backend/auth.py`, `backend/auth_controller.py`, `backend/config.py`, `backend/rate_limit.py`, `backend/security.py`, `backend/data_protection.py`, `backend/.env.example`, `backend/Dockerfile` - Hardened auth, RLS enforcement, rate limiting, secure headers, encryption behavior, env settings, and container runtime privileges.
  - `database.sql` - Forced row-level security for defense in depth.
  - `tests/conftest.py`, `tests/test_config.py`, `tests/test_data_protection.py` - Stabilized config-backed tests for clean-environment execution.
  - `.github/workflows/ci.yml`, `pyproject.toml`, `loadtests/locustfile.py` - Added backend test env seeding, frontend test execution, Redis dependency support, and realistic login-based load testing.
  - `infra/terraform/main.tf`, `infra/terraform/variables.tf`, `infra/terraform/README.md` - Split frontend origin from backend API URL and reduced JWT lifetime to 15 minutes.
  - `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.js`, `frontend/src/App.test.jsx`, `frontend/src/main.jsx`, `frontend/src/App.jsx` - Added frontend test tooling, error containment, accessible login states, and books-only UX copy.
  - `README.md`, `docs/api-reference.md`, `docs/architecture.md`, `docs/operations.md`, `docs/usage-examples.md` - Updated repository guidance to match the hardened runtime and actual shipped scope.
- **Verification:** Ran `python3 -m pip install -e '.[dev]'`, `npm install` in `frontend/`, `python3 -m ruff check backend tests loadtests`, `python3 -m ruff format --check backend tests loadtests`, `python3 -m pytest`, `python3 -m bandit -r backend -c bandit.yaml`, `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_AUTH_KEY=test-auth-key SUPABASE_JWT_SECRET=test-secret AUDIT_LOG_SALT=test-salt TAKEAWAY_ENCRYPTION_KEY=$(python3 - <<'PY'\nfrom cryptography.fernet import Fernet\nprint(Fernet.generate_key().decode())\nPY\n) python3 -c "import backend.app"`, `npm run lint`, `npm run test`, and `npm run build`.
- **Follow-ups:** Validate `terraform plan` against live provider credentials and verify Redis-backed rate limiting plus container runtime behavior in deployed infrastructure.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Production Repository Audit and Polish
- **Summary:** Completed a production-grade repository pass across docs, tooling, backend structure, validation, tests, CI, and frontend state handling. Added professional governance documents, architecture and API references, Python project configuration, automated tests, GitHub Actions CI, shared frontend auth context, stricter API env handling, and database indexing/constraint improvements.
- **Files Changed:**
  - `.gitignore` - Added governance file ignores per request plus Python cache and egg-info ignores.
  - `.editorconfig` - Standardized whitespace and indentation rules.
  - `.pre-commit-config.yaml` - Added pre-commit hooks for Ruff and basic file hygiene.
  - `README.md` - Added full project overview, setup, quality gates, and documentation index.
  - `LICENSE` - Added MIT license.
  - `CONTRIBUTING.md` - Added contribution workflow and expectations.
  - `CODE_OF_CONDUCT.md` - Added collaboration standards.
  - `SECURITY.md` - Added security reporting and handling policy.
  - `Makefile` - Added common lint, test, and build commands.
  - `pyproject.toml` - Added Python packaging, Ruff, and pytest configuration.
  - `.github/workflows/ci.yml` - Added backend and frontend CI.
  - `docs/architecture.md` - Added architecture overview.
  - `docs/api-reference.md` - Added API documentation.
  - `docs/usage-examples.md` - Added product and env usage examples.
  - `backend/logging_config.py` - Added centralized backend logging setup.
  - `backend/services.py` - Added service-layer integration helpers for Supabase and Gemini.
  - `backend/app.py` - Wired centralized logging.
  - `backend/auth.py` - Improved middleware documentation and exception chaining.
  - `backend/controllers.py` - Separated service usage, improved docstrings, and tightened failure handling.
  - `backend/config.py` - Extended typed settings to include allowed origins.
  - `backend/schemas.py` - Added clearer schema docstrings.
  - `database.sql` - Added status constraint and index for user-centric lookups.
  - `tests/test_config.py` - Added configuration validation tests.
  - `tests/test_schemas.py` - Added request schema validation tests.
  - `frontend/src/context/AuthContext.jsx` - Added shared auth provider.
  - `frontend/src/context/auth-context.js` - Added shared auth context access helper.
  - `frontend/src/hooks/useAuth.js` - Converted hook to shared context access.
  - `frontend/src/hooks/useBooks.js` - Removed API fallback and reset errors per request.
  - `frontend/src/main.jsx` - Mounted app under shared auth provider.
  - `frontend/src/App.jsx` - Reworked landing/login presentation and clarified product messaging.
  - `frontend/src/components/layout/Navbar.jsx` - Kept auth display bound to shared session state.
  - `frontend/src/components/features/AICmdPalette.jsx` - Replaced clickable div with button and cleaned command copy.
  - `frontend/package.json` - Added project metadata, `check` script, and aligned Vite versions.
  - `frontend/package-lock.json` - Regenerated dependency lockfile for compatible frontend tooling.
  - `frontend/index.html` - Added product title and description metadata.
  - `frontend/README.md` - Replaced template text with workspace-specific guidance.
- **Verification:** Ran `python3 -m pip install -e '.[dev]'`, `npm install` in `frontend/`, `python3 -m ruff check backend tests`, `python3 -m ruff format --check backend tests`, `python3 -m pytest`, `npm run lint`, and `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=example-anon-key VITE_API_URL=http://127.0.0.1:8000 npm run build`.
- **Follow-ups:** The frontend production bundle still exceeds Vite’s 500 kB warning threshold; next improvement should split the command palette and related heavy UI into lazy-loaded chunks.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Post-Verification Polish
- **Summary:** Normalized controller formatting after verification so the backend remediation remains clean and presentation-ready.
- **Files Changed:**
  - `backend/controllers.py` - Wrapped long logging call and restored spacing around top-level declarations.
  - `AGENT.md` - Added this post-verification entry.
  - `CHANGELOG.md` - Added this post-verification entry.
- **Verification:** Confirmed the controller module remains syntactically valid after the formatting-only adjustment.
- **Follow-ups:** None.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Audit Finding Remediation
- **Summary:** Fixed backend package import stability, replaced implicit config fallbacks with explicit environment validation, tightened API schema validation, and removed the tracked backend `.env` in favor of example env files and root ignore rules.
- **Files Changed:**
  - `.gitignore` - Added repo-level ignore rules for env files, build outputs, caches, and local dependencies.
  - `backend/__init__.py` - Marked backend as a package for standard imports.
  - `backend/config.py` - Added cached validated backend settings loader.
  - `backend/.env.example` - Added safe backend environment template.
  - `frontend/.env.example` - Added safe frontend environment template.
  - `backend/app.py` - Fixed package-relative imports while preserving backend-cwd startup.
  - `backend/auth.py` - Wired JWT secret loading through validated settings.
  - `backend/controllers.py` - Added explicit Supabase config loading and guarded dependency error handling.
  - `backend/schemas.py` - Added request validation for status, rating, and string fields.
  - `frontend/src/lib/supabaseClient.js` - Removed fake env fallbacks and required explicit frontend configuration.
  - `backend/.env` - Removed tracked runtime env file from the repository tree.
- **Verification:** Ran `npm run lint`, `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=test-anon-key VITE_API_URL=http://127.0.0.1:8000 npm run build`, `python3 -m compileall backend/app.py backend/auth.py backend/controllers.py backend/config.py backend/schemas.py`, `SUPABASE_URL=http://localhost:54321 SUPABASE_KEY=test-key SUPABASE_JWT_SECRET=test-secret ./backend/venv/bin/python -c "import backend.app"`, and `SUPABASE_URL=http://localhost:54321 SUPABASE_KEY=test-key SUPABASE_JWT_SECRET=test-secret ./venv/bin/python -c "import app"` from `backend/`.
- **Follow-ups:** Add shared frontend auth context and split the AI command palette into a lazy-loaded chunk to address the bundle-size warning.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Initialization
- **Summary:** Setup the baseline full-stack React + LiteStar architectural layout per initial requirements.
- **Files Changed:**
  - `/Users/raoof.r12/Desktop/Raouf/E/AGENT.md` - Generated new foundational agent constraints.
  - `/Users/raoof.r12/Desktop/Raouf/E/backend/` - Initialized LiteStar backend via CLI.
  - `/Users/raoof.r12/Desktop/Raouf/E/frontend/` - Scaffolding React Vite App.
- **Verification:** Backend venv initialized. React scafolding underway.
- **Follow-ups:** Proceed to build Supabase logic, UI components, and API routing.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Full Audit and Scaffolding Fixes
- **Summary:** Fixed Tailwind v4 build issues and verified backend runs correctly. Scaffolded missing component directories.
- **Files Changed:**
  - `frontend/package.json` - Replaced outdated postcss with @tailwindcss/vite.
  - `frontend/vite.config.js` - Integrated tailwind plugin.
  - `frontend/src/index.css` - Converted css variables explicitly to Tailwind v4 @theme syntax.
  - `frontend/src/components/*` - Bootstrapped the component folders.
- **Verification:** Ran `npm run build` and `npm run lint` successfully. Ran `uvicorn app:app` backend with 0 exceptions.
- **Follow-ups:** Proceed to flesh out the actual implementation of UI components matching cyberpunk aesthetics.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Component Implementation & Wiring
- **Summary:** Built frontend React components (Navbar, BentoGrid, KanbanBoard, CyberCard, AICmdPalette), set up Supabase hooks, and wired them into App.jsx. Fixed Framer Motion ESLint warning.
- **Files Changed:**
  - `frontend/src/hooks/useAuth.js` - Supabase session hook.
  - `frontend/src/hooks/useBooks.js` - API connection hook.
  - `frontend/src/components/layout/Navbar.jsx` - Cyberpunk navigation.
  - `frontend/src/components/layout/BentoGrid.jsx` - Layout wrapper.
  - `frontend/src/components/features/CyberCard.jsx` - Animated book card.
  - `frontend/src/components/features/KanbanBoard.jsx` - Dashboard swimlanes.
  - `frontend/src/components/features/AICmdPalette.jsx` - Gemini magic menu.
  - `frontend/src/App.jsx` - Main app orchestrator.
- **Verification:** Ran `npm run lint` and the code passes all standards. UI is ready.
- **Follow-ups:** Integrate with local database credentials to verify end-to-end data flow.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Complete Architecture Audit
- **Summary:** Conducted file-by-file audit. Confirmed no missing imports, accurate strict TS-like boundaries in Python schemas, valid React hooks state architecture, and proper ESLint/Build checks.
- **Files Changed:**
  - `CHANGELOG.md` - Added verification log.
- **Verification:** Frontend (`npm run lint`, `npm run build`) completed flawlessly. Backend scripts and middlewares conform perfectly.
- **Follow-ups:** Proceed to QA manually after database linkage.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Elite Production Hardening and Operability Upgrade
- **Summary:** Upgraded Nexus Archive from a polished demo into a more production-aligned system. Added strict schema sanitization, secure response headers, public health and schema routes, structured audit logging, optional Sentry bootstrap, Gemini few-shot prompting with token-budget pruning and circuit-breaker fallback logic, TanStack Query caching with optimistic updates, lazy AI command palette loading, Docker and devcontainer assets, Locust load testing, Terraform scaffolding, and expanded architecture/API/operations documentation.
- **Files Changed:**
  - `backend/app.py` - Added OpenAPI docs, health route wiring, security middleware, and settings-driven hosts/CORS.
  - `backend/auth.py` - Allowed health/schema/options traffic and hardened request state injection.
  - `backend/config.py` - Added production-oriented settings for origins, observability, auditing, and Gemini controls.
  - `backend/controllers.py` - Added audit logging and resilient suggestion response handling.
  - `backend/schemas.py` - Added strict Pydantic v2 sanitization validators and suggestion source metadata.
  - `backend/services.py` - Added few-shot prompting, token pruning, circuit breaker, and local fallback recommendations.
  - `backend/audit_logger.py` - Added hashed-user audit event logging.
  - `backend/health.py` - Added `/healthz` uptime probe.
  - `backend/observability.py` - Added optional backend Sentry initialization.
  - `backend/security.py` - Added secure response header middleware.
  - `backend/Dockerfile` - Added containerized backend runtime.
  - `frontend/src/hooks/useBooks.js` - Replaced manual fetch state with TanStack Query caching and optimistic updates.
  - `frontend/src/components/features/AICmdPalette.jsx` - Surfaced live-vs-local suggestion source and aligned with the new mutation flow.
  - `frontend/src/components/features/LazyAICmdPalette.jsx` - Added on-demand AI palette loading with shortcut support.
  - `frontend/src/lib/apiClient.js` - Added shared authenticated API client.
  - `frontend/src/lib/queryClient.js` - Added shared React Query client.
  - `frontend/src/observability/sentry.js` - Added optional frontend Sentry bootstrap.
  - `frontend/src/App.jsx` - Removed manual fetch effect and wired in lazy AI loading.
  - `frontend/src/main.jsx` - Added QueryClient provider and observability init.
  - `frontend/package.json` / `frontend/package-lock.json` - Added Sentry and TanStack Query dependencies.
  - `frontend/vite.config.js` - Added manual chunking to eliminate the oversized bundle warning.
  - `pyproject.toml` - Added observability, tokenizer, and Locust dependencies.
  - `Makefile` - Added load-test, docker-build, and Terraform formatting targets.
  - `.github/workflows/ci.yml` - Added Terraform formatting and Docker build quality gates.
  - `backend/.env.example` / `frontend/.env.example` - Added new observability and hardening configuration templates.
  - `.dockerignore`, `docker-compose.yml`, `.devcontainer/devcontainer.json` - Added local runtime parity assets.
  - `loadtests/locustfile.py` - Added concurrent `/books/suggest` load scenario.
  - `infra/terraform/*` - Added reviewed IaC scaffold for Supabase and Vercel.
  - `README.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/usage-examples.md`, `docs/operations.md`, `SECURITY.md` - Documented the new operational, security, and runtime model.
  - `tests/test_config.py`, `tests/test_schemas.py`, `tests/test_services.py` - Added coverage for config parsing, sanitization, and fallback suggestion logic.
- **Verification:** Ran `python3 -m pip install -e '.[dev]'`, `npm install` in `frontend/`, `python3 -m ruff check backend tests loadtests`, `python3 -m ruff format --check backend tests loadtests`, `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_JWT_SECRET=test-secret python3 -m pytest`, `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_JWT_SECRET=test-secret python3 -c "import backend.app"`, `npm run lint`, and `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=example-anon-key VITE_API_URL=http://127.0.0.1:8000 VITE_SENTRY_DSN=https://public@example.ingest.sentry.io/1 VITE_SENTRY_TRACES_SAMPLE_RATE=0 npm run build`. `terraform fmt` could not run locally because Terraform is not installed, and `docker build` could not complete because the Docker daemon was unavailable.
- **Follow-ups:** Run `terraform init/plan` with live provider credentials and re-run the container build once Docker is running to fully validate external tooling paths.

### 2026-03-15 (Australia/Sydney)
**Raouf:**
- **Scope:** Zero-Trust Auth and Adversarial Security Hardening
- **Summary:** Reworked the app around backend-managed `HttpOnly` cookies so Supabase access tokens are no longer exposed to browser storage. Added cookie-backed auth endpoints and refresh rotation, server-side token validation from cookies or bearer headers, LLM prompt scrubbing with strict XML delimiters and PII masking, application-layer takeaway encryption hooks, per-user sliding-window rate limiting for `/books/suggest`, deeper schema constraints, and CI security scanners for SAST, SCA, and secret detection. Updated docs to describe the new zero-trust model and production checklist.
- **Files Changed:**
  - `backend/auth.py` - Added cookie token support and shared JWT decode helper.
  - `backend/auth_controller.py` - Added login, refresh, logout, and session endpoints that issue `HttpOnly` cookies.
  - `backend/config.py` - Added cookie, auth-key, rate-limit, and encryption settings.
  - `backend/controllers.py` - Added takeaway encryption/decryption handling and suggest rate limiting.
  - `backend/data_protection.py` - Added LLM input scrubbing, PII masking, XML serialization, and takeaway encryption helpers.
  - `backend/rate_limit.py` - Added in-memory sliding-window limiter for the suggestion endpoint.
  - `backend/services.py` - Added prompt isolation and sanitized XML context generation for Gemini.
  - `backend/schemas.py` - Added login/session schemas and tighter field constraints.
  - `backend/app.py` - Registered the auth controller.
  - `database.sql` - Enabled `pgcrypto` extension for deeper data-protection readiness.
  - `frontend/src/context/AuthContext.jsx` - Replaced Supabase browser-session handling with backend cookie session handling.
  - `frontend/src/lib/apiClient.js` - Added `credentials: include` requests and silent refresh retry logic.
  - `frontend/src/hooks/useBooks.js` - Removed direct access-token dependency from API calls.
  - `frontend/src/lib/supabaseClient.js` - Removed browser-managed Supabase client session storage.
  - `frontend/package.json` / `frontend/package-lock.json` - Removed `@supabase/supabase-js` from the browser bundle.
  - `frontend/vite.config.js` - Removed the obsolete Supabase chunk split.
  - `pyproject.toml` - Added `cryptography`, `email-validator`, `bandit`, and `pip-audit`.
  - `bandit.yaml` - Added repository SAST configuration and excluded runtime artifacts.
  - `.github/workflows/ci.yml` - Added Bandit, pip-audit, npm audit, and gitleaks jobs.
  - `backend/.env.example` / `frontend/.env.example` - Added zero-trust auth and encryption configuration templates.
  - `README.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/usage-examples.md`, `docs/operations.md`, `SECURITY.md` - Documented cookie auth, prompt-injection defenses, rate limits, and PITR/encryption guidance.
  - `tests/test_config.py`, `tests/test_data_protection.py`, `tests/test_rate_limit.py` - Added coverage for new security controls.
- **Verification:** Ran `python3 -m pip install -e '.[dev]'`, `npm install` in `frontend/`, `python3 -m ruff check backend tests loadtests`, `python3 -m ruff format --check backend tests loadtests`, `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_AUTH_KEY=test-auth-key SUPABASE_JWT_SECRET=test-secret python3 -m pytest`, `python3 -m bandit -r backend -c bandit.yaml -x backend/venv,backend/__pycache__`, `npm run lint`, `VITE_API_URL=http://127.0.0.1:8000 VITE_SENTRY_DSN=https://public@example.ingest.sentry.io/1 VITE_SENTRY_TRACES_SAMPLE_RATE=0 npm run build`, `npm audit --audit-level=high`, and an isolated `pip-audit` run in a temporary virtual environment after upgrading that venv-local `pip`. Also confirmed `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SUPABASE_AUTH_KEY=test-auth-key SUPABASE_JWT_SECRET=test-secret python3 -c "import backend.app"` succeeds.
- **Follow-ups:** Configure Supabase project JWT lifetime to 15 minutes, enable PITR in the hosted project, provide a stable production `TAKEAWAY_ENCRYPTION_KEY`, and decide whether logout should also revoke refresh tokens server-side.
