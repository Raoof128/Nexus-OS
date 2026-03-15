# API Reference

## Public Endpoints

- `GET /healthz`
- `GET /schema/swagger`
- `GET /schema/openapi.json`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/session`

## Authentication Model

Protected routes use server-managed `HttpOnly` cookies:

- access cookie: short-lived, default 15 minutes
- refresh cookie: longer-lived, used only for rotation

The browser never reads the Supabase access token directly.

## Auth Endpoints

### `POST /auth/login`

Rate-limited by client IP and email to reduce brute-force attempts.

Request body:

```json
{
  "email": "runner@nexus.net",
  "password": "correct horse battery staple"
}
```

Response:

```json
{
  "user": {
    "id": "9ef4d4d6-57bb-4b9e-82c1-5df5d356b5b5",
    "email": "runner@nexus.net"
  },
  "expires_at": 1773544458
}
```

### `POST /auth/refresh`

Refreshes the cookie-backed session and rotates the short-lived access token.
This endpoint is rate-limited by client IP.

### `POST /auth/logout`

Revokes the upstream Supabase session when possible and clears the auth cookies.

### `GET /auth/session`

Returns the current user snapshot derived from the access cookie.

## Book Endpoints

### `GET /books`

Returns all book entries for the authenticated user.

### `POST /books`

Creates a new book entry.

Validation rules:

- `title`: 1-200 chars, rejects angle brackets, XSS, and injection probes
- `author`: 1-100 chars, rejects angle brackets, XSS, and injection probes
- `genre`: optional, max 80 chars, rejects angle brackets, XSS, and injection probes
- `status`: `To Read`, `Reading`, or `Finished`
- `rating`: optional, integer from 1 to 5
- `takeaway`: optional, max 2000 chars, rejects embedded script markup

### `GET /books/suggest`

Returns a recommendation derived from the user library. This route is rate-limited to protect quota and degrades to a deterministic local fallback when Gemini is unavailable.

Response:

```json
{
  "suggestion": "Snow Crash",
  "reasoning": "Fast-paced cyberpunk with satirical energy and strong world design.",
  "source": "gemini"
}
```
