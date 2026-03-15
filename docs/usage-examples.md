# Usage Examples

## Example Product Framing

Nexus Archive is meant to hold:

- anime lists
- movie lists
- book lists
- ratings and notes
- what is planned, in progress, or completed

## API Example

```bash
curl http://127.0.0.1:8000/books \
  -H "Authorization: Bearer <token>"
```

## Suggestion Example

```bash
curl http://127.0.0.1:8000/books/suggest \
  -H "Authorization: Bearer <token>"
```

## Frontend Example Env

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://127.0.0.1:8000
VITE_SENTRY_DSN=
VITE_SENTRY_TRACES_SAMPLE_RATE=0
```

## Backend Example Env

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
GEMINI_API_KEY=optional-key
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
APP_ENV=development
AUDIT_LOG_SALT=replace-me
```

## Load Test Example

```bash
export LOCUST_HOST=http://127.0.0.1:8000
export LOCUST_BEARER_TOKEN=<supabase_access_token>
make load-test
```

## Docker Example

```bash
docker compose up --build backend
```
