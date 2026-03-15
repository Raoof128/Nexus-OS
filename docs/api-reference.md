# API Reference

## Authentication

All book endpoints require:

```http
Authorization: Bearer <supabase_access_token>
```

Public operational routes:

- `GET /healthz`
- `GET /schema/swagger`
- `GET /schema/openapi.json`

## Endpoints

### `GET /healthz`

Returns a simple uptime response:

```json
{
  "status": "ok"
}
```

### `GET /books`

Returns all book entries for the authenticated user.

Response:

```json
[
  {
    "id": "7d2d7d5a-2f0e-4bf0-bf34-c6f0d570f1db",
    "user_id": "9ef4d4d6-57bb-4b9e-82c1-5df5d356b5b5",
    "title": "Neuromancer",
    "author": "William Gibson",
    "genre": "Cyberpunk",
    "status": "Finished",
    "rating": 5,
    "takeaway": "Classic genre-defining atmosphere.",
    "created_at": "2026-03-15T10:00:00Z"
  }
]
```

### `POST /books`

Creates a new book entry.

Request body:

```json
{
  "title": "Akira",
  "author": "Katsuhiro Otomo",
  "genre": "Sci-Fi",
  "status": "Reading",
  "rating": 4,
  "takeaway": "Dense worldbuilding and striking art."
}
```

Validation rules:

- `title`: 1-255 chars, strips excess whitespace, rejects XSS and injection probes
- `author`: 1-255 chars, rejects XSS and injection probes
- `genre`: optional, max 100 chars, rejects XSS and injection probes
- `status`: `To Read`, `Reading`, or `Finished`
- `rating`: optional, integer from 1 to 5
- `takeaway`: optional, max 2000 chars, rejects embedded script markup

### `GET /books/suggest`

Returns a recommendation derived from the user library. When Gemini is unavailable, the endpoint degrades to a deterministic local fallback instead of returning a server error.

Response:

```json
{
  "suggestion": "Snow Crash",
  "reasoning": "Fast-paced cyberpunk with satirical energy and strong world design.",
  "source": "gemini"
}
```

Possible `source` values:

- `gemini`
- `local`
