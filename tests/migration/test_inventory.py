import json
import subprocess
from copy import deepcopy

import pytest

from scripts.nexus_migration.inventory import (
    InventoryError,
    inspect_source,
    read_cli_result,
)
from scripts.nexus_migration.models import (
    AssetDisposition,
    EndpointProfile,
    InventoryManifest,
    SourceCatalog,
)
from scripts.nexus_migration.scope import nexus_data_dump_filters


@pytest.fixture
def catalog_row():
    return {
        "read_only": True,
        "database_oid": 6144,
        "database_name": "postgres",
        "postgres_version_num": 170006,
        "database_bytes": 8192,
        "encoding": "UTF8",
        "collation": "en_US.UTF-8",
        "storage_buckets": 0,
        "storage_objects": 0,
        "large_objects": 0,
        "publications": 2,
        "migration_versions": ["20261117000001"],
        "extensions": [{"name": "plpgsql", "version": "1.0"}],
        "schemas": ["auth", "public", "private", "custom", "storage"],
        "relations": [
            {"schema_name": "auth", "name": "users", "kind": "r"},
            {"schema_name": "private", "name": "sensitive_name", "kind": "r"},
            {"schema_name": "custom", "name": "new_table", "kind": "p"},
            {"schema_name": "custom", "name": "serial_seq", "kind": "S"},
        ],
    }


@pytest.fixture
def profile():
    return EndpointProfile(project_ref="a" * 20, database_name="postgres")


def test_inventory_covers_nonpublic_and_custom_schemas(catalog_row):
    catalog = SourceCatalog.model_validate(catalog_row)
    relations = {(r.schema_name, r.name, r.kind) for r in catalog.relations}
    assert ("auth", "users", "r") in relations
    assert ("private", "sensitive_name", "r") in relations
    assert ("custom", "new_table", "p") in relations
    assert ("custom", "serial_seq", "S") in relations
    assert "storage" in catalog.schemas


def test_unclassified_asset_blocks_plan(catalog_row, profile):
    manifest = InventoryManifest(profile=profile, catalog=SourceCatalog(**catalog_row))
    proposals = [
        AssetDisposition(relation=relation, treatment="restore_exact")
        for relation in manifest.catalog.relations[:-1]
    ]
    report = manifest.redacted_report(proposals=proposals)
    assert report["unclassified_relations"] == 1
    assert report["m00_gate"] == "incomplete"
    assert "sensitive_name" not in json.dumps(report)
    assert profile.project_ref not in json.dumps(report)


def test_browser_storage_is_separate_from_the_nexus_database(catalog_row, profile):
    manifest = InventoryManifest(profile=profile, catalog=SourceCatalog(**catalog_row))
    scopes = manifest.redacted_report()["independent_scope"]
    assert scopes == {"browser_local": "separate"}


def test_shared_project_inventory_counts_other_tables_without_selecting_them(
    catalog_row, profile
):
    catalog_row["relations"].extend(
        [
            {"schema_name": "public", "name": "media", "kind": "r"},
            {"schema_name": "public", "name": "unrelated_app_table", "kind": "r"},
            {"schema_name": "public", "name": "email_accounts_safe", "kind": "v"},
        ]
    )
    manifest = InventoryManifest(profile=profile, catalog=SourceCatalog(**catalog_row))
    report = manifest.redacted_report()
    assert report["nexus_scope"]["present_tables"] == 1
    assert report["nexus_scope"]["other_public_tables"] == 1
    assert report["nexus_scope"]["missing_views"] == []
    assert "media" not in report["nexus_scope"]["missing_tables"]
    assert "unrelated_app_table" not in json.dumps(report)
    filters = nexus_data_dump_filters()
    assert len(filters) == 12
    assert "--table=public.media" in filters
    assert "--table=public.email_accounts_safe" not in filters
    assert "--table=public.unrelated_app_table" not in filters
    assert report["m00_gate"] == "incomplete"


def test_target_older_than_source_is_blocked(catalog_row, profile):
    manifest = InventoryManifest(profile=profile, catalog=SourceCatalog(**catalog_row))
    assert manifest.redacted_report(target_major=16)["version_gate"] == "target_older"
    assert manifest.redacted_report(target_major=17)["version_gate"] == "same_major"
    assert (
        manifest.redacted_report(target_major=18)["version_gate"]
        == "rehearsal_required"
    )


def test_profile_identity_is_not_hostname_only(catalog_row, profile):
    original = InventoryManifest(profile=profile, catalog=SourceCatalog(**catalog_row))
    catalog_row["database_oid"] += 1
    moved = InventoryManifest(profile=profile, catalog=SourceCatalog(**catalog_row))
    assert original.source_fingerprint != moved.source_fingerprint


def test_unexpected_details_and_unproven_read_only_are_rejected(catalog_row):
    for field, value in (("read_only", False), ("connection_string", "secret")):
        row = dict(catalog_row, **{field: value})
        with pytest.raises(InventoryError, match="invalid catalog"):
            read_cli_result(json.dumps({"rows": [row]}))


def test_inspect_passes_an_explicit_read_only_target(catalog_row, profile, monkeypatch):
    seen = []

    def run(command, **options):
        seen.append((command, options))
        return subprocess.CompletedProcess(
            command, 0, json.dumps({"rows": [catalog_row]}), ""
        )

    monkeypatch.setattr(subprocess, "run", run)
    result = inspect_source(profile)
    assert result.catalog.postgres_version_num == 170006
    command, options = seen[0]
    assert command[:7] == [
        "supabase",
        "db",
        "query",
        f"--remote={profile.project_ref}",
        "--read-only",
        "--output",
        "json",
    ]
    assert options["check"] is True
    assert options["capture_output"] is True


def test_cli_failure_does_not_expose_output(profile, monkeypatch):
    def run(command, **_):
        raise subprocess.CalledProcessError(
            1, command, output="secret", stderr="secret"
        )

    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(InventoryError, match="read-only Supabase query failed") as err:
        inspect_source(profile)
    assert "secret" not in str(err.value)
    assert err.value.__suppress_context__


def test_result_rejects_inconsistent_relations(catalog_row):
    for changes in (
        {"schemas": ["public"]},
        {"relations": catalog_row["relations"] * 2},
    ):
        row = dict(deepcopy(catalog_row), **changes)
        with pytest.raises(InventoryError, match="invalid catalog"):
            read_cli_result(json.dumps({"rows": [row]}))


def test_pinned_source_fails_if_catalog_identity_changes(
    catalog_row, profile, monkeypatch
):
    observed = InventoryManifest(profile=profile, catalog=SourceCatalog(**catalog_row))
    pinned = EndpointProfile(
        project_ref=profile.project_ref,
        database_name=profile.database_name,
        expected_fingerprint=observed.source_fingerprint,
    )

    def run(command, **_):
        return subprocess.CompletedProcess(
            command, 0, json.dumps({"rows": [catalog_row]}), ""
        )

    monkeypatch.setattr(subprocess, "run", run)
    assert inspect_source(pinned).redacted_report()["source_pin_verified"]
    catalog_row["database_oid"] += 1
    with pytest.raises(InventoryError, match="did not match the endpoint profile"):
        inspect_source(pinned)


def test_duplicate_or_unknown_disposition_is_rejected(catalog_row, profile):
    manifest = InventoryManifest(profile=profile, catalog=SourceCatalog(**catalog_row))
    known = AssetDisposition(
        relation=manifest.catalog.relations[0], treatment="restore_exact"
    )
    unknown = AssetDisposition(
        relation={"schema_name": "custom", "name": "missing", "kind": "r"},
        treatment="restore_exact",
    )
    for proposals in ((known, known), (unknown,)):
        with pytest.raises(ValueError, match="exactly one observed relation"):
            manifest.redacted_report(proposals=proposals)
