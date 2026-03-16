# Usage Examples

## Frontend Example Env

```bash
VITE_API_URL=http://127.0.0.1:8000
VITE_SENTRY_DSN=
VITE_SENTRY_TRACES_SAMPLE_RATE=0
```

## Backend Example Env

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_AUTH_KEY=your-anon-or-auth-key
SUPABASE_JWT_SECRET=your-jwt-secret
GEMINI_API_KEY=optional-key
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AUDIT_LOG_SALT=replace-me-with-a-long-random-secret
ACCESS_COOKIE_MAX_AGE=900
REFRESH_COOKIE_MAX_AGE=604800
COOKIE_SECURE=false
TAKEAWAY_ENCRYPTION_KEY=replace-me-with-a-fernet-key
REDIS_URL=redis://localhost:6379/0
TRUSTED_PROXY_IPS=10.0.0.5
```

## Login Example

```bash
curl -X POST http://127.0.0.1:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"runner@nexus.net","password":"correct horse battery staple"}' \
  -c cookies.txt
```

## Suggestion Example

```bash
curl "http://127.0.0.1:8000/media/suggest?type=book" \
  -b cookies.txt
```

## Load Test Example

```bash
export LOCUST_HOST=http://127.0.0.1:8000
export LOCUST_EMAIL=runner@nexus.net
export LOCUST_PASSWORD=correct-horse-battery-staple
make load-test
```
