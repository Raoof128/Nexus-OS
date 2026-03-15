# Auth Sliding Panels Design

## Overview

Add Register, Forgot Password, and Reset Password flows to the existing login UI using direction-aware sliding panel transitions with cyberpunk depth effects.

## Components

1. **AuthPanel** — Container managing three form states (`login` | `register` | `forgot`) with CSS `translateX` + z-axis depth scaling transitions. Preserves form state across slides.
2. **LoginForm** — Existing form refactored, with links to Register and Forgot Password.
3. **RegisterForm** — Email + password + confirm password. Calls `POST /auth/register`.
4. **ForgotPasswordForm** — Email-only. Calls `POST /auth/forgot-password`.
5. **ResetPasswordPage** — Standalone view rendered when Supabase redirects back with a recovery token. Checks both `window.location.hash` and `searchParams` for the access token. Calls `POST /auth/reset-password`.

## Backend Endpoints

- `POST /auth/register` — Proxies `supabase.auth.sign_up()`, sets HttpOnly session cookies, returns session.
- `POST /auth/forgot-password` — Proxies `supabase.auth.reset_password_email()`. Always returns `{ ok: true }` (no email enumeration).
- `POST /auth/reset-password` — Takes `access_token` + `new_password`, calls Supabase to update user, sets fresh session cookies.

## Animation

- Three panels in a horizontal track, viewport clips to one.
- Direction-aware: login→register slides left, register→login slides right.
- Outgoing panel fades + scales down (z-depth), incoming slides over it.
- Cyberpunk glitch micro-effect on the panel wrapper during transition.

## Security

- All new endpoints behind `enforce_auth_rate_limit` with stricter limits on `/auth/register`.
- Registration inputs sanitized via Pydantic schema (existing validators).
- Forgot password always returns success to prevent email enumeration.
- Reset page redirects to login with "Session expired" if token is missing/invalid.
- Password reset invalidates other sessions via Supabase sign-out.
- Cookies: HttpOnly, Secure, SameSite=Strict (existing cookie infrastructure).

## Data Flow

1. **Register:** Form → `/auth/register` → Supabase sign_up → HttpOnly cookies set → session loaded → Kanban.
2. **Forgot:** Form → `/auth/forgot-password` → Supabase sends email → always show "Check your inbox".
3. **Reset:** User clicks email link → app detects recovery token in hash/params → ResetPasswordPage renders → form → `/auth/reset-password` → Supabase update_user + sign out other sessions → fresh cookies → Kanban.

## Form State Persistence

Parent AuthPanel holds form state for all three forms so switching panels doesn't lose partially-typed input.

## Router Strategy

No router library. Check `window.location.hash` for `type=recovery` + `access_token` on mount. If present, render ResetPasswordPage. Otherwise render AuthPanel.
