# Nexus OS

Nexus OS is a premium, cyberpunk-styled personal media vault and job tracker. It combines a high-performance React frontend, a Litestar API, and Supabase-backed identity and persistence to manage books, movies, anime, job applications, ratings, takeaways, and AI-assisted recommendations within a unified, immersive interface.

## Visual Aesthetic

Nexus OS is built with a **Cyberpunk-First** design philosophy. It features:

- **Neon-Glow Design System**: Tailored HSL color palettes with high-contrast accents.
- **Glassmorphism**: Translucent windowing system with backdrop filters and depth.
- **Dynamic Backgrounds**: High-performance CSS patterns and 4K cyberpunk wallpapers.
- **Silky Transitions**: View Transitions API (2026) for seamless theme and state changes.

## Security Upgrade Highlights

This repository includes a hardened defensive posture:

- **Zero-Trust Auth**: Backend-managed `HttpOnly` cookies; no sensitive tokens in browser storage.
- **Silent Rotation**: Strict cookie refresh flow with short-lived access tokens.
- **AI Isolation**: Prompt scrubbing, XML delimiters, and PII masking for Gemini interactions.
- **Rate Limiting**: Shared server-side AI quotas enforced via Redis-backed sliding windows.
- **Encrypted Persistence**: Field-level encryption for takeaways and chat content.

## Backend Service Layer

- **LiteStar Controllers**: Handle routing and dependency injection.
- **Service Layer**: Pure business logic (e.g., `media_service.py`, `chat_service.py`) that interacts with Supabase or Gemini.
- **Data Protection**: Centralized module for encryption and prompt sanitization.

## App Directory Structure (Frontend)

Nexus OS uses a modular application registry. Each "App" is self-contained in `frontend/src/os/apps/`:

- `Library/`: Media tracking (Books, Movies, Anime) and Job Tracker.
- `Email/`: Secure email client with AI drafting.
- `Chat/`: Encrypted AI chat assistant.
- `Auth/`: Unified authentication panels and recovery.
- `Terminal/`: System console and diagnostics.

## Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS 4, TanStack Query, Framer Motion
- **Backend**: Python 3.12, Litestar, Supabase Python, PyJWT, Tiktoken
- **Database/Auth**: Supabase PostgreSQL with strict Row Level Security (RLS)
- **Quality Assurance**: ESLint, Ruff, Vitest, Pytest, Bandit, pip-audit, Gitleaks

## Repository Layout

```text
.
├── backend/                 # Litestar API package and backend runtime assets
├── docs/                    # Architecture, API, operations, and usage docs
├── frontend/                # React client (OS Shell + Apps)
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

### 1. Unified Setup

The easiest way to get started is using the provided `Makefile`:

```bash
# Install all dependencies (backend + frontend)
make install

# Start development servers (concurrently)
make dev
```

The backend will be available at `http://localhost:8000` and the frontend at `http://localhost:5173`.

### 3. Container Orchestration

```bash
docker compose up --build backend
```

## Quality Gates

Nexus OS maintains a strict quality gate via `scripts/check.sh`.

```bash
make lint       # Ruff + ESLint
make test       # Pytest + Vitest
make security   # Bandit + pip-audit + Gitleaks
make build      # Production bundle verification
```

## Documentation

- [Architecture Overview](./docs/architecture.md)
- [API Reference](./docs/api-reference.md)
- [Design Guidelines](./docs/design-guidelines.md)
- [Usage Examples](./docs/usage-examples.md)
- [Operations Guide](./docs/operations.md)
- [Security Policy](./SECURITY.md)
- [Contributing Guide](./CONTRIBUTING.md)

## License

This project is released under the [MIT License](./LICENSE).
