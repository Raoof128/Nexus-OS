# Operations Guide

## Observability

- Configure `BACKEND_SENTRY_DSN` to capture backend exceptions.
- Configure `VITE_SENTRY_DSN` to capture frontend runtime failures.
- Review `nexus.audit` log entries for `media.create`, `media.suggest`, and chat activity.
- Use `GET /healthz` for uptime and readiness checks.

## Security Controls

- API access tokens live only in `HttpOnly` cookies and rotate through
  `/auth/refresh`. Auth responses return identity metadata only; private
  browser reads use the authenticated API rather than direct PostgREST.
- The suggestion endpoint is rate-limited per user and can use Redis for multi-instance enforcement.
- Authentication rate limiting only trusts `X-Forwarded-For` from explicitly configured proxy IPs.
- LLM-bound library context is scrubbed, masked, and wrapped in strict XML delimiters.
- Chat history sent to Gemini is reduced to a recent window, scrubbed for prompt-injection markers, and PII-masked.
- `takeaway` writes require `TAKEAWAY_ENCRYPTION_KEY` so sensitive notes are not persisted in plaintext.
- Chat content is encrypted at rest when `TAKEAWAY_ENCRYPTION_KEY` is configured.
- CI runs Ruff, pytest, Bandit, pip-audit, ESLint, Prettier, Vitest, npm audit,
  gitleaks and the Playwright functional suite (`npm run test:e2e`).
- Send, reply and forward share a per-user budget (50 per hour, `429` with
  `Retry-After`) checked after the idempotency lookup and before any provider
  call, so a replayed request does not consume it.
- Send, reply and forward honour an `Idempotency-Key` header (8-128 characters
  from `A-Z a-z 0-9 _ -`; malformed returns `400`). A retry with the same key
  and the same request returns the first response with `Idempotent-Replayed:
true` and does not call the provider. A retry while the first request is
  still running returns `409` with `Retry-After`; the same key with a
  different request returns `422`. Keys are per user and kept for 24 hours; a
  provider failure before the message is accepted releases the key. Requests
  without the header are not deduplicated. With `REDIS_URL` the store is
  shared across instances; without it, it is per process and bounded.
- Login has two budgets: per IP + account, and per account from any IP (20 per
  15 minutes). The account budget stops rotating-IP guessing, at a known cost:
  anyone who knows an address can throttle that account's sign-in (and lock
  screen unlock, which uses `/auth/login`) for 15 minutes. Only failed
  credential attempts count; once the budget is spent even the correct
  password is refused before Supabase is asked.
- `/auth/refresh` is budgeted per refresh session plus a per-IP ceiling (60 per
  minute). The frontend treats a `429` from refresh as transient, never as a
  sign-out.
- Sentry events have credential request headers (including the password-reset
  `X-Recovery-*` headers), bodies, query strings and frame locals scrubbed.
- Browser-local data (Nexus Drive tree and blobs, notes, window layout,
  notification history) belongs to the account that last signed in on that
  browser and is wiped when a different account signs in
  (`frontend/src/lib/privateState.js`).

## Production Checklist

- Set Supabase JWT expiry to 15 minutes.
- Enable Supabase Point-in-Time Recovery (PITR).
- Configure `COOKIE_SECURE=true` and `COOKIE_DOMAIN` for your production domain.
- Configure `TRUSTED_PROXY_IPS` so auth throttling only trusts your reverse proxy tier.
  **Without it, every request appears to come from the proxy**, so per-IP
  budgets (including the `/auth/refresh` ceiling of 60/minute) become one shared
  bucket for all users.
- **Client IP for rate limits (`CLIENT_IP_STRATEGY`).** Requests reach nginx
  from Cloudflare, so nginx's `$remote_addr` is a Cloudflare edge address, not
  the visitor. Do **not** overwrite `X-Forwarded-For` with `$remote_addr`:
  every user would share Cloudflare's rate-limit buckets. The default
  `leftmost` is correct for traffic through the Worker (it sets
  `X-Forwarded-For` from `CF-Connecting-IP`); the gap is a request sent straight
  to `api.home-notes-app.uk` with a forged `X-Forwarded-For`.
  - **Check first.** Log `$remote_addr`, `$http_x_forwarded_for` and
    `$http_cf_connecting_ip` in nginx, make one request through the site and
    one direct `curl https://api.home-notes-app.uk/healthz -H "X-Forwarded-For:
1.2.3.4"`, and read what arrives. It is not verified what Cloudflare puts in
    `CF-Connecting-IP` on the Worker's own subrequest, so do not switch nginx to
    `real_ip` from `CF-Connecting-IP` until the log shows the visitor's address
    there. Remove the logging afterwards (it records visitor IPs).
  - **Close the direct route** (preferred, keeps `leftmost`): have the Worker
    add a secret header that nginx requires, so only Worker traffic reaches the
    backend; or
  - set `CLIENT_IP_STRATEGY=rightmost` and list **every** proxy hop in
    `TRUSTED_PROXY_IPS` (all Cloudflare IPv4/IPv6 ranges and nginx). The backend
    then takes the first untrusted hop from the right, so an appended
    client-supplied value is never used. It logs a warning at startup if
    `rightmost` is set without any public proxy ranges.
- After deploying the Sentry header scrubbing, purge older Sentry events that
  may contain `X-Recovery-Access-Token` / `X-Recovery-Refresh-Token` headers.
- `supabase/seed.sql` refuses to run unless the server address is local
  (loopback, `172.16/12`, `192.168/16` or a Unix socket) and `auth.users` holds
  no other account. Podman's default `10.88/16` network is refused; never run
  the seed against a hosted project.
- Set `ALLOWED_HOSTS` to the exact frontend and API hosts. Production must not
  use `*`.
- When email OAuth is enabled, configure the provider registration and backend
  with the identical callback URL:
  `OAUTH_CALLBACK_URL=https://home-notes-app.uk/api/email/accounts/callback`,
  `FRONTEND_APP_URL=https://home-notes-app.uk`.
- Set bounded upstream deadlines with `SUPABASE_REQUEST_TIMEOUT_SECONDS` and
  `GEMINI_REQUEST_TIMEOUT_MS`.
- Provide a stable `TAKEAWAY_ENCRYPTION_KEY`.
- Provide a non-default `AUDIT_LOG_SALT`.
- Configure `REDIS_URL` for distributed rate limiting.
- Run only one email-poller-enabled API worker/replica until a distributed poll
  lease or dedicated worker is implemented.
- Apply `20260817000001_backend_integrity_hardening.sql` in a maintenance window
  after a backup. Its unique constraints and validation scans are transactional
  but can hold locks on active notes, tasks, and email tables.
- Apply Terraform with live provider credentials and review generated infrastructure drift.
