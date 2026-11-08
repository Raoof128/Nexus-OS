"""Tests for response security headers, the docs CSP and the cross-site guard."""

from __future__ import annotations

import pytest
from litestar import Litestar, get, post
from litestar.exceptions import NotAuthorizedException
from litestar.openapi.plugins import SwaggerRenderPlugin
from litestar.testing import TestClient

from backend.config import get_settings
from backend.security import (
    SECURITY_HEADERS,
    SWAGGER_UI_CDN_PREFIX,
    CrossSiteRequestMiddleware,
    SecurityHeadersMiddleware,
    _build_csp,
    cross_site_rejection_reason,
    is_docs_path,
    security_exception_handlers,
)

# The seven fixed headers plus the CSP and the cache policy for API responses.
EXPECTED_API_HEADERS = {name for name, _ in SECURITY_HEADERS} | {
    "content-security-policy",
    "cache-control",
}


def _parse_csp(policy: str) -> dict[str, list[str]]:
    """Split a CSP string into {directive: [sources]}."""

    parsed: dict[str, list[str]] = {}
    for directive in policy.split(";"):
        parts = directive.strip().split()
        if parts:
            parsed[parts[0]] = parts[1:]
    return parsed


COOKIE_HEADER = {"Cookie": "access_token=t"}


@get("/ok")
async def _ok() -> dict:
    return {"status": "ok"}


@post("/mutate")
async def _mutate() -> dict:
    return {"status": "done"}


@get("/unauth")
async def _unauth() -> dict:
    raise NotAuthorizedException("nope")


@get("/boom")
async def _boom() -> dict:
    raise RuntimeError("unexpected")


@get("/schema/ping")
async def _schema_ping() -> dict:
    return {"docs": True}


@get("/schemas")
async def _schemas() -> dict:
    return {"collection": True}


def _build_app(*handlers, middleware=None) -> Litestar:
    return Litestar(
        route_handlers=list(handlers),
        middleware=middleware or [SecurityHeadersMiddleware],
        exception_handlers=security_exception_handlers,
        logging_config=None,
        debug=False,
    )


@pytest.fixture
def headers_client() -> TestClient:
    app = _build_app(_ok, _unauth, _boom, _schema_ping, _schemas)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def _assert_security_headers(response, *, docs: bool = False) -> None:
    names = set(response.headers.keys())
    for name in EXPECTED_API_HEADERS - {"cache-control"}:
        assert name in names, f"missing {name}"
    assert len(response.headers.get_list("content-security-policy")) == 1
    if docs:
        assert "cache-control" not in names
    else:
        assert response.headers.get("cache-control") == "no-store"


class TestHeadersOnEveryResponse:
    def test_200_has_all_headers(self, headers_client):
        response = headers_client.get("/ok")
        assert response.status_code == 200
        _assert_security_headers(response)

    def test_401_has_all_headers(self, headers_client):
        response = headers_client.get("/unauth")
        assert response.status_code == 401
        _assert_security_headers(response)

    def test_404_has_all_headers(self, headers_client):
        response = headers_client.get("/does-not-exist")
        assert response.status_code == 404
        assert response.json() == {"status_code": 404, "detail": "Not Found"}
        _assert_security_headers(response)

    def test_405_has_all_headers(self, headers_client):
        response = headers_client.delete("/ok")
        assert response.status_code == 405
        _assert_security_headers(response)

    def test_500_has_all_headers(self, headers_client):
        response = headers_client.get("/boom")
        assert response.status_code == 500
        _assert_security_headers(response)


class TestDocsPolicy:
    @pytest.mark.parametrize(
        "path", ["/schema", "/schema/", "/schema/openapi.json", "/schema/swagger"]
    )
    def test_docs_paths_get_docs_policy(self, path):
        assert is_docs_path(path)
        policy = _parse_csp(_build_csp(path))
        assert "'unsafe-inline'" in policy["script-src"]
        assert "'unsafe-inline'" in policy["style-src"]

    @pytest.mark.parametrize("path", ["/schemaX", "/schemas", "/schemata", "/healthz"])
    def test_lookalike_paths_get_api_policy(self, path):
        assert not is_docs_path(path)
        policy = _parse_csp(_build_csp(path))
        assert policy["default-src"] == ["'none'"]
        assert "'unsafe-inline'" not in policy["script-src"]
        assert "'unsafe-inline'" not in policy["style-src"]

    def test_schema_subpath_is_docs_not_schemas_collection(self):
        assert is_docs_path("/schema/ping")
        assert not is_docs_path("/schemas/ping")

    def test_docs_policy_allows_only_pinned_swagger_path(self):
        policy = _parse_csp(_build_csp("/schema"))
        assert SWAGGER_UI_CDN_PREFIX in policy["script-src"]
        assert SWAGGER_UI_CDN_PREFIX in policy["style-src"]
        plugin = SwaggerRenderPlugin(path="/")
        for asset in (
            plugin.js_url,
            plugin.css_url,
            plugin.standalone_preset_js_url,
        ):
            assert asset.startswith(SWAGGER_UI_CDN_PREFIX)
        assert "https://cdn.jsdelivr.net" not in policy["default-src"]

    def test_api_policy_never_allows_the_swagger_cdn(self):
        policy = _build_csp("/api/media")
        assert "cdn.jsdelivr.net" not in policy


class TestConnectSources:
    def test_connect_src_includes_supabase_https_and_wss(self):
        settings = get_settings()
        host = settings.supabase_url.split("://", 1)[1]
        for path in ("/schema", "/api/tasks"):
            connect = _parse_csp(_build_csp(path))["connect-src"]
            assert f"https://{host}" in connect
            assert f"wss://{host}" in connect

    def test_connect_src_includes_allowed_origins(self):
        connect = _parse_csp(_build_csp("/api/tasks"))["connect-src"]
        for origin in get_settings().allowed_origins:
            assert origin in connect


class TestCacheAndMerge:
    def test_docs_path_has_no_cache_control(self):
        app = _build_app(_schema_ping)
        with TestClient(app) as client:
            response = client.get("/schema/ping")
        assert response.status_code == 200
        assert "cache-control" not in response.headers
        assert response.headers.get("content-security-policy") == _build_csp(
            "/schema/ping"
        )

    def test_route_chosen_cache_control_is_kept(self):
        @get("/explicit-cache")
        async def explicit() -> dict:
            from litestar.response import Response

            return Response(
                content={"cached": True},
                headers={"cache-control": "public, max-age=60"},
            )

        app = _build_app(explicit)
        with TestClient(app) as client:
            response = client.get("/explicit-cache")
        assert response.headers.get_list("cache-control") == ["public, max-age=60"]

    def test_duplicate_security_header_is_replaced_not_appended(self):
        @get("/framed")
        async def framed() -> dict:
            from litestar.response import Response

            return Response(
                content={"ok": True},
                headers={"x-frame-options": "SAMEORIGIN"},
            )

        app = _build_app(framed)
        with TestClient(app) as client:
            response = client.get("/framed")
        assert response.headers.get_list("x-frame-options") == ["DENY"]


class TestCrossSiteGuardDecision:
    """Pure-function rules, independent of the HTTP stack."""

    @staticmethod
    def _scope(method="POST", **headers):
        raw = [
            (name.lower().encode("latin-1"), value.encode("latin-1"))
            for name, value in headers.items()
        ]
        return {"type": "http", "method": method, "path": "/x", "headers": raw}

    def test_safe_methods_are_never_checked(self):
        assert (
            cross_site_rejection_reason(self._scope("GET"), ["https://a.test"]) is None
        )

    def test_allowed_origin_passes(self):
        scope = self._scope(origin="https://app.example.test/")
        assert cross_site_rejection_reason(scope, ["https://app.example.test"]) is None

    def test_origin_match_is_case_insensitive(self):
        scope = self._scope(origin="HTTPS://App.Example.test")
        assert cross_site_rejection_reason(scope, ["https://app.example.test"]) is None

    def test_sibling_origin_rejected(self):
        scope = self._scope(origin="https://evil.home-notes-app.uk")
        assert (
            cross_site_rejection_reason(scope, ["https://home-notes-app.uk"])
            == "origin_not_allowed"
        )

    def test_null_origin_rejected_even_if_listed(self):
        scope = self._scope(origin="null")
        assert cross_site_rejection_reason(scope, ["null"]) == "null_origin"

    def test_ambiguous_origin_rejected(self):
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/x",
            "headers": [
                (b"origin", b"https://a.test"),
                (b"origin", b"https://b.test"),
            ],
        }
        assert cross_site_rejection_reason(scope, ["https://a.test"]) == (
            "ambiguous_origin"
        )

    def test_missing_origin_and_fetch_metadata_rejected(self):
        assert cross_site_rejection_reason(self._scope(), []) == "missing_origin"

    @pytest.mark.parametrize("value", ["same-origin", "none"])
    def test_fetch_metadata_fallback_accepts_same_origin(self, value):
        scope = self._scope(**{"Sec-Fetch-Site": value})
        assert cross_site_rejection_reason(scope, []) is None

    @pytest.mark.parametrize("value", ["same-site", "cross-site"])
    def test_fetch_metadata_fallback_rejects_same_site_and_cross_site(self, value):
        scope = self._scope(**{"Sec-Fetch-Site": value})
        assert cross_site_rejection_reason(scope, []) == "cross_site_fetch"

    def test_bearer_token_bypasses_origin_check(self):
        scope = self._scope(
            authorization="Bearer abc.def.ghi", origin="https://evil.test"
        )
        assert cross_site_rejection_reason(scope, ["https://app.test"]) is None


@pytest.fixture
def guarded_client() -> TestClient:
    app = _build_app(
        _ok,
        _mutate,
        middleware=[SecurityHeadersMiddleware, CrossSiteRequestMiddleware],
    )
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


class TestCrossSiteGuardHttp:
    def _allowed(self) -> str:
        return get_settings().allowed_origins[0]

    def test_cookie_post_with_allowed_origin_is_accepted(self, guarded_client):
        response = guarded_client.post(
            "/mutate",
            headers={**COOKIE_HEADER, "Origin": self._allowed()},
        )
        assert response.status_code == 201

    def test_cookie_post_with_evil_sibling_origin_is_403(self, guarded_client):
        response = guarded_client.post(
            "/mutate",
            headers={**COOKIE_HEADER, "Origin": "https://evil.home-notes-app.uk"},
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Cross-site request rejected"

    def test_cookie_post_with_null_origin_is_403(self, guarded_client):
        response = guarded_client.post(
            "/mutate",
            headers={**COOKIE_HEADER, "Origin": "null"},
        )
        assert response.status_code == 403

    def test_post_without_origin_or_fetch_metadata_is_403(self, guarded_client):
        response = guarded_client.post("/mutate", headers=COOKIE_HEADER)
        assert response.status_code == 403

    def test_text_plain_json_body_from_foreign_origin_is_403(self, guarded_client):
        response = guarded_client.post(
            "/mutate",
            content='{"status": "x"}',
            headers={
                **COOKIE_HEADER,
                "Content-Type": "text/plain",
                "Origin": "https://evil.test",
            },
        )
        assert response.status_code == 403

    def test_bearer_post_with_hostile_origin_is_accepted(self, guarded_client):
        response = guarded_client.post(
            "/mutate",
            headers={
                "Authorization": "Bearer abc.def.ghi",
                "Origin": "https://evil.test",
            },
        )
        assert response.status_code == 201

    def test_get_is_unaffected_by_missing_origin(self, guarded_client):
        response = guarded_client.get("/ok")
        assert response.status_code == 200

    def test_rejection_still_carries_security_headers(self, guarded_client):
        response = guarded_client.post(
            "/mutate", headers={"Origin": "https://evil.test"}
        )
        assert response.status_code == 403
        _assert_security_headers(response)

    def test_exempt_path_skips_the_guard(self):
        app = _build_app(
            _mutate,
            middleware=[
                lambda app: CrossSiteRequestMiddleware(
                    app, exempt_paths=frozenset({"/mutate"})
                )
            ],
        )
        with TestClient(app) as client:
            response = client.post("/mutate", headers={"Origin": "https://evil.test"})
        assert response.status_code == 201
