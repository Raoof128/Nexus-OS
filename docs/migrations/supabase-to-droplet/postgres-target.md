# Standalone PostgreSQL target

The revised Release M target uses PostgreSQL with direct Litestar queries and a separate Better Auth service. FORMA provides the reference for private PostgreSQL and application-owned authentication. The v4 source inventory, backup, rehearsal, and cutover gates still apply. Release C follows the primary Nexus data-platform cutover and stabilisation.

## Target design

- Keep Cloudflare Pages and the Nexus Litestar API. Put PostgreSQL and Better Auth on private endpoints. The production auth routing and cookie integration must be rehearsed through the existing public origin.
- Better Auth owns credentials, sessions and one-time recovery. Litestar resolves the session server-side, then supplies its verified UUID to a non-owner PostgreSQL role as transaction-local context. The app role gets explicit table privileges. Existing RLS policies can use a local `auth.uid()` compatibility function backed by that context.
- Preserve account and record UUIDs. The first candidate for imported email/password accounts is verified email recovery to establish a fresh password. Any hash-compatibility path or migration of linked providers and MFA needs separate verification.
- Preserve application encryption keys and ciphertext. Inventory Supabase Vault usage before transforming the source schema. The migration covers the primary Nexus project after removal of the Aion app.

References: [Better Auth PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql), [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), and [Psycopg pools](https://www.psycopg.org/psycopg3/docs/advanced/pool.html).

## First rehearsal

On 17 November 2026, the harness ran against native PostgreSQL 18.7 on macOS, Node 24 with Better Auth 1.7.23, and Python 3.12 with Litestar and Psycopg. PostgreSQL accepted connections through private Unix sockets. The auth and API listeners used loopback only.

- Applied the six existing Media Vault schema migrations and used Nexus's existing media input validation. A synthetic user signed in, created a movie, marked it finished, and saved a rating.
- A second user saw an empty list and received 404 when attempting to change the owner's movie using its known ID. The next owner read still returned the original record. A write without the required origin and CSRF header was denied.
- Password reset delivered a synthetic token to a local outbox. The token could be used once. The reset revoked the old session and old password. A synthetic imported account established a password and recovered the movie attached to its original UUID.
- A custom-format `pg_dump` restored into a second, freshly initialised PostgreSQL cluster with matching roles. A source session was rejected after auth-secret rotation. A fresh login retrieved the movie with the original IDs, status, and rating.
- Across two steady-state snapshots, Better Auth used 148–154 MiB RSS and Litestar used 84–86 MiB. PostgreSQL process RSS summed to 74–87 MiB, including shared pages counted in multiple processes. Linux memory limits and concurrent password-hashing and backup peaks still need measurement.

## Run it locally

Use Node 24, `uv`, and the path to local PostgreSQL server and client binaries. Run from the repository root.

```bash
npm --prefix scripts/nexus_migration/rehearsal ci --ignore-scripts
uv run --no-project --python 3.12 --with-editable . \
  --with 'psycopg[binary,pool]~=3.3.9' \
  python -m scripts.nexus_migration.rehearsal --pg-bin /opt/homebrew/opt/postgresql@18/bin
```

The harness allocates its own database clusters and credentials, imports only synthetic fixtures, and cleans up its processes, outbox, and dump on exit. Recovery email is represented by the local outbox.

## Migration start and shared-source scope

Read-only verification on 17 November 2026 found all 12 Nexus tables and the Nexus-owned view. The shared source also contains 28 public tables outside the Nexus allowlist. PostgreSQL reported zero foreign keys crossing between those two groups. The Nexus view is rebuilt from the migrations. The transfer uses exact schema-qualified table filters for the 12 Nexus tables.

The source has two verified email accounts, including one account whose UUID owns Nexus records. No anonymous accounts, MFA factors, linked non-email identities, Storage objects, or Vault entries were present at this check. Confirm the exact Nexus account membership in a private allowlist before exporting identities. Scope any source freeze to Nexus traffic and writers so the shared project can continue serving its other data.

### Linux rehearsal evidence

PostgreSQL 17.12 ran in an isolated Linux ARM64 container with a 768 MiB RAM limit, zero additional swap allowance and 1.5 CPUs. The latest synthetic fixture run peaked at **376.5 MiB** and included four concurrent sign-ins launched alongside a backup. A droplet-sized rehearsal with representative data and concurrent request load is still needed.

All 15 repository migrations replayed. The harness seeded all 12 Nexus tables, including linked chat, tasks, notes and email records, and synthetic ciphertext for notes and mail tokens. It verified exact scoped row contents after both a full backup recovery and a separate data-only transfer. That second source contained an unrelated table and an extra identity. Both were excluded by the target check. The database runs used synthetic data throughout.

Run from the repository root with a local Docker engine.

```bash
docker build -t nexus-db-rehearsal:local -f scripts/nexus_migration/rehearsal/Dockerfile .
docker run --rm --network none --memory 768m --memory-swap 768m \
  --cpus 1.5 nexus-db-rehearsal:local
```

## Nexus application rehearsal

The Nexus backend selects Better Auth and direct PostgreSQL when `NEXUS_DATABASE_URL` and `NEXUS_AUTH_URL` are configured. The mail poller uses its own `NEXUS_MAIL_DATABASE_URL` and a role scoped to the mail tables. The frontend build selects direct password recovery with `VITE_NEXUS_AUTH=standalone`. That build omits the legacy browser Supabase client.

The isolated suite passed on PostgreSQL 17.12 in Linux and PostgreSQL 18.7 on macOS. It uses the Nexus API, Better Auth, all 15 schema migrations, two synthetic accounts, and RLS-enabled database roles. It checks sign-in, refresh, one-time password recovery and revocation, account isolation, encrypted media and notes, chat sessions, and Inbox search, pagination, and draft saves. Four concurrent task completions created one successor. Chromium covered password recovery, Media Vault, cached Inbox, chat sessions, local Notes, and Control Panel against the same application. The browser test set its clock to Australia/Sydney and observed zero reminders before the deadline and one across two tabs when the timer fired.

For the browser run, install the existing frontend dependencies and Playwright Chromium. Use Node 24 and Python 3.12. Run from the repository root.

```bash
npm --prefix scripts/nexus_migration/rehearsal ci --ignore-scripts
npm --prefix frontend ci
./frontend/node_modules/.bin/playwright install chromium
uv run --no-project --python 3.12 --with-editable '.[standalone]' \
  python -m scripts.nexus_migration.rehearsal.app_e2e \
  --pg-bin /opt/homebrew/opt/postgresql@18/bin --browser
```

The Linux image can run the application API checks on PostgreSQL 17 with networking disabled.

```bash
docker run --rm --network none --memory 768m --memory-swap 768m --cpus 1.5 \
  --entrypoint /usr/local/bin/python nexus-db-rehearsal:local \
  -m scripts.nexus_migration.rehearsal.app_e2e --pg-bin /usr/lib/postgresql/17/bin
```

## Pre-cutover gates

See the [production cutover log](production-cutover.md) for the final outcome and follow-up.

- Validate Linux x86-64 resource budgets with a representative Nexus workload and a backup running together. The local PostgreSQL 17.12 synthetic run provides the initial compatibility and memory measurements.
- Finish the production source inventory and write the reviewed source-to-target table and identity mapping for the full primary project. Test actual encrypted fields, role separation, MFA and linked identity handling, and the external SMTP recovery flow.
- Provision the private Better Auth and PostgreSQL services, exercise the production-origin cookie flow on isolated staging, and check Gmail, Microsoft, Gemini and SMTP with test credentials.
- Rehearse a full off-host backup restore and recovery. Prepare the freeze, rotation, cutover and rollback steps for separate production approval.
