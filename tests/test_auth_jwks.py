"""Regression coverage for bounded Supabase JWKS validation."""

from __future__ import annotations

import base64
import datetime as dt
import json
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from jwt import PyJWKClientError

from backend import auth as auth_module
from backend.config import BackendSettings


class _FakeJwksClient:
    def __init__(self, keys=None, error: Exception | None = None):
        self.keys = keys or []
        self.error = error
        self.refresh_calls = 0
        self.calls = 0

    def get_signing_keys(self, refresh: bool = False):
        self.calls += 1
        if refresh:
            self.refresh_calls += 1
        if self.error:
            raise self.error
        return self.keys


@pytest.fixture(autouse=True)
def _reset_jwks_state():
    auth_module._reset_jwks_lookup_state()
    yield
    auth_module._reset_jwks_lookup_state()


def _unsigned_es256_token(kid: str) -> str:
    def _encode(value: dict) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return ".".join(
        (
            _encode({"alg": "ES256", "kid": kid}),
            _encode({"sub": "user", "aud": "authenticated"}),
            "AA",
        )
    )


def test_unknown_kids_cannot_force_repeated_jwks_refreshes(monkeypatch) -> None:
    client = _FakeJwksClient(keys=[SimpleNamespace(key_id="known")])
    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: client)

    with pytest.raises(jwt.InvalidTokenError, match="signing key"):
        auth_module.decode_supabase_token(_unsigned_es256_token("attacker-one"))

    # Simulate the bounded rotation window elapsing. Exactly one later unknown
    # key may refresh the set; additional attacker-selected kids cannot.
    auth_module._jwks_last_refresh_at -= 61
    for kid in ("attacker-two", "attacker-three"):
        with pytest.raises(jwt.InvalidTokenError, match="signing key"):
            auth_module.decode_supabase_token(_unsigned_es256_token(kid))

    assert client.refresh_calls == 1


def test_jwks_outage_is_backed_off_across_attacker_kids(monkeypatch) -> None:
    client = _FakeJwksClient(error=PyJWKClientError("offline"))
    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: client)

    for kid in ("attacker-one", "attacker-two"):
        with pytest.raises(jwt.InvalidTokenError, match="unavailable"):
            auth_module.decode_supabase_token(_unsigned_es256_token(kid))

    assert client.calls == 1


def test_es256_kid_is_bounded_before_any_jwks_lookup(monkeypatch) -> None:
    client = _FakeJwksClient()
    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: client)

    with pytest.raises(jwt.InvalidTokenError, match="key identifier"):
        auth_module.decode_supabase_token(_unsigned_es256_token("x" * 129))

    assert client.calls == 0


def test_legitimate_es256_token_still_validates(monkeypatch) -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    client = _FakeJwksClient(
        keys=[SimpleNamespace(key_id="production-key", key=public_key)]
    )
    settings = BackendSettings(
        supabase_url="https://project.supabase.co",
        supabase_auth_key="anon-key",
        supabase_jwt_secret="unused-for-es256",
        audit_log_salt="audit-salt",
    )
    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: client)
    monkeypatch.setattr(auth_module, "get_settings", lambda: settings)

    now = dt.datetime.now(dt.timezone.utc)
    token = jwt.encode(
        {
            "sub": "user-123",
            "aud": "authenticated",
            "iss": "https://project.supabase.co/auth/v1",
            "iat": now,
            "exp": now + dt.timedelta(minutes=5),
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "production-key"},
    )

    assert auth_module.decode_supabase_token(token)["sub"] == "user-123"
    assert client.refresh_calls == 0
