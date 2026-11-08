# Final quality audit — Nexus OS

Date: 2026-11-08 · Branch: `claude/funny-hamilton-kasc78` · Audit base: `c4c5434` · Head: see
`git log` (22 commits for this audit, 171 files, +7,999 / −1,054 lines).

Companion report: [`final-visual-parity.md`](final-visual-parity.md) (7.css parity and visual
regression). Earlier reports (`win7-*.md`) are history; every number here was re-measured on the
final branch.

## Release assessment

**CONDITIONAL PASS.**

All mandatory automated gates pass on the final branch, no known critical or high defect remains in
the code, and both independent adversarial reviews' high findings were fixed and re-verified. It is
conditional because four things cannot be closed from inside the repository: the Playwright CI job has
not yet run on a real GitHub runner; reverse-proxy `X-Forwarded-For` handling (SEC-02) lives in
nginx/Cloudflare config outside the repo; old Sentry events may still hold password-reset headers; and
a decision is needed on four wallpapers that appear to be third-party game artwork (section 7).

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
| SEC-02           | Forged `X-Forwarded-For` can reset the auth rate-limit identity                             | Leftmost-hop trust; depends on proxy appending                         | **Open — ops** (nginx/Cloudflare, outside repo); documented in `operations.md`                                                    |
| ARCH-01          | Text shared to Nexus (PWA share target) was dropped                                         | `consumeShareTarget()` called without `createNote`                     | Fixed `a8016ee`; e2e                                                                                                              |
| APP2-01          | Task edits looked unsaved until remount                                                     | Drag state copied the task objects                                     | Fixed `7c08f28`                                                                                                                   |
| APP2-02          | Closing a Notes window made its note unreachable                                            | Notes keyed by random window id                                        | Fixed `a8016ee` (note-document model, migration)                                                                                  |
| APP2-03          | Deleting a task list (and all its tasks) had no confirmation                                | —                                                                      | Fixed `7c08f28`                                                                                                                   |
| APP1-01          | One failed save blanked the whole Library board                                             | `useMedia.error` merged mutation errors                                | Fixed `7c0fe7d`                                                                                                                   |
| APP1-02          | Email search never worked                                                                   | Destructured a function the hook never returned; error swallowed       | Fixed `3405b48`                                                                                                                   |
| A11Y-01          | Ctrl+K opened two palettes; Escape left an overlay blocking the desktop                     | Two global handlers                                                    | Fixed `7c0fe7d` (Ask AI → Alt+A)                                                                                                  |
| TEST-01          | CI never ran Playwright                                                                     | —                                                                      | Fixed `bc584d0` (job added; not yet run on GitHub)                                                                                |
| PERF-01          | Full Supabase client in the eager bundle for features no longer used                        | Static import of `realtimeClient`                                      | Fixed `bd44290`: main chunk 143.4 → 98.0 kB gzip                                                                                  |

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

| Item                                                                                                                                | Status               | Reason                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Per-account login budget can be used to throttle a known account (and its lock-screen unlock) for 15 min; successful sign-ins count | Accepted, documented | Standard per-account throttling. Counting only failures needs a non-recording "peek" in both the memory and Redis/Lua limiters |
| `/auth/refresh` per-IP ceiling becomes one shared bucket if `TRUSTED_PROXY_IPS` is unset                                            | Ops                  | Documented in the production checklist                                                                                         |
| `Idempotency-Key` is sent but not deduplicated server-side                                                                          | Open                 | Docs previously claimed it was; now corrected                                                                                  |
| Task reminders fire only while Tasks is open (APP2-06)                                                                              | Deferred             | Needs a shell-level reminder service                                                                                           |
| Seed guard refuses Podman `10.88/16`; an empty hosted project at `172.16/12` would pass                                             | Accepted, documented | Never run the seed against hosted projects                                                                                     |
| Cascade resizes windows larger than the work area; Tasks drag order is not re-synced from another tab                               | Low, deferred        | —                                                                                                                              |
| Caption buttons are 24 px tall on touch tablets (44 px wide)                                                                        | Partial (#54)        | 44 px tall needs a taller title bar                                                                                            |
| Supabase recovery/Aion, Gemini, Gmail/Graph, Realtime                                                                               | Not exercised live   | All e2e uses mocked APIs                                                                                                       |

## 4. Verification evidence (final branch)

| Check                                     | Before (`c4c5434`)               | Final                                                                             |
| ----------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| ESLint                                    | pass                             | pass                                                                              |
| Prettier                                  | pass                             | pass                                                                              |
| Vitest                                    | 693 / 693                        | **865 / 865** (3 consecutive runs)                                                |
| Coverage (statements, lib + stores scope) | 78.2%                            | **91.2%**                                                                         |
| `vite build`                              | pass                             | pass; main chunk 97.98 kB gzip (was 143.4)                                        |
| Playwright functional (`test:e2e`)        | 39/39 incl. capture/parity specs | **32 / 32**, two consecutive runs (journeys, privacy incl. two-tab, PWA launch)   |
| Visual regression (`test:visual`)         | did not exist                    | **18 / 18**, two consecutive runs                                                 |
| 7.css parity (`test:parity`)              | 58 / 64 identical                | **62 / 64** identical, two runs                                                   |
| pytest                                    | 1066 passed, 1 skipped           | **1080 passed, 1 skipped**                                                        |
| ruff check / format                       | pass                             | pass                                                                              |
| Bandit                                    | 0 issues                         | 0 issues                                                                          |
| pip-audit                                 | 0                                | 0                                                                                 |
| npm audit (production)                    | 0                                | 0 (6 moderate dev-only advisories in the vitest toolchain; fix requires vitest 4) |

Playwright ran with a scratch config that only swaps the Chromium executable (this container ships a
different Chromium build than the pinned Playwright expects); the literal `npm run test:e2e` is what CI
runs.

Mutation checks (test fails with the fix removed, passes with it): ConfirmDialog stale-Escape guard,
privacy single-tab and two-tab e2e, Dockerfile `--no-access-log` guard, Tasks reorder (15 tests failed on
old code first), apiClient refresh handling (5 failed first), backend rate limits (11 failed first).

Performance (headless, software rendering; compare runs, not absolutes): login → desktop median 327 ms;
no heap leak across 10 open/close cycles (+0.1 MB/cycle); drag p95 116.6 → 33.4 ms, layouts per drag
62–65 → 3–4; resize p95 unchanged at ~17 ms.

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

## 7. Decisions needed from the owner

1. **Wallpapers 2–5** in Settings appear to be third-party game artwork (a Cyberpunk 2077 logo; NieR:
   Automata characters). If so they conflict with the repository's "all artwork is original" rule and
   are served publicly. Keep (with rights) or remove.
2. **Proxy:** set nginx to overwrite `X-Forwarded-For`, set `TRUSTED_PROXY_IPS`, firewall the origin to
   Cloudflare.
3. **Sentry:** purge events that predate `9c38bcd`.
4. **CI:** watch the first run of the new `e2e` job; pin `actions/upload-artifact` to a SHA.
