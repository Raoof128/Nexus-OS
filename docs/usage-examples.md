# Usage Examples

## Example Product Framing

Nexus Archive is meant to hold:

- anime lists
- movie lists
- book lists
- ratings and notes
- what is planned, in progress, or completed

## Example User Story

> I want one account where I can manage every anime, movie, and book I care about, rate them, leave notes, and get recommendations based on what I already like.

## API Example

```bash
curl http://127.0.0.1:8000/books \
  -H "Authorization: Bearer <token>"
```

## Frontend Example Env

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://127.0.0.1:8000
```

## Backend Example Env

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
GEMINI_API_KEY=optional-key
```
