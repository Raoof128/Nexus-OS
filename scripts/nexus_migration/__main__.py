"""Print a redacted managed-source catalog report."""

import argparse
import json

from pydantic import ValidationError

from .inventory import InventoryError, inspect_source
from .models import EndpointProfile


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--database-name", required=True)
    parser.add_argument("--expected-fingerprint")
    parser.add_argument("--target-postgres-major", type=int, choices=range(10, 100))
    args = parser.parse_args()
    try:
        profile = EndpointProfile(
            project_ref=args.project_ref,
            database_name=args.database_name,
            expected_fingerprint=args.expected_fingerprint,
        )
    except ValidationError:
        parser.exit(2, "Invalid endpoint profile.\n")
    try:
        manifest = inspect_source(profile)
    except InventoryError as exc:
        parser.exit(1, f"{exc}\n")
    print(
        json.dumps(
            manifest.redacted_report(target_major=args.target_postgres_major), indent=2
        )
    )


if __name__ == "__main__":
    main()
