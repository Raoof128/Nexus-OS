"""Tests for audit record shape, privacy rules and the media mutation audit calls."""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from litestar.exceptions import HTTPException
from litestar.testing import TestClient

from backend import audit_logger as audit_mod
from backend.app import app
from backend.audit_logger import (
    ALLOWED_METADATA_KEYS,
    MAX_STRING_LENGTH,
    _hash_user_id,
    hash_identifier,
    log_audit_event,
    sanitize_metadata,
)
from backend.rate_limit import AI_RATE_LIMIT_EVENT, _enforce_ai

AUDIT_LOGGER = "nexus.audit"
RAW_USER_ID = "user-123"


@dataclass
class FakeSupabaseResponse:
    """Minimal Supabase response stub."""

    data: list[dict] | None = None


def _audit_records(caplog) -> list[logging.LogRecord]:
    return [
        r
        for r in caplog.records
        if r.name == AUDIT_LOGGER and r.levelno == logging.INFO
    ]


def _parse(record: logging.LogRecord) -> dict:
    return json.loads(record.getMessage())


@pytest.fixture()
def audit_caplog(caplog):
    caplog.set_level(logging.INFO, logger=AUDIT_LOGGER)
    return caplog


class TestRecordShape:
    def test_record_has_action_request_id_user_hash_and_metadata(self, audit_caplog):
        log_audit_event("media.delete", RAW_USER_ID, {"media_id": "m-1"})

        (record,) = _audit_records(audit_caplog)
        payload = _parse(record)
        assert set(payload) == {"action", "request_id", "user_hash", "metadata"}
        assert payload["action"] == "media.delete"
        assert payload["metadata"] == {"media_id": "m-1"}

    def test_raw_user_id_is_not_logged(self, audit_caplog):
        log_audit_event("media.delete", RAW_USER_ID, {"media_id": "m-1"})

        (record,) = _audit_records(audit_caplog)
        assert RAW_USER_ID not in record.getMessage()
        assert _parse(record)["user_hash"] != RAW_USER_ID

    def test_user_hash_is_stable_for_same_salt(self):
        assert _hash_user_id(RAW_USER_ID) == _hash_user_id(RAW_USER_ID)

    def test_user_hash_changes_with_salt(self, monkeypatch):
        first = _hash_user_id(RAW_USER_ID)
        monkeypatch.setattr(
            audit_mod,
            "get_settings",
            lambda: SimpleNamespace(audit_log_salt="a-different-salt"),
        )
        assert _hash_user_id(RAW_USER_ID) != first

    def test_hash_identifier_matches_user_hash_for_same_value(self):
        assert hash_identifier(RAW_USER_ID) == _hash_user_id(RAW_USER_ID)

    def test_request_id_is_taken_from_request_context(self, audit_caplog):
        token = audit_mod.request_id_var.set("req-abc")
        try:
            log_audit_event("media.delete", RAW_USER_ID, {"media_id": "m-1"})
        finally:
            audit_mod.request_id_var.reset(token)

        (record,) = _audit_records(audit_caplog)
        assert _parse(record)["request_id"] == "req-abc"


class TestMetadataAllowlist:
    def test_allowed_keys_are_kept(self):
        clean = sanitize_metadata("media.create", {"type": "book", "status": "To Read"})
        assert clean == {"type": "book", "status": "To Read"}

    def test_rate_limit_event_keeps_feature(self, audit_caplog):
        # Regression: ai.rate_limited had no schema, so feature was dropped.
        class _Limited:
            def enforce(self, key: str) -> None:
                raise HTTPException(status_code=429, detail="slow down")

        with pytest.raises(HTTPException):
            _enforce_ai(RAW_USER_ID, "suggest", _Limited())

        (record,) = _audit_records(audit_caplog)
        payload = _parse(record)
        assert payload["action"] == AI_RATE_LIMIT_EVENT
        assert payload["metadata"] == {"feature": "suggest"}
        assert RAW_USER_ID not in record.getMessage()

    @pytest.mark.parametrize("outcome", ["success", "failure"])
    def test_outcome_accepts_only_documented_values(self, outcome):
        assert sanitize_metadata("auth.login", {"outcome": outcome}) == {
            "outcome": outcome
        }

    @pytest.mark.parametrize("outcome", ["denied", "jane@example.com", "", None])
    def test_outcome_with_other_value_is_dropped(self, outcome):
        assert sanitize_metadata("auth.login", {"outcome": outcome}) == {}

    def test_unexpected_key_is_dropped_and_its_value_never_logged(self, audit_caplog):
        secret = "pii-value-should-not-appear@example.com"
        log_audit_event(
            "media.update",
            RAW_USER_ID,
            {"media_id": "m-1", "email": secret},
        )

        (record,) = _audit_records(audit_caplog)
        assert secret not in record.getMessage()
        assert _parse(record)["metadata"] == {"media_id": "m-1"}
        assert any("email" in r.getMessage() for r in audit_caplog.records)

    @pytest.mark.parametrize(
        "value",
        [["a", "b"], {"nested": 1}, uuid.UUID(int=1), object()],
    )
    def test_non_scalar_value_is_dropped(self, audit_caplog, value):
        log_audit_event("media.update", RAW_USER_ID, {"media_id": value})

        (record,) = _audit_records(audit_caplog)
        assert _parse(record)["metadata"] == {}

    def test_non_finite_float_is_dropped(self):
        clean = sanitize_metadata("media.suggest", {"library_size": float("nan")})
        assert clean == {}

    def test_long_string_is_capped(self):
        clean = sanitize_metadata("media.update", {"media_id": "x" * 500})
        assert len(clean["media_id"]) == MAX_STRING_LENGTH

    def test_unknown_action_logs_no_metadata(self, audit_caplog):
        log_audit_event("not.a.real.action", RAW_USER_ID, {"media_id": "m-1"})

        (record,) = _audit_records(audit_caplog)
        assert _parse(record)["metadata"] == {}

    def test_every_schema_key_is_a_string_set(self):
        for action, keys in ALLOWED_METADATA_KEYS.items():
            assert isinstance(action, str)
            assert all(isinstance(key, str) for key in keys)


class TestTotalSerialization:
    def test_uuid_and_circular_metadata_do_not_raise(self, audit_caplog):
        circular: dict = {}
        circular["self"] = circular

        log_audit_event(
            "media.update",
            RAW_USER_ID,
            {"media_id": uuid.uuid4(), "loop": circular},
        )

        (record,) = _audit_records(audit_caplog)
        assert _parse(record)["metadata"] == {}

    def test_serialization_failure_writes_fallback_record(
        self, audit_caplog, monkeypatch
    ):
        circular: dict = {}
        circular["self"] = circular
        monkeypatch.setattr(
            audit_mod,
            "sanitize_metadata",
            lambda action, metadata: circular,
        )

        log_audit_event("media.update", RAW_USER_ID, {"media_id": "m-1"})

        (record,) = _audit_records(audit_caplog)
        payload = _parse(record)
        assert payload["metadata"] == {}
        assert payload["metadata_error"] is True
        assert payload["action"] == "media.update"


@pytest.fixture()
def media_client():
    with TestClient(app=app, base_url="http://testserver.local") as tc:
        yield tc


@pytest.fixture()
def _inject_auth(monkeypatch):
    """Inject an authenticated user without a real JWT (mirrors test_controllers)."""

    from backend import auth as auth_mod

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if not path.startswith(("/healthz", "/schema", "/auth")):
                scope.setdefault("state", {})["user_id"] = RAW_USER_ID
                scope["state"]["auth_payload"] = {
                    "sub": RAW_USER_ID,
                    "email": "test@nexus.net",
                    "exp": 9999999999,
                    "iat": 1000000000,
                    "aud": "authenticated",
                }
                scope["state"]["access_token"] = "fake-access-token"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)


MEDIA_ROW = {
    "id": "m-1",
    "user_id": RAW_USER_ID,
    "type": "book",
    "title": "Dune",
    "creator": "Herbert",
    "status": "To Read",
    "genre": None,
    "rating": None,
    "takeaway": None,
    "sub_info": None,
}


@pytest.mark.usefixtures("_inject_auth")
class TestMediaMutationsAudited:
    """Each media mutation writes exactly one nexus.audit record."""

    @staticmethod
    def _mock_client(response: FakeSupabaseResponse) -> MagicMock:
        builder = MagicMock()
        builder.insert.return_value = builder
        builder.update.return_value = builder
        builder.delete.return_value = builder
        builder.eq.return_value = builder
        builder.execute.return_value = response
        client = MagicMock()
        client.from_.return_value = builder
        return client

    @patch("backend.controllers._get_user_client")
    def test_create_logs_one_media_create_event(
        self, mock_client_fn, media_client, audit_caplog
    ):
        mock_client_fn.return_value = self._mock_client(
            FakeSupabaseResponse(data=[MEDIA_ROW])
        )

        response = media_client.post(
            "/media",
            json={"type": "book", "title": "Dune", "creator": "Herbert"},
        )

        assert response.status_code in (200, 201)
        (record,) = _audit_records(audit_caplog)
        payload = _parse(record)
        assert payload["action"] == "media.create"
        assert payload["metadata"] == {"type": "book", "status": "To Read"}
        assert RAW_USER_ID not in record.getMessage()

    @patch("backend.controllers._get_user_client")
    def test_update_logs_one_media_update_event(
        self, mock_client_fn, media_client, audit_caplog
    ):
        mock_client_fn.return_value = self._mock_client(
            FakeSupabaseResponse(data=[{**MEDIA_ROW, "status": "Finished"}])
        )

        response = media_client.put("/media/m-1", json={"status": "Finished"})

        assert response.status_code == 200
        (record,) = _audit_records(audit_caplog)
        payload = _parse(record)
        assert payload["action"] == "media.update"
        assert payload["metadata"] == {"media_id": "m-1"}

    @patch("backend.controllers._get_user_client")
    def test_delete_logs_one_media_delete_event(
        self, mock_client_fn, media_client, audit_caplog
    ):
        mock_client_fn.return_value = self._mock_client(FakeSupabaseResponse(data=[]))

        response = media_client.delete("/media/m-1")

        assert response.status_code in (200, 204)
        (record,) = _audit_records(audit_caplog)
        payload = _parse(record)
        assert payload["action"] == "media.delete"
        assert payload["metadata"] == {"media_id": "m-1"}
