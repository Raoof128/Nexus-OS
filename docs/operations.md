# Operations Guide

## Observability

- Configure `BACKEND_SENTRY_DSN` to capture backend exceptions.
- Configure `VITE_SENTRY_DSN` to capture frontend runtime failures.
- Review `nexus.audit` log entries for `book.create` and `book.suggest` activity.
- Use `GET /healthz` for uptime and readiness checks.

## Security Controls

- Access tokens live in `HttpOnly` cookies and are rotated through `/auth/refresh`.
- The suggestion endpoint is rate-limited per user and can use Redis for multi-instance enforcement.
- LLM-bound library context is scrubbed, masked, and wrapped in strict XML delimiters.
- `takeaway` writes require `TAKEAWAY_ENCRYPTION_KEY` so sensitive notes are not persisted in plaintext.
- CI runs Ruff, pytest, Bandit, pip-audit, npm audit, and gitleaks.

## Production Checklist

- Set Supabase JWT expiry to 15 minutes.
- Enable Supabase Point-in-Time Recovery (PITR).
- Configure `COOKIE_SECURE=true` and `COOKIE_DOMAIN` for your production domain.
- Provide a stable `TAKEAWAY_ENCRYPTION_KEY`.
- Provide a non-default `AUDIT_LOG_SALT`.
- Configure `REDIS_URL` for distributed rate limiting.
- Apply Terraform with live provider credentials and review generated infrastructure drift.
