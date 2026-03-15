# Operations Guide

## Observability

- Configure `BACKEND_SENTRY_DSN` to capture backend exceptions.
- Configure `VITE_SENTRY_DSN` to capture frontend runtime failures.
- Review `nexus.audit` log entries for `book.create` and `book.suggest` activity.
- Use `GET /healthz` for uptime and readiness checks.

## Performance and Resilience

- The AI recommendation path uses a circuit breaker to avoid repeated Gemini failures.
- Recommendation prompts are pruned to a token budget before they leave the backend.
- Frontend data fetches are cached with TanStack Query to reduce repeated round trips.
- `loadtests/locustfile.py` simulates concurrent traffic against `/books/suggest`.

## Infrastructure

- `backend/Dockerfile` is the deployment image for the API.
- `docker-compose.yml` starts the backend in a locally reproducible container.
- `infra/terraform/` is the reviewed IaC entry point for Supabase and Vercel resources.
- `.devcontainer/devcontainer.json` sets up a consistent local workspace for contributors.
