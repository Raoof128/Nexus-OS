# Contributing to Nexus OS

Thank you for contributing to Nexus OS! This project maintains a high standard for visual excellence, security, and protocol adherence.

## Development Principles

### 1. Visual Excellence (Cyberpunk Aesthetic)

- **Neon-Glow**: Use HSL-based variables for neon effects. Avoid generic hex colors.
- **Motion**: Every interaction should feel "alive". Use `framer-motion` for choreographed entrances and `View Transitions API` for state changes.
- **Glassmorphism**: Use `backdrop-blur` and subtle borders to create depth.

### 2. Raouf Protocol (Mandatory)

Before making any code changes, you must:

1.  Read `AGENT.md` for foundational rules.
2.  Read `CHANGELOG.md` to understand the recent context.
3.  Implement changes following the file-by-file audit rule (no skimming).
4.  Update both `AGENT.md` and `CHANGELOG.md` with your changes using the `Raouf:` template.

### 3. Backend Integrity

- **Modular Design**: Keep code in appropriate layers: `controllers`, `schemas`, `services`, `auth`.
- **Zero-Trust**: Never expose tokens to the frontend. Use `HttpOnly` cookies for session management.
- **Sanitization**: All user input must be sanitized and validated via Pydantic schemas.

## Local Setup

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Backend

```bash
# Install dependencies using Makefile
make install

# Or manually
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
litestar run --app backend.app:app --reload
```

## Testing & Quality Gates

Nexus OS uses a "Quality Gate" script to ensure all invariants are met.

```bash
# Run the full quality gate
./scripts/check.sh

# Individual checks
make lint       # Ruff (Python) + ESLint (JS)
make test       # Pytest (Backend) + Vitest (Frontend)
make security   # Bandit + pip-audit + Gitleaks
```

## Commit Messages

Use conventional commits:

- `feat(ui): add neural mesh wallpaper`
- `fix(auth): resolve refresh token race condition`
- `docs(api): document chat session endpoints`

## Pull Request Process

1.  Ensure all tests pass.
2.  Include screenshots for any UI/UX changes.
3.  Update the `CHANGELOG.md` entry for your change.
4.  Link to any related issues or design discussions.
