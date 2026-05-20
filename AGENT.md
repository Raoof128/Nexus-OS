---
name: Agent Rules
description: Foundational agent rules for the Gemini + LiteStar + React project.
---

# Agent Rules

### 2026-05-20 (Australia/Sydney) — Backend Security Audit & Hardening

**Raouf:**

- **Scope:** Full backend security audit and systematic hardening pass.
- **Summary:** Performed a surgical file-by-file audit of the LiteStar/Supabase backend. Hardened AI-driven features (email drafting, summarization, chat) with mandatory rate limiting and enhanced prompt injection protection using strict XML delimiters. Implemented field-level encryption for sensitive chat content and takeaway notes. Cleaned up redundant rate-limit configuration.
- **Files Changed:** `backend/email_controller.py`, `backend/chat_controller.py`, `backend/data_protection.py`, `backend/config.py`, `backend/oauth_controller.py`.
- **Verification:** Full `scripts/check.sh` pass. Implemented and passed new integration test suite (`tests/test_email_controller.py`, `tests/test_chat_controller.py`, `tests/test_oauth_controller.py`).
- **Follow-ups:** None.

### 2026-05-20 (Australia/Sydney) — Full Frontend Audit & Polish

**Raouf:**

- **Scope:** Full frontend audit fix pass and quality gate stabilization.
- **Summary:** Stabilized the windowing system with relaxed drag boundaries and reliable titlebar interactions. Implemented arrow-key navigation in the App Launcher and added professional boot sequence visuals. Completed a systematic audit of all frontend components, fixing interaction bugs and polishing the cyberpunk aesthetic.
- **Files Changed:** `frontend/src/os/stores/windowStore.js`, `frontend/src/os/components/Window.jsx`, `frontend/src/os/components/AppLauncher.jsx`, `frontend/src/os/components/BootSequence.jsx`, `frontend/src/os/components/Taskbar.jsx`, `frontend/src/os/components/DesktopIcons.jsx`, `frontend/src/os/apps/SettingsApp.jsx`.
- **Verification:** Full project quality gate (`check.sh`) passed. Verified manual polish on all touched surfaces.
- **Follow-ups:** None.

### 2026-05-20 (Australia/Sydney) — Quality Gate & Audit Pass

**Raouf:**

- **Scope:** Full audit fix pass and quality gate stabilization.
- **Summary:** Stabilized `scripts/check.sh` by targeting `pip-audit` to the local project. Fixed React lint errors in `AppLauncher.jsx` and cleaned up test hygiene. Updated Python dependencies to patched versions.
- **Files Changed:** `scripts/check.sh`, `pyproject.toml`, `frontend/src/os/components/AppLauncher.jsx`, `frontend/src/components/features/EmailInbox.test.jsx`, `frontend/src/hooks/useChat.js`.
- **Verification:** Full `check.sh` pass.
- **Follow-ups:** None.

### 2026-05-20 (Australia/Sydney) — Windowing Overhaul & Frontend Audit

**Raouf:**

- **Scope:** Full polish of the windowing system and systematic frontend audit.
- **Summary:** Relaxed window dragging constraints to allow more off-screen movement while keeping the title bar accessible. Implemented arrow-key navigation in the App Launcher and added a professional progress bar to the boot sequence. Polished desktop icons, taskbar, and chat loading states. Added a factory reset option to settings.
- **Files Changed:** `frontend/src/os/stores/windowStore.js`, `frontend/src/os/components/Window.jsx`, `frontend/src/os/components/SnapPreview.jsx`, `frontend/src/os/components/AppLauncher.jsx`, `frontend/src/os/components/DesktopIcons.jsx`, `frontend/src/os/components/Taskbar.jsx`, `frontend/src/os/components/BootSequence.jsx`, `frontend/src/components/features/ChatLayout.jsx`, `frontend/src/os/apps/SettingsApp.jsx`, `frontend/src/os/stores/__tests__/windowStore.test.js`.
- **Verification:** Created and passed `windowStore.test.js`. Verified all interaction patterns manually. Successfully ran `scripts/check.sh` with all gates passing (Formatting, Lint, Security, Tests). All 173 project tests (Vitest + Pytest) are passing.
- **Follow-ups:** None.

### 2026-05-20 (Australia/Sydney) — Test Suite Expansion

**Raouf:**

- **Scope:** Expanded test coverage across full stack.
- **Summary:** Implemented `AuthPanel.test.jsx` for UI behavior/transitions and `test_auth_logic.py` / `test_data_privacy.py` for backend security/PII invariants. Updated `conftest.py` for stable module-level environment seeding.
- **Files Changed:** `frontend/src/components/features/__tests__/AuthPanel.test.jsx`, `frontend/src/App.test.jsx`, `tests/test_auth_logic.py`, `tests/test_data_privacy.py`, `tests/conftest.py`.
- **Verification:** Frontend (Vitest) and Backend (Pytest) suites verified.
- **Follow-ups:** None.

1. **Framework Strictness:**
   - **Frontend:** React + Vite + Tailwind CSS. Follow component-driven architecture (e.g., `/src/components/layout`, `/src/components/features`).
   - **Backend:** Python + LiteStar. Do not dump code in `main.py` or `app.py`. Split into controllers, schemas, and auth middlewares.
   - **Database/Auth:** Supabase for PostgreSQL and Auth (JWT). Utilize backend Service Role Key sparingly and Anon Key appropriately.
2. **Design Philosophy:**
   - Visual excellence is mandatory. Use Cyberpunk aesthetic, neon effects, dark modes, gradients, dynamic hover states.
   - No generic minimal designs. Must feel premium.
3. **Security Constraints:**
   - Validate and verify Supabase JWTs stringently in backend APIs.
   - Use Row Level Security (RLS) to restrict User access.
   - Restrict CORS on LiteStar backends. No wildcard allow-origins.
4. **Operations:**
   - Do NOT run destructive commands without user approval or when not strictly testing logic boundaries.
   - Ensure all secrets and env vars are securely tracked via local `.env`. Do not hardcode secrets.

## Change Log

### 2026-05-20 (Australia/Sydney)

**Raouf:**

- **Scope:** Quality Gate & Audit Pass
- **Summary:** Fixed project formatting, React lint errors, and security vulnerabilities. Stabilized the quality gate script to focus on project-specific dependencies.
- **Files Changed:** `scripts/check.sh`, `pyproject.toml`, `frontend/src/os/components/AppLauncher.jsx`, `frontend/src/components/features/EmailInbox.test.jsx`, `frontend/src/hooks/useChat.js`, `frontend/vitest.setup.js`, `frontend/src/os/apps/__tests__/NotesApp.test.jsx`, `frontend/src/os/components/__tests__/Desktop.test.jsx`, `frontend/src/os/components/__tests__/Window.test.jsx`, `frontend/src/App.test.jsx`.
- **Verification:** Full project quality gate (`check.sh`) passed with 173/173 tests green (94 Vitest, 79 Pytest).
- **Follow-ups:** None.

### 2026-05-20 (Australia/Sydney)

**Raouf:**

- **Scope:** Windowing Overhaul & Frontend Audit
- **Summary:** Relaxed window dragging constraints, implemented App Launcher keyboard navigation, and enhanced boot sequence visuals. Completed a systematic audit of shell and feature components for interaction polish and accessibility.
- **Files Changed:** `frontend/src/os/stores/windowStore.js`, `frontend/src/os/components/Window.jsx`, `frontend/src/os/components/SnapPreview.jsx`, `frontend/src/os/components/AppLauncher.jsx`, `frontend/src/os/components/DesktopIcons.jsx`, `frontend/src/os/components/Taskbar.jsx`, `frontend/src/os/components/BootSequence.jsx`, `frontend/src/components/features/ChatLayout.jsx`, `frontend/src/os/apps/SettingsApp.jsx`.
- **Verification:** Passed 4/4 new vitest tests for windowStore. Verified manual polish on all touched surfaces. Full project quality gate (`check.sh`) passed.
- **Follow-ups:** None.

### 2026-05-20 (Australia/Sydney)

**Raouf:**

- **Scope:** Enhanced login page responsiveness and cyberpunk visual excellence.
- **Summary:** Refactored `AuthPanel` with Framer Motion for fluid transitions and dynamic height. Added cyber-brackets, terminal-style inputs, and decryption loading animations. Improved mobile hero section layout to maintain brand presence on small screens.
- **Files Changed:**
  - `frontend/src/components/features/AuthPanel.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/components/features/ResetPasswordPage.jsx`
  - `frontend/src/index.css`
- **Verification:** Verified smooth choreography between panels and improved mobile layout flow. Renamed `motion` to `Motion` to satisfy strict lint rules.
- **Follow-ups:** None.

### 2026-04-17 (Australia/Sydney) — Fix: card shake on status change + stalled modal exit

**Raouf:**

- **Scope:** Two user-reported bugs in the Media Vault detail modal — "card shakes when I pick a status option" and "exit button doesn't work after that."
- **Root cause:** `CyberCard.jsx:54` and `MediaDetailModal.jsx:63` both rendered `layoutId={'card-${item.id}'}` simultaneously while the modal was open. Framer Motion's shared-layout reconciler is designed for _one element at a time_ claiming a `layoutId` so it can morph between them (card → modal on open). With both mounted _and_ `layout="position"` on CyberCard, whenever an optimistic status update re-parented the card to a different kanban column, the reconciler tried to animate the **modal** toward the card's new DOM position and back — visible as a "shake." The same broken reconciler state then stalled the exit animation; the X-button click _did_ fire and the React state _did_ clear, but AnimatePresence's exit never completed cleanly, so users perceived the close button as dead. The conflict was latent until the prior commit that stopped auto-closing the modal on status change — before that fix, only one element held the id at a time.
- **Fix:** Dropped the shared `layoutId` from both sides. Kept `layout="position"` on `CyberCard` so within-column drag/drop reordering still settles smoothly. Modal now has a deterministic `initial/animate/exit` fade+scale+y entry/exit that doesn't depend on the card's DOM position. Trade-off: lost the delightful card-to-modal morph on open — acceptable in exchange for a modal that actually opens and closes reliably while its item is being updated.
- **Investigation notes:** Followed the systematic-debugging protocol — reproduced mentally from code, traced data flow through the optimistic update, identified the exact Framer Motion interaction, formed a single hypothesis, applied the minimal fix. Not a "remove all animations" sledgehammer: only the _shared_ id was removed.
- **Files Changed:** `frontend/src/components/features/CyberCard.jsx`, `frontend/src/components/features/MediaDetailModal.jsx`.
- **Verification:** ESLint 0 errors, Vitest 117/117, Vite build clean.

### 2026-04-17 (Australia/Sydney) — Animation Audit + Polish

**Raouf:**

- **Scope:** Full audit and polish of every animation across the frontend (190 Framer Motion usages across 18 files, 3 CSS keyframe sets).
- **Audit findings:** `MotionConfig reducedMotion="user"` already wired at root (`main.jsx:25`) — Framer Motion auto-disables for users with `prefers-reduced-motion: reduce`, so the biggest accessibility concern is already covered. CSS has a catch-all `animation-duration: 0.01ms !important` under the same media query, plus explicit disables for `.ambient-orbs`, `.scanlines`, `.glitch-hover`, `.neon-pulse`. The two real gaps were (a) **inconsistent motion tokens** — 11 distinct `duration` values and 3 near-identical spring configs scattered across components, each reinventing the same ~250ms gentle bounce or ~200ms fade; and (b) two infinite / long-running animations that animated `top` as a CSS percentage, which triggers layout every frame instead of GPU-compositing.
- **Polish applied:** (1) New `frontend/src/lib/motion.js` establishes canonical tokens — `DURATION.{fast:0.15, base:0.2, slow:0.3}`, `EASE.{standard, inOut, emphasized}`, `SPRING.{soft, snappy}`, plus pre-composed `TRANSITION_FADE` / `TRANSITION_FAST`. (2) Migrated 8 spring usages (CyberCard, MediaDetailModal, ComposeModal, AddMediaDialog, ConfirmDialog, AppLauncher, NotificationToast, EmailList) from ad-hoc `{damping: 28, stiffness: 280}` / `{25, 300}` / `{stiffness: 340}` to the two-token scale so the same interaction feels the same everywhere. (3) Migrated ad-hoc fade/scale durations (MediaApp vault-switch, EmailInbox mount, EmailReader swap, ContextMenu popover, MediaDetailModal backdrop, stepper) to `DURATION.*` tokens. (4) Performance: LockScreen infinite scan highlight and BootSequence CRT sweep now animate `y` via transform (with `willChange: 'transform'`) instead of `top` as a CSS %, so the GPU compositor handles them and the browser no longer recalculates layout every frame. (5) Choreographed sequences kept bespoke — BootSequence phase timings (0.3s–0.8s, intentionally paced) and LockScreen ambient loops (2s/3s/8s) are not UI chrome, they _are_ the content; forcing tokens on them would flatten deliberate pacing.
- **Files Changed:** `frontend/src/lib/motion.js` _(new)_, `components/features/CyberCard.jsx`, `components/features/MediaDetailModal.jsx`, `components/features/ComposeModal.jsx`, `components/features/AddMediaDialog.jsx`, `components/features/ConfirmDialog.jsx`, `components/features/MediaApp.jsx`, `components/features/EmailInbox.jsx`, `components/features/EmailReader.jsx`, `components/features/EmailList.jsx`, `os/components/AppLauncher.jsx`, `os/components/NotificationToast.jsx`, `os/components/ContextMenu.jsx`, `os/components/LockScreen.jsx`, `os/components/BootSequence.jsx`.
- **Verification:** ESLint 0 errors, Vitest 117/117, Vite build clean (1.95s).
- **Follow-ups:** None critical. Future work could collapse the `MODAL_VARIANTS` / `OVERLAY_VARIANTS` objects in `ComposeModal.jsx` into shared exports if more modals need the same slide-up pattern.

### 2026-04-17 (Australia/Sydney) — Window Controls + Z-index + Responsive Polish

**Raouf:**

- **Scope:** Three reported bugs plus a global z-index/responsive audit on the Desktop OS shell.
- **Summary:** (1) **Close/min/max buttons required multiple clicks** — titlebar's `onPointerDown` unconditionally called `dragControls.start(e)`, capturing the pointer and swallowing the button's click. Fixed by bailing out when the event target is inside a `<button>` (plus the same guard on the titlebar's double-click-to-maximize so button double-clicks don't accidentally maximize). (2) **Resize felt unreliable at corners** — the outer `Motion.div` had `overflow-hidden rounded-lg`, which clipped the 8px resize handles against the rounded corner path. Moved `rounded-t-lg`/`rounded-b-lg` onto the inner titlebar + content, removed outer `overflow-hidden`, enlarged handle hit areas (edges 6px, corners 14px) and offset them outward by half their width so the grabbable region extends slightly past the window border. Added `touch-action: none` on handles so touch doesn't scroll mid-resize. (3) **Z-index scale was overlapping** — windows occupied 100–~250 while in-app modals lived at 80/81/100/110 and `ContextMenu` at 900. A modal opened in a non-top window would render below another window. Built a single canonical ladder in `frontend/src/lib/zLayers.js` (snap preview 90, windows 100+stack, taskbar 500, launcher 599/600, modals 1000/1001, nested confirm 1051, context menu 1200, notifications 1500, lock 2000, boot 9999) and migrated every consumer to it. (4) **Mobile/responsive polish** — mobile Window titlebar now uses `env(safe-area-inset-top)` + a 44×44 close button (WCAG touch target); desktop window controls bumped from `p-1.5` to `p-2`.
- **Files Changed:**
  - `frontend/src/os/components/Window.jsx` — button-in-titlebar drag guard, resize handle size + outset, rounded-lg moved inward, mobile safe-area-top, bigger hit targets.
  - `frontend/src/lib/zLayers.js` _(new)_ — canonical z-index constants + Tailwind class fragments.
  - `frontend/src/os/Desktop.jsx` — snap preview `z-[99]` → `z-[90]`.
  - `frontend/src/components/features/MediaDetailModal.jsx`, `ComposeModal.jsx`, `AddMediaDialog.jsx`, `EditMediaDialog.jsx`, `AICmdPalette.jsx`, `LazyAICmdPalette.jsx`, `ConfirmDialog.jsx` — all modal z-indexes migrated into the 1000–1051 band.
  - `frontend/src/os/components/ContextMenu.jsx` — bumped to `zIndex: 1200` so right-click inside a modal still surfaces the menu on top.
- **Verification:** `npm run lint` 0 errors, `vitest` 117/117, `vite build` clean (2.08s).

### 2026-04-17 (Australia/Sydney) — Logic Audit Remediation (Medium + Low)

**Raouf:**

- **Scope:** Four-agent file-by-file logic/correctness audit, all remaining batches (Backend Medium, OS shell Medium, Feature Medium, Data layer Medium, Low sweep).
- **Summary:** After landing Critical + High (prior entry), finished the audit by applying every verified Medium/Low finding and dropping false positives. Backend Medium — validated `TAKEAWAY_ENCRYPTION_KEY` at first use with a clear config error instead of letting `cryptography` raise an opaque `binascii` error deeper in the stack; wired `chat_controller` to consult the shared Gemini circuit breaker (and record success/failure) so a Gemini outage degrades chat the same way it degrades `/media/suggest` instead of failing fast. OS shell Medium — deduped hydrated `zStack` in `windowStore` so a stale persisted layout with duplicate IDs can't break focus/close invariants. Feature Medium — `AICmdPalette` resets `addedIndices` and `result` on `mediaType` change via the render-time reset pattern (eslint `react-hooks/set-state-in-effect` clean); `ComposeModal.handleSubmit` guards against empty `selectedAccountId`; `ResetPasswordPage` adds a `submittingRef` double-submit guard and moves `setSubmitting(false)` into a `finally` block. Data layer Medium — `useChat.sendMessage.onSuccess` no longer appends a synthetic `ai-${Date.now()}` row alongside `invalidateQueries` (just invalidate — the refetch is the canonical truth and the synthetic append was pure churn). Low sweep — email poller task handle stashed on `app.state` and cancelled via a new `stop_email_poller` shutdown hook wired into `Litestar(on_shutdown=[...])`; `MediaDetailModal`'s `ConfirmDialog` now passes `id={item.id}` for uniqueness across stacked modals.
- **False positives dropped after verification:** H1 (`controllers.create_media:89` overwrites `user_id` from the token — `MediaCreate` has no `user_id` field; nothing to verify post-insert). H5 (`Window.jsx` ResizeHandle math is stable relative to `startRef` — position deltas never drift across re-renders). H7 (`NotesApp` per-`windowId` localStorage keys are consistent; nanoid collision space is effectively zero). H9 (`useEmails` effect re-subscribes on `accessToken` change via its dep array — channel is torn down and rebuilt, no stale auth). Plus Medium/Low: BootSequence `onComplete` is already stabilized via `useCallback([])` in `Desktop.jsx`; `LockScreen` dismiss uses a stable `useCallback`; notification auto-dismiss timer references an idempotent action and nanoid(8) collision risk is negligible; `schemas.py` angle-bracket regex gap is not exploitable through React's auto-escaping text rendering; OAuth state already cookie-scoped per browser; `useFocusTrap` stale-element concern was real (already fixed in prior commit).
- **Also fixed (gratis cleanup):** pre-existing ruff errors in `email_poller.py:185` (line-length) and `oauth_controller.py` (unused `import os`).
- **Files Changed:** `backend/auth.py`, `backend/auth_controller.py`, `backend/rate_limit.py`, `backend/oauth_controller.py`, `backend/data_protection.py`, `backend/chat_controller.py`, `backend/email_poller.py`, `backend/app.py`, `frontend/src/lib/apiClient.js`, `frontend/src/context/AuthContext.jsx`, `frontend/src/hooks/useMedia.js`, `frontend/src/hooks/useChat.js`, `frontend/src/hooks/useFocusTrap.js`, `frontend/src/os/hooks/useGlobalShortcuts.js`, `frontend/src/os/stores/windowStore.js`, `frontend/src/components/features/AICmdPalette.jsx`, `frontend/src/components/features/ComposeModal.jsx`, `frontend/src/components/features/MediaDetailModal.jsx`, `frontend/src/components/features/ResetPasswordPage.jsx`.
- **Verification:** `ruff check` clean on all touched files, `pytest` 74/74, `npm run lint` 0 errors, `vitest` 117/117, `vite build` clean.

### 2026-04-17 (Australia/Sydney)

**Raouf:**

- **Scope:** UI/UX Audit Remediation — Defect + High-Confidence Fixes
- **Summary:** Audited full frontend (auth → Desktop OS shell → Media/KanbanBoard/CyberCard/Detail/Add/AICmd apps) and fixed 11 items that were clear defects or high-confidence UX wins. Deferred 6 subjective items (OS-metaphor scope, tone-of-voice rewrite, dual-accent color commitment, logo redesign, full undo system, mobile breakpoint) for separate decisions. Fixes: (1) wired `onAiSuggest` + `onAddRequest` from empty-state Kanban columns via a lightweight `window` event bus (`nexus:open-add-media`, `nexus:open-ai-cmd`) — previously dead buttons. (2) CyberCard action row now rests at `opacity-60` instead of `0` on desktop, so advance/revert/edit/delete are discoverable without hover. (3) MediaDetailModal no longer auto-closes on status change — stepper progression is now visible. (4) Desktop welcome notification gated on genuine first-boot + derived count from `APP_ORDER.length` (no more hardcoded "8 apps" every mount). (5) KanbanBoard grid cols derived from `config.statuses.length`. (6) Empty-state column gets a primary "+ Add {Singular}" CTA (pre-fills status), AI button demoted to secondary. (7) activeType mirrored to URL `?type=…` so refresh preserves tab. (8) Font sizes raised from 8–10px to 10–11px on Taskbar labels/clock, Window titlebar, DesktopIcons labels, AppLauncher labels, media-type tabs. (9) Edge-fade mask on overflow-scroll tab rails (Taskbar window list, MediaApp type tabs). (10) Removed duplicate `useState` import in KanbanBoard. (11) Removed stale "noise texture" comment in `index.css`.
- **Files Changed:**
  - `frontend/src/components/features/KanbanBoard.jsx` — merged imports, added `Plus` icon, derived grid cols from `statuses.length`, threaded `onAddRequest`, rewrote empty-state block with primary/secondary CTAs and cleaner copy.
  - `frontend/src/components/features/MediaApp.jsx` — URL-sync for `activeType` via `URLSearchParams` + `replaceState`, added `handleAddRequest`/`handleAiSuggest` that dispatch window events, passed both to KanbanBoard, added edge-fade mask on the tab rail.
  - `frontend/src/components/features/CyberCard.jsx` — resting opacity `0` → `60` for the action row on desktop.
  - `frontend/src/components/features/MediaDetailModal.jsx` — removed `onClose()` from `handleStatusChange`.
  - `frontend/src/components/features/AddMediaDialog.jsx` — listens for `nexus:open-add-media`, reads `detail.status` and seeds the form.
  - `frontend/src/components/features/LazyAICmdPalette.jsx` — listens for `nexus:open-ai-cmd`.
  - `frontend/src/os/Desktop.jsx` — welcome notification gated on first boot + dynamic app count from `APP_ORDER`.
  - `frontend/src/os/components/Taskbar.jsx` — clock, tab, and window-name font bumps (11px), edge-fade mask on window tab rail.
  - `frontend/src/os/components/Window.jsx` — titlebar font bump (11px desktop + mobile).
  - `frontend/src/os/components/DesktopIcons.jsx` — icon labels 11px and contrast lifted to `text-white/70`.
  - `frontend/src/os/components/AppLauncher.jsx` — app labels 11px (removed tiny 9px breakpoint).
  - `frontend/src/index.css` — removed stale noise-texture comment block.
- **Verification:** `npm run lint` 0 errors, `npm run test -- --run` 117/117 passing, `npm run build` clean (2645 modules, 1.95s).
- **Follow-ups (deferred, need direction):** (i) OS-metaphor vs. media-vault focus — 8 apps around one core product is scope creep. (ii) Copy tone rewrite — action verbs are dressed up ("Authenticate", "Commit to Archive", "Disconnect"). (iii) Dual-accent color commitment — `--neon-teal` defined but near-unused. (iv) Full undo system for status changes / drag-drop (notification-store toast with "Undo" action). (v) Navbar logo glyph upgrade. (vi) Tablet breakpoint near 768px (min-window-width 600px inside 768px viewport). (vii) Hoist per-card `ConfirmDialog` to a single app-level dialog. Browser-based axe/contrast audit also still outstanding.

### 2026-03-24 (Australia/Sydney)

**Raouf:**

- **Scope:** New Media Type — Job Application Tracker
- **Summary:** Added `job` as a fourth media type to the unified engine. Jobs use the existing polymorphic `media` table with `title` (Role), `creator` (Company), `sub_info` (Salary/Location), and `takeaway` (Interview Notes). Four-status Kanban pipeline: Not Answered, Answered, Rejected, Got the Job. Dynamic grid layout switches to 4-column on `lg` for the job board while preserving 3-column for books/movies/anime. Added Gemini career advisor prompt and local fallback suggestions for jobs. Added `jobs` chat category with amber color. Delete button was already fully implemented (Trash2 + ConfirmDialog on CyberCard, MediaDetailModal, MediaVault).
- **Files Changed:**
  - `supabase/migrations/20260324000000_add_job_media_type.sql` — New migration: `ALTER TYPE media_type ADD VALUE 'job'`.
  - `backend/schemas.py` — Added `"job"` to `MediaType`, job statuses to `MediaStatus`, `"jobs"` to `ChatCategory`.
  - `backend/controllers.py` — Added `"job"` to `VALID_MEDIA_TYPES`.
  - `backend/services.py` — Added job `MASTER_PROMPTS` (career strategist) and `LOCAL_FALLBACKS` (engineering/ai/product/default).
  - `frontend/src/lib/mediaConfig.js` — Added `job` config with `Briefcase` icon, 4 statuses, Company/Salary labels.
  - `frontend/src/components/features/KanbanBoard.jsx` — Dynamic `gridColsClass`: `md:grid-cols-2 lg:grid-cols-4` for jobs.
  - `frontend/src/components/features/ChatSidebar.jsx` — Added `job: 'text-amber-400'` color.
  - `frontend/src/components/features/AddMediaDialog.jsx` — Added job placeholders (Senior Engineer / Stripe).
  - `frontend/src/App.jsx` — Added 'Jobs' to hero labels, updated description text, hero grid to `sm:grid-cols-4`.
- **Verification:** `ruff check` clean, `pytest` 34/34 pass, `npm run lint` 0 errors, `npm run test` 17/17 pass, `npm run build` clean.
- **Follow-ups:** Run `ALTER TYPE media_type ADD VALUE 'job'` in production Supabase SQL Editor before deploying. Backend runs on DigitalOcean droplet — redeploy Docker container after push.

### 2026-03-22 (Australia/Sydney)

**Raouf:**

- **Scope:** AI Palette UX — Lift Button + One-Click Add to Archive
- **Summary:** Moved AI CMD FAB higher. Added "Add to Archive" buttons on each suggestion card with status selection (To Read/Watch, Reading/Watching, Finished). One click creates the entry with all details pre-filled. Visual confirmation with checkmark.
- **Files Changed:** `AICmdPalette.jsx`, `LazyAICmdPalette.jsx`, `App.jsx`.
- **Verification:** Lint/test/build clean, deployed.

### 2026-03-22 (Australia/Sydney)

**Raouf:**

- **Scope:** Fix Production Account + Password Reset Redirect
- **Summary:** Fixed two production issues. (1) Production Supabase user `raoof.r12@gmail.com` password was out of sync — reset to `Dev@Nexus2026` via Supabase Admin API. (2) Password reset email link was redirecting to root `/` instead of `/reset-password` — updated Supabase recovery email template via Management API to use `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`. Updated frontend `recoveryTokens.js` to also parse `token_hash` from URL params (in addition to `access_token`). Updated `ResetPasswordPage.jsx` to accept `tokenHash` prop and exchange it for a session via `realtimeClient.auth.verifyOtp()` before showing the password form.
- **Files Changed:** `lib/recoveryTokens.js`, `components/features/ResetPasswordPage.jsx`, `App.jsx`.
- **Verification:** Lint 0 errors, test 17/17, build clean, deployed to Cloudflare Pages.
- **Follow-ups:** Test the full password reset flow end-to-end by requesting a recovery email and clicking the link.

### 2026-03-22 (Australia/Sydney)

**Raouf:**

- **Scope:** Full 53-Finding UI/UX Remediation — Auth, Media, Chat, Infrastructure
- **Summary:** Fixed all 53 findings from the 4-agent code-level UI/UX audit. **Auth (14 fixes):** double-submit race guard via `submittingRef`, extracted shared `PasswordInput` to `components/ui/`, added to ResetPasswordPage, `aria-invalid` on both email+password, register auto-login failure shows success message, forgot-password disables after send, panel height transition smoothing, password toggle keyboard-accessible (removed `tabIndex={-1}`), error Alert `normal-case`, consistent input styles on ResetPasswordPage, hero visible at `md` breakpoint (fixes 768-1023px gap), Navbar hides "Awaiting Auth..." when settled, glitch animation on full brand. **Media (27 fixes):** ConfirmDialog unique ARIA IDs via `id` prop, body scroll lock on all modals, Escape listener guarded by `!item`/`!open`, null creator guard, rating `!= null && > 0` checks, `group-focus-within` on action buttons, mobile column `max-h-[60vh]`, edit-from-modal uses `requestAnimationFrame` to avoid overlap, vault search resets via key, mobile vault field labels, status stepper `max-w-[60px]`, takeaway single-scroll, sub_info truncate, iOS safe-area on FAB, close button focus rings, consistent empty states, rating input validates 1-5, MediaForm `submittingLabel` prop. **Chat (21 fixes):** session delete confirmation, send error reset on session switch, optimistic message dedup via invalidation, Enter key guard, ARIA live region on messages, `break-words` on bubbles, timestamps on messages, create session disabled state, select option cross-platform colors, sidebar `md:` breakpoint, delete button `focus-visible:opacity-100`, empty state CTA, suggest error reset on palette close, palette max-height, skip `⌘K` in inputs, platform-aware shortcut hint, LoadingDialog backdrop. **Infrastructure (7 fixes):** token refresh failure callback + user error, auth expired clears session, mutation errors in useMedia error field, Realtime re-subscribes on token rotation, focus trap container-level listener, `bootstrapRecoveryTokens` try/catch, neon-pulse hover-only.
- **Files Changed:** `AuthPanel.jsx`, `ResetPasswordPage.jsx`, `App.jsx`, `Navbar.jsx`, `PasswordInput.jsx` (new), `ConfirmDialog.jsx`, `CyberCard.jsx`, `KanbanBoard.jsx`, `MediaVault.jsx`, `MediaDetailModal.jsx`, `AddMediaDialog.jsx`, `EditMediaDialog.jsx`, `MediaForm.jsx`, `ChatLayout.jsx`, `ChatSidebar.jsx`, `ChatWindow.jsx`, `AICmdPalette.jsx`, `LazyAICmdPalette.jsx`, `useChat.js`, `useSuggest.js`, `useMedia.js`, `useFocusTrap.js`, `apiClient.js`, `AuthContext.jsx`, `main.jsx`, `index.css`.
- **Verification:** `npm run lint` 0 errors 0 warnings, `npm run test -- --run` 17/17 pass, `npm run build` clean, deployed to Cloudflare Pages production.
- **Follow-ups:** None.

### 2026-03-22 (Australia/Sydney)

**Raouf:**

- **Scope:** UI/UX Audit Fixes — Layout Overlap, Mobile-First Login, Autocomplete, Password Toggle, Footer
- **Summary:** Fixed all findings from the Playwright-driven UI/UX audit. **C1 (CRITICAL):** Hero section overlapped auth panel at 800–900px viewports making the Authenticate button unclickable — fixed by hiding hero on sub-lg breakpoints and wrapping AuthPanel in a `relative z-10` container. **H1:** Login form was below the fold on mobile (375px) requiring scroll — fixed by reordering grid so auth panel shows first on mobile (`order-1`), hero hidden below `lg`. Added "Nexus Archive" H1 heading on mobile to replace hidden hero. **H2:** Added skip-to-login link on unauthenticated page. **M1:** Added `autocomplete` attributes to all 6 form inputs (email, current-password, new-password). **L1:** Increased touch targets on text link buttons via `py-2` padding. **L2:** Added `PasswordInput` component with show/hide toggle (Eye/EyeOff icons) on all 3 password fields. **L3:** Added minimal footer with copyright year.
- **Files Changed:**
  - `App.jsx` — Mobile-first layout reorder, skip link, footer, hero hidden below lg.
  - `AuthPanel.jsx` — `PasswordInput` component with visibility toggle, `autocomplete` on all inputs, increased link touch targets.
- **Verification:** `npm run lint` 0 errors (1 pre-existing warning), `npm run test -- --run` 17/17 pass, `npm run build` clean. Playwright re-audit: all 9 findings resolved — auth button clickable at all widths (600–1440px), login form above fold on mobile (y=343px), skip link found, autocomplete correct on all inputs, password toggles present (3), footer present, no horizontal overflow.
- **Follow-ups:** None.

### 2026-03-22 (Australia/Sydney)

**Raouf:**

- **Scope:** Full Frontend Audit Remediation — Architecture, Performance, Accessibility, Design
- **Summary:** Implemented all findings from a 4-dimension frontend audit (architecture, performance, a11y, design). Architecture: removed buggy `sanitize()` double-encoding, extracted shared `MediaForm` component from duplicated Add/Edit dialogs, centralized `TYPE_ICONS` into `mediaConfig.js`, deleted dead code (`useBooks.js`, `BentoGrid.jsx`, scaffold SVGs), replaced `window.location.reload()` with proper `signIn()` in AuthPanel, added env var validation to `realtimeClient.js`, extracted inline `useRecoveryTokens` hook, fixed variable shadowing in ChatLayout and App.jsx, derived ChatSidebar categories from `mediaConfig`. Performance: memoized CyberCard (custom comparator), KanbanBoard, and MediaVault with `React.memo`, added `useCallback` wrappers for all handler props in App.jsx, lazy-loaded MediaDetailModal/EditMediaDialog/ChatLayout, set global React Query `staleTime`/`gcTime` defaults, included update/delete mutation pending states in loading indicator. Accessibility: created reusable `useFocusTrap` hook and applied to all modals, created `ConfirmDialog` component for destructive actions (CyberCard, MediaDetailModal, MediaVault), fixed contrast (`--muted-foreground` to 68% lightness, placeholder opacity to 40%), added skip-to-content link, added `role="status"` to all loading states, linked form errors via `aria-describedby`/`aria-invalid`, standardized `focus-visible` rings across all interactive elements. Design: added `line-height: 1.6` to body, slowed neon-pulse animation to 6s.
- **Files Changed:**
  - `components/features/MediaForm.jsx` — New shared form component.
  - `components/features/ConfirmDialog.jsx` — New delete confirmation dialog.
  - `hooks/useFocusTrap.js` — New reusable focus trap hook.
  - `hooks/useRecoveryTokens.js` — Extracted from App.jsx.
  - `components/features/AddMediaDialog.jsx` — Refactored to use MediaForm, focus trap, a11y fixes.
  - `components/features/EditMediaDialog.jsx` — Refactored to use MediaForm, focus trap, a11y fixes.
  - `components/features/MediaDetailModal.jsx` — Removed sanitize(), added focus trap, confirm dialog, centralized icons, a11y focus rings.
  - `components/features/CyberCard.jsx` — Memoized, confirm dialog, centralized icons, focus rings.
  - `components/features/KanbanBoard.jsx` — Memoized.
  - `components/features/MediaVault.jsx` — Memoized, confirm dialog, centralized icons, edit button, focus rings.
  - `components/features/ChatLayout.jsx` — Fixed session variable shadowing.
  - `components/features/ChatSidebar.jsx` — Derived categories from mediaConfig.
  - `components/features/ChatWindow.jsx` — Loading state `role="status"`, focus rings.
  - `components/features/AuthPanel.jsx` — Replaced reload() with signIn(), a11y error linking, focus rings.
  - `components/layout/Navbar.jsx` — Focus rings.
  - `App.jsx` — Lazy-load modals/chat, useCallback handlers, skip link, loading announcements, extracted hook, centralized icons.
  - `lib/mediaConfig.js` — Added TYPE_ICONS export, removed dead icon strings.
  - `lib/realtimeClient.js` — Added env var validation.
  - `lib/queryClient.js` — Added global staleTime/gcTime defaults.
  - `hooks/useMedia.js` — Added update/delete pending to loading state.
  - `index.css` — Fixed muted-foreground contrast, body line-height, neon-pulse timing.
  - Deleted: `hooks/useBooks.js`, `components/layout/BentoGrid.jsx`, `assets/react.svg`, `assets/vite.svg`.
- **Verification:** `npm run lint` 0 errors (1 pre-existing warning), `npm run test -- --run` 21/21 pass, `npm run build` clean.
- **Follow-ups:** Consider adding `prefers-contrast: more` media query. Audit hero.png compression (44KB, could convert to WebP). Add skeleton loaders for data loading states.

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
- **Summary:** Applied all three bug-fix changes using the Supabase CLI. `supabase start` picked up the updated `config.toml`. `supabase db reset` applied 4 migrations and seeded `raoof.r12@gmail.com`. Added `.env.local` overlay support to `backend/config.py`; created `backend/.env.local` with local stack credentials.
- **Files Changed:** `backend/config.py`, `backend/.env.local` (new, gitignored).
- **Verification:** DB reset succeeded, both `auth.users` + `auth.identities` rows confirmed, ruff clean, pytest 34/34 pass.
- **Follow-ups:** Regenerate `.env.local` after stack restarts if JWT secret rotates. Create prod user via Supabase Auth dashboard only.

### 2026-03-20 (Australia/Sydney)

**Raouf:**

- **Scope:** Three Critical Bug Fixes — Recovery Redirect, Dev Seed, Realtime Race Condition
- **Summary:** Fixed password recovery redirect (added `/reset-password` to Supabase allow-list and corrected `PASSWORD_RESET_REDIRECT_URL`). Created `supabase/seed.sql` for dev user; `AuthContext.jsx` was already clean (uses `/auth/login`). Fixed Realtime/optimistic-UI race in `useMedia.js` by replacing `JSON.stringify` dedup with `existing.status === newItem.status`.
- **Files Changed:** `supabase/config.toml`, `backend/.env`, `supabase/seed.sql` (new), `frontend/src/hooks/useMedia.js`.
- **Verification:** `ruff check` clean, `pytest` 34/34 pass, `npm run lint` 0 errors, `npm run test` 21/21 pass, `npm run build` clean.
- **Follow-ups:** Activate seed with `supabase db reset` locally. Create prod account via Supabase Auth dashboard — do not run seed.sql against production.

### 2026-03-17 (Australia/Sydney)

**Raouf:**

- **Scope:** Shared AI Usage Rate Limiting
- **Summary:** Added a dedicated per-user AI quota for Gemini-backed features so chat generation and media recommendations now share one server-side rate-limit budget instead of allowing endpoint-by-endpoint bypass. Wired the new settings into backend config, applied the limiter to both AI entry points, documented the environment knobs, and added regression coverage for the shared-budget behavior.
- **Files Changed:**
  - `backend/config.py` — Added typed AI rate-limit settings.
  - `backend/rate_limit.py` — Added shared AI limiter wiring and a test reset helper.
  - `backend/controllers.py`, `backend/chat_controller.py` — Applied the shared AI quota to recommendation and chat routes.
  - `tests/test_rate_limit.py`, `tests/test_config.py` — Added coverage for shared AI budget enforcement and config parsing.
  - `backend/.env.example`, `README.md`, `docs/api-reference.md` — Documented the new AI rate-limit controls.
- **Verification:** `python3 -m pytest tests/test_rate_limit.py tests/test_config.py` passed (4/4), `python3 -m ruff check backend tests` clean.
- **Follow-ups:** Remove or formally deprecate the older suggest-specific rate-limit settings if you want configuration surface area reduced further.

### 2026-03-15 (Australia/Sydney)

**Raouf:**

- **Scope:** Responsive Dashboard + Deep Dive Detail Modal
- **Summary:** Refactored the media dashboard for full mobile-first responsiveness with smooth momentum scrolling. Added a "Deep Dive" detail modal using Framer Motion `layoutId` for shared element transitions — clicking any CyberCard expands it into a centered modal with backdrop blur showing all fields (title, creator, genre, rating, status, sub_info, takeaway). Implemented Esc key close, XSS-safe string rendering via `textContent` sanitization, and cyberpunk neon scrollbar styling. Fixed layout from `overflow-hidden` to proper flex scroll container so the Kanban is fully scrollable without breaking the sticky navbar/tabs.
- **Files Changed:**
  - `frontend/src/components/features/MediaDetailModal.jsx` — New shared-element detail modal with AnimatePresence, star ratings, metadata grid, action buttons.
  - `frontend/src/components/features/CyberCard.jsx` — Added `layoutId`, `onClick` → `onSelect`, responsive padding/text sizes.
  - `frontend/src/components/features/KanbanBoard.jsx` — Responsive grid, scrollable columns with max-height, passes `onSelect`.
  - `frontend/src/App.jsx` — `selectedItem` state, `LayoutGroup` wrapper, sticky tabs, flex scroll layout, removed BentoGrid wrapper.
  - `frontend/src/index.css` — Custom cyberpunk scrollbar styles with webkit + Firefox support.
  - `frontend/src/App.test.jsx` — Updated for new component structure.
- **Verification:** `npm run lint` clean, `npm run test` 4/4 pass, `npm run build` clean.
- **Follow-ups:** None.

### 2026-03-16 (Australia/Sydney)

**Raouf:**

- **Scope:** Security Audit Remediation — Auth Trust Boundaries, Chat Isolation, Recovery Token Hygiene
- **Summary:** Closed the confirmed and likely security findings from the repository-wide audit. Auth throttling no longer trusts spoofed `X-Forwarded-For` unless the immediate peer is explicitly configured in `TRUSTED_PROXY_IPS`. Chat queries are now user-scoped and the frontend clears React Query state on auth transitions to prevent cross-account cache disclosure. Recovery tokens are scrubbed from the URL before frontend telemetry bootstraps, Sentry now redacts token-bearing URLs, and the password-reset bootstrap was made StrictMode-safe. Chat history sent to Gemini is reduced to a recent window, prompt-injection markers and obvious PII are masked, and chat content is encrypted at rest when `TAKEAWAY_ENCRYPTION_KEY` is configured. Removed the unused required `SUPABASE_KEY`, hardened checked-in Supabase local auth defaults, codified frontend security headers in `vercel.json`, and synchronized stale docs/examples with `/media` routes and the current media model.
- **Files Changed:**
  - `backend/auth_controller.py`, `backend/config.py` — Trusted-proxy-aware auth rate-limit identity and config cleanup.
  - `backend/chat_controller.py`, `backend/data_protection.py` — Chat sanitization, history minimization, optional at-rest protection, decrypted reads.
  - `frontend/src/context/AuthContext.jsx`, `frontend/src/hooks/useChat.js`, `frontend/src/components/features/ChatLayout.jsx`, `frontend/src/components/features/ChatWindow.jsx` — User-scoped chat caching and logout cache invalidation.
  - `frontend/src/lib/recoveryTokens.js`, `frontend/src/App.jsx`, `frontend/src/main.jsx`, `frontend/src/observability/sentry.js` — Recovery-token URL scrubbing, StrictMode-safe bootstrap, and Sentry redaction.
  - `frontend/src/components/features/AuthPanel.jsx`, `frontend/src/hooks/useMedia.js`, `frontend/src/hooks/useBooks.js` — Test warning cleanup and stale hook alignment.
  - `frontend/index.html`, `vercel.json`, `supabase/config.toml` — Frontend security headers and stronger local auth defaults.
  - `backend/.env.example`, `.github/workflows/ci.yml`, `README.md`, `SECURITY.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/operations.md`, `docs/usage-examples.md`, `loadtests/locustfile.py`, `pyproject.toml` — Secret/config cleanup and route/documentation alignment.
  - `tests/test_auth_controller.py`, `tests/test_config.py`, `tests/test_data_protection.py`, `frontend/src/lib/recoveryTokens.test.js` — Coverage for the new security controls.
- **Verification:** `python3 -m ruff check backend tests loadtests` clean, `python3 -m ruff format --check backend tests loadtests` clean, `python3 -m pytest` 33/33 pass, `python3 -m bandit -r backend -c bandit.yaml` 0 issues, `cd frontend && npm run lint` clean, `cd frontend && npm run test` 6/6 pass, `cd frontend && npm run build` clean.
- **Follow-ups:** Set `TRUSTED_PROXY_IPS` to the real reverse-proxy tier in deployed environments and verify live Vercel/Sentry settings match the repo-controlled header and redaction policy.

### 2026-03-15 (Australia/Sydney)

**Raouf:**

- **Scope:** Unified Media Model — Books, Movies, Anime
- **Summary:** Expanded from books-only to a unified media engine. Created Postgres ENUM `media_type`, renamed `books` → `media`, added `creator`/`sub_info` columns, migrated `author` data, recreated RLS policy, added composite index. Refactored backend to `MediaController` at `/media` with `?type=` filtering. Frontend now has media-type tabs (Books/Movies/Anime) with per-type status columns, dynamic icons, and type-aware AddMediaDialog. Fixed ES256 JWT support via JWKS client, switched to direct PostgREST client to bypass supabase-py v2.28 `ClientOptions` bug.
- **Files Changed:**
  - `supabase/migrations/20260315070031_unified_media_model.sql` — Migration: ENUM, rename, columns, RLS, index.
  - `database.sql` — Updated canonical schema.
  - `backend/app.py` — `BookController` → `MediaController`.
  - `backend/controllers.py` — Rewritten as `MediaController` with type filtering.
  - `backend/schemas.py` — `BookCreate`/`BookUpdate` → `MediaCreate`/`MediaUpdate` with `type`, `creator`, `sub_info`.
  - `backend/services.py` — PostgREST direct client, removed `ClientOptions` dependency.
  - `backend/auth.py` — Added ES256 JWKS support alongside HS256.
  - `frontend/src/App.jsx` — Media type tabs, `useMedia` hook, `AddMediaDialog`.
  - `frontend/src/hooks/useMedia.js` — New type-filtered media hook.
  - `frontend/src/lib/mediaConfig.js` — New media type configuration constants.
  - `frontend/src/components/features/AddBookDialog.jsx` — Rewritten as `AddMediaDialog`.
  - `frontend/src/components/features/CyberCard.jsx` — Type-aware icons and `creator` field.
  - `frontend/src/components/features/KanbanBoard.jsx` — Dynamic status columns per type.
  - `frontend/src/hooks/useSuggest.js` — Updated to `/media/suggest`.
  - `frontend/src/App.test.jsx` — Updated for media model.
  - `tests/test_controllers.py` — Updated for `/media` endpoints.
  - `tests/test_schemas.py` — Tests for book, movie, anime validation.
- **Verification:** `ruff check` clean, `pytest` 25/25 pass, `npm run lint` clean, `npm run test` 4/4 pass, `npm run build` clean. Migration applied to live Supabase.
- **Follow-ups:** None.

### 2026-03-15 (Australia/Sydney)

**Raouf:**

- **Scope:** Integration Audit — Recovery Token Fix and Env Alignment
- **Summary:** Full repo-wide integration audit traced every flow end-to-end and found three issues. Fixed the critical password reset bug where only the access_token was extracted from the Supabase recovery URL while the refresh_token was ignored, causing `set_session` to fail. Added `refresh_token` to the frontend extraction, the backend schema, and the reset endpoint. Added missing `PASSWORD_RESET_REDIRECT_URL` to the env template. Fixed stale pyproject.toml description.
- **Files Changed:**
  - `frontend/src/App.jsx` — Extract both `access_token` and `refresh_token` from recovery URL hash/params.
  - `frontend/src/components/features/ResetPasswordPage.jsx` — Send `refresh_token` to backend reset endpoint.
  - `backend/schemas.py` — Added `refresh_token` field to `ResetPasswordRequest`.
  - `backend/auth_controller.py` — Use correct `refresh_token` in `set_session` call.
  - `backend/.env.example` — Added `PASSWORD_RESET_REDIRECT_URL` template entry.
  - `pyproject.toml` — Fixed description to books-only.
- **Verification:** `ruff check` clean, `ruff format --check` clean, `pytest` 24/24 pass, `npm run lint` clean, `npm run test` 4/4 pass, `npm run build` clean.
- **Follow-ups:** None — all integration paths verified end-to-end.

### 2026-03-15 (Australia/Sydney)

**Raouf:**

- **Scope:** Auth Sliding Panels — Register, Forgot Password, Reset Password
- **Summary:** Added registration, forgot password, and password reset flows with direction-aware sliding panel transitions. Backend endpoints proxy Supabase auth operations through rate-limited, cookie-backed controllers. Frontend uses a three-panel CSS `translateX` slider with persistent form state across slides. Password reset detects recovery tokens from both URL hash and search params, with an expired-session fallback. Always-success response on forgot-password to prevent email enumeration. Post-reset flow logs in the user with fresh session cookies.
- **Files Changed:**
  - `backend/auth_controller.py` — Added `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` endpoints.
  - `backend/schemas.py` — Added `RegisterRequest`, `ForgotPasswordRequest`, `ResetPasswordRequest` schemas.
  - `backend/config.py` — Added `password_reset_redirect_url` setting.
  - `frontend/src/components/features/AuthPanel.jsx` — New sliding panel container with login, register, and forgot forms.
  - `frontend/src/components/features/ResetPasswordPage.jsx` — New standalone reset password view with expired-token handling.
  - `frontend/src/App.jsx` — Replaced inline login form with AuthPanel, added recovery token detection from hash/params.
  - `frontend/src/App.test.jsx` — Updated test assertions for new AuthPanel structure.
  - `docs/plans/2026-03-15-auth-sliding-panels-design.md` — Design document.
  - `backend/.env` — Added `PASSWORD_RESET_REDIRECT_URL`.
- **Verification:** `ruff check` clean, `ruff format --check` clean, `pytest` 24/24 pass, `npm run lint` clean, `npm run test` 4/4 pass, `npm run build` clean.
- **Follow-ups:** Configure `PASSWORD_RESET_REDIRECT_URL` for production domain. Consider email confirmation requirement toggle.

### 2026-03-15 (Australia/Sydney)

**Raouf:**

- **Scope:** Production-Readiness Audit Fix — All 17 Findings Resolved
- **Summary:** Resolved every finding from the Staff Principal audit across all five domains (Architecture, Performance, Security, UI/UX, DevOps). Fixed the Redis rate limiter race condition with an atomic Lua script, completed the CRUD loop with PUT/DELETE book endpoints and a full Add Book UI with status advancement and deletion on CyberCard, replaced the development server with production uvicorn in the Dockerfile with HEALTHCHECK, made AUDIT_LOG_SALT a required env var to prevent silent correlation breakage, aligned LLM few-shot examples with actual JSON serialization format, removed dead admin client code, added AbortController request timeouts to the frontend API client, added Redis to docker-compose, extracted a dedicated useSuggest hook to eliminate unnecessary books query in the AI palette, fixed the stale meta description to books-only, reduced initial auth load requests for logged-out visitors, documented CSP unsafe-inline rationale, documented threading.Lock choice in rate limiter, added controller integration tests with mocked Supabase, and expanded frontend tests to cover authenticated, loading, and error states.
- **Files Changed:**
  - `backend/rate_limit.py` — Atomic Lua script for Redis rate limiter; documented threading.Lock rationale in in-memory limiter.
  - `backend/controllers.py` — Added PUT `/{book_id}` and DELETE `/{book_id}` endpoints with audit logging.
  - `backend/schemas.py` — Added `BookUpdate` partial-update schema with full validation.
  - `backend/config.py` — Made `AUDIT_LOG_SALT` a required env var; removed `secrets.token_urlsafe` import.
  - `backend/services.py` — Aligned few-shot examples to JSON-in-XML format; removed unused `get_supabase_admin_client`.
  - `backend/security.py` — Documented CSP `unsafe-inline` rationale for Swagger UI routes.
  - `backend/Dockerfile` — Replaced `litestar run` with `uvicorn` (4 workers); added HEALTHCHECK instruction.
  - `docker-compose.yml` — Added Redis service with `depends_on` for backend.
  - `frontend/src/lib/apiClient.js` — Added AbortController with 30s timeout and user-friendly timeout error.
  - `frontend/src/context/AuthContext.jsx` — Reduced initial auth requests from 3 to at most 2 for logged-out visitors.
  - `frontend/src/hooks/useSuggest.js` — New dedicated suggestion-only hook extracted from useBooks.
  - `frontend/src/hooks/useBooks.js` — Added `updateBook` and `deleteBook` mutations with optimistic updates.
  - `frontend/src/components/features/AICmdPalette.jsx` — Switched from useBooks to useSuggest to avoid unnecessary books query.
  - `frontend/src/components/features/AddBookDialog.jsx` — New cyberpunk-styled book creation dialog wired to addBook mutation.
  - `frontend/src/components/features/CyberCard.jsx` — Added status advancement button and delete button on hover.
  - `frontend/src/components/features/KanbanBoard.jsx` — Passed onUpdateBook and onDeleteBook props to CyberCard.
  - `frontend/src/App.jsx` — Wired AddBookDialog, updateBook, and deleteBook into authenticated view.
  - `frontend/src/App.test.jsx` — Added tests for loading state, authenticated Kanban render, and error state display.
  - `frontend/index.html` — Fixed meta description from "anime, movies, and books" to books-only.
  - `tests/test_controllers.py` — New controller integration tests: healthz, auth rejection, CRUD with mocked Supabase, error propagation.
- **Verification:** Ran `python3 -m ruff check backend tests loadtests`, `python3 -m ruff format --check backend tests loadtests`, `python3 -m pytest` (24/24 pass), `python3 -m bandit -r backend -c bandit.yaml` (0 issues), `python3 -c "import backend.app"`, `npm run lint`, `npm run test` (4/4 pass), and `npm run build` (clean, all chunks under 500 kB).
- **Follow-ups:** Validate `terraform plan` against live provider credentials and verify Redis-backed rate limiting plus container runtime behavior in deployed infrastructure.

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
