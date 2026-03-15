# Operations Guide

## Observability

- Configure `BACKEND_SENTRY_DSN` to capture backend exceptions.
- Configure `VITE_SENTRY_DSN` to capture frontend runtime failures.
- Review `nexus.audit` log entries for `book.create` and `book.suggest` activity.
- Use `GET /healthz` for uptime and readiness checks.

## Security Controls

- Access tokens live in `HttpOnly` cookies and are rotated through `/auth/refresh`.
- The suggestion endpoint is rate-limited per user.
- LLM-bound library context is scrubbed, masked, and wrapped in strict XML delimiters.
- `takeaway` encryption is enabled when `TAKEAWAY_ENCRYPTION_KEY` is set.
- CI runs Ruff, pytest, Bandit, pip-audit, npm audit, and gitleaks.

## Production Checklist

- Set Supabase JWT expiry to 15 minutes.
- Enable Supabase Point-in-Time Recovery (PITR).
- Configure `COOKIE_SECURE=true` and `COOKIE_DOMAIN` for your production domain.
- Provide a stable `TAKEAWAY_ENCRYPTION_KEY`.
- Apply Terraform with live provider credentials and review generated infrastructure drift.
