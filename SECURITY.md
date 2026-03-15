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
- Health and schema routes are intentionally public for operations and API review.
- User-controlled book fields are sanitized and checked for XSS and injection patterns.
- Secure response headers are emitted by the backend middleware layer.
- Audit events log hashed user identifiers rather than raw identities.
- Secrets stay environment-driven; production deployments should source them from a vault.

## Reporting a Vulnerability

Do not open public issues for active vulnerabilities.

Instead:

1. Prepare a clear reproduction summary.
2. Include affected files, endpoints, and impact.
3. Send the report privately to the repository owner.

## Response Expectations

- Initial triage target: within 5 business days
- Mitigation or remediation plan: as soon as impact is confirmed
