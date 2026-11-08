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
- CI runs Ruff, pytest, Bandit, pip-audit, npm audit, and gitleaks.
- Outbound send/reply/forward requests require `Idempotency-Key`; the browser
  retains a key across ambiguous timeouts. Deduplication is process-local, so
  multi-worker deployments still require shared durable idempotency.

## Production Checklist

- Set Supabase JWT expiry to 15 minutes.
- Enable Supabase Point-in-Time Recovery (PITR).
- Configure `COOKIE_SECURE=true` and `COOKIE_DOMAIN` for your production domain.
- Configure `TRUSTED_PROXY_IPS` so auth throttling only trusts your reverse proxy tier.
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
