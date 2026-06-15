# Tasks App — Design Doc

**Date:** 2026-06-15
**App id:** `tasks`
**Status:** Approved for planning

A native Nexus OS task manager in the spirit of **Google Tasks**: lists → tasks →
one level of subtasks, due dates/times, recurrence, completion, manual reorder,
per-task encrypted notes. No Google API — all data lives in Supabase behind
per-user RLS. This is a sibling to the Keep-style Notes app: shared architecture
patterns, no shared data.

---

## 1. Scope (locked)

**In scope (this build):**

- Multiple task lists (reorderable).
- Tasks with one level of subtasks (`parent_id`, single level enforced).
- Due **date** and optional due **time** (`due` date + `due_at` timestamptz + `all_day`).
- **Star** important tasks (`starred`) + star view.
- **Recurrence engine** (RRULE): Daily / Weekly / Monthly / Annually / Custom, with
  next-occurrence regeneration on completion. Recurring tasks are pinned to their
  list (cannot be moved between lists), matching Google.
- Completion + collapsible "Completed" section (`status`, `completed_at`).
- Manual drag reorder (`position` float) + client-side sort modes ("My order" / "Date").
- Per-task notes, Fernet-encrypted at rest.
- **Quick-add NL parsing** — parse phrases like "Pay rent tomorrow" into a due date on create.
- **Reminders via the notification center** — surface due tasks through the existing
  `notificationStore` (client-side scheduler; no server cron).
- Full keyboard shortcuts mirroring Google Tasks web (see §9).

**Out of scope (future):** Google sync, collaboration/sharing, Job Tracker link
(deferred), server-side push notifications.

---

## 2. Architecture fit (grounded in current codebase)

- **Controller / service split** — `tasks_controller.py` (routing/DI, auth, rate
  limiting) + `tasks_service.py` (pure logic: recurrence math, position math,
  encrypt/decrypt hydration). Mirrors the `email_controller.py` + `email_service.py` split.
- **API mount path** — `path = "/api/tasks"`, following the newest controller
  (`EmailController` mounts at `/api/email`) and the Cloudflare Worker `/api/*`
  proxy convention. (Older controllers use bare `/media`, `/chat`; we follow the
  newer precedent.) Frontend calls use `/api/tasks/...`.
- **Async hygiene** — every synchronous PostgREST `.execute()` is wrapped in
  `run_blocking(builder.execute)` (from `services.py`), exactly as in
  `email_controller.py`.
- **RLS** — per-request PostgREST client via `create_supabase_user_client(access_token)`;
  both tables `ENABLE` + `FORCE ROW LEVEL SECURITY` with a `FOR ALL USING
  (user_id = auth.uid())` policy, matching the email-inbox migration. Every query
  also `.eq("user_id", user_id)` defensively.
- **Auth** — `_require_auth(request) -> (user_id, access_token)` helper copied from
  the email controller pattern (reads HttpOnly access cookie + `request.state.user_id`).
- **Encryption** — task notes use a new `protect_task_notes` / `decrypt_takeaway`
  pair in `data_protection.py`, mirroring `protect_chat_content` /
  `hydrate_chat_message_record`: **graceful** — if `TAKEAWAY_ENCRYPTION_KEY` is
  unset, notes are stored as plaintext (so the app works without the optional key),
  and the `enc::` prefix drives decrypt-on-read. Only the free-text notes body is
  encrypted; structural fields stay plaintext so they remain queryable.
  **Production guard:** add a startup assertion in `config.py`/app boot — if
  `environment == "production"` and `TAKEAWAY_ENCRYPTION_KEY` is unset, **fail loud
  (refuse to boot)** rather than silently downgrading to plaintext. Keeps dev
  ergonomics without a prod footgun.
- **Rate limiting** — mutations call the existing sliding-window limiter
  (`rate_limit.py`). AI/quick-add parsing is local (no Gemini), so it does not need
  the AI limiter; standard mutation limiting applies.
- **Frontend** — self-contained `frontend/src/os/apps/Tasks/`, registered once in
  `os/stores/appRegistry.js` (`APP_REGISTRY` + `APP_ORDER`). TanStack Query with
  optimistic mutations + invalidate-on-settle (NOT Realtime — tasks don't need the
  cross-device live channel that media/email use; this keeps the dedup logic out).
  Multi-tab self-heal via `refetchOnWindowFocus: true` (and `refetchOnReconnect: true`)
  on the tasks queries, so a second tab refreshes on focus.
  Neon-glow + glassmorphism, one global focus ring, full a11y.

---

## 3. Data model (Supabase)

### `task_lists`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK `auth.users` ON DELETE CASCADE |
| `name` | text | not null |
| `position` | double precision | drag ordering, default 0 |
| `created_at` | timestamptz | default now() |

### `tasks`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK `auth.users` ON DELETE CASCADE |
| `list_id` | uuid | FK `task_lists` ON DELETE CASCADE |
| `parent_id` | uuid nullable | FK `tasks` ON DELETE CASCADE (subtasks; single level) |
| `title` | text | not null |
| `notes_encrypted` | text nullable | `enc::`-prefixed Fernet token, or plaintext if no key |
| `status` | text | `needsAction` \| `completed`, default `needsAction` |
| `due` | date nullable | date-only due |
| `due_at` | timestamptz nullable | optional due time (null ⇒ date-only) |
| `all_day` | boolean | default true |
| `starred` | boolean | default false |
| `recurrence` | text nullable | RRULE string; recurring tasks pinned to their list |
| `position` | double precision | drag ordering, default 0 |
| `completed_at` | timestamptz nullable | set when status → completed |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now(), bumped on edit |

**Rules:**
- RLS on both tables (`FORCE`); `FOR ALL USING (user_id = auth.uid())`.
- `position` (float) drives drag ordering — new items get `max(position)+1` (or
  midpoint between neighbours on reorder), avoiding full re-indexing.
- Single subtask level enforced server-side: a task whose `parent_id` is set may
  not itself be a parent (reject create/move that would nest deeper than one level).
- Structural fields (`status`, `due`, `due_at`, `starred`, `recurrence`) stay
  plaintext so they're queryable; only `notes_encrypted` is encrypted.

### Indexes
- `tasks (user_id, list_id, position)` — list rendering in order.
- `tasks (user_id, parent_id)` — subtask grouping.
- `tasks (user_id, starred) WHERE starred` — star view.
- `task_lists (user_id, position)` — list rail ordering.

---

## 4. Recurrence engine (`tasks_service.py`)

- `recurrence` stores a subset of RRULE (`FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`
  with optional `INTERVAL`, `BYDAY`, plus a "custom" passthrough).
- **Date math: `python-dateutil`** (`dateutil.rrule`) — decided, added as a backend
  dependency. Pure-Python, no native build, mature/audited → negligible
  Bandit/pip-audit/supply-chain surface, and it correctly handles the cases
  recurrence exists for: month-end clamping (Jan 31 → Feb 28/29 → Mar 31), BYDAY /
  nth-weekday ("3rd Tuesday", "every weekday"), and leap-year/DST boundaries. A
  hand-rolled stepper's test matrix would cost more than the dep.
- **Schedule-based regeneration (Google fidelity):** on **complete** of a recurring
  task, mark the current instance `completed` (`completed_at = now()`), then compute
  the next occurrence from the **scheduled** due date — `rrule.after(last_scheduled_due,
  inc=False)` — NOT from `completed_at`. Insert a fresh `needsAction` task in the same
  list with the same title/notes/recurrence and the next due date. The completed
  instance stays in the Completed section as history.
- **Timezone:** compute in the user's local tz (Australia/Sydney), store UTC.
  Localize the anchor before stepping the RRULE, then persist `due_at` in UTC so a
  9am task stays 9am across DST boundaries.
- Recurring tasks reject the `/move` re-list operation (HTTP 409) to match Google.
- A recurrence with no due-date anchor does not regenerate (needs a date to step from).
- Edge cases covered by tests: month-end rollover, interval > 1, weekly BYDAY,
  schedule-based (not completion-based) next-date, DST boundary, no-anchor no-regen.

---

## 5. Backend API (`/api/tasks`)

All endpoints user-scoped; all DB calls via `run_blocking`; all mutations rate-limited.

| Method + path | Purpose |
| --- | --- |
| `GET /api/tasks/lists` | List task lists (ordered by position) |
| `POST /api/tasks/lists` | Create a list |
| `PATCH /api/tasks/lists/{id}` | Rename / reorder a list |
| `DELETE /api/tasks/lists/{id}` | Delete a list (cascades tasks) |
| `GET /api/tasks/lists/{id}/items` | Tasks in a list (query `showCompleted` bool) |
| `POST /api/tasks/lists/{id}/items` | Create task (title, notes, due, due_at, parent, recurrence, starred) |
| `PATCH /api/tasks/items/{id}` | Edit / complete / reschedule / star (triggers recurrence regen on complete) |
| `POST /api/tasks/items/{id}/move` | Reorder / re-parent (subtask) / move to list (rejected for recurring) |
| `DELETE /api/tasks/items/{id}` | Delete task (cascades subtasks) |

Pydantic v2 request/response models added to a new `tasks_schemas.py`
(`ConfigDict(str_strip_whitespace=True)`), following `email_schemas.py`.

Registered in `backend/app.py` `route_handlers` list alongside the other controllers.

---

## 6. Frontend — `frontend/src/os/apps/Tasks/`

```
Tasks/
├── TasksApp.jsx              # shell: list rail + active list pane
├── views/
│   └── TaskListView.jsx      # task pane: header, sort toggle, rows, completed section
├── components/
│   ├── ListSidebar.jsx       # list rail (select/create/rename/reorder)
│   ├── TaskRow.jsx           # checkbox, title, due chip, star, subtask indent
│   ├── TaskEditor.jsx        # inline create/edit (title, notes, due, recurrence picker)
│   ├── RecurrencePicker.jsx  # Daily/Weekly/Monthly/Annually/Custom → RRULE
│   └── QuickAddBar.jsx       # NL quick-add ("Pay rent tomorrow")
└── hooks/
    ├── useTasks.js           # TanStack Query + optimistic mutations (lists + items)
    └── useTaskReminders.js   # client scheduler → notificationStore.addNotification
```

- **NL quick-add** — a small client-side parser (`lib/quickAddParse.js` or colocated)
  extracts relative dates ("today", "tomorrow", "next monday", "fri", "in 3 days")
  and a time ("5pm", "at 14:00") from the typed title, stripping the matched words
  from the saved title. Pure function, fully unit-tested. No server/AI dependency.
- **Reminders** — `useTaskReminders` runs while the Tasks app (or OS shell) is
  mounted: on an interval it finds tasks whose `due_at`/`due` is now-or-overdue and
  not yet notified, and calls `notificationStore.addNotification({ title, message,
  type })`.
  - **Dedup:** persist last-fired timestamps per task id in `localStorage` so a
    reminder doesn't re-fire on every mount/refresh within its window.
  - **Timezone:** compute fire times in the user's local tz (Australia/Sydney),
    not UTC, so reminders don't drift.
  - **Known limitation (accepted):** only fires while a tab is open — inherent to a
    client-side scheduler; server push is explicitly future. No backend cron.
- **UX** — left list rail; checkable rows; inline add; one-level indent for subtasks;
  due-date/time chip; star toggle; collapsible Completed section; drag to reorder;
  sort toggle (My order / Date). Optimistic check/create/star with invalidate-on-settle.
- **Design** — cyberpunk neon/glass per the global design system; uses shared
  `lib/motion.js` tokens and `import { motion as Motion }`. Built with the
  **frontend-design** skill for visual quality.

### Accessibility
Real focus rings (no bare `outline-none`; branded rings also set
`focus-visible:outline-none` per the global-ring rule), correct ARIA roles
(`list`/`listitem`, checkbox semantics), labeled icon-only buttons, arrow-key
navigation through rows, and the keyboard shortcuts in §9.

---

## 7. Proposed SQL (single migration)

```sql
BEGIN;

CREATE TABLE public.task_lists (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  list_id         UUID NOT NULL REFERENCES public.task_lists ON DELETE CASCADE,
  parent_id       UUID REFERENCES public.tasks ON DELETE CASCADE,
  title           TEXT NOT NULL,
  notes_encrypted TEXT,
  status          TEXT NOT NULL DEFAULT 'needsAction'
                    CHECK (status IN ('needsAction', 'completed')),
  due             DATE,
  due_at          TIMESTAMPTZ,
  all_day         BOOLEAN NOT NULL DEFAULT true,
  starred         BOOLEAN NOT NULL DEFAULT false,
  recurrence      TEXT,
  position        DOUBLE PRECISION NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own task lists"
  ON public.task_lists FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users manage own tasks"
  ON public.tasks FOR ALL USING (user_id = auth.uid());

CREATE INDEX task_lists_user_position_idx
  ON public.task_lists (user_id, position);
CREATE INDEX tasks_user_list_position_idx
  ON public.tasks (user_id, list_id, position);
CREATE INDEX tasks_user_parent_idx
  ON public.tasks (user_id, parent_id);
CREATE INDEX tasks_user_starred_idx
  ON public.tasks (user_id, starred) WHERE starred;

COMMIT;
```

---

## 8. Feature parity with Google Tasks

| Capability | Plan |
| --- | --- |
| Multiple lists | `task_lists.position` reorderable rail |
| Subtasks (1 level) | `parent_id`, single level enforced server-side |
| Due date | `due` |
| Due time | `due_at` + `all_day` |
| Recurrence | `recurrence` RRULE + regen engine (§4); recurring pinned to list |
| Star | `starred` + star view |
| Complete | `status` + `completed_at` + collapsible Completed |
| Sort | client-side "My order" / "Date" |
| Move to list | `/move` endpoint (rejected for recurring) |
| Details/notes | `notes_encrypted` |
| Quick-add NL | client parser (§6) |
| Reminders | notification center via `useTaskReminders` (§6) |

---

## 9. Keyboard shortcuts (mirror Google Tasks web)

| Action | Shortcut |
| --- | --- |
| Create a task | `Enter` |
| Mark complete / incomplete | `Space` |
| Indent (make subtask) | `Ctrl/⌘ + ]` |
| Remove indent | `Ctrl/⌘ + [` |
| Add sub-item | `Ctrl/⌘ + Alt/Opt + Return` |
| Star / unstar | `s` |
| Move up / down | `Ctrl/⌘ + ↑ / ↓` |
| Move to top / bottom | `Ctrl/⌘ + Shift + ↑ / ↓` |
| More actions / move to list | `.` or `v` |
| Finish editing | `Esc` or `Enter` |

Implemented locally within the Tasks app (scoped to the focused list pane), not in
the global `useGlobalShortcuts` hook, to avoid clashing with OS-level Alt shortcuts.
Listeners bind **only when the Tasks window is focused/active** and are removed on
unmount, so they never leak into other apps.

---

## 10. Security checklist

- [ ] Per-user RLS (`FORCE`) on both tables; per-request PostgREST client.
- [ ] Task notes Fernet-encrypted before persistence (graceful no-key fallback); decrypt server-side only.
- [ ] All sync SDK calls wrapped in `run_blocking`.
- [ ] Mutations rate-limited via the sliding-window limiter.
- [ ] Single-subtask-level + recurring-cannot-move enforced server-side (not just UI).
- [ ] No secrets inline (`gitleaks` clean).

---

## 11. Milestones

1. **M1 — Schema:** migration (tables + RLS + indexes); `data_protection` note helpers.
2. **M2 — Backend:** `tasks_schemas.py`, `tasks_service.py` (recurrence + position math),
   `tasks_controller.py`, app registration; Pytest (CRUD, RLS scoping via mocks,
   recurrence regen, single-level enforcement, recurring-move rejection).
3. **M3 — Frontend:** registry entry, `useTasks`, list rail, task rows, subtasks,
   due chips, recurrence picker, star, sort, drag reorder, quick-add parser,
   reminders hook; Vitest (parser, hooks, row interactions).
4. **M4 — Polish:** a11y pass, keyboard shortcuts, docs update (CLAUDE.md architecture map).

---

## 12. Quality gates (mirror `scripts/check.sh`)

Ruff, ESLint + Prettier, Pytest, Vitest, Bandit + pip-audit + Gitleaks, production
build. No new function ships without tests.

---

## 13. Resolved decisions

- **Scope:** Core + parity + recurrence engine (full Google Tasks parity).
- **Integrations:** Quick-add NL parsing ✅ + reminders via notification center ✅;
  Job Tracker link ❌ deferred.
- **Realtime:** not used for tasks (optimistic + invalidate-on-settle only).
- **API path:** `/api/tasks` (follows Email/worker `/api/*` precedent).
- **Notes encryption:** graceful (chat-style), works without the optional key.
- **Reminders:** client-side scheduler → existing `notificationStore`; no server cron.
- **Recurrence date math:** `python-dateutil` (added dep), schedule-based regen.

---

## 14. Implementation deviations from the original brief (approved)

Each deviation is a fit to the live codebase, confirmed before planning, with the
guardrail that was attached on approval.

| # | Deviation | Guardrail |
| --- | --- | --- |
| 1 | API mounts at `/api/tasks` (not `/tasks`) — follows newest controller + Worker `/api/*` | none needed |
| 2 | Graceful notes encryption (mirror `protect_chat_content`), plaintext fallback w/o key | **prod startup assertion**: fail to boot if `environment == production` and key unset |
| 3 | No Supabase Realtime for tasks (optimistic + invalidate-on-settle) | `refetchOnWindowFocus` + `refetchOnReconnect` so a 2nd tab self-heals |
| 4 | Client-side reminders via `useTaskReminders` → `notificationStore` | `localStorage` last-fired dedup; local tz (Australia/Sydney); tab-open-only is accepted |
| 5 | App-scoped keyboard shortcuts (not `useGlobalShortcuts`) | bind only when Tasks window focused; remove on unmount |
| 6 | `python-dateutil` for recurrence (not hand-rolled) | schedule-based regen via `rrule.after(last_scheduled_due, inc=False)`; compute local tz, store UTC |
