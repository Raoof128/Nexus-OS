# Nexus Archive

Nexus Archive is a cyberpunk-styled personal media vault for tracking anime, movies, and books in one place. It combines a React frontend, a Litestar API, and Supabase-backed identity and persistence so a user can manage watchlists, reading queues, ratings, takeaways, and AI-assisted recommendations from a single interface.

## What Changed in This Upgrade

This repository now includes the operational and security layer that was previously missing:

- hardened backend request validation with Pydantic v2 field validators
- secure response headers, explicit allowed-host handling, and public health/schema routes
- structured audit logging for book creation and AI suggestion activity
- Gemini few-shot prompting with context pruning and a circuit-breaker fallback path
- TanStack Query server-state caching with optimistic create mutations
- lazy-loaded AI command palette to reduce initial frontend bundle pressure
- optional Sentry bootstrap for frontend and backend error tracking
- Docker, Terraform scaffolding, devcontainer metadata, and Locust load tests

## Stack

- Frontend: React 19, Vite, Tailwind CSS 4, TanStack Query, Framer Motion
- Backend: Python 3.12, Litestar, Supabase Python client, PyJWT, Tiktoken
- Database/Auth: Supabase PostgreSQL with Row Level Security
- Observability: Sentry, structured audit logs, health probes
- Tooling: ESLint, Ruff, pytest, Locust, Docker, Terraform, GitHub Actions

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

- `GET /healthz` is available for uptime checks.
- `GET /schema/swagger` exposes live API docs without requiring auth.
- `GET /books/suggest` gracefully degrades to a local recommendation when Gemini is unavailable.
- Book creation and suggestion requests emit audit events with hashed user identifiers.
- Frontend book queries are cached and refetched through TanStack Query rather than manual `useEffect` fetch loops.

## Quality Gates

```bash
make lint
make test
make build-frontend
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
- Sentry DSNs are optional and only activate telemetry when configured.
- Supabase must enforce RLS policies before public deployment.

## License

This project is released under the [MIT License](./LICENSE).
