# Notes App — Design Doc

**Date:** 2026-06-16
**Status:** Approved for planning
**Sibling app:** Tasks (`docs/superpowers/specs/2026-06-15-tasks-app-design.md`) — independent app, shared architecture patterns, no shared data.

A Google-Keep-style quick-capture notes app native to Nexus OS: fast capture, pin,
color/background, labels, archive, search, checklists. No Google API — all data in
Supabase behind per-user RLS; note title/body/checklist text are field-level encrypted.

---

## 1. Scope (locked)

**In scope (v1):** notes (title + body), 12 colors, 9 backgrounds, pin, archive,
labels (incl. inline `#` creation, 50-label cap), filtered search, multi-select bulk
actions, masonry + single-column list views, checklist (list-type) notes with item
actions, soft-delete (Trash) with lazy 7-day purge, time reminders (local delivery).

**Out of scope (v1):** Google Keep sync, collaboration/sharing, location reminders
(discontinued by Google in 2025), drawings/handwriting, audio, image attach + OCR,
per-note version history, Docs-style export, Takeout importer, cross-app linked-task
creation for reminders.

**Initial build = Core + parity fields + checklist notes.** Every parity column ships
in the schema from day one (`type`, `background`, `reminder_at`, `deleted_at`); list-type
notes are interactive in v1 (`note_items`). Single-level checklist sub-items
(`note_items.parent_id`) ship in the schema but the interactive UI for indenting is a
stretch goal, not a v1 guarantee.

### 1.1 Decisions resolved during brainstorming (2026-06-16)

1. **Build is decomposed by phase** (not one mega-plan): Phase 1 backend, Phase 2
   frontend core, Phase 3 search/reminders/polish. Each phase is its own
   implementation plan + PR, green on CI before the next.
2. **Trash purge is lazy** (no scheduler): `GET /api/notes` hard-deletes the caller's
   rows past `deleted_at + 7 days` in-scope before returning results. Mirrors the
   no-cron pattern used for Tasks reminders.
3. **Takeout importer deferred** — `/api/notes/import` is dropped from v1.
4. **Reminders are local-only in v1** — store `reminder_at`; deliver via
   `useNoteReminders` → `notificationStore`. The "creates a linked task in the Tasks
   app" behavior is a v2 cross-app integration.

---

## 2. Architecture fit

- **Controller / service split** → `notes_controller.py` (routing/DI) +
  `notes_service.py` (pure logic: position math, purge cutoff, label-cap check,
  content-length cap).
- **Async hygiene** → every synchronous Supabase `.execute()` wrapped in `run_blocking`.
- **RLS** → per-request PostgREST clients (`create_supabase_user_client`); every row
  filtered by `auth.uid() = user_id`.
- **Encryption** → note title + body + checklist text Fernet-encrypted via the central
  data-protection module using the **graceful** `protect_chat_content` pattern (plaintext
  fallback when `TAKEAWAY_ENCRYPTION_KEY` is unset, so local dev runs). The existing
  production startup guard (`config.py`) already refuses to boot if the key is missing
  when `environment != development` — no new guard needed.
- **Rate limiting** → reuse the sliding-window limiter; add
  `enforce_notes_rate_limit(user_id)` mirroring `enforce_tasks_rate_limit`.
- **Frontend** → self-contained `frontend/src/os/apps/Notes/`, registered once in
  `os/stores/appRegistry.js`, TanStack Query, neon-glow + glassmorphism.

---

## 3. Data model (Supabase)

Four tables. Table names are **un-namespaced** (`notes`, `note_labels`,
`note_label_links`, `note_items`) — verified no collision with existing tables
(`tasks` was the only collision and is unrelated to Notes). RLS uses
`FORCE ROW LEVEL SECURITY` + `FOR ALL USING/WITH CHECK` consistent with the Tasks
migration.

- `notes` — `id`, `user_id`, `title_encrypted`, `content_encrypted`, `type`
  (`text` | `list`), `color`, `background`, `pinned`, `archived`, `position`,
  `reminder_at`, `deleted_at`, `created_at`, `updated_at`.
- `note_labels` — `id`, `user_id`, `name`, `unique (user_id, name)`.
- `note_label_links` — join (`note_id`, `label_id`); no `user_id` — RLS via parent-note
  ownership.
- `note_items` — checklist items: `id`, `user_id`, `note_id`, `parent_id`,
  `text_encrypted`, `checked`, `position`, `updated_at`.

**Rules:**
- RLS on **all four** tables.
- `position` (double precision float) drives manual ordering. Pinned and unpinned notes
  keep **separate** orderings (ordering is computed client-side from the float per
  section; the backend just persists `position`).
- Structural fields (`type`, `color`, `background`, `pinned`, `archived`, `deleted_at`,
  `reminder_at`) stay plaintext so they're queryable/filterable server-side.
- Only free-text title/body/checklist text is encrypted → full-text search is
  client-side (§7).
- **Cross-tenant integrity:** `note_items` gets a composite same-owner FK
  `(user_id, note_id) → notes(user_id, id)` and `(user_id, parent_id) →
  note_items(user_id, id)`, which requires a `unique (user_id, id)` on each parent —
  the IDOR-hardening lesson carried over from Tasks.

See §6 for the exact SQL.

---

## 4. Backend API

All user-scoped, all DB calls via `run_blocking`, all mutations rate-limited. Mounts at
`/api/notes` (follows `EmailController` `/api/email` + the Cloudflare Worker `/api/*`
proxy).

| Method + path | Purpose |
| --- | --- |
| `GET /api/notes` | List notes (filters: `archived`, `trashed`, `label`, `type`). Runs lazy 7-day purge first. |
| `POST /api/notes` | Create note (title, body, type, color, background, labels). |
| `PATCH /api/notes/{id}` | Edit note / color / background / labels / reminder. |
| `POST /api/notes/{id}/pin` · `POST /api/notes/{id}/archive` | Toggle pin / archive. |
| `POST /api/notes/{id}/move` | Reorder (persists `position`). |
| `POST /api/notes/{id}/copy` | Duplicate a note ("Make a copy"), incl. its items + label links. |
| `DELETE /api/notes/{id}` | Soft-delete → sets `deleted_at` (moves to Trash). |
| `POST /api/notes/{id}/restore` | Restore a trashed note (clears `deleted_at`). |
| `GET /api/notes/{id}/items` · `POST /api/notes/{id}/items` | List / add checklist items. |
| `PATCH /api/notes/items/{itemId}` · `POST /api/notes/items/{itemId}/move` | Edit / check / reorder / indent an item. |
| `DELETE /api/notes/items/{itemId}` | Delete a checklist item. |
| `GET/POST /api/notes/labels` · `DELETE /api/notes/labels/{id}` | Label management (50-label cap + unique name). |

**Validation:** content length cap (~20,000 chars) enforced in `notes_service`;
label-cap (50) enforced on label create; `type` must be `text`|`list`; `color` /
`background` validated against the known palette names (§12.1).

**Lazy purge:** on `GET /api/notes`, before selecting, issue a scoped
`delete().eq(user_id).lt("deleted_at", now - 7d)`. Cheap, bounded, no scheduler.

---

## 5. Frontend — `frontend/src/os/apps/Notes/`

```
Notes/
├── NotesApp.jsx            # shell: search bar + label rail + view toggle + multi-select
├── views/
│   └── NotesGridView.jsx   # masonry grid; pinned section on top; list-toggle
├── components/
│   ├── NoteCard.jsx        # Keep-style card (memoized; comparator on displayed fields)
│   ├── NoteEditor.jsx      # title / rich-text body / color / background / labels / checklist
│   ├── ColorPicker.jsx     # 12 colors + 9 backgrounds
│   ├── LabelChips.jsx      # chips + inline `#` autocomplete/create
│   └── ChecklistEditor.jsx # interactive list-type items
├── lib/
│   ├── notesConfig.js      # COLORS, BACKGROUNDS (names → neon/glass CSS vars)
│   └── search.js           # client-side filter/search predicate (pure, tested)
└── hooks/
    ├── useNotes.js          # TanStack Query + optimistic mutations
    └── useNoteReminders.js  # client-side reminder scheduler → notificationStore
```

**UX:** masonry card grid with a pinned section on top; grid ↔ single-column list
toggle; color + background swatches; label chips; archive + Trash views; click a card
to expand into the editor; quick-add bar at top; list-type notes render interactive
checklists (checked items auto-sink, hide/show checkboxes, uncheck-all, delete-checked);
rich-text body (bold/italic/underline/headings) stored as markdown; multi-select for
bulk color/label/archive/pin/delete; inline `#hashtag` label creation with autocomplete;
filtered search (color, label, type, has-reminder). Optimistic create/edit with
invalidate-on-settle; no Realtime; `refetchOnWindowFocus`/`refetchOnReconnect` heal
multi-tab.

**Reminders:** time-based only. Store `reminder_at`; `useNoteReminders` delivers the
local notification via `notificationStore` (deduped via persisted last-fired timestamps,
computed in local tz). No server cron/push; no linked-task creation in v1.

**Keyboard shortcuts (app-scoped):** mirror Keep's web set — `j`/`k` next/previous
note, `Ctrl+o`/`Ctrl+p` next/previous list item, `Ctrl+Shift+o`/`Ctrl+Shift+p` move a
list item, `Ctrl+m` drawer, plus compose / search / archive / pin / select. Bound only
while the Notes window is focused (not in `useGlobalShortcuts`); cleaned up on unmount.

**Accessibility:** real focus rings (no bare `outline-none`), correct ARIA roles,
labeled icon buttons, arrow-key nav.

---

## 6. SQL (consolidated migration)

```sql
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title_encrypted text,
  content_encrypted text,
  type text not null default 'text' check (type in ('text','list')),
  color text not null default 'default',
  background text,
  pinned boolean not null default false,
  archived boolean not null default false,
  position double precision not null default 0,
  reminder_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)            -- enables composite same-owner FK from note_items
);
create table public.note_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unique (user_id, name)
);
create table public.note_label_links (
  note_id uuid not null references public.notes(id) on delete cascade,
  label_id uuid not null references public.note_labels(id) on delete cascade,
  primary key (note_id, label_id)
);
create table public.note_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null,
  parent_id uuid,
  text_encrypted text,
  checked boolean not null default false,
  position double precision not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, note_id) references public.notes(user_id, id) on delete cascade,
  foreign key (user_id, parent_id) references public.note_items(user_id, id) on delete cascade
);

-- indexes
create index notes_user_state_idx on public.notes (user_id, archived, deleted_at, position);
create index note_label_links_label_idx on public.note_label_links (label_id);
create index note_items_note_idx on public.note_items (note_id, position);

-- row level security (FORCE + FOR ALL, matching the Tasks migration)
alter table public.notes enable row level security;
alter table public.notes force row level security;
alter table public.note_labels enable row level security;
alter table public.note_labels force row level security;
alter table public.note_label_links enable row level security;
alter table public.note_label_links force row level security;
alter table public.note_items enable row level security;
alter table public.note_items force row level security;

create policy n_owner on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy nl_owner on public.note_labels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ni_owner on public.note_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- join table has no user_id: scope via parent-note ownership
create policy nll_owner on public.note_label_links
  for all
  using (exists (select 1 from public.notes n
                 where n.id = note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from public.notes n
                 where n.id = note_id and n.user_id = auth.uid()));
```

---

## 7. Search vs. encryption

Field-level encryption blocks server-side full-text search. **Decision: option (a)** —
client-side search over decrypted notes in memory (simplest for a personal dataset).
The title stays encrypted; search decrypts client-side; label/color/pin/archive/type
filters stay server-side. Plaintext-title (b) and blind-index/HMAC (c) are deferred.

---

## 8. Security checklist

- [ ] Per-user RLS (FORCE) on all four tables; join table scoped via parent-note
      ownership; per-request PostgREST clients.
- [ ] Composite same-owner FKs on `note_items` (anti-IDOR, the Tasks lesson).
- [ ] Title/body/checklist text Fernet-encrypted before persistence; decrypt
      server-side only via `hydrate_note_record`.
- [ ] Graceful encryption (`protect_chat_content` pattern); existing prod boot guard
      covers the missing-key case.
- [ ] All sync SDK calls wrapped in `run_blocking`.
- [ ] Mutations rate-limited via the sliding-window limiter.
- [ ] Content length + label-cap validation server-side.
- [ ] No secrets inline (`gitleaks` clean).

---

## 9. Build phases (→ implementation plans / PRs)

1. **Phase 1 — Backend:** migration (4 tables + RLS + composite FKs + indexes),
   `notes_service` (position, purge cutoff, caps), `notes_schemas`, `notes_controller`
   (all endpoints in §4), `data_protection` note helpers, rate-limit hook,
   `app.py` registration. Pytest for service + controller. **PR 1.**
2. **Phase 2 — Frontend core:** `appRegistry` entry, `useNotes`, masonry
   `NotesGridView`, `NoteCard`, `NoteEditor`, `ColorPicker`, `LabelChips`,
   `ChecklistEditor`, `notesConfig`. Pin/archive/Trash/restore, color/bg/labels,
   interactive checklists, multi-select. Vitest. **PR 2.**
3. **Phase 3 — Search + reminders + polish:** client-side `search.js`,
   `useNoteReminders` → `notificationStore`, app-scoped shortcuts, a11y pass,
   architecture-map doc update. Vitest. **PR 3.**

---

## 10. Quality gates

Mirror `scripts/check.sh` / CI: Ruff, ESLint, Pytest, Vitest, Bandit + pip-audit +
Gitleaks, production build. No new function ships without a test.

---

## 11. Feature parity with Google Keep

Covered in v1: text + checklist notes; 12 colors / 9 backgrounds; pin; 50-label cap +
multi-label + filter rail; archive; soft-delete Trash + 7-day lazy purge; time
reminders (local delivery); rich text (markdown); manual drag order + date sort;
client-side search; masonry ↔ list views; multi-select bulk actions; inline `#` labels;
checklist item actions (hide/show checkboxes, uncheck-all, delete-checked, reorder);
quick capture bar; "Make a copy"; ~20k char cap.

Deferred / out of v1: collaborators/sharing; drawing/audio; image attach + OCR; link
previews; version history; export-to-doc; AI list generation; Takeout import;
location reminders (discontinued by Google); reminder→Tasks linked-task creation.

### 11.1 Palette (match Keep names, map to neon/glass)

- **12 colors:** Default, Coral, Peach, Sand, Mint, Sage, Fog, Storm, Dusk, Blossom,
  Clay, Chalk.
- **9 backgrounds:** Groceries, Food, Music, Recipes, Notes, Places, Travel, Video,
  Celebration.

---

## 12. Implementation deviations (codebase fit)

Mirror the Tasks app's committed deviations so both apps share conventions:

1. **API mounts at `/api/notes`** — follows `EmailController`/`/api/*` proxy.
2. **Graceful encryption** — `protect_chat_content` pattern; existing prod boot guard.
3. **No Supabase Realtime** — optimistic + invalidate-on-settle;
   `refetchOnWindowFocus`/`refetchOnReconnect` heal multi-tab.
4. **Client-side reminders** — `useNoteReminders` drives `notificationStore`; deduped
   via persisted last-fired timestamps, local tz.
5. **App-scoped keyboard shortcuts** — bound only while the Notes window is focused.
6. **Lazy Trash purge** — purge-on-list, no scheduler dependency.
```
