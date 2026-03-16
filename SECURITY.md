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
- Browser auth uses backend-managed `HttpOnly` cookies rather than frontend-readable access tokens.
- User-controlled media fields are sanitized and checked for XSS and injection patterns.
- Secure response headers are emitted by the backend middleware layer.
- Audit events log hashed user identifiers rather than raw identities.
- The Gemini prompt path strips markdown fences, masks obvious PII, and treats library data as untrusted input.
- The AI suggestion route is rate-limited to protect quota abuse.
- Sensitive takeaway notes can be encrypted before persistence.

## Reporting a Vulnerability

Do not open public issues for active vulnerabilities.

Instead:

1. Prepare a clear reproduction summary.
2. Include affected files, endpoints, and impact.
3. Send the report privately to the repository owner.
