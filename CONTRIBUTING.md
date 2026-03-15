# Contributing

## Development Principles

- Keep backend code modular: config, auth, services, controllers, schemas.
- Preserve the cyberpunk visual direction in the frontend.
- Do not commit secrets, generated build output, or local virtual environments.
- Prefer small, reviewable changes with tests when backend behavior changes.

## Local Setup

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
```

### Backend

```bash
cd backend
cp .env.example .env
python3 -m venv venv
source venv/bin/activate
pip install -e ..
```

## Before Opening a Pull Request

Run:

```bash
make lint
make test
make build-frontend
```

## Pull Request Expectations

- Explain the user-facing or architectural impact.
- Reference any docs updated alongside the code.
- Include screenshots for frontend changes when relevant.
- Add or update tests for backend logic changes.

## Commit Messages

Use the format:

```text
type(scope): concise imperative description
```

Example:

```text
fix(api): validate missing media status
```
