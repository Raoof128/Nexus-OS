# Security Policy

## Supported Scope

Security issues are accepted for:

- backend authentication and authorization
- Supabase integration and RLS assumptions
- request validation and prompt-sanitization logic
- audit logging and observability configuration
- dependency and supply-chain concerns

## Security Controls in This Repository

- Supabase JWTs are validated server-side before protected routes run.
- Browser API auth uses backend-managed `HttpOnly`, `Secure` production cookies.
  Login, registration, refresh, session, and password-reset responses expose
  identity metadata only; bearer credentials are not returned to application
  JavaScript. Supabase clients used for recovery are non-persistent and
  historical SDK auth keys are removed during startup, logout, and expiry.
- Private email and media reads use the cookie-authenticated API. The UI uses
  bounded foreground polling and focus refresh instead of browser-owned
  database credentials.
- User-controlled media fields are sanitized and checked for XSS and injection patterns.
- Secure response headers are emitted by the backend middleware layer.
- Audit events log hashed user identifiers rather than raw identities.
- The Gemini prompt path strips markdown fences, masks obvious PII, and treats library data as untrusted input.
- The AI suggestion route is rate-limited to protect quota abuse.
- Outbound email requires an idempotency key and is rate-limited per user and
  connected account. The current idempotency cache is process-local.
- Sensitive takeaway notes can be encrypted before persistence.

## Reporting a Vulnerability

Do not open public issues for active vulnerabilities.

Instead:

1. Prepare a clear reproduction summary.
2. Include affected files, endpoints, and impact.
3. Send the report privately to the repository owner.
