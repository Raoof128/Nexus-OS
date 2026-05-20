# API Reference

## Public Endpoints

- `GET /healthz`
- `GET /schema/swagger`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

## Authentication Model

Protected routes use server-managed `HttpOnly` cookies. The browser never reads the Supabase access token directly.

- **access_token**: 15m lifetime.
- **refresh_token**: 7d lifetime.

---

## Auth Endpoints

### `POST /auth/login`

Validates credentials against Supabase and issues secure cookies.
**Body:** `{ "email": "...", "password": "..." }`

### `POST /auth/refresh`

Rotates the session using the `refresh_token` cookie.

### `POST /auth/logout`

Revokes the session and clears cookies.

---

## Media Endpoints

### `GET /media`

Returns paginated media. Supports `type` (book, movie, anime, job) filter.

### `POST /media`

Creates a entry.

- **Sanitization**: All strings are stripped of `<script>` and `<iframe>` tags.
- **Validation**: Rating must be 1-5. Status must match the specific media type pipeline.

### `PUT /media/{id}`

Updates an entry. Triggers a Realtime event to other connected clients.

### `DELETE /media/{id}`

Deletes an entry.

### `GET /media/suggest`

Consumes shared AI quota. Returns a suggested title + reasoning.

---

## Chat Endpoints

### `GET /chat/sessions`

Returns user chat history.

### `POST /chat/sessions`

Starts a new session. Category determines the UI accent color.

### `DELETE /chat/sessions/{id}`

Deletes the session and all associated messages.

### `POST /chat/sessions/{id}/messages`

Sends a message. Sanitized history is sent to Gemini. Response is encrypted at rest if `TAKEAWAY_ENCRYPTION_KEY` is set.

---

---

## Settings Endpoints

### `GET /settings/wallpapers` (Planned)

Returns a list of available CSS patterns and image presets. (Currently hardcoded in `settingsStore.js` and managed via LocalStorage for speed).

### `PUT /settings/theme` (Planned)

Persists the user's preferred theme and wallpaper ID to the database for cross-device synchronization. (Currently state is localized to the browser).
