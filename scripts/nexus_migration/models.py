"""Validated inputs and catalog evidence for the read-only M00 probe."""

import hashlib
import json
from collections.abc import Sequence
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .scope import NEXUS_TABLES, NEXUS_VIEWS

Identifier = Annotated[str, Field(min_length=1, max_length=63)]
Count = Annotated[int, Field(ge=0)]
Fingerprint = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
RelationKind = Literal["r", "p", "m", "S", "f", "v"]
Treatment = Literal[
    "restore_exact",
    "recreate_equivalent",
    "archive_then_reset",
    "explicitly_out_of_scope",
]


class StrictRecord(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, strict=True, hide_input_in_errors=True
    )


class EndpointProfile(StrictRecord):
    """An explicit managed endpoint selected through the authenticated CLI."""

    project_ref: Annotated[str, Field(pattern=r"^[a-z0-9]{20}$")]
    database_name: Identifier
    expected_fingerprint: Fingerprint | None = None


class CatalogRelation(StrictRecord):
    schema_name: Identifier
    name: Identifier
    kind: RelationKind

    @property
    def key(self) -> tuple[str, str, str]:
        return self.schema_name, self.name, self.kind


class CatalogExtension(StrictRecord):
    name: Identifier
    version: Annotated[str, Field(min_length=1)]


class SourceCatalog(StrictRecord):
    read_only: Literal[True]
    database_oid: Annotated[int, Field(gt=0)]
    database_name: Identifier
    postgres_version_num: Annotated[int, Field(ge=100000)]
    database_bytes: Count
    encoding: Identifier
    collation: Identifier
    storage_buckets: Count
    storage_objects: Count
    large_objects: Count
    publications: Count
    migration_versions: list[Annotated[str, Field(pattern=r"^[0-9]{14}$")]]
    schemas: list[Identifier]
    relations: list[CatalogRelation]
    extensions: list[CatalogExtension]

    @model_validator(mode="after")
    def validate_catalog(self) -> "SourceCatalog":
        schema_names = set(self.schemas)
        relation_keys = {relation.key for relation in self.relations}
        if len(schema_names) != len(self.schemas) or len(relation_keys) != len(
            self.relations
        ):
            raise ValueError("duplicate catalog identifiers")
        if any(relation.schema_name not in schema_names for relation in self.relations):
            raise ValueError("relation references an unlisted schema")
        return self


class AssetDisposition(StrictRecord):
    """Proposed relation treatment. A proposal is not an owner approval."""

    relation: CatalogRelation
    treatment: Treatment
    rationale: str | None = None

    @model_validator(mode="after")
    def validate_rationale(self) -> "AssetDisposition":
        if self.treatment in ("archive_then_reset", "explicitly_out_of_scope") and not (
            self.rationale and self.rationale.strip()
        ):
            raise ValueError("this treatment requires a written rationale")
        return self


class InventoryManifest(StrictRecord):
    profile: EndpointProfile
    catalog: SourceCatalog

    @property
    def source_fingerprint(self) -> str:
        # OIDs are only unique inside a project. Combine the observed OID and
        # name with the explicit project selected by the management API.
        identity = [
            "supabase-managed-catalog-v1",
            self.profile.project_ref,
            self.catalog.database_name,
            self.catalog.database_oid,
        ]
        encoded = json.dumps(identity, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    @model_validator(mode="after")
    def verify_endpoint(self) -> "InventoryManifest":
        if self.profile.database_name != self.catalog.database_name:
            raise ValueError("unexpected database name")
        if (
            self.profile.expected_fingerprint
            and self.profile.expected_fingerprint != self.source_fingerprint
        ):
            raise ValueError("source fingerprint mismatch")
        return self

    def redacted_report(
        self,
        *,
        proposals: Sequence[AssetDisposition] = (),
        target_major: int | None = None,
    ) -> dict:
        catalog = self.catalog
        relation_keys = {relation.key for relation in catalog.relations}
        proposal_keys = {proposal.relation.key for proposal in proposals}
        if len(proposal_keys) != len(proposals) or not proposal_keys <= relation_keys:
            raise ValueError(
                "each treatment must refer to exactly one observed relation"
            )

        source_major = catalog.postgres_version_num // 10000
        observed_tables = {
            r.name
            for r in catalog.relations
            if r.schema_name == "public" and r.kind in {"r", "p", "m", "f"}
        }
        observed_views = {
            r.name
            for r in catalog.relations
            if r.schema_name == "public" and r.kind == "v"
        }
        version_gate = "target_unselected"
        if target_major is not None:
            if target_major < source_major:
                version_gate = "target_older"
            elif target_major > source_major:
                version_gate = "rehearsal_required"
            else:
                version_gate = "same_major"

        return {
            "probe": "managed_catalog",
            "source_fingerprint": self.source_fingerprint,
            "source_pin_verified": self.profile.expected_fingerprint is not None,
            "postgres_version_num": catalog.postgres_version_num,
            "database_bytes": catalog.database_bytes,
            "encoding": catalog.encoding,
            "collation": catalog.collation,
            "schema_count": len(catalog.schemas),
            "durable_relation_count": sum(r.kind != "v" for r in catalog.relations),
            "view_count": sum(r.kind == "v" for r in catalog.relations),
            "extension_count": len(catalog.extensions),
            "storage_buckets": catalog.storage_buckets,
            "storage_objects": catalog.storage_objects,
            "large_objects": catalog.large_objects,
            "publications": catalog.publications,
            "migration_count": len(catalog.migration_versions),
            "latest_migration": max(catalog.migration_versions, default=None),
            "nexus_scope": {
                "present_tables": len(observed_tables & NEXUS_TABLES),
                "missing_tables": sorted(NEXUS_TABLES - observed_tables),
                "present_views": len(observed_views & NEXUS_VIEWS),
                "missing_views": sorted(NEXUS_VIEWS - observed_views),
                "other_public_tables": len(observed_tables - NEXUS_TABLES),
                "other_public_views": len(observed_views - NEXUS_VIEWS),
            },
            "unclassified_relations": len(relation_keys - proposal_keys),
            "independent_scope": {"browser_local": "separate"},
            "version_gate": version_gate,
            # A catalog probe cannot attest to service settings, grants,
            # writers, approved dispositions, or a target's actual capacity.
            "m00_gate": "incomplete",
        }
