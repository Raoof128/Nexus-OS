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

## Media Endpoints

### `GET /media`

Returns paginated media entries for the authenticated user.

Query parameters:

- `type`: optional `book`, `movie`, `anime`, or `job`
- `page`: optional page number, default `1`
- `limit`: optional page size, default `200`, max `500`

### `POST /media`

Creates a new media entry.

Validation rules:

- `title`: 1-200 chars, rejects angle brackets, XSS, and injection probes
- `creator`: 1-100 chars, rejects angle brackets, XSS, and injection probes
- `genre`: optional, max 80 chars, rejects angle brackets, XSS, and injection probes
- `status`: `To Read`, `Reading`, `Finished`, `To Watch`, `Watching`, `Not Answered`, `Answered`, `Rejected`, or `Got the Job`
- `rating`: optional, integer from 1 to 5
- `takeaway`: optional, max 2000 chars, rejects embedded script markup
- `sub_info`: optional, max 100 chars, rejects angle brackets and probe strings

### `PUT /media/{media_id}`

Updates an existing media entry owned by the authenticated user.

### `DELETE /media/{media_id}`

Deletes an existing media entry owned by the authenticated user.

### `GET /media/suggest`

Returns recommendations derived from the user library. This route consumes the shared per-user AI quota and degrades to a deterministic local fallback when Gemini is unavailable.

Response:

```json
{
  "suggestions": [
    {
      "title": "Snow Crash",
      "creator": "Neal Stephenson",
      "genre": "Cyberpunk",
      "year": "1992",
      "pitch": "Fast-paced cyberpunk with satirical energy and strong world design."
    }
  ],
  "source": "gemini"
}
```

For job suggestions, the AI acts as a career strategist — `title` is the role, `creator` is the company, `genre` is the industry.

## Chat Endpoints

### `GET /chat/sessions`

Returns chat sessions for the authenticated user.

### `POST /chat/sessions`

Creates a chat session with `title` and `category`.

### `DELETE /chat/sessions/{session_id}`

Deletes an owned chat session and its messages.

### `GET /chat/sessions/{session_id}/messages`

Returns decrypted chat messages for an owned session.

### `POST /chat/sessions/{session_id}/messages`

Sends a message, stores it, forwards a sanitized recent history window to Gemini, and returns the AI response.

This route also consumes the shared per-user AI quota. Configure the budget with `AI_RATE_LIMIT_REQUESTS` and `AI_RATE_LIMIT_WINDOW_SECONDS`.
