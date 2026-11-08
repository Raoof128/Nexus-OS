# Final quality audit — Nexus OS

Date: 2026-11-08 · Branch: `claude/funny-hamilton-kasc78` · Audit base: `c4c5434` · Head: see
`git log` (30 commits for this audit, 185 files, +10,872 / −1,955 lines).

Companion report: [`final-visual-parity.md`](final-visual-parity.md) (7.css parity and visual
regression). Earlier reports (`win7-*.md`) are history; every number here was re-measured on the
final branch.

## Release assessment

**CONDITIONAL PASS.**

All mandatory automated gates pass on the final branch, no known critical or high defect remains in
the code, both independent adversarial reviews' high findings were fixed and re-verified, and every
item previously deferred inside the repository has since been fixed (section 3). It stays conditional
only on three operator actions that cannot be done from the repository: the Playwright CI job has not
yet run on a real GitHub runner; production must choose one of the two documented client-IP setups
(SEC-02, `operations.md`); and Sentry events from before `9c38bcd` should be purged (section 7). The
owner confirmed rights to the photo wallpapers W1–W8.

## 1. How the audit ran

| Phase           | What happened                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline        | Fresh runs of every gate on `c4c5434` (section 4, "before"). `test:visual` pointed at a missing file; CI never ran Playwright.                                                                                            |
| Wave A — audit  | 8 read-only Claude Haiku 5.5 agents in parallel: architecture/tests/docs, security (whole codebase), shell, apps ×2, accessibility (axe on 13 screens × 8 viewports), performance (measured), 7.css parity.               |
| Verification    | Opus verified every high finding itself; an adversarial Haiku reviewer re-checked 38 medium+ findings (34 confirmed, 4 already fixed, 7 duplicate pairs merged).                                                          |
| Wave B — fix    | Opus fixed shared/security-critical code (Sentry, dialogs, CSS parity, privacy, docs). 10 Haiku agents fixed the rest with exclusive file ownership; Opus reviewed each diff and screenshot, re-ran tests, and committed. |
| Wave C — review | Two fresh adversarial reviews (frontend; backend + security) of the whole diff; every confirmed issue was fixed or explicitly accepted; full gates re-run.                                                                |

Opus rejected or corrected agent work several times, for example: a cyberpunk "glow" that was actually
7.css's own title halo; a menu-gutter regression in File Manager behind an agent screenshot that did not
show the menu; a privacy e2e test that still passed with the fix removed (mutation check); and a seed
guard test that matched a comment instead of code.

## 2. Findings

| Source                     | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| Architecture, tests, docs  | 0        | 3    | 10     | 29  |
| Security                   | 0        | 2    | 3      | 15  |
| Shell                      | 0        | 0    | 3      | 15  |
| Library, Email, Chat, Auth | 0        | 2    | 18     | 17  |
| System apps, Tasks, Notes  | 0        | 3    | 9      | 14  |
| Accessibility              | 0        | 1    | 4      | 8   |
| Performance                | 0        | 1    | 4      | 8   |
| 7.css parity               | 0        | 0    | 0      | 5   |
| Wave C adversarial reviews | 0        | 1    | 4      | 16  |

Counts are as reported before de-duplication (several issues were found by two agents independently,
e.g. cross-account data, Ctrl+K double palette, notification persistence). Severity follows user impact,
not tool labels.

### Critical and high, with outcome

| ID               | Issue                                                                                       | Root cause                                                             | Outcome                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ARCH-02 / SEC-08 | A second account on the same browser saw the first account's files and notes                | Browser-local data had no owner; sign-out only cleared the query cache | Fixed `98a295e`, hardened `14b7229`                                                                                               |
| Review FE-1      | A stale tab of the old account wrote its file tree back after another tab switched accounts | Ownership checked only on mount; writers never re-checked              | Fixed `14b7229`: writers refuse, stale tab reloads; two-tab e2e, mutation-checked (fails with guards off; each layer holds alone) |
| SEC-01           | Password-reset recovery tokens could reach Sentry                                           | `_scrub_event` never scrubbed request headers                          | Fixed `9c38bcd`; probe shows `[Filtered]`                                                                                         |
| SEC-02           | Forged `X-Forwarded-For` can reset the auth rate-limit identity                             | Leftmost-hop trust; depends on proxy appending                         | Fixed in code `cf54124` as opt-in `CLIENT_IP_STRATEGY=rightmost` (default unchanged); **ops** must pick a documented setup        |
| ARCH-01          | Text shared to Nexus (PWA share target) was dropped                                         | `consumeShareTarget()` called without `createNote`                     | Fixed `a8016ee`; e2e                                                                                                              |
| APP2-01          | Task edits looked unsaved until remount                                                     | Drag state copied the task objects                                     | Fixed `7c08f28`                                                                                                                   |
| APP2-02          | Closing a Notes window made its note unreachable                                            | Notes keyed by random window id                                        | Fixed `a8016ee` (note-document model, migration)                                                                                  |
| APP2-03          | Deleting a task list (and all its tasks) had no confirmation                                | —                                                                      | Fixed `7c08f28`                                                                                                                   |
| APP1-01          | One failed save blanked the whole Library board                                             | `useMedia.error` merged mutation errors                                | Fixed `7c0fe7d`                                                                                                                   |
| APP1-02          | Email search never worked                                                                   | Destructured a function the hook never returned; error swallowed       | Fixed `3405b48`                                                                                                                   |
| A11Y-01          | Ctrl+K opened two palettes; Escape left an overlay blocking the desktop                     | Two global handlers                                                    | Fixed `7c0fe7d` (Ask AI → Alt+A)                                                                                                  |
| TEST-01          | CI never ran Playwright                                                                     | —                                                                      | Fixed `bc584d0` (job added; not yet run on GitHub)                                                                                |
| PERF-01          | Full Supabase client in the eager bundle for features no longer used                        | Static import of `realtimeClient`                                      | Fixed `bd44290`: main chunk 143.4 → 98.0 kB gzip (99.9 kB after the desktop reminder service)                                     |

### Selected medium fixes

Destructive confirms default to Cancel, plus Escape and backdrop bugs in the shared dialog (`1d66499`) ·
transient refresh failures no longer sign users out (`bd44290`), and a boot-time blip shows "can't reach
the server" instead of the sign-in form (`dce6449`) · per-account login budget, per-user email send budget,
safer dev seed guard, no token in login bodies, no access log of OAuth codes (`be0af18`, `bf9f0bf`) ·
Email reader race and stale body, Compose validation and mid-send close (`3405b48`) · Chat errors, focus
and double mount (`b1e271e`) · Aion keeps its chat across views (`e95f2b6`) · Snap preview z-order,
windows kept on screen, drag p95 116.6 → 33.4 ms (`6f80bad`) · System Monitor honest labels and tabs at
360 px, real factory reset (`e95f2b6`) · logon/lock contrast ≥ 4.95:1 on all wallpapers (`bd44290`) ·
touch targets (`05323f0`, `7c0fe7d`, `3405b48`, `6f80bad`) · `CLAUDE.md`/`AGENTS.md` described a
Realtime architecture that did not exist (`8ede8f7`).

## 3. Accepted, deferred and limitations

Items that were deferred in the first release assessment and have since been fixed:

| Item                                                             | Fix                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Per-account login budget counted successful sign-ins and unlocks | Counts only failed credential attempts; still refuses before Supabase once spent (`cf54124`)     |
| SEC-02 leftmost `X-Forwarded-For` trust                          | `CLIENT_IP_STRATEGY` (`leftmost` default, `rightmost` opt-in with a startup warning) (`cf54124`) |
| `Idempotency-Key` sent but not deduplicated                      | Server-side idempotency for send/reply/forward, Redis or per-process (`129a991`)                 |
| Task reminders only while Tasks was open (APP2-06)               | Desktop-wide reminder service for every list (`3a74095`)                                         |
| Tasks drag order not re-synced from another tab                  | Fixed (`3a74095`)                                                                                |
| Cascade permanently resized large windows                        | Cascade only repositions (`08d9d96`)                                                             |
| Caption buttons 24 px tall on touch tablets (#54)                | 44 × 44 on coarse pointers; mouse desktops pixel-identical (`08d9d96`)                           |
| 6 moderate dev-only npm advisories                               | Vitest 4.1.12; `npm audit` reports 0 for all dependencies (`d11a5a4`)                            |
| CI actions pinned by tag                                         | Every action SHA-pinned (`917e047`)                                                              |

Still accepted or out of reach:

| Item                                                                                          | Status               | Reason                                                                                                                         |
| --------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The account login budget can throttle a known account (and its lock-screen unlock) for 15 min | Accepted, documented | Standard per-account throttling; only failed guesses count                                                                     |
| Fine-pointer title bar renders 36 px while `--w7-titlebar-h` is 30 px                         | Accepted             | The token sets `min-height`; changing it would alter desktop pixels. Clamps keep 30 px of the bar above the taskbar, as before |
| Seed guard refuses Podman `10.88/16`; an empty hosted project at `172.16/12` would pass       | Accepted, documented | Never run the seed against hosted projects                                                                                     |
| Supabase recovery/Aion, Gemini, Gmail/Graph live services                                     | Not exercised live   | All e2e uses mocked APIs                                                                                                       |

## 4. Verification evidence (final branch)

| Check                                     | Before (`c4c5434`)               | Final                                                                                           |
| ----------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| ESLint                                    | pass                             | pass                                                                                            |
| Prettier                                  | pass                             | pass                                                                                            |
| Vitest                                    | 693 / 693                        | **885 / 885** on Vitest 4.1.12 (repeated runs; clean `npm ci` with npm 10 too)                  |
| Coverage (statements, lib + stores scope) | 78.2% (Vitest 3)                 | 91.2% on Vitest 3; **82.7% statements / 86.7% lines** on Vitest 4's stricter AST-based counting |
| `vite build`                              | pass                             | pass; main chunk 99.91 kB gzip (was 143.4)                                                      |
| Playwright functional (`test:e2e`)        | 39/39 incl. capture/parity specs | **32 / 32**, repeated runs (journeys, privacy incl. two-tab, PWA launch)                        |
| Visual regression (`test:visual`)         | did not exist                    | **18 / 18**, two consecutive runs                                                               |
| 7.css parity (`test:parity`)              | 58 / 64 identical                | **62 / 64** identical, two runs                                                                 |
| pytest                                    | 1066 passed, 1 skipped           | **1149 passed, 2 skipped** (the extra skip needs a live Redis)                                  |
| ruff check / format                       | pass                             | pass                                                                                            |
| Bandit                                    | 0 issues                         | 0 issues                                                                                        |
| pip-audit                                 | 0                                | 0                                                                                               |
| npm audit                                 | 0 production, 6 moderate dev     | **0** (all dependencies)                                                                        |

Playwright ran with a scratch config that only swaps the Chromium executable (this container ships a
different Chromium build than the pinned Playwright expects); the literal `npm run test:e2e` is what CI
runs.

Mutation checks (test fails with the fix removed, passes with it): ConfirmDialog stale-Escape guard,
privacy single-tab and two-tab e2e, Dockerfile `--no-access-log` guard, Tasks reorder (15 tests failed on
old code first), apiClient refresh handling (5 failed first), backend rate limits (11 failed first),
failure-only login budget (15 failed first).

Process note: the reminder-service commit `3a74095` was verified with the Tasks and Desktop suites only;
the next full run found 3 `App` tests failing (the test renders App without a React Query provider). It
was fixed in `08d9d96` before release; every later commit was gated on the full suite. One test failed
once in the first coverage run after the Vitest 4 swap and did not reproduce in four further runs.

Performance (headless, software rendering; compare runs, not absolutes): login → desktop median 327 ms;
no heap leak across 10 open/close cycles (+0.1 MB/cycle); drag p95 116.6 → 33.4 ms, layouts per drag
62–65 → 3–4; resize p95 unchanged (33.3 ms on the audit harness after the touch title-bar token
change, same as its baseline).

## 5. Accessibility

axe-core 4.10.2 ran on 13 screens at 8 viewports (360×640 to 2560×1440). Fixed: Ctrl+K stuck overlay,
inactive title contrast, logon/lock contrast, small targets on touch, System Monitor tab overflow, Aion
off-screen caption buttons at 768 px, Tasks overlay modal focus trap and Escape focus loss, File Manager
sort at narrow widths, announcements for Aion text size. Verified passing: no horizontal overflow at any
viewport, visible focus on all 50 desktop tab stops, focus traps in Add media / Compose / Lock / confirm
dialogs, reduced motion, 200 %-equivalent reflow. Not verified: real screen readers, real browser zoom.

## 6. Security

Re-verified after the fixes: no unsafe HTML paths (email HTML sanitised and sandboxed without
same-origin; Notes markdown allowlisted), JWT claims enforced, HttpOnly/SameSite cookies, explicit CORS
origins, service worker never caches `/api/*`, RLS forced on every table, credential headers scrubbed
from Sentry, no access token in response bodies, browser-local data scoped to one account across tabs.

## 7. Operator actions (outside the repository)

1. **Client IP:** log the forwarding headers nginx receives (steps in `operations.md`), then close the
   direct route to the API (preferred) or use `CLIENT_IP_STRATEGY=rightmost` with every proxy hop in
   `TRUSTED_PROXY_IPS`. Do not overwrite `X-Forwarded-For` with `$remote_addr`.
2. **Sentry:** purge events that predate `9c38bcd`.
3. **CI:** watch the first run of the new `e2e` job.

Resolved by the owner: the photo wallpapers W1–W8 are used with the owner's rights (recorded in
`CLAUDE.md`).
