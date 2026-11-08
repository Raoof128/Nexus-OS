"""Tests for application wiring: OpenAPI exposure, health probe, request IDs."""

from __future__ import annotations

import logging

import pytest
from litestar import Litestar, get
from litestar.exceptions import NotFoundException
from litestar.testing import TestClient

from backend.app import app, build_openapi_config
from backend.logging_config import (
    RequestIdMiddleware,
    log_unhandled_exception,
)


@get("/boom", sync_to_thread=False)
def _boom() -> dict[str, str]:
    raise RuntimeError("kaboom")


@get("/missing", sync_to_thread=False)
def _missing() -> dict[str, str]:
    raise NotFoundException(detail="no such item")


def _error_app() -> Litestar:
    """Mirror the production wiring for exception logging on a tiny app."""

    return Litestar(
        route_handlers=[_boom, _missing],
        middleware=[RequestIdMiddleware()],
        exception_handlers={Exception: log_unhandled_exception},
        logging_config=None,
    )


class TestOpenApiExposure:
    def test_development_exposes_schema_at_schema_path(self):
        config = build_openapi_config("development")

        assert config is not None
        assert config.path == "/schema"

    @pytest.mark.parametrize(
        "environment",
        ["production", "staging", "prod", "Development", " development", "", "dev"],
    )
    def test_every_other_environment_hides_docs(self, environment):
        assert build_openapi_config(environment) is None


class TestHealthAndRequestIds:
    @pytest.fixture
    def client(self):
        with TestClient(app=app, base_url="http://testserver.local") as tc:
            yield tc

    def test_healthz_returns_ok(self, client):
        response = client.get("/healthz")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_response_carries_generated_request_id(self, client):
        response = client.get("/healthz")

        request_id = response.headers.get("x-request-id")
        assert request_id
        assert len(request_id) == 36  # uuid4 string form

    def test_valid_inbound_request_id_is_echoed(self, client):
        response = client.get("/healthz", headers={"X-Request-ID": "abc-123"})

        assert response.headers["x-request-id"] == "abc-123"

    @pytest.mark.parametrize(
        "bad_id",
        ["has spaces", "x" * 65, "semi;colon"],
    )
    def test_invalid_inbound_request_id_is_replaced(self, client, bad_id):
        response = client.get("/healthz", headers={"X-Request-ID": bad_id})

        assert response.headers["x-request-id"] != bad_id
        assert len(response.headers["x-request-id"]) == 36

    def test_cors_exposes_request_id_to_browser_clients(self, client):
        response = client.get("/healthz", headers={"Origin": "http://localhost:5173"})

        exposed = response.headers.get("access-control-expose-headers", "")
        assert "X-Request-ID" in exposed

    def test_app_registers_unhandled_exception_logger(self):
        assert app.exception_handlers[Exception] is log_unhandled_exception


class TestUnhandledExceptionLogging:
    def test_500_is_logged_with_traceback_and_keeps_request_id(self, caplog):
        with (
            caplog.at_level(logging.ERROR),
            TestClient(app=_error_app(), raise_server_exceptions=False) as client,
        ):
            response = client.get("/boom", headers={"X-Request-ID": "trace-1"})

        assert response.status_code == 500
        assert response.headers["x-request-id"] == "trace-1"
        errors = [r for r in caplog.records if r.levelno == logging.ERROR]
        assert len(errors) == 1
        assert errors[0].exc_info is not None
        assert errors[0].exc_info[0] is RuntimeError
        assert "GET request" in errors[0].getMessage()
        assert "/boom" not in errors[0].getMessage()

    def test_http_exception_is_returned_without_error_log(self, caplog):
        with (
            caplog.at_level(logging.ERROR),
            TestClient(app=_error_app(), raise_server_exceptions=False) as client,
        ):
            response = client.get("/missing")

        assert response.status_code == 404
        assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []
