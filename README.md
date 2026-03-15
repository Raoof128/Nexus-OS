# Nexus Archive

Nexus Archive is a cyberpunk-styled personal media vault for tracking anime, movies, and books in one place. It combines a React frontend, a Litestar API, and Supabase-backed identity and persistence so a user can manage watchlists, reading queues, ratings, takeaways, and AI-assisted recommendations from a single interface.

## Why This Exists

Most people split their media history across multiple apps. Nexus Archive unifies:

- anime watchlists
- movie watchlists
- book lists
- personal ratings
- short reviews and takeaways
- AI suggestions based on your existing library

The result is a single personal archive instead of disconnected checklists.

## Stack

- Frontend: React 19, Vite, Tailwind CSS 4, Framer Motion
- Backend: Python 3.12, Litestar, Supabase Python client, PyJWT
- Database: Supabase PostgreSQL with Row Level Security
- Tooling: ESLint, Ruff, pytest, GitHub Actions, pre-commit

## Repository Layout

```text
.
├── backend/                 # Litestar API package
├── docs/                    # Architecture, API, and usage docs
├── frontend/                # React client
├── tests/                   # Backend-focused automated tests
├── .github/workflows/       # CI pipeline
├── database.sql             # Supabase schema bootstrap
├── pyproject.toml           # Python tooling and test configuration
└── Makefile                 # Common developer commands
```

## Quick Start

### 1. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Required frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

### 2. Backend

```bash
cd backend
cp .env.example .env
python3 -m venv venv
source venv/bin/activate
pip install -e ..
litestar run --app backend.app:app
```

Required backend variables:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_JWT_SECRET`
- `GEMINI_API_KEY` (optional)

## Quality Gates

```bash
make lint
make test
make build-frontend
```

## Documentation

- [Architecture Overview](./docs/architecture.md)
- [API Reference](./docs/api-reference.md)
- [Usage Examples](./docs/usage-examples.md)
- [Security Policy](./SECURITY.md)
- [Contributing Guide](./CONTRIBUTING.md)

## Product Direction

Nexus Archive is designed as a personal media operating system. The intended experience is:

- one login
- one catalog
- all anime, movies, and books in one place
- fast status tracking
- ratings and personal notes
- recommendation support without losing human curation

## Deployment Notes

- Frontend can be deployed to Vercel, Netlify, or any static host.
- Backend can run anywhere ASGI apps are supported.
- Supabase must enforce RLS policies before public deployment.

## License

This project is released under the [MIT License](./LICENSE).
