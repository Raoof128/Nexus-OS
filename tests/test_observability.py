"""Tests for telemetry credential redaction."""

from backend.observability import _scrub_event


def test_scrub_event_redacts_recovery_headers_case_insensitively() -> None:
    event = {
        "request": {
            "headers": {
                "X-Recovery-Access-Token": "access-secret",
                "x-recovery-refresh-token": "refresh-secret",
                "Content-Type": "application/json",
            }
        }
    }

    scrubbed = _scrub_event(event, {})

    assert scrubbed["request"]["headers"] == {
        "X-Recovery-Access-Token": "[Filtered]",
        "x-recovery-refresh-token": "[Filtered]",
        "Content-Type": "application/json",
    }
