# Architecture Overview

## System Summary

Nexus OS is a split frontend/backend media-tracking and job-tracking application backed by Supabase. It prioritizes **Zero-Trust Security** and **Visual Excellence**.

```mermaid
flowchart TD
  subgraph "Client Layer (Browser)"
    F["React Frontend (Vite)"]
    S["Zustand OS State"]
    Q["TanStack Query Cache"]
  end

  subgraph "Security Boundary (API)"
    A["Litestar API"]
    C["HttpOnly Cookie Middleware"]
    V["Pydantic Validation Layer"]
    P["Prompt Sanitization (XML)"]
  end

  subgraph "Persistence & Services"
    Auth["Supabase Auth"]
    DB["Supabase Postgres (RLS)"]
    AI["Gemini Pro API"]
    Audit["Audit Logs + Sentry"]
  end

  F -->|Secure cookies for API| C
  C --> A
  A --> V
  V --> Auth
  V --> DB
  V -->|Sanitized Context| AI
  A --> Audit
```

## Security Invariants

### 1. Zero-Trust Auth

Nexus OS uses a backend-mediated auth flow.

- **API Access Tokens**: Stored in `HttpOnly`, `SameSite=Lax` cookies. Auth
  responses expose only identity metadata; bearer tokens are not available to
  application JavaScript or browser storage.
- **Refresh Flow**: Handled via `/auth/refresh` on the backend, preventing token theft from localStorage.
- **CSRF Protection**: Enforced with `SameSite=Lax`, an `X-Requested-With`
  requirement on state-changing API calls, and credentialed-origin allowlists.
- **Freshness Model**: Private media and email views use bounded foreground
  polling plus focus refresh through the authenticated API. This intentionally
  trades instant cross-tab updates for a smaller browser credential surface.

### 2. AI Prompt Isolation

- **XML Delimiters**: All user context is wrapped in strict XML tags (e.g., `<user_library>`) before being sent to Gemini.
- **PII Masking**: Obvious personally identifiable information is masked before reaching the LLM.
- **Scrubbing**: Markdown fences and injection probes are stripped.

## Frontend OS Shell

### Windowing & Workspace

- **Virtual DOM OS**: Implements a custom windowing system with z-stacking, snapping, and persistence.
- **Settings Engine**: Leverages the View Transitions API for theme switches and wallpaper changes (CSS-only patterns + local 4K images).

### State Management

- **Zustand**: Manages ephemeral OS state (windows, app launcher, taskbar).
- **TanStack Query**: Manages server state, optimistic mutations, bounded
  foreground polling, and focus refresh.

## Backend Service Layer

- **LiteStar Controllers**: Handle routing and dependency injection.
- **Service Layer**: Pure business logic (e.g., `media_service.py`, `chat_service.py`) that interacts with Supabase or Gemini.
- **Data Protection**: Centralized module for encryption and prompt sanitization.

## App Directory Structure (Frontend)

Nexus OS uses a modular application registry. Each "App" is self-contained in `frontend/src/os/apps/`:

- `Library/`: Media tracking (Books, Movies, Anime) and Job Tracker.
- `Email/`: Secure email client with AI drafting.
- `Chat/`: Encrypted AI chat assistant.
- `Auth/`: Unified authentication panels and recovery.
- `Terminal/`: System console and diagnostics.

## Trust Boundaries

1.  **Browser to API**: Secured by HttpOnly cookies, CSRF header checks, allowed
    hosts, and credentialed CORS allowlists.
2.  **API to Supabase**: User requests carry the caller JWT so RLS remains the
    primary tenant boundary; only the background email poller uses service role.
3.  **API to Redis**: Shared rate-limit state; failures fall back to bounded
    per-process limits.
4.  **API to Gemini and email providers**: Server-side credentials, bounded
    inputs, request timeouts, and provider-specific validation.
