# Architecture Overview

## System Summary

Nexus Archive is a split frontend/backend application backed by Supabase:

```mermaid
flowchart LR
  U["User"] --> F["React Frontend"]
  F --> Q["TanStack Query Cache"]
  Q --> A["Litestar API"]
  F --> S["Supabase Auth"]
  A --> D["Supabase Postgres"]
  A --> G["Gemini Recommendation API"]
  A --> O["Audit Logs + Sentry"]
  I["Terraform + Docker"] --> A
  I --> F
```

## Frontend Responsibilities

- authenticate users with Supabase
- cache server state with TanStack Query
- render the personal media dashboard
- lazy-load the AI command palette on demand
- emit frontend telemetry to Sentry when configured

## Backend Responsibilities

- validate Supabase JWT bearer tokens
- exempt health and schema routes from auth
- enforce request schema validation with strict sanitization rules
- isolate Supabase and Gemini calls behind service functions
- emit audit records for sensitive actions
- degrade gracefully to deterministic local suggestions when Gemini fails

## AI Recommendation Flow

```mermaid
sequenceDiagram
  participant Browser
  participant API as Litestar API
  participant Gemini

  Browser->>API: GET /books/suggest
  API->>API: Load books + prune context
  API->>API: Check circuit breaker
  alt Gemini available
    API->>Gemini: Few-shot prompt with pruned context
    Gemini-->>API: Title + reasoning
    API->>API: Record success + audit event
    API-->>Browser: suggestion, reasoning, source=gemini
  else Gemini unavailable or unhealthy
    API->>API: Build local genre-based fallback
    API->>API: Record failure + audit event
    API-->>Browser: suggestion, reasoning, source=local
  end
```

## Trust Boundaries

- Browser to API
- Browser to Supabase Auth
- API to Supabase
- API to Gemini
- CI/CD to Terraform-managed infrastructure

Every boundary validates configuration and input before use.

## Operational Notes

- CORS is restricted to configured frontend origins.
- Allowed hosts are derived from allowed origins.
- Backend returns secure defaults such as CSP, HSTS, `X-Frame-Options`, and `X-Content-Type-Options`.
- `GET /healthz` supports uptime checks and container orchestration probes.
- `GET /schema/swagger` exposes live API docs for stakeholder review and integration work.
