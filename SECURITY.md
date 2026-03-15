# Security Policy

## Supported Scope

Security issues are accepted for:

- backend authentication and authorization
- Supabase integration
- environment variable handling
- dependency and supply-chain concerns
- API exposure and data validation issues

## Reporting a Vulnerability

Do not open public issues for active vulnerabilities.

Instead:

1. Prepare a clear reproduction summary.
2. Include affected files, endpoints, and impact.
3. Send the report privately to the repository owner.

## Response Expectations

- Initial triage target: within 5 business days
- Mitigation or remediation plan: as soon as impact is confirmed

## Security Expectations for Contributors

- Never commit secrets or real credentials.
- Preserve strict JWT validation and restricted CORS behavior.
- Keep Supabase RLS assumptions explicit in schema and docs.
- Validate all user-controlled input before persistence or downstream API use.
