"""Tests for the OAuth connect/callback endpoints.

Provider HTTP traffic is served by an ``httpx.MockTransport`` injected into the
controller's ``httpx.AsyncClient``, so no test touches a real network endpoint.
"""

from __future__ import annotations

import base64
import dataclasses
import hashlib
import http.cookies
import json
import time
import urllib.parse
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest
from litestar.status_codes import (
    HTTP_302_FOUND,
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_502_BAD_GATEWAY,
    HTTP_503_SERVICE_UNAVAILABLE,
    HTTP_504_GATEWAY_TIMEOUT,
)
from litestar.testing import TestClient

from backend.app import app
from backend.oauth_controller import _OAUTH_COOKIE

CALLBACK_URL = "/api/email/accounts/callback"
CONNECT_URL = "/api/email/accounts/connect"
REDIRECT_URI = f"http://testserver.local{CALLBACK_URL}"
ACCESS_COOKIE = "nexus-access-token"


@pytest.fixture()
def client():
    with TestClient(app=app, base_url="http://testserver.local") as tc:
        yield tc


@pytest.fixture()
def _inject_auth(monkeypatch):
    from backend import auth as auth_mod
    from backend.config import BackendSettings

    # Create a fake settings instance
    fake_settings = BackendSettings(
        supabase_url="https://fake.supabase.co",
        supabase_auth_key="fake-key",
        supabase_jwt_secret="fake-secret",
        audit_log_salt="fake-salt",
        google_oauth_client_id="fake-id",
        google_oauth_client_secret="fake-secret",
        microsoft_oauth_client_id="fake-ms-id",
        microsoft_oauth_client_secret="fake-ms-secret",
        allowed_hosts=["localhost", "127.0.0.1", "testserver.local"],
    )

    # Patch get_settings globally for relevant modules
    monkeypatch.setattr("backend.config.get_settings", lambda: fake_settings)
    monkeypatch.setattr("backend.oauth_controller.get_settings", lambda: fake_settings)

    async def _bypass(self, scope, receive, send):
        if scope["type"] == "http":
            scope.setdefault("state", {})["user_id"] = "user-123"
        await self.app(scope, receive, send)

    monkeypatch.setattr(auth_mod.SupabaseAuthMiddleware, "__call__", _bypass)
    return fake_settings


def _override_settings(monkeypatch, base, **changes):
    """Make the controller see ``base`` with ``changes`` applied."""

    patched = dataclasses.replace(base, **changes)
    monkeypatch.setattr("backend.oauth_controller.get_settings", lambda: patched)
    return patched


def _state_payload(**changes) -> dict:
    payload = {
        "state": "real-state",
        "verifier": "v" * 43,
        "provider": "google",
        "redirect_uri": REDIRECT_URI,
        "user_id": "user-123",
        "ts": int(time.time()),
    }
    payload.update(changes)
    return payload


def _cookie_value(response) -> str:
    """Return the decoded value of the OAuth state cookie from a response."""

    jar = http.cookies.SimpleCookie()
    jar.load(response.headers["set-cookie"])
    return jar[_OAUTH_COOKIE].value


def _location_query(response) -> dict[str, list[str]]:
    return urllib.parse.parse_qs(
        urllib.parse.urlparse(response.headers["location"]).query
    )


def _patch_httpx(monkeypatch, handler):
    """Route the controller's httpx clients through a MockTransport."""

    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    fake_httpx = SimpleNamespace(
        AsyncClient=factory,
        Timeout=httpx.Timeout,
        TimeoutException=httpx.TimeoutException,
        HTTPError=httpx.HTTPError,
    )
    monkeypatch.setattr("backend.oauth_controller.httpx", fake_httpx)


def _provider_handler(token_json=None, profile_json=None, seen=None):
    """Return a MockTransport handler: token endpoint and profile endpoint."""

    token_json = (
        {"access_token": "access-plain", "expires_in": 3599}
        if token_json is None
        else token_json
    )
    profile_json = {} if profile_json is None else profile_json

    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if request.url.path.endswith("/token"):
            return httpx.Response(200, json=token_json)
        return httpx.Response(200, json=profile_json)

    return handler


@pytest.fixture()
def store_mock(monkeypatch):
    """Replace the RLS-scoped Supabase client; returns the mock client."""

    mock_client = MagicMock()
    monkeypatch.setattr(
        "backend.oauth_controller.create_supabase_user_client",
        MagicMock(return_value=mock_client),
    )
    return mock_client


@pytest.fixture()
def _takeaway_key(monkeypatch, _inject_auth):
    """Token encryption needs a Fernet key; supply a throwaway one for the test run."""

    from cryptography.fernet import Fernet

    keyed = dataclasses.replace(
        _inject_auth, takeaway_encryption_key=Fernet.generate_key().decode("ascii")
    )
    monkeypatch.setattr("backend.data_protection.get_settings", lambda: keyed)
    return keyed


@pytest.mark.usefixtures("_inject_auth", "_takeaway_key")
class TestOAuthController:
    """Tests for the OAuth PKCE flow, state handling and redirects."""

    def test_connect_redirects_to_google(self, client):
        response = client.get(f"{CONNECT_URL}?provider=google", follow_redirects=False)
        assert response.status_code == HTTP_302_FOUND

        location = response.headers["location"]
        assert "accounts.google.com" in location
        assert "response_type=code" in location
        assert "code_challenge=" in location

        assert _OAUTH_COOKIE in response.cookies

    def test_connect_pkce_challenge_matches_verifier(self, client):
        response = client.get(f"{CONNECT_URL}?provider=google", follow_redirects=False)
        query = _location_query(response)

        assert query["code_challenge_method"] == ["S256"]
        verifier = json.loads(_cookie_value(response))["verifier"]
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        assert query["code_challenge"] == [expected]

    def test_state_cookie_attributes(self, client):
        response = client.get(f"{CONNECT_URL}?provider=google", follow_redirects=False)
        header = response.headers["set-cookie"].lower()

        assert _OAUTH_COOKIE in response.headers["set-cookie"]
        assert "httponly" in header
        assert "max-age=600" in header
        assert "path=/" in header
        assert "samesite=lax" in header

    def test_connect_cookie_round_trips_into_callback(
        self, client, store_mock, monkeypatch
    ):
        """The cookie that connect sets is accepted by callback unchanged."""

        connect = client.get(f"{CONNECT_URL}?provider=google", follow_redirects=False)
        state = _location_query(connect)["state"][0]
        _patch_httpx(
            monkeypatch,
            _provider_handler(profile_json={"emailAddress": "a@example.com"}),
        )
        client.cookies.set(_OAUTH_COOKIE, _cookie_value(connect))
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(
            f"{CALLBACK_URL}?code=abc&state={state}", follow_redirects=False
        )
        assert response.status_code == HTTP_302_FOUND

    def test_connect_validates_host_header(self, client, monkeypatch, _inject_auth):
        # Restricted hosts; secrets are set so the 400 is reached, not a 503
        _override_settings(monkeypatch, _inject_auth, allowed_hosts=("nexus-os.com",))

        # Request with mismatched host
        response = client.get(
            f"{CONNECT_URL}?provider=google",
            headers={"host": "evil.com"},
            follow_redirects=False,
        )
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "invalid host header" in response.text.lower()

    @pytest.mark.parametrize(
        ("provider", "overrides", "status", "expected_host"),
        [
            ("google", {}, HTTP_302_FOUND, "accounts.google.com"),
            ("microsoft", {}, HTTP_302_FOUND, "login.microsoftonline.com"),
            (
                "google",
                {"google_oauth_client_id": ""},
                HTTP_503_SERVICE_UNAVAILABLE,
                None,
            ),
            (
                "google",
                {"google_oauth_client_secret": ""},
                HTTP_503_SERVICE_UNAVAILABLE,
                None,
            ),
            (
                "microsoft",
                {"microsoft_oauth_client_id": ""},
                HTTP_503_SERVICE_UNAVAILABLE,
                None,
            ),
            ("yahoo", {}, HTTP_400_BAD_REQUEST, None),
        ],
    )
    def test_connect_provider_matrix(
        self,
        client,
        monkeypatch,
        _inject_auth,
        provider,
        overrides,
        status,
        expected_host,
    ):
        _override_settings(monkeypatch, _inject_auth, **overrides)

        response = client.get(
            f"{CONNECT_URL}?provider={provider}", follow_redirects=False
        )

        assert response.status_code == status
        if expected_host is None:
            return
        location = response.headers["location"]
        assert expected_host in location
        query = _location_query(response)
        if provider == "google":
            assert query["access_type"] == ["offline"]
            assert "gmail.modify" in query["scope"][0]
        else:
            assert "access_type" not in query
            assert "User.Read" in query["scope"][0].split()

    def test_callback_mismatched_state_fails(self, client):
        client.cookies.set(
            _OAUTH_COOKIE, json.dumps(_state_payload(state="real-state"))
        )

        response = client.get(f"{CALLBACK_URL}?state=wrong-state&code=abc")
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "OAuth state mismatch" in response.text

    def test_callback_rejects_request_without_query_params(self, client):
        response = client.get(CALLBACK_URL)
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "Missing required query parameter 'state'" in response.text

    def test_callback_without_code_or_error_is_rejected(self, client):
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        response = client.get(f"{CALLBACK_URL}?state=real-state")
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "Missing required query parameter 'code'" in response.text

    def test_callback_without_cookie_fails(self, client):
        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "Missing OAuth state cookie" in response.text

    @pytest.mark.parametrize(
        "raw_cookie",
        [
            "not json",
            "[1,2]",
            '"x"',
            "null",
            json.dumps(_state_payload(ts="abc")),
            json.dumps(_state_payload(ts=True)),
            json.dumps(_state_payload(state=5)),
            json.dumps(_state_payload(state="")),
            json.dumps({k: v for k, v in _state_payload().items() if k != "user_id"}),
            json.dumps(_state_payload(provider=["google"])),
        ],
        ids=[
            "not-json",
            "list",
            "string",
            "null",
            "ts-string",
            "ts-bool",
            "state-int",
            "state-empty",
            "user-missing",
            "provider-list",
        ],
    )
    def test_malformed_cookie_returns_400(self, client, raw_cookie):
        client.cookies.set(_OAUTH_COOKIE, raw_cookie)

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "Malformed OAuth state cookie" in response.text

    def test_callback_non_ascii_state_is_mismatch_not_500(self, client):
        client.cookies.set(
            _OAUTH_COOKIE, json.dumps(_state_payload(state="real-state"))
        )

        response = client.get(CALLBACK_URL, params={"code": "abc", "state": "é"})

        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "OAuth state mismatch" in response.text

    def test_callback_empty_query_state_is_missing(self, client):
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload(state="")))
        response = client.get(f"{CALLBACK_URL}?code=abc&state=")
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "Missing required query parameter 'state'" in response.text

    def test_callback_cookie_from_other_user_is_rejected(self, client):
        client.cookies.set(
            _OAUTH_COOKIE, json.dumps(_state_payload(user_id="someone-else"))
        )
        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "OAuth state mismatch" in response.text

    @pytest.mark.parametrize("age", [601, -3600])
    def test_callback_expired_or_future_state_is_rejected(self, client, age):
        client.cookies.set(
            _OAUTH_COOKIE, json.dumps(_state_payload(ts=int(time.time()) - age))
        )
        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "OAuth state expired" in response.text

    def test_callback_unknown_provider_in_state_is_rejected(self, client):
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload(provider="yahoo")))
        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")
        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "Unknown provider in state" in response.text

    def test_callback_unconfigured_provider_returns_503(
        self, client, monkeypatch, _inject_auth
    ):
        _override_settings(monkeypatch, _inject_auth, google_oauth_client_id="")
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
        assert "Google OAuth not configured" in response.text

    def test_callback_access_denied_redirects_and_clears_cookie(self, client):
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))

        response = client.get(
            f"{CALLBACK_URL}?error=access_denied&state=real-state",
            follow_redirects=False,
        )

        assert response.status_code == HTTP_302_FOUND
        assert response.headers["location"].endswith("/?email_error=access_denied")
        assert "max-age=0" in response.headers["set-cookie"].lower()

    def test_callback_unknown_provider_error_is_mapped_to_fixed_value(self, client):
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))

        response = client.get(
            CALLBACK_URL,
            params={"error": "<script>alert(1)</script>", "state": "real-state"},
            follow_redirects=False,
        )

        assert response.status_code == HTTP_302_FOUND
        assert response.headers["location"].endswith("/?email_error=provider_error")

    def test_callback_error_with_mismatched_state_is_rejected(self, client):
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))

        response = client.get(f"{CALLBACK_URL}?error=access_denied&state=wrong")

        assert response.status_code == HTTP_400_BAD_REQUEST
        assert "OAuth state mismatch" in response.text

    def test_callback_success_stores_account(self, client, store_mock, monkeypatch):
        seen: list[httpx.Request] = []
        _patch_httpx(
            monkeypatch,
            _provider_handler(
                token_json={
                    "access_token": "access-plain",
                    "refresh_token": "refresh-plain",
                    "expires_in": 3599,
                },
                profile_json={"emailAddress": "owner@example.com"},
                seen=seen,
            ),
        )
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(
            f"{CALLBACK_URL}?code=abc&state=real-state", follow_redirects=False
        )

        assert response.status_code == HTTP_302_FOUND
        assert response.headers["location"].endswith("/?email_connected=1")
        assert "max-age=0" in response.headers["set-cookie"].lower()

        # Google account address comes from the Gmail profile endpoint
        profile_calls = [r for r in seen if "/profile" in r.url.path]
        assert profile_calls and profile_calls[0].url.host == "gmail.googleapis.com"

        # The token exchange sends the PKCE verifier and the stored redirect URI
        token_call = next(r for r in seen if r.url.path.endswith("/token"))
        form = urllib.parse.parse_qs(token_call.content.decode())
        assert form["code_verifier"] == ["v" * 43]
        assert form["redirect_uri"] == [REDIRECT_URI]

        store_mock.from_.assert_called_once_with("email_accounts")
        row = store_mock.from_.return_value.upsert.call_args.args[0]
        kwargs = store_mock.from_.return_value.upsert.call_args.kwargs
        assert kwargs["on_conflict"] == "user_id,provider,email_address"
        assert kwargs["returning"] == "minimal"
        assert row["user_id"] == "user-123"
        assert row["provider"] == "google"
        assert row["email_address"] == "owner@example.com"
        # email_accounts_status_check allows only 'active' or 'disconnected'.
        assert row["status"] == "active"
        assert row["access_token_enc"] != "access-plain"
        assert row["refresh_token_enc"] != "refresh-plain"
        assert "access-plain" not in json.dumps(row)
        assert "refresh-plain" not in json.dumps(row)

    def test_callback_uses_access_cookie_for_user_client(
        self, client, store_mock, monkeypatch
    ):
        import backend.oauth_controller as controller

        create_client = MagicMock(return_value=store_mock)
        monkeypatch.setattr(controller, "create_supabase_user_client", create_client)
        _patch_httpx(
            monkeypatch,
            _provider_handler(profile_json={"emailAddress": "a@example.com"}),
        )
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        client.cookies.set(ACCESS_COOKIE, "user-jwt")

        client.get(f"{CALLBACK_URL}?code=abc&state=real-state", follow_redirects=False)

        create_client.assert_called_once_with("user-jwt")

    def test_callback_microsoft_account_is_stored(
        self, client, store_mock, monkeypatch
    ):
        seen: list[httpx.Request] = []
        _patch_httpx(
            monkeypatch,
            _provider_handler(profile_json={"mail": "ms@example.com"}, seen=seen),
        )
        client.cookies.set(
            _OAUTH_COOKIE, json.dumps(_state_payload(provider="microsoft"))
        )
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(
            f"{CALLBACK_URL}?code=abc&state=real-state", follow_redirects=False
        )

        assert response.status_code == HTTP_302_FOUND
        me_call = next(r for r in seen if r.url.host == "graph.microsoft.com")
        assert me_call.url.path == "/v1.0/me"
        row = store_mock.from_.return_value.upsert.call_args.args[0]
        assert row["provider"] == "microsoft"
        assert row["email_address"] == "ms@example.com"

    def test_callback_without_refresh_token_omits_column(
        self, client, store_mock, monkeypatch
    ):
        _patch_httpx(
            monkeypatch,
            _provider_handler(
                token_json={"access_token": "access-plain", "expires_in": 3599},
                profile_json={"emailAddress": "a@example.com"},
            ),
        )
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(
            f"{CALLBACK_URL}?code=abc&state=real-state", follow_redirects=False
        )

        assert response.status_code == HTTP_302_FOUND
        row = store_mock.from_.return_value.upsert.call_args.args[0]
        assert "refresh_token_enc" not in row
        assert "access_token_enc" in row

    def test_callback_empty_email_returns_502_and_writes_nothing(
        self, client, store_mock, monkeypatch
    ):
        _patch_httpx(monkeypatch, _provider_handler(profile_json={"emailAddress": ""}))
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_502_BAD_GATEWAY
        assert "Failed to retrieve account email" in response.text
        store_mock.from_.assert_not_called()

    def test_callback_token_timeout_returns_504(self, client, monkeypatch):
        def handler(request):
            raise httpx.ConnectTimeout("connect timed out")

        _patch_httpx(monkeypatch, handler)
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_504_GATEWAY_TIMEOUT
        assert "Token exchange failed" in response.text

    def test_callback_token_transport_error_returns_502(self, client, monkeypatch):
        def handler(request):
            raise httpx.ConnectError("connection refused")

        _patch_httpx(monkeypatch, handler)
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_502_BAD_GATEWAY
        assert "Token exchange failed" in response.text

    def test_callback_non_object_token_body_returns_502(self, client, monkeypatch):
        _patch_httpx(monkeypatch, _provider_handler(token_json=["not", "an", "object"]))
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_502_BAD_GATEWAY
        assert "No access token in response" in response.text

    def test_callback_token_http_error_returns_502(self, client, monkeypatch):
        def handler(request):
            if request.url.path.endswith("/token"):
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={})

        _patch_httpx(monkeypatch, handler)
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_502_BAD_GATEWAY
        assert "Token exchange failed" in response.text

    def test_callback_profile_http_error_returns_502_and_writes_nothing(
        self, client, store_mock, monkeypatch
    ):
        def handler(request):
            if request.url.path.endswith("/token"):
                return httpx.Response(200, json={"access_token": "access-plain"})
            return httpx.Response(403, json={"error": "insufficient_scope"})

        _patch_httpx(monkeypatch, handler)
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_502_BAD_GATEWAY
        assert "Failed to retrieve account email" in response.text
        store_mock.from_.assert_not_called()

    def test_callback_db_failure_returns_generic_502(
        self, client, store_mock, monkeypatch
    ):
        _patch_httpx(
            monkeypatch,
            _provider_handler(profile_json={"emailAddress": "a@example.com"}),
        )
        store_mock.from_.return_value.upsert.return_value.execute.side_effect = (
            RuntimeError("row violates constraint secret-detail")
        )
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(f"{CALLBACK_URL}?code=abc&state=real-state")

        assert response.status_code == HTTP_502_BAD_GATEWAY
        assert "Failed to store account" in response.text
        assert "secret-detail" not in response.text

    def test_callback_infinite_expires_in_still_stores_account(
        self, client, store_mock, monkeypatch
    ):
        # json.loads accepts the non-standard Infinity literal; it must not 500.
        def handler(request):
            if request.url.path.endswith("/token"):
                body = b'{"access_token": "access-plain", "expires_in": Infinity}'
                return httpx.Response(
                    200, content=body, headers={"content-type": "application/json"}
                )
            return httpx.Response(200, json={"emailAddress": "a@example.com"})

        _patch_httpx(monkeypatch, handler)
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(
            f"{CALLBACK_URL}?code=abc&state=real-state", follow_redirects=False
        )

        assert response.status_code == HTTP_302_FOUND
        assert store_mock.from_.return_value.upsert.called

    def test_callback_huge_expires_in_is_clamped(self, client, store_mock, monkeypatch):
        _patch_httpx(
            monkeypatch,
            _provider_handler(
                token_json={"access_token": "access-plain", "expires_in": 10**12},
                profile_json={"emailAddress": "a@example.com"},
            ),
        )
        client.cookies.set(_OAUTH_COOKIE, json.dumps(_state_payload()))
        client.cookies.set(ACCESS_COOKIE, "jwt")

        response = client.get(
            f"{CALLBACK_URL}?code=abc&state=real-state", follow_redirects=False
        )

        assert response.status_code == HTTP_302_FOUND
        assert store_mock.from_.return_value.upsert.called


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (3599, 3599),
        ("120", 120),
        (0, 3600),
        (-5, 3600),
        (None, 3600),
        (True, 3600),
        ("not-a-number", 3600),
        (float("nan"), 3600),
        (float("inf"), 3600),
        (10**12, 366 * 24 * 3600),
    ],
)
def test_coerce_expires_in(value, expected):
    from backend.oauth_controller import _coerce_expires_in

    assert _coerce_expires_in(value) == expected


class TestOAuthControllerUnauthenticated:
    """Without the auth bypass, the real middleware must reject both endpoints."""

    def test_connect_without_session_is_unauthorized(self, client):
        response = client.get(f"{CONNECT_URL}?provider=google", follow_redirects=False)
        assert response.status_code == HTTP_401_UNAUTHORIZED

    def test_callback_without_session_is_unauthorized(self, client):
        response = client.get(f"{CALLBACK_URL}?code=x&state=y", follow_redirects=False)
        assert response.status_code == HTTP_401_UNAUTHORIZED
