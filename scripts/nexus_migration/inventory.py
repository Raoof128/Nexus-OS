"""Query catalog metadata through Supabase CLI without exporting user data."""

import json
import subprocess

from pydantic import ValidationError

from .models import EndpointProfile, InventoryManifest, SourceCatalog

CATALOG_QUERY = """
WITH namespaces AS (
    SELECT oid, nspname
    FROM pg_namespace
    WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
),
relations AS (
    SELECT n.nspname AS schema_name, c.relname AS name, c.relkind::text AS kind
    FROM pg_class c
    JOIN namespaces n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'm', 'S', 'f', 'v')
)
SELECT
    current_setting('transaction_read_only')::boolean AS read_only,
    oid::bigint AS database_oid,
    datname AS database_name,
    current_setting('server_version_num')::integer AS postgres_version_num,
    pg_database_size(datname) AS database_bytes,
    pg_encoding_to_char(encoding) AS encoding,
    datcollate AS collation,
    (SELECT count(*) FROM storage.buckets) AS storage_buckets,
    (SELECT count(*) FROM storage.objects) AS storage_objects,
    (SELECT count(*) FROM pg_largeobject_metadata) AS large_objects,
    (SELECT count(*) FROM pg_publication) AS publications,
    COALESCE((
        SELECT json_agg(version ORDER BY version)
        FROM supabase_migrations.schema_migrations
    ), '[]'::json) AS migration_versions,
    COALESCE((
        SELECT json_agg(json_build_object('name', extname, 'version', extversion)
                        ORDER BY extname)
        FROM pg_extension
    ), '[]'::json) AS extensions,
    COALESCE((SELECT json_agg(nspname ORDER BY nspname) FROM namespaces),
             '[]'::json) AS schemas,
    COALESCE((SELECT json_agg(r ORDER BY schema_name, name, kind) FROM relations r),
             '[]'::json) AS relations
FROM pg_database
WHERE datname = current_database()
"""


class InventoryError(RuntimeError):
    """A redacted operator-facing inventory failure."""


def read_cli_result(stdout: str) -> SourceCatalog:
    try:
        response = json.loads(stdout)
        if not isinstance(response, dict):
            raise ValueError
        rows = response.get("rows")
        if not isinstance(rows, list) or len(rows) != 1:
            raise ValueError
        return SourceCatalog.model_validate(rows[0])
    except (ValueError, ValidationError):
        raise InventoryError("Supabase returned an invalid catalog response.") from None


def inspect_source(profile: EndpointProfile) -> InventoryManifest:
    command = [
        "supabase",
        "db",
        "query",
        f"--remote={profile.project_ref}",
        "--read-only",
        "--output",
        "json",
        CATALOG_QUERY,
    ]
    try:
        result = subprocess.run(
            command, capture_output=True, check=True, text=True, timeout=30
        )
    except (OSError, subprocess.SubprocessError, UnicodeError):
        # CLI output may name a private project or include upstream diagnostics.
        raise InventoryError("The read-only Supabase query failed.") from None

    try:
        return InventoryManifest(
            profile=profile, catalog=read_cli_result(result.stdout)
        )
    except ValidationError:
        raise InventoryError(
            "The observed source did not match the endpoint profile."
        ) from None
