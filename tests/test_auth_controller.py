"""Tests for the cookie-session authentication controller.

The Supabase client is replaced by a fake, so no test touches the network.
Each test runs with fresh rate-limiter state.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from litestar import Litestar
from litestar.exceptions import HTTPException, ServiceUnavailableException
from litestar.testing import TestClient
from supabase_auth.errors import (
    AuthApiError,
    AuthRetryableError,
    AuthWeakPasswordError,
)

from backend import auth_controller
from backend.auth_controller import AuthController, _client_ip
from backend.config import get_settings
from backend.rate_limit import reset_rate_limiters

ORIGIN = "http://localhost:5173"
EMAIL = "person@example.com"


@pytest.fixture(autouse=True)
def _fresh_rate_limiters() -> None:
    """Rate-limiter state is module-level, so reset it around every test."""

    reset_rate_limiters()
    yield
    reset_rate_limiters()


def _request(headers: dict[str, str] | None = None, host: str = "198.51.100.10"):
    return SimpleNamespace(
        headers=headers or {},
        client=SimpleNamespace(host=host),
    )


# ── Fake Supabase client ──────────────────────────────────────────────────


def _session(access: str = "access-1", refresh: str = "refresh-1") -> SimpleNamespace:
    return SimpleNamespace(
        access_token=access,
        refresh_token=refresh,
        expires_at=1_900_000_000,
        user=SimpleNamespace(id="user-1", email=EMAIL),
    )


class FakeAuth:
    """Records calls and returns scripted results or raises scripted errors."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.sign_in_result: Any = SimpleNamespace(session=_session())
        self.sign_in_error: BaseException | None = None
        self.refresh_result: Any = SimpleNamespace(session=_session("a2", "r2"))
        self.refresh_error: BaseException | None = None
        self.sign_up_result: Any = SimpleNamespace(session=_session())
        self.sign_up_error: BaseException | None = None
        self.set_session_error: BaseException | None = None
        self.update_user_result: Any = SimpleNamespace(
            user=SimpleNamespace(id="user-1", email=EMAIL)
        )
        self.update_user_error: BaseException | None = None

    def _record(self, name: str, *args: Any) -> None:
        self.calls.append((name, args))

    def sign_in_with_password(self, credentials: dict[str, str]) -> Any:
        self._record("sign_in_with_password", credentials)
        if self.sign_in_error is not None:
            raise self.sign_in_error
        return self.sign_in_result

    def refresh_session(self, refresh_token: str) -> Any:
        self._record("refresh_session", refresh_token)
        if self.refresh_error is not None:
            raise self.refresh_error
        return self.refresh_result

    def sign_up(self, credentials: dict[str, str]) -> Any:
        self._record("sign_up", credentials)
        if self.sign_up_error is not None:
            raise self.sign_up_error
        return self.sign_up_result

    def set_session(self, access_token: str, refresh_token: str) -> None:
        self._record("set_session", access_token, refresh_token)
        if self.set_session_error is not None:
            raise self.set_session_error

    def update_user(self, attributes: dict[str, str]) -> Any:
        self._record("update_user", attributes)
        if self.update_user_error is not None:
            raise self.update_user_error
        return self.update_user_result

    def sign_out(self, options: dict[str, str] | None = None) -> None:
        self._record("sign_out", options)

    def reset_password_email(self, email: str, options: dict | None = None) -> None:
        self._record("reset_password_email", email, options)


class FakeClient:
    def __init__(self, auth: FakeAuth) -> None:
        self.auth = auth


@pytest.fixture
def fake_auth(monkeypatch: pytest.MonkeyPatch) -> FakeAuth:
    auth = FakeAuth()
    monkeypatch.setattr(
        auth_controller, "create_supabase_auth_client", lambda: FakeClient(auth)
    )
    return auth


@pytest.fixture
def client() -> TestClient:
    app = Litestar(route_handlers=[AuthController], debug=False)
    with TestClient(app=app, base_url="http://testserver.local") as tc:
        yield tc


def _set_cookie_headers(response: Any) -> list[str]:
    return response.headers.get_list("set-cookie")


def _cookie_names(response: Any) -> set[str]:
    """Names of every cookie the response sets, including expiring ones."""

    return {header.split("=", 1)[0] for header in _set_cookie_headers(response)}


# ── Client IP resolution ──────────────────────────────────────────────────


def test_client_ip_ignores_forwarded_header_from_untrusted_peer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Client-supplied proxy headers must not bypass auth throttles."""

    monkeypatch.setenv("TRUSTED_PROXY_IPS", "")
    request = _request({"x-forwarded-for": "203.0.113.99"}, host="198.51.100.10")

    assert _client_ip(request) == "198.51.100.10"


def test_client_ip_uses_forwarded_header_from_trusted_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Trusted reverse proxies may forward the original client address."""

    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.5")
    request = _request({"x-forwarded-for": "203.0.113.99, 10.0.0.5"}, host="10.0.0.5")

    assert _client_ip(request) == "203.0.113.99"


def test_client_ip_uses_leftmost_forwarded_entry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The Worker overwrites the header, so the leftmost entry is the client."""

    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.5")
    request = _request(
        {"x-forwarded-for": "203.0.113.99, 198.51.100.7, 10.0.0.5"}, host="10.0.0.5"
    )

    assert _client_ip(request) == "203.0.113.99"


def test_client_ip_refuses_malformed_forwarded_entry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A non-IP entry is not used as a rate-limit key."""

    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.5")
    request = _request({"x-forwarded-for": "not-an-ip, 10.0.0.5"}, host="10.0.0.5")

    assert _client_ip(request) == "10.0.0.5"


# ── Login ─────────────────────────────────────────────────────────────────


def test_login_success_sets_httponly_cookies_and_returns_body_token(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post(
        "/auth/login", json={"email": EMAIL, "password": "correct-horse"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"] == {"id": "user-1", "email": EMAIL}
    assert body["access_token"] == "access-1"
    assert body["expires_at"] == 1_900_000_000

    cookie_headers = _set_cookie_headers(response)
    settings = get_settings()
    access_cookie = next(
        h for h in cookie_headers if h.startswith(f"{settings.access_cookie_name}=")
    )
    assert "HttpOnly" in access_cookie
    assert "SameSite=lax" in access_cookie
    assert _cookie_names(response) == {
        settings.access_cookie_name,
        settings.refresh_cookie_name,
    }


def test_login_rejection_maps_to_401_invalid_credentials(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    fake_auth.sign_in_error = AuthApiError("Invalid login", 400, None)

    response = client.post(
        "/auth/login", json={"email": EMAIL, "password": "wrong-password"}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_upstream_outage_maps_to_503_not_credential_error(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    fake_auth.sign_in_error = AuthRetryableError("Bad gateway", 502)

    response = client.post(
        "/auth/login", json={"email": EMAIL, "password": "correct-horse"}
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication service unavailable"


def test_login_network_failure_maps_to_503(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    fake_auth.sign_in_error = ConnectionError("network down")

    response = client.post(
        "/auth/login", json={"email": EMAIL, "password": "correct-horse"}
    )

    assert response.status_code == 503


def test_login_config_error_is_not_reported_as_bad_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A missing configuration must not look like a wrong password."""

    def _broken_client() -> None:
        raise RuntimeError("Missing required environment variable: SUPABASE_URL")

    monkeypatch.setattr(auth_controller, "create_supabase_auth_client", _broken_client)
    app = Litestar(route_handlers=[AuthController], debug=False)
    with TestClient(app=app, raise_server_exceptions=False) as tc:
        response = tc.post(
            "/auth/login", json={"email": EMAIL, "password": "correct-horse"}
        )

    assert response.status_code == 500
    assert response.json().get("detail") != "Invalid credentials"


def test_login_rate_limit_key_does_not_contain_raw_email(
    client: TestClient, fake_auth: FakeAuth, monkeypatch: pytest.MonkeyPatch
) -> None:
    keys: list[str] = []

    async def _record(key: str) -> None:
        keys.append(key)

    monkeypatch.setattr(auth_controller, "enforce_auth_rate_limit_async", _record)

    client.post("/auth/login", json={"email": EMAIL, "password": "correct-horse"})

    assert len(keys) == 1
    assert keys[0].startswith("login:")
    assert EMAIL not in keys[0]
    assert "@" not in keys[0]


def test_account_digest_is_case_insensitive_and_keyed() -> None:
    digest = auth_controller._account_digest("Person@Example.com ")

    assert digest == auth_controller._account_digest("person@example.com")
    assert digest != auth_controller._account_digest("other@example.com")
    assert len(digest) == 64


# ── Refresh ───────────────────────────────────────────────────────────────


def test_refresh_without_cookie_reports_unauthenticated(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post("/auth/refresh")

    assert response.status_code == 201
    assert response.json() == {"authenticated": False}
    assert fake_auth.calls == []


def test_refresh_success_rotates_cookies_without_body_token(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    settings = get_settings()
    client.cookies.set(settings.refresh_cookie_name, "refresh-1")

    response = client.post("/auth/refresh")

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["id"] == "user-1"
    assert body["access_token"] is None
    assert _cookie_names(response) == {
        settings.access_cookie_name,
        settings.refresh_cookie_name,
    }


def test_refresh_rejected_token_maps_to_401(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    settings = get_settings()
    client.cookies.set(settings.refresh_cookie_name, "stale")
    fake_auth.refresh_error = AuthApiError("refresh_token_not_found", 400, None)

    response = client.post("/auth/refresh")

    assert response.status_code == 401


def test_refresh_outage_maps_to_503_so_session_is_kept(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    settings = get_settings()
    client.cookies.set(settings.refresh_cookie_name, "refresh-1")
    fake_auth.refresh_error = AuthRetryableError("Service unavailable", 503)

    response = client.post("/auth/refresh")

    assert response.status_code == 503


# ── Logout ────────────────────────────────────────────────────────────────


def test_logout_revokes_with_local_scope_when_both_cookies_present(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    settings = get_settings()
    client.cookies.set(settings.access_cookie_name, "access-1")
    client.cookies.set(settings.refresh_cookie_name, "refresh-1")

    response = client.post("/auth/logout")

    assert response.status_code == 201
    assert response.json() == {"ok": True}
    assert ("set_session", ("access-1", "refresh-1")) in fake_auth.calls
    assert ("sign_out", ({"scope": "local"},)) in fake_auth.calls


def test_logout_revokes_refresh_only_browser(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    """A browser holding only the refresh cookie must still be revoked."""

    settings = get_settings()
    client.cookies.set(settings.refresh_cookie_name, "refresh-only")

    response = client.post("/auth/logout")

    assert response.status_code == 201
    assert ("set_session", ("", "refresh-only")) in fake_auth.calls
    assert ("sign_out", ({"scope": "local"},)) in fake_auth.calls


def test_logout_without_cookies_skips_upstream_and_clears_cookies(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post("/auth/logout")

    assert response.status_code == 201
    assert fake_auth.calls == []
    assert _cookie_names(response) == {
        get_settings().access_cookie_name,
        get_settings().refresh_cookie_name,
    }


def test_logout_upstream_failure_still_clears_cookies(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    settings = get_settings()
    client.cookies.set(settings.refresh_cookie_name, "refresh-only")
    fake_auth.set_session_error = AuthRetryableError("down", 503)

    response = client.post("/auth/logout")

    assert response.status_code == 201
    assert response.json() == {"ok": True}
    assert _cookie_names(response) == {
        settings.access_cookie_name,
        settings.refresh_cookie_name,
    }


# ── Register ──────────────────────────────────────────────────────────────


def test_register_without_session_asks_user_to_confirm_email(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    fake_auth.sign_up_result = SimpleNamespace(session=None)

    response = client.post(
        "/auth/register", json={"email": EMAIL, "password": "long-enough-pass"}
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "message": "Check your email to confirm"}


def test_register_weak_password_maps_to_400(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    fake_auth.sign_up_error = AuthWeakPasswordError("weak", 422, ["too short"])

    response = client.post(
        "/auth/register", json={"email": EMAIL, "password": "long-enough-pass"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Registration failed"


def test_register_upstream_outage_maps_to_503(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    fake_auth.sign_up_error = AuthRetryableError("down", 503)

    response = client.post(
        "/auth/register", json={"email": EMAIL, "password": "long-enough-pass"}
    )

    assert response.status_code == 503


# ── Forgot and reset password ─────────────────────────────────────────────


def test_forgot_password_is_generic_and_sends_email(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post("/auth/forgot-password", json={"email": EMAIL})

    assert response.status_code == 201
    assert response.json()["ok"] is True
    assert any(name == "reset_password_email" for name, _ in fake_auth.calls)


def test_forgot_password_spent_account_budget_is_silent(
    client: TestClient, fake_auth: FakeAuth, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A spent per-account budget sends no email and returns the generic reply."""

    async def _budget(key: str) -> None:
        if key.startswith("forgot-email:"):
            raise HTTPException(status_code=429, detail="Rate limit exceeded.")

    monkeypatch.setattr(auth_controller, "enforce_auth_rate_limit_async", _budget)

    response = client.post("/auth/forgot-password", json={"email": EMAIL})

    assert response.status_code == 201
    assert response.json()["ok"] is True
    assert not any(name == "reset_password_email" for name, _ in fake_auth.calls)


def test_reset_prefers_recovery_headers_over_body(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post(
        "/auth/reset-password",
        json={
            "access_token": "body-access",
            "refresh_token": "body-refresh",
            "new_password": "brand-new-password",
        },
        headers={
            "x-recovery-access-token": "header-access",
            "x-recovery-refresh-token": "header-refresh",
        },
    )

    assert response.status_code == 201
    assert ("set_session", ("header-access", "header-refresh")) in fake_auth.calls
    assert response.json()["access_token"] is None


def test_reset_without_any_token_is_rejected(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post(
        "/auth/reset-password", json={"new_password": "brand-new-password"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Recovery token is required."
    assert fake_auth.calls == []


def test_reset_rejected_recovery_token_maps_to_400(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    fake_auth.set_session_error = AuthApiError("bad token", 403, None)

    response = client.post(
        "/auth/reset-password",
        json={"new_password": "brand-new-password"},
        headers={"x-recovery-access-token": "expired"},
    )

    assert response.status_code == 400
    assert response.json()["detail"].startswith("Password reset failed")


# ── Session ───────────────────────────────────────────────────────────────


def test_session_without_cookie_reports_unauthenticated(client: TestClient) -> None:
    response = client.get("/auth/session")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False}


def test_session_returns_identity_from_verified_token(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    client.cookies.set(settings.access_cookie_name, "good-token")
    monkeypatch.setattr(
        auth_controller,
        "decode_supabase_token",
        lambda token: {"sub": "user-9", "email": EMAIL, "exp": 1_900_000_000},
    )

    response = client.get("/auth/session")

    assert response.status_code == 200
    assert response.json()["user"] == {"id": "user-9", "email": EMAIL}
    assert response.json()["access_token"] is None


@pytest.mark.parametrize(
    "error",
    [
        jwt.ExpiredSignatureError("expired"),
        jwt.InvalidTokenError("bad signature"),
        jwt.PyJWKClientError("Unable to find a signing key that matches"),
    ],
)
def test_session_invalid_token_maps_to_401(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    settings = get_settings()
    client.cookies.set(settings.access_cookie_name, "bad-token")

    def _raise(token: str) -> dict:
        raise error

    monkeypatch.setattr(auth_controller, "decode_supabase_token", _raise)

    response = client.get("/auth/session")

    assert response.status_code == 401
    assert response.json()["detail"] == "Session expired or invalid"


def test_session_jwks_connection_failure_maps_to_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A JWKS outage must not look like an expired session (which logs users out)."""

    settings = get_settings()
    client.cookies.set(settings.access_cookie_name, "es256-token")

    def _raise(token: str) -> dict:
        raise jwt.PyJWKClientConnectionError("Fetching the JWK set failed")

    monkeypatch.setattr(auth_controller, "decode_supabase_token", _raise)

    response = client.get("/auth/session")

    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication service unavailable"


def test_session_auth_module_jwks_outage_maps_to_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """auth.py raises ServiceUnavailableException for JWKS network faults."""

    settings = get_settings()
    client.cookies.set(settings.access_cookie_name, "es256-token")

    def _raise(token: str) -> dict:
        raise ServiceUnavailableException(
            "Authentication service temporarily unavailable"
        )

    monkeypatch.setattr(auth_controller, "decode_supabase_token", _raise)

    response = client.get("/auth/session")

    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication service unavailable"


def test_reset_upstream_outage_maps_to_503(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    fake_auth.update_user_error = AuthRetryableError("down", 503)

    response = client.post(
        "/auth/reset-password",
        json={"new_password": "brand-new-password"},
        headers={"x-recovery-access-token": "valid-token"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication service unavailable"


def test_session_unexpected_error_maps_to_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    client.cookies.set(settings.access_cookie_name, "token")

    def _raise(token: str) -> dict:
        raise RuntimeError("config missing")

    monkeypatch.setattr(auth_controller, "decode_supabase_token", _raise)

    response = client.get("/auth/session")

    assert response.status_code == 503


# ── Cross-site request guard ──────────────────────────────────────────────


def test_foreign_origin_is_rejected_with_403(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post(
        "/auth/login",
        json={"email": EMAIL, "password": "correct-horse"},
        headers={"origin": "https://evil.example"},
    )

    assert response.status_code == 403
    assert fake_auth.calls == []


def test_null_origin_is_rejected_with_403(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post(
        "/auth/login",
        json={"email": EMAIL, "password": "correct-horse"},
        headers={"origin": "null"},
    )

    assert response.status_code == 403


def test_allowed_origin_is_accepted(client: TestClient, fake_auth: FakeAuth) -> None:
    response = client.post(
        "/auth/login",
        json={"email": EMAIL, "password": "correct-horse"},
        headers={"origin": ORIGIN},
    )

    assert response.status_code == 201


def test_cross_site_fetch_without_origin_is_rejected(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post("/auth/logout", headers={"sec-fetch-site": "cross-site"})

    assert response.status_code == 403


def test_request_without_origin_or_fetch_metadata_is_allowed(
    client: TestClient, fake_auth: FakeAuth
) -> None:
    response = client.post("/auth/logout")

    assert response.status_code == 201
