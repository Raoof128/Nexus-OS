# Supabase-to-droplet migration · M00 kickoff

Observed 17 November 2026 (Australia/Sydney). The v4 handoff defines two releases. Release M preserves the complete primary Nexus project on compatible self-hosted Supabase. Release C adds the movie/anime connector after migration stabilisation. Keep the existing Litestar and Pages service boundaries.

The [standalone PostgreSQL target](postgres-target.md) records the later FORMA-style design and the first rehearsal. This catalog remains the source inventory starting point.

## Baseline

- The archive passed ZIP CRC and SHA-256 checks for the four files covered by its QA manifest. It describes work to implement and verify.
- The plan inspected `7adfa9d`. The implementation starts from release `9fe9f0d`, a descendant 48 commits later. Cloudflare Pages reported production deployment `397ff81c` at `9fe9f0d`, and the public API health endpoint returned HTTP 200.
- The migration covers the primary Nexus project. The former Aion project is outside this scope. Browser-local files and desktop settings need their own preservation plan.

## Read-only production evidence

| Surface | Observed |
| --- | --- |
| PostgreSQL | 17.6, UTF8, `en_US.UTF-8`, approximately 83 MiB |
| Database catalog | 10 non-system schemas, 87 durable relations, 4 views, 5 extensions and 2 publications. The scoped audit found 12 Nexus tables, 1 Nexus view and 28 public tables outside the Nexus allowlist. |
| Database behavior | 14 RLS policies and 5 non-internal triggers. Supabase Vault is installed. The catalog did not list pg_cron, pg_net or pgsodium. |
| Migration history | 15 versions, including `20261117000001`. The version list matches the repository. |
| Managed Storage and Functions | 0 buckets, 0 Storage object rows, 0 large objects and 0 deployed Edge Functions at the time of the check |
| Existing droplet | 2 vCPUs, 1.92 GiB total RAM, 0.85 GiB available at the sample |
| Existing root filesystem | 57.08 GiB total and 26.77 GiB available |

Supabase lists 4 GB RAM, 2 cores and 40 GB SSD as minimums for all components. The existing host falls below the RAM minimum before any rehearsal workload is added. Production colocation and image selection remain blocked on an approved resource profile and version compatibility checks. [Supabase Docker requirements](https://supabase.com/docs/guides/self-hosting/docker#system-requirements)

Prefer a supported PostgreSQL 17 destination for rehearsal. The restore plan must explicitly account for service schema compatibility, Auth, migration history and project configuration. [Supabase platform restore guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform)

## Reproduce the redacted catalog probe

Run from the repository root with the project's Python dependencies and an authenticated Supabase CLI. Supply the explicit managed project reference and database name.

```bash
python -m scripts.nexus_migration \
  --project-ref "$NEXUS_SOURCE_PROJECT_REF" \
  --database-name postgres
```

Save the fingerprint in the operator's private profile after verifying the selected project. Use `--expected-fingerprint` on repeat checks. The CLI requests a read-only transaction and validates that PostgreSQL reports read-only mode. It emits counts and the fingerprint. Full catalog names and upstream response diagnostics are excluded from its output. The production repeat check matched the independently observed fingerprint and flagged PostgreSQL 16 as an older target.

The 11 inventory tests passed on Python 3.12, and Ruff passed for the changed Python files.

## M00 acceptance pending

- Classify every discovered asset. Collect private column and constraint signatures, owner/grant/RLS details, publication membership, and encrypted-field checks. Then account for managed settings, enabled identity/MFA methods, Auth hooks, cron, webhooks and other writers.
- Verify how to preserve the existing encryption roots. Keep private operator evidence and credentials outside the repository.
- Select a reviewable target resource profile, measure headroom under rehearsal load and pin the compatible production stack. Production capacity changes and cutover are separate owner decisions.
