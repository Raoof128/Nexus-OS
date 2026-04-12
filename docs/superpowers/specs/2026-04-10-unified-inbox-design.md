# Unified Inbox — Design Spec

**Date:** 2026-04-10
**Status:** Draft
**Scope:** Add a full email client to Nexus Archive as a new top-level tab, supporting Google (Gmail) and Microsoft (Outlook) with multiple accounts per provider.

---

## 1. Requirements

### Functional
- **Providers:** Gmail and Microsoft Outlook, multiple accounts per provider
- **Features:** Full client — read, reply, compose, search, labels/folders, drafts, delete, archive
- **Layout:** Three-column (folder sidebar | email list | reading pane)
- **AI:** Basic — draft replies and summarize emails via existing Gemini integration (Cmd+K palette + chat sidebar)
- **Sync:** 60-second polling interval per account
- **Storage:** Emails cached in Supabase, filtered at API level (Gmail: `category:primary in:inbox`, Outlook: full inbox)
- **Search:** Full-text search across cached emails using Postgres GIN index

### Non-Functional
- Zero-trust: OAuth tokens never touch the browser
- RLS on all email tables, scoped to `user_id = auth.uid()`
- Lazy-loaded tab (no impact on initial bundle size)
- Cyberpunk aesthetic consistent with existing Nexus UI

---

## 2. Architecture: Hybrid (Approach C)

Split read/write paths, matching the existing Nexus media vault pattern.

```
Read path:  Supabase (nexus_emails) → Realtime → useEmails hook → React UI
Write path: React UI → Litestar API → Gmail/Graph API → Provider
Sync path:  Background poller → Gmail/Graph API → Supabase upsert → Realtime → React UI
```

**Why Hybrid over Backend-First:**
- Leverages Supabase Realtime for instant UI updates (same as media items)
- No unnecessary round-trip through Litestar for reads
- Poller runs as isolated async task, doesn't block API routes
- Matches existing Nexus architecture — no new patterns to learn

---

## 3. Data Model

### 3.1 `email_accounts` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → auth.users | RLS anchor |
| `provider` | text | `'google'` or `'microsoft'` |
| `email_address` | text | Display address |
| `encrypted_access_token` | text | Fernet-encrypted |
| `encrypted_refresh_token` | text | Fernet-encrypted |
| `token_expires_at` | timestamptz | For proactive refresh |
| `status` | text | `'connected'` or `'disconnected'` |
| `created_at` | timestamptz | |

### 3.2 `nexus_emails` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → auth.users | RLS anchor |
| `account_id` | uuid FK → email_accounts | Source account |
| `provider_id` | text | Gmail/Graph message ID (dedup key) |
| `thread_id` | text | Conversation grouping |
| `folder` | text | `'inbox'`, `'sent'`, `'drafts'`, `'archive'`, `'trash'` |
| `labels` | text[] | Label names |
| `from_address` | text | |
| `from_name` | text | |
| `to_addresses` | jsonb | `[{name, email}]` |
| `cc_addresses` | jsonb | |
| `subject` | text | |
| `body_text` | text | Plain text only (for search + snippets) |
| `snippet` | text | Preview text for list view |
| `is_read` | boolean | |
| `is_starred` | boolean | |
| `has_attachments` | boolean | |
| `attachments_meta` | jsonb | `[{name, size, mime_type}]` metadata only |
| `provider_date` | timestamptz | Original send date |
| `synced_at` | timestamptz | Last sync timestamp |

**No `body_html` column.** Full HTML is fetched on-demand from the provider via `GET /api/email/{id}/html` to keep Supabase lean.

**Pagination:** `EmailList` uses cursor-based pagination on `provider_date DESC` with a page size of 50. Infinite scroll loads the next page when the user reaches the bottom of the list. The cursor is the `provider_date` of the last loaded item — the next page fetches with `.lt('provider_date', lastCursor).order('provider_date', { ascending: false }).limit(50)`. No offset, no performance degradation at depth.

### 3.3 Indexes

```sql
-- Dedup: one row per provider message per account
CREATE UNIQUE INDEX idx_nexus_emails_dedup
  ON nexus_emails (account_id, provider_id);

-- List queries: folder + date ordering
CREATE INDEX idx_nexus_emails_folder_date
  ON nexus_emails (user_id, folder, provider_date DESC);

-- Full-text search
CREATE INDEX idx_nexus_emails_search
  ON nexus_emails USING GIN (
    to_tsvector('english', subject || ' ' || body_text || ' ' || snippet)
  );
```

### 3.4 RLS Policies

```sql
-- email_accounts: users see only their own accounts
CREATE POLICY email_accounts_user_isolation ON email_accounts
  FOR ALL USING (user_id = auth.uid());

-- nexus_emails: frontend has read-only access via user JWT
CREATE POLICY nexus_emails_user_read ON nexus_emails
  FOR SELECT USING (user_id = auth.uid());

-- nexus_emails: only backend service role can write
CREATE POLICY nexus_emails_service_write ON nexus_emails
  FOR ALL USING (auth.role() = 'service_role');
```

### 3.5 Postgres View (token-safe frontend access)

```sql
CREATE VIEW email_accounts_safe
  WITH (security_invoker = true) AS
SELECT id, user_id, provider, email_address, status, created_at
FROM email_accounts;
```

Exposes account metadata to the frontend without leaking encrypted tokens. `security_invoker = true` ensures RLS applies using the calling user's role.

---

## 4. Backend (Litestar)

### 4.1 New Modules

| Module | Purpose |
|---|---|
| `email_controller.py` | REST endpoints for email actions |
| `oauth_controller.py` | OAuth2 PKCE flow for Google/Microsoft |
| `email_service.py` | Provider abstraction (Gmail + Graph clients) |
| `email_poller.py` | Background sync worker |

### 4.2 Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/email/accounts` | GET | List connected accounts |
| `/api/email/accounts/connect` | POST | Start OAuth flow (returns redirect URL) |
| `/api/email/accounts/callback` | GET | OAuth callback — exchanges code, encrypts tokens |
| `/api/email/accounts/{id}` | DELETE | Disconnect account, revoke tokens |
| `/api/email/send` | POST | Send email via provider |
| `/api/email/{id}/reply` | POST | Reply via provider |
| `/api/email/{id}/forward` | POST | Forward via provider |
| `/api/email/draft` | POST | Save draft via provider |
| `/api/email/{id}/move` | PATCH | Move to folder |
| `/api/email/{id}/labels` | PATCH | Add/remove labels |
| `/api/email/{id}/read` | PATCH | Mark read/unread |
| `/api/email/{id}/star` | PATCH | Toggle star |
| `/api/email/{id}/html` | GET | Fetch full HTML body on-demand from provider |
| `/api/email/{id}/attachments/{att_id}` | GET | Stream attachment from provider |
| `/api/email/ai/draft` | POST | Gemini drafts a reply |
| `/api/email/ai/summarize` | POST | Gemini summarizes email/thread |

**No `GET /api/email/list` endpoint.** The frontend reads directly from Supabase Realtime.

### 4.3 Email Service Layer

`EmailProvider` protocol with `GmailProvider` and `GraphProvider` implementations:
- Token decryption + proactive refresh (reuses Fernet pattern from `data_protection.py`)
- Gmail <-> Graph API translation (folder names, label formats, message structure)
- Rate limiting per provider (Gmail: 250 quota units/sec, Graph: 10,000 requests/10min)
- All responses normalized into a unified `EmailMessage` Pydantic model

### 4.4 Background Poller

Runs as `asyncio.create_task` in Litestar's `on_startup` hook:

1. 60-second loop per connected account
2. Fetch new messages since last `synced_at`
3. Upsert into `nexus_emails` (dedup on `account_id + provider_id`)
4. **Ghost email detection:** fetch current remote inbox IDs, compare against Supabase. IDs present in Supabase but missing from remote are updated to `folder: 'trash'` or `'archive'`
5. Gmail filter: `category:primary in:inbox`
6. Outlook filter: full inbox (no `inferenceClassification` filter)
7. Upserts trigger Supabase Realtime automatically — frontend gets instant updates

Error handling: catch-all around each poll iteration, log errors, continue loop. If token refresh fails, mark account as `status: 'disconnected'`.

---

## 5. Frontend (React)

### 5.1 New Files

| File | Purpose |
|---|---|
| `components/features/EmailInbox.jsx` | Top-level email tab — three-column layout |
| `components/features/FolderSidebar.jsx` | Left column — folders + account switcher |
| `components/features/EmailList.jsx` | Middle column — message list with snippets |
| `components/features/EmailReader.jsx` | Right column — email view with HTML rendering |
| `components/features/ComposeModal.jsx` | New/reply/forward compose modal |
| `components/features/EmailToolbar.jsx` | Action bar (archive, delete, label, star) |
| `hooks/useEmails.js` | React Query + Supabase Realtime on `nexus_emails` |
| `hooks/useEmailAccounts.js` | React Query for account CRUD |
| `hooks/useEmailActions.js` | Mutations hitting Litestar write endpoints |
| `hooks/useEmailPolling.js` | Manual refresh trigger + sync status |
| `lib/emailConfig.js` | Folder icons, provider colors, mappings (single source of truth) |

### 5.2 Data Flow

```
Supabase (nexus_emails) → Realtime subscription → useEmails hook → React Query cache
                                                                   ↓
                                              FolderSidebar ← EmailList ← EmailReader

User action → useEmailActions → Litestar API → Provider API
           → Optimistic cache update (read/star/move only)
           → Poller confirms on next sync
```

### 5.3 Key Patterns

1. **Realtime dedup** — same as media items: `handleRealtimeEvent` compares all visible fields before updating cache to prevent Framer Motion layout re-triggers

2. **Optimistic updates (non-destructive only)** — mark-as-read, star, move-to-folder apply instantly to cache with rollback on failure. **Send, reply, and forward are NOT optimistic** — they show a "Sending..." toast state and only update cache after Litestar returns `200 OK` with the provider ID

3. **Lazy-loaded tab** — `EmailInbox` loaded via `React.lazy()` (same as `ChatLayout` and `AICmdPalette`)

4. **Safe HTML rendering** — `EmailReader` fetches HTML via `GET /api/email/{id}/html`, sanitizes with DOMPurify, renders in `<iframe srcdoc>` with `sandbox="allow-popups allow-same-origin"` (never `allow-scripts`). **Remote images blocked by default** — "Show remote images" button re-renders with `img-src https: data:` allowed. Strips `onerror`, `onload`, `onmouseover` attributes

5. **Compose modal** — shared modal pattern from `MediaForm.jsx`. Rich text via Tiptap editor

6. **Account switcher** in FolderSidebar:
   - "All Accounts" (default) — unified folder counts
   - Per-account — shows that account's folders/labels only
   - Provider badge (Gmail/Outlook icon) on each email in the list

### 5.4 AI Integration

Extends existing `ChatController` and `AICmdPalette`:
- Cmd+K: "Draft reply to [subject]" → `POST /api/email/ai/draft` → text inserted into compose modal
- Cmd+K: "Summarize this thread" → `POST /api/email/ai/summarize` → summary in chat sidebar
- Context passed to Gemini: `subject + body_text + snippet` (never full HTML)

---

## 6. OAuth Flow & Security

### 6.1 OAuth2 + PKCE + State Parameter

```
1. User clicks "Connect Gmail" in Email settings
2. Frontend → POST /api/email/accounts/connect?provider=google
3. Litestar generates:
   - PKCE code_verifier + code_challenge
   - CSRF state token (secrets.token_urlsafe(32))
4. Stores state:code_verifier in HttpOnly secure cookie
5. Returns 302 redirect → Google/Microsoft consent screen
6. User authorizes → provider redirects to /api/email/accounts/callback?code=xxx&state=yyy
7. Litestar validates:
   - state matches cookie (CSRF protection, constant-time comparison)
   - Exchanges code + code_verifier for tokens (server-side only)
8. Encrypts tokens with Fernet, stores in email_accounts
9. Clears oauth_session cookie
10. Redirects to Nexus Email tab with success flash
```

### 6.2 Scopes (Principle of Least Privilege)

| Provider | Scopes |
|---|---|
| Google | `gmail.modify`, `gmail.compose`, `gmail.labels` |
| Microsoft | `Mail.ReadWrite`, `Mail.Send`, `MailboxSettings.Read` |

### 6.3 Token Lifecycle

- **Access tokens:** ~1hr lifespan. Backend refreshes proactively when `token_expires_at` is within 5 minutes
- **Refresh tokens:** long-lived. If refresh fails (user revoked), mark account `status: 'disconnected'`, surface "Reconnect" banner in UI
- **All token operations** in `email_service.py` — frontend never sees raw tokens

### 6.4 Encryption

- Reuses `TAKEAWAY_ENCRYPTION_KEY` Fernet key from `data_protection.py`
- Tokens encrypted at rest in Supabase, decrypted only in-memory on backend during API calls

### 6.5 Security Summary

| Layer | Protection |
|---|---|
| Browser | Never sees OAuth tokens. Read-only Supabase access via RLS |
| Transport | HTTPS only. HttpOnly + Secure cookies for OAuth state |
| OAuth | PKCE prevents code interception. State parameter prevents CSRF |
| Storage | Fernet encryption at rest. Postgres view hides tokens from frontend |
| RLS | `user_id = auth.uid()` on all tables. Service role for writes |
| Email HTML | DOMPurify + sandboxed iframe. Images blocked by default |
| AI | Only plain text context sent to Gemini. Never raw HTML |

---

## 7. Migration Plan

This feature integrates into the existing Nexus codebase with no breaking changes:

1. **Database:** New Supabase migration adding `email_accounts`, `nexus_emails`, indexes, RLS policies, and the safe view
2. **Backend:** New controller + service + poller modules. Registered in `app.py` route list. Poller starts via `on_startup` hook
3. **Frontend:** New lazy-loaded tab added to `App.jsx` nav. New components + hooks. `emailConfig.js` follows `mediaConfig.js` pattern
4. **Environment:** New env vars: Google OAuth client ID/secret, Microsoft OAuth client ID/secret (backend `.env` only)
5. **No changes** to existing media, chat, or auth functionality
