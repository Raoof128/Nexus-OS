# Nexus Archive

Nexus Archive is a cyberpunk-styled personal media vault. It combines a React frontend, a Litestar API, and Supabase-backed identity and persistence so a user can manage books, movies, anime, ratings, takeaways, chat sessions, and AI-assisted recommendations from a single interface.

## Security Upgrade Highlights

This repository now includes a stronger defensive posture:

- backend-managed `HttpOnly` auth cookies instead of frontend-readable Supabase tokens
- strict cookie refresh flow with short-lived access tokens and silent rotation
- AI prompt isolation with XML delimiters, string scrubbing, and PII masking
- server-side rate limiting for `/media/suggest` and chat message generation
- encrypted `takeaway` persistence when `TAKEAWAY_ENCRYPTION_KEY` is configured
- Bandit, pip-audit, npm audit, and secret scanning in CI

## Stack

- Frontend: React 19, Vite, Tailwind CSS 4, TanStack Query, Framer Motion
- Backend: Python 3.12, Litestar, Supabase Python client, PyJWT, Tiktoken
- Database/Auth: Supabase PostgreSQL with Row Level Security
- Observability: Sentry, structured audit logs, health probes
- Tooling: ESLint, Ruff, pytest, Bandit, pip-audit, Locust, Docker, Terraform, GitHub Actions

## Repository Layout

```text
.
├── backend/                 # Litestar API package and backend runtime assets
├── docs/                    # Architecture, API, operations, and usage docs
├── frontend/                # React client
├── infra/terraform/         # IaC scaffold for Supabase and Vercel
├── loadtests/               # Locust performance scenarios
├── tests/                   # Backend-focused automated tests
├── .devcontainer/           # Dev container configuration
├── .github/workflows/       # CI pipeline
├── docker-compose.yml       # Local container orchestration
├── database.sql             # Supabase schema bootstrap
├── pyproject.toml           # Python tooling and test configuration
└── Makefile                 # Common developer commands
```

## Quick Start

### Backend

```bash
cp backend/.env.example backend/.env
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
litestar run --app backend.app:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Containers

```bash
docker compose up --build backend
```

## Core Runtime Guarantees

- `POST /auth/login` issues `HttpOnly`, `SameSite=Strict` cookies.
- `POST /auth/refresh` silently rotates short-lived access tokens.
- `GET /healthz` is available for uptime checks.
- `GET /schema/swagger` exposes live API docs without requiring auth.
- `GET /media/suggest?type=book|movie|anime` is rate-limited and degrades to a local recommendation when Gemini is unavailable.
- chat transcripts are user-scoped, sanitized before Gemini calls, and protected at rest when `TAKEAWAY_ENCRYPTION_KEY` is configured.
- `takeaway` notes are stored encrypted when `TAKEAWAY_ENCRYPTION_KEY` is configured.

## Quality Gates

```bash
make lint
make test
make build-frontend
make security
make load-test
make docker-backend
make terraform-fmt
```

## Documentation

- [Architecture Overview](./docs/architecture.md)
- [API Reference](./docs/api-reference.md)
- [Usage Examples](./docs/usage-examples.md)
- [Operations Guide](./docs/operations.md)
- [Security Policy](./SECURITY.md)
- [Contributing Guide](./CONTRIBUTING.md)

## Deployment Notes

- `infra/terraform/` contains the reviewed starting point for Supabase and Vercel-managed infrastructure.
- `backend/Dockerfile` is the canonical backend runtime image.
- `vercel.json` codifies frontend security headers for deployed static assets.
- Sentry DSNs are optional and only activate telemetry when configured.
- Supabase must enforce RLS, short JWT lifetime, and PITR before public deployment.
- Production should provide a non-default `AUDIT_LOG_SALT`, `TAKEAWAY_ENCRYPTION_KEY`, `REDIS_URL`, and `TRUSTED_PROXY_IPS`.

## License

This project is released under the [MIT License](./LICENSE).
