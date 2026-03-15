# API Reference

## Authentication

All backend endpoints require:

```http
Authorization: Bearer <supabase_access_token>
```

## Endpoints

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

- `title`: 1-255 chars
- `author`: 1-255 chars
- `genre`: optional, max 100 chars
- `status`: `To Read`, `Reading`, or `Finished`
- `rating`: optional, integer from 1 to 5
- `takeaway`: optional, max 2000 chars

### `GET /books/suggest`

Returns an AI-assisted recommendation derived from the user book list.

Response:

```json
{
  "suggestion": "Snow Crash",
  "reasoning": "Fast-paced cyberpunk with satirical energy and strong world design."
}
```
