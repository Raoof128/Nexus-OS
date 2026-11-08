"""Tests for the Supabase JWT decoder and SupabaseAuthMiddleware.

The test app is a minimal Litestar application that mounts only the auth
middleware. It does not import backend.app, whose module-level startup hooks
and global middleware would interfere with these checks.
"""

from __future__ import annotations

import base64
import json
import logging
import threading
import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from litestar import Litestar, Request, get, post
from litestar.exceptions import ServiceUnavailableException
from litestar.status_codes import HTTP_200_OK
from litestar.testing import TestClient

import backend.auth as auth_mod
from backend.auth import SupabaseAuthMiddleware, _is_public_path
from backend.config import get_settings

# HMAC keys shorter than the SHA-256 digest size trigger PyJWT's
# InsecureKeyLengthWarning, so the test secret is 32 bytes or more.
TEST_SECRET = "test-secret-" + "x" * 32
COOKIE_NAME = "nexus-access-token"


@pytest.fixture(autouse=True)
def _jwt_secret(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SECRET)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _issuer() -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/auth/v1"


def _claims(**overrides: Any) -> dict[str, Any]:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": "user-123",
        "aud": "authenticated",
        "iss": _issuer(),
        "iat": now,
        "exp": now + 3600,
        "email": "user@example.com",
    }
    for key, value in overrides.items():
        if value is None:
            claims.pop(key, None)
        else:
            claims[key] = value
    return claims


def _hs256(claims: dict[str, Any], secret: str = TEST_SECRET) -> str:
    return jwt.encode(claims, secret, algorithm="HS256")


def _unsigned_token(header: dict[str, Any], claims: dict[str, Any]) -> str:
    def enc(obj: dict[str, Any]) -> str:
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{enc(header)}.{enc(claims)}."


class _StubSigningKey:
    def __init__(self, key: Any) -> None:
        self.key = key


class _StubJWKSClient:
    """Stands in for PyJWKClient. Returns a fixed key or raises a fixed error."""

    def __init__(self, key: Any = None, error: Exception | None = None) -> None:
        self._key = key
        self._error = error

    def get_signing_key_from_jwt(self, token: str) -> _StubSigningKey:
        if self._error is not None:
            raise self._error
        return _StubSigningKey(self._key)


@pytest.fixture(scope="module")
def es256_keys() -> tuple[Any, Any]:
    private = ec.generate_private_key(ec.SECP256R1())
    return private, private.public_key()


def _es256_token(private_key: Any, **overrides: Any) -> str:
    return jwt.encode(
        _claims(**overrides),
        private_key,
        algorithm="ES256",
        headers={"kid": "test-kid"},
    )


def _use_jwks(monkeypatch: pytest.MonkeyPatch, client: _StubJWKSClient) -> None:
    monkeypatch.setattr(auth_mod, "_get_jwks_client", lambda: client)


# --- Minimal application -----------------------------------------------------


@get("/healthz", status_code=HTTP_200_OK)
async def _healthz() -> dict[str, str]:
    return {"ok": "true"}


@get("/schema", status_code=HTTP_200_OK)
async def _schema_root() -> dict[str, str]:
    return {"ok": "true"}


@get("/schema/openapi.json", status_code=HTTP_200_OK)
async def _schema_json() -> dict[str, str]:
    return {"ok": "true"}


@post("/auth/login", status_code=HTTP_200_OK)
async def _login() -> dict[str, str]:
    return {"ok": "true"}


@post("/auth/refresh", status_code=HTTP_200_OK)
async def _refresh() -> dict[str, str]:
    return {"ok": "true"}


@post("/auth/logout", status_code=HTTP_200_OK)
async def _logout() -> dict[str, str]:
    return {"ok": "true"}


@get("/auth/session", status_code=HTTP_200_OK)
async def _session() -> dict[str, str]:
    return {"ok": "true"}


@get("/auth/me", status_code=HTTP_200_OK)
async def _unlisted_auth_route() -> dict[str, str]:
    return {"ok": "true"}


@get("/authentication", status_code=HTTP_200_OK)
async def _authentication() -> dict[str, str]:
    return {"ok": "true"}


@get("/tasks", status_code=HTTP_200_OK)
async def _get_tasks(request: Request) -> dict[str, Any]:
    state = request.state
    return {
        "user_id": state.user_id,
        "sub": state.auth_payload["sub"],
        "access_token": state.access_token,
    }


@post("/tasks", status_code=HTTP_200_OK)
async def _post_tasks() -> dict[str, str]:
    return {"ok": "true"}


@pytest.fixture
def client() -> Any:
    app = Litestar(
        route_handlers=[
            _healthz,
            _schema_root,
            _schema_json,
            _login,
            _refresh,
            _logout,
            _session,
            _unlisted_auth_route,
            _authentication,
            _get_tasks,
            _post_tasks,
        ],
        middleware=[SupabaseAuthMiddleware],
        openapi_config=None,
    )
    with TestClient(app=app) as test_client:
        yield test_client


# --- Public path rules -------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/healthz"),
        ("GET", "/schema"),
        ("GET", "/schema/"),
        ("GET", "/schema/openapi.json"),
        ("HEAD", "/healthz"),
        ("POST", "/auth/login"),
        ("POST", "/auth/refresh"),
        ("POST", "/auth/logout"),
        ("POST", "/auth/register"),
        ("POST", "/auth/forgot-password"),
        ("POST", "/auth/reset-password"),
        ("GET", "/auth/session"),
    ],
)
def test_public_routes_are_allowed(method: str, path: str) -> None:
    assert _is_public_path(method, path) is True


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/healthz"),  # healthz is GET-only
        ("GET", "/auth/me"),  # unlisted /auth sub-path is protected
        ("GET", "/auth/login"),  # listed path, wrong method
        ("POST", "/auth/session"),  # listed path, wrong method
        ("POST", "/schema"),  # schema docs are GET-only
        ("GET", "/schemas"),
        ("GET", "/authentication"),  # prefix collision with /auth
        ("GET", "/authx"),
        ("GET", "/healthz/x"),
        ("GET", "/tasks"),
        ("DELETE", "/auth/login"),
    ],
)
def test_protected_routes_are_not_public(method: str, path: str) -> None:
    assert _is_public_path(method, path) is False


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/healthz"),
        ("POST", "/auth/login"),
        ("GET", "/auth/session"),
        ("GET", "/schema/openapi.json"),
    ],
)
def test_public_routes_bypass_auth_in_app(client: Any, method: str, path: str) -> None:
    response = client.request(method, path)
    assert response.status_code == HTTP_200_OK


def test_unlisted_auth_route_requires_token(client: Any) -> None:
    assert client.get("/auth/me").status_code == 401


def test_authentication_prefix_collision_requires_token(client: Any) -> None:
    assert client.get("/authentication").status_code == 401


def test_options_preflight_bypasses_auth(client: Any) -> None:
    response = client.request("OPTIONS", "/tasks")
    assert response.status_code not in (401, 403)


# --- Token extraction and precedence -----------------------------------------


def test_missing_token_returns_401(client: Any) -> None:
    assert client.get("/tasks").status_code == 401


def test_valid_bearer_token_populates_state(client: Any) -> None:
    token = _hs256(_claims())
    response = client.get("/tasks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == HTTP_200_OK
    body = response.json()
    assert body == {"user_id": "user-123", "sub": "user-123", "access_token": token}


def test_bearer_takes_precedence_over_cookie(client: Any) -> None:
    good = _hs256(_claims(sub="from-bearer"))
    bad_cookie = "not-a-token"
    response = client.get(
        "/tasks",
        headers={"Authorization": f"Bearer {good}"},
        cookies={COOKIE_NAME: bad_cookie},
    )
    assert response.status_code == HTTP_200_OK
    assert response.json()["user_id"] == "from-bearer"


def test_invalid_bearer_does_not_fall_back_to_valid_cookie(client: Any) -> None:
    good_cookie = _hs256(_claims())
    response = client.get(
        "/tasks",
        headers={"Authorization": "Bearer not-a-token"},
        cookies={COOKIE_NAME: good_cookie},
    )
    assert response.status_code == 401


def test_non_bearer_authorization_falls_back_to_cookie(client: Any) -> None:
    token = _hs256(_claims())
    response = client.get(
        "/tasks",
        headers={"Authorization": f"Token {token}"},
        cookies={COOKIE_NAME: token},
    )
    assert response.status_code == HTTP_200_OK
    assert response.json()["user_id"] == "user-123"


def test_non_bearer_authorization_without_cookie_returns_401(client: Any) -> None:
    token = _hs256(_claims())
    response = client.get("/tasks", headers={"Authorization": f"Token {token}"})
    assert response.status_code == 401


def test_empty_bearer_value_returns_401(client: Any) -> None:
    response = client.get("/tasks", headers={"Authorization": "Bearer "})
    assert response.status_code == 401


# --- HS256 claim and algorithm rejection --------------------------------------


@pytest.mark.parametrize(
    "token_factory",
    [
        pytest.param(
            lambda: _unsigned_token({"alg": "none", "typ": "JWT"}, _claims()),
            id="alg-none",
        ),
        pytest.param(
            lambda: _unsigned_token({"typ": "JWT"}, _claims()),
            id="alg-missing",
        ),
        pytest.param(
            lambda: jwt.encode(_claims(), TEST_SECRET, algorithm="HS512"),
            id="alg-hs512",
        ),
        pytest.param(lambda: _hs256(_claims(aud="anon")), id="wrong-aud"),
        pytest.param(
            lambda: _hs256(_claims(iss="https://evil.example/auth/v1")),
            id="wrong-iss",
        ),
        pytest.param(lambda: _hs256(_claims(exp=int(time.time()) - 60)), id="expired"),
        pytest.param(lambda: _hs256(_claims(exp=None)), id="missing-exp"),
        pytest.param(lambda: _hs256(_claims(iat=None)), id="missing-iat"),
        pytest.param(lambda: _hs256(_claims(sub=None)), id="missing-sub"),
        pytest.param(lambda: _hs256(_claims(aud=None)), id="missing-aud"),
        pytest.param(
            lambda: _hs256(_claims(), secret="wrong-" * 6), id="bad-signature"
        ),
    ],
)
def test_invalid_hs256_tokens_return_401(client: Any, token_factory: Any) -> None:
    response = client.get(
        "/tasks", headers={"Authorization": f"Bearer {token_factory()}"}
    )
    assert response.status_code == 401


def test_empty_subject_returns_401(client: Any) -> None:
    token = _hs256(_claims(sub=""))
    response = client.get("/tasks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_decode_rejects_malformed_header() -> None:
    with pytest.raises(jwt.InvalidTokenError):
        auth_mod.decode_supabase_token("not-a-jwt")


# --- ES256 via JWKS ----------------------------------------------------------


def test_valid_es256_token_is_accepted(
    client: Any, monkeypatch: pytest.MonkeyPatch, es256_keys: tuple[Any, Any]
) -> None:
    private, public = es256_keys
    _use_jwks(monkeypatch, _StubJWKSClient(key=public))
    response = client.get(
        "/tasks",
        headers={"Authorization": f"Bearer {_es256_token(private)}"},
    )
    assert response.status_code == HTTP_200_OK
    assert response.json()["user_id"] == "user-123"


def test_es256_signed_by_other_key_returns_401(
    client: Any, monkeypatch: pytest.MonkeyPatch, es256_keys: tuple[Any, Any]
) -> None:
    _, trusted_public = es256_keys
    attacker = ec.generate_private_key(ec.SECP256R1())
    _use_jwks(monkeypatch, _StubJWKSClient(key=trusted_public))
    response = client.get(
        "/tasks",
        headers={"Authorization": f"Bearer {_es256_token(attacker)}"},
    )
    assert response.status_code == 401


def test_unknown_kid_returns_401(
    client: Any, monkeypatch: pytest.MonkeyPatch, es256_keys: tuple[Any, Any]
) -> None:
    private, _ = es256_keys
    _use_jwks(
        monkeypatch,
        _StubJWKSClient(error=jwt.PyJWKClientError("Unable to find a signing key")),
    )
    response = client.get(
        "/tasks",
        headers={"Authorization": f"Bearer {_es256_token(private)}"},
    )
    assert response.status_code == 401


def test_malformed_jwks_returns_401(
    client: Any, monkeypatch: pytest.MonkeyPatch, es256_keys: tuple[Any, Any]
) -> None:
    private, _ = es256_keys
    _use_jwks(
        monkeypatch,
        _StubJWKSClient(error=jwt.PyJWKSetError("Unable to parse JWKS")),
    )
    response = client.get(
        "/tasks",
        headers={"Authorization": f"Bearer {_es256_token(private)}"},
    )
    assert response.status_code == 401


def test_jwks_connection_failure_returns_503(
    client: Any, monkeypatch: pytest.MonkeyPatch, es256_keys: tuple[Any, Any]
) -> None:
    private, _ = es256_keys
    _use_jwks(
        monkeypatch,
        _StubJWKSClient(error=jwt.PyJWKClientConnectionError("timed out")),
    )
    response = client.get(
        "/tasks",
        headers={"Authorization": f"Bearer {_es256_token(private)}"},
    )
    assert response.status_code == 503


def test_unavailable_jwks_client_returns_401(
    client: Any, monkeypatch: pytest.MonkeyPatch, es256_keys: tuple[Any, Any]
) -> None:
    private, _ = es256_keys
    _use_jwks(monkeypatch, None)  # type: ignore[arg-type]
    response = client.get(
        "/tasks",
        headers={"Authorization": f"Bearer {_es256_token(private)}"},
    )
    assert response.status_code == 401


def test_decode_raises_service_unavailable_on_connection_failure(
    monkeypatch: pytest.MonkeyPatch, es256_keys: tuple[Any, Any]
) -> None:
    private, _ = es256_keys
    _use_jwks(
        monkeypatch,
        _StubJWKSClient(error=jwt.PyJWKClientConnectionError("timed out")),
    )
    with pytest.raises(ServiceUnavailableException):
        auth_mod.decode_supabase_token(_es256_token(private))


def test_decode_maps_unknown_kid_to_invalid_token(
    monkeypatch: pytest.MonkeyPatch, es256_keys: tuple[Any, Any]
) -> None:
    private, _ = es256_keys
    _use_jwks(
        monkeypatch,
        _StubJWKSClient(error=jwt.PyJWKClientError("no matching key")),
    )
    with pytest.raises(jwt.InvalidTokenError, match="Unknown signing key"):
        auth_mod.decode_supabase_token(_es256_token(private))


# --- Logging hygiene ---------------------------------------------------------


def test_jwks_outage_logs_error_without_token(
    client: Any,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    es256_keys: tuple[Any, Any],
) -> None:
    private, _ = es256_keys
    token = _es256_token(private)
    _use_jwks(
        monkeypatch,
        _StubJWKSClient(error=jwt.PyJWKClientConnectionError("timed out")),
    )
    with caplog.at_level(logging.DEBUG):
        response = client.get("/tasks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors, "JWKS outage must be logged at ERROR"
    assert token not in caplog.text
    assert token.split(".")[0] not in caplog.text


def test_invalid_token_logs_class_name_without_token(
    client: Any, caplog: pytest.LogCaptureFixture
) -> None:
    token = _hs256(_claims(aud="anon"))
    with caplog.at_level(logging.DEBUG):
        response = client.get("/tasks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    warnings = [
        r
        for r in caplog.records
        if r.levelno == logging.WARNING and "Rejected access token" in r.getMessage()
    ]
    assert warnings
    assert "InvalidAudienceError" in warnings[0].getMessage()
    assert token not in caplog.text


def test_expired_token_logs_at_debug_not_warning(
    client: Any, caplog: pytest.LogCaptureFixture
) -> None:
    token = _hs256(_claims(exp=int(time.time()) - 60))
    with caplog.at_level(logging.DEBUG):
        response = client.get("/tasks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    auth_records = [r for r in caplog.records if r.name == "backend.auth"]
    assert not [r for r in auth_records if r.levelno >= logging.WARNING]
    assert [r for r in auth_records if r.levelno == logging.DEBUG]
    assert token not in caplog.text


# --- CSRF header for cookie-authenticated requests ---------------------------


def test_cookie_post_without_csrf_header_is_rejected(client: Any) -> None:
    token = _hs256(_claims())
    response = client.post("/tasks", cookies={COOKIE_NAME: token})
    assert response.status_code == 403


def test_cookie_post_with_csrf_header_is_accepted(client: Any) -> None:
    token = _hs256(_claims())
    response = client.post(
        "/tasks",
        cookies={COOKIE_NAME: token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    assert response.status_code == HTTP_200_OK


def test_cookie_post_with_wrong_csrf_value_is_rejected(client: Any) -> None:
    token = _hs256(_claims())
    response = client.post(
        "/tasks",
        cookies={COOKIE_NAME: token},
        headers={"X-Requested-With": "fetch"},
    )
    assert response.status_code == 403


def test_cookie_get_does_not_need_csrf_header(client: Any) -> None:
    token = _hs256(_claims())
    response = client.get("/tasks", cookies={COOKIE_NAME: token})
    assert response.status_code == HTTP_200_OK


def test_bearer_post_does_not_need_csrf_header(client: Any) -> None:
    token = _hs256(_claims())
    response = client.post("/tasks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == HTTP_200_OK


def test_public_refresh_requires_csrf_header(client: Any) -> None:
    assert client.post("/auth/refresh").status_code == 403
    response = client.post(
        "/auth/refresh", headers={"X-Requested-With": "XMLHttpRequest"}
    )
    assert response.status_code == HTTP_200_OK


def test_public_logout_requires_csrf_header(client: Any) -> None:
    assert client.post("/auth/logout").status_code == 403
    response = client.post(
        "/auth/logout", headers={"X-Requested-With": "XMLHttpRequest"}
    )
    assert response.status_code == HTTP_200_OK


def test_public_login_does_not_need_csrf_header(client: Any) -> None:
    assert client.post("/auth/login").status_code == HTTP_200_OK


# --- Threading ---------------------------------------------------------------


async def test_decode_runs_off_the_event_loop_thread(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, int] = {}
    loop_thread = threading.get_ident()

    def _record(token: str) -> dict[str, Any]:
        seen["thread"] = threading.get_ident()
        return {"sub": "user-123"}

    monkeypatch.setattr(auth_mod, "decode_supabase_token", _record)
    payload = await auth_mod.decode_supabase_token_async("tok")

    assert payload == {"sub": "user-123"}
    assert seen["thread"] != loop_thread
