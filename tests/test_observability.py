"""Tests for Sentry scrubbing, Sentry init options, and logging configuration."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import pytest
from sentry_sdk.scrubber import EventScrubber

import backend.observability as observability
from backend.config import get_settings
from backend.logging_config import (
    RequestIdFilter,
    configure_logging,
    request_id_var,
)
from backend.observability import _scrub_event, configure_observability


def _request_event(**request: Any) -> dict[str, Any]:
    return {"request": dict(request)}


class TestScrubRequest:
    def test_query_string_redacts_oauth_code_and_state(self):
        event = _request_event(query_string="code=abc123&state=xyz&page=2")

        scrubbed = _scrub_event(event, {})

        assert (
            scrubbed["request"]["query_string"]
            == "code=[Filtered]&state=[Filtered]&page=2"
        )

    def test_query_string_matches_whole_parameter_names_only(self):
        event = _request_event(query_string="promo_code=SPRING&error_code=7&xtoken=1")

        scrubbed = _scrub_event(event, {})

        assert scrubbed["request"]["query_string"] == (
            "promo_code=SPRING&error_code=7&xtoken=1"
        )

    def test_query_string_mapping_is_redacted(self):
        event = _request_event(query_string={"code": "abc", "q": "hello"})

        scrubbed = _scrub_event(event, {})

        assert scrubbed["request"]["query_string"] == {
            "code": "[Filtered]",
            "q": "hello",
        }

    def test_form_encoded_body_is_redacted(self):
        event = _request_event(data="username=ana&password=hunter2&access_token=tkn")

        scrubbed = _scrub_event(event, {})

        assert scrubbed["request"]["data"] == (
            "username=ana&password=[Filtered]&access_token=[Filtered]"
        )

    def test_raw_json_string_body_is_redacted_when_parseable(self):
        event = _request_event(data='{"credentials": {"Password": "x", "n": 1}}')

        scrubbed = _scrub_event(event, {})

        assert scrubbed["request"]["data"] == (
            '{"credentials": {"Password": "[Filtered]", "n": 1}}'
        )

    def test_json_pattern_fallback_for_unparseable_text(self):
        event = _request_event(data='{"client_secret": "abc", "broken": ')

        scrubbed = _scrub_event(event, {})

        assert '"client_secret": "[Filtered]"' in scrubbed["request"]["data"]
        assert "abc" not in scrubbed["request"]["data"]

    def test_nested_dict_body_is_redacted_case_insensitively(self):
        body = {"outer": {"NEW_PASSWORD": "p1", "keep": "ok"}, "list": [{"Code": "c"}]}
        event = _request_event(data=body)

        scrubbed = _scrub_event(event, {})

        assert scrubbed["request"]["data"] == {
            "outer": {"NEW_PASSWORD": "[Filtered]", "keep": "ok"},
            "list": [{"Code": "[Filtered]"}],
        }

    def test_cookies_are_replaced(self):
        event = _request_event(cookies={"sb-access": "secret"})

        scrubbed = _scrub_event(event, {})

        assert scrubbed["request"]["cookies"] == "[Filtered]"

    def test_recovery_headers_are_redacted_case_insensitively(self):
        # Regression: the password-reset flow sends its recovery session in
        # X-Recovery-* headers; a failed reset used to ship them to Sentry.
        event = _request_event(
            headers={
                "X-Recovery-Access-Token": "live-access",
                "x-recovery-refresh-token": "live-refresh",
                "Authorization": "Bearer abc",
                "Content-Type": "application/json",
            }
        )

        headers = _scrub_event(event, {})["request"]["headers"]

        assert headers["X-Recovery-Access-Token"] == "[Filtered]"
        assert headers["x-recovery-refresh-token"] == "[Filtered]"
        assert headers["Authorization"] == "[Filtered]"
        assert headers["Content-Type"] == "application/json"

    def test_header_pairs_are_redacted(self):
        event = _request_event(
            headers=[["X-Recovery-Refresh-Token", "live"], ["Accept", "*/*"]]
        )

        headers = _scrub_event(event, {})["request"]["headers"]

        assert headers == [
            ["X-Recovery-Refresh-Token", "[Filtered]"],
            ["Accept", "*/*"],
        ]

    def test_plain_text_body_without_credentials_is_untouched(self):
        event = _request_event(data="just some words")

        assert _scrub_event(event, {})["request"]["data"] == "just some words"

    def test_event_without_request_is_returned(self):
        assert _scrub_event({"message": "boom"}, {}) == {"message": "boom"}


class TestScrubOtherSurfaces:
    def test_exception_frame_locals_are_redacted(self):
        event = {
            "exception": {
                "values": [
                    {
                        "stacktrace": {
                            "frames": [
                                {
                                    "vars": {
                                        "access_token": "eyJ...",
                                        "verifier": "kept",
                                        "code_verifier": "pkce",
                                        "count": 3,
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }

        frame_vars = _scrub_event(event, {})["exception"]["values"][0]["stacktrace"][
            "frames"
        ][0]["vars"]

        assert frame_vars["access_token"] == "[Filtered]"
        assert frame_vars["code_verifier"] == "[Filtered]"
        assert frame_vars["verifier"] == "kept"
        assert frame_vars["count"] == 3

    def test_breadcrumb_data_and_extra_are_redacted(self):
        event = {
            "extra": {"refresh_token": "r"},
            "breadcrumbs": {"values": [{"data": {"client_secret": "s", "ok": 1}}]},
        }

        scrubbed = _scrub_event(event, {})

        assert scrubbed["extra"] == {"refresh_token": "[Filtered]"}
        assert scrubbed["breadcrumbs"]["values"][0]["data"] == {
            "client_secret": "[Filtered]",
            "ok": 1,
        }

    def test_transaction_shaped_event_is_scrubbed(self):
        event = {
            "type": "transaction",
            "request": {"data": {"password": "hunter2"}, "query_string": "code=c"},
        }

        scrubbed = _scrub_event(event, {})

        assert scrubbed["request"]["data"] == {"password": "[Filtered]"}
        assert scrubbed["request"]["query_string"] == "code=[Filtered]"

    def test_url_fields_have_credential_parameters_redacted(self):
        event = {
            "request": {"url": "https://api.example.test/cb?code=abc&state=xyz&q=1"},
            "breadcrumbs": {
                "values": [
                    {"data": {"url": "https://idp.example.test/token?refresh_token=r"}}
                ]
            },
            "spans": [
                {"data": {"http.query": "state=s&page=2", "url": "https://x.test/"}}
            ],
        }

        scrubbed = _scrub_event(event, {})

        assert scrubbed["request"]["url"] == (
            "https://api.example.test/cb?code=[Filtered]&state=[Filtered]&q=1"
        )
        assert scrubbed["breadcrumbs"]["values"][0]["data"]["url"] == (
            "https://idp.example.test/token?refresh_token=[Filtered]"
        )
        assert scrubbed["spans"][0]["data"] == {
            "http.query": "state=[Filtered]&page=2",
            "url": "https://x.test/",
        }

    def test_span_data_credentials_are_redacted_by_key(self):
        event = {"spans": [{"data": {"client_secret": "s", "ok": 1}}]}

        scrubbed = _scrub_event(event, {})

        assert scrubbed["spans"][0]["data"] == {"client_secret": "[Filtered]", "ok": 1}


class TestConfigureObservability:
    def test_no_dsn_means_sentry_is_not_initialised(self, monkeypatch):
        monkeypatch.delenv("BACKEND_SENTRY_DSN", raising=False)
        get_settings.cache_clear()
        calls: list[dict[str, Any]] = []
        monkeypatch.setattr(
            observability.sentry_sdk, "init", lambda **kw: calls.append(kw)
        )

        configure_observability()

        assert calls == []

    def test_dsn_initialises_sentry_with_privacy_options(self, monkeypatch):
        monkeypatch.setenv("BACKEND_SENTRY_DSN", "https://key@example.invalid/1")
        monkeypatch.setenv("BACKEND_SENTRY_TRACES_SAMPLE_RATE", "0.1")
        get_settings.cache_clear()
        calls: list[dict[str, Any]] = []
        monkeypatch.setattr(
            observability.sentry_sdk, "init", lambda **kw: calls.append(kw)
        )

        configure_observability()

        assert len(calls) == 1
        options = calls[0]
        assert options["dsn"] == "https://key@example.invalid/1"
        assert options["send_default_pii"] is False
        assert options["include_local_variables"] is False
        assert options["before_send"] is _scrub_event
        assert options["before_send_transaction"] is _scrub_event
        assert options["traces_sample_rate"] == pytest.approx(0.1)
        scrubber = options["event_scrubber"]
        assert isinstance(scrubber, EventScrubber)
        for key in ("access_token", "refresh_token", "client_secret", "code"):
            assert key in scrubber.denylist
        get_settings.cache_clear()


@pytest.fixture
def restore_root_logging():
    """Restore root handlers and level after logging tests reconfigure them."""

    root = logging.getLogger()
    handlers, level = list(root.handlers), root.level
    yield
    root.handlers[:] = handlers
    root.setLevel(level)


class TestLoggingConfig:
    def test_configure_logging_sets_root_info_and_quiets_http_clients(
        self, restore_root_logging
    ):
        configure_logging()

        assert logging.getLogger().level == logging.INFO
        assert logging.getLogger("httpx").level == logging.WARNING
        assert logging.getLogger("httpcore").level == logging.WARNING

    def test_configure_logging_installs_request_filter_on_handlers(
        self, restore_root_logging
    ):
        configure_logging()

        handlers = logging.getLogger().handlers
        assert handlers
        for handler in handlers:
            assert any(isinstance(f, RequestIdFilter) for f in handler.filters)

    def test_configure_logging_is_idempotent_for_filters(self, restore_root_logging):
        configure_logging()
        configure_logging()

        for handler in logging.getLogger().handlers:
            filters = [f for f in handler.filters if isinstance(f, RequestIdFilter)]
            assert len(filters) == 1


class TestRequestIdFilter:
    def _record(self) -> logging.LogRecord:
        return logging.LogRecord("t", logging.INFO, __file__, 1, "msg", (), None)

    def test_defaults_to_dash_outside_a_request(self):
        record = self._record()

        RequestIdFilter().filter(record)

        assert record.request_id == "-"

    def test_reads_active_request_id(self):
        token = request_id_var.set("abc-123")
        try:
            record = self._record()
            RequestIdFilter().filter(record)
        finally:
            request_id_var.reset(token)

        assert record.request_id == "abc-123"

    def test_request_ids_do_not_leak_between_concurrent_tasks(self):
        async def emit(request_id: str) -> str:
            token = request_id_var.set(request_id)
            try:
                await asyncio.sleep(0)
                record = self._record()
                RequestIdFilter().filter(record)
                return record.request_id
            finally:
                request_id_var.reset(token)

        async def run() -> list[str]:
            return list(await asyncio.gather(*(emit(f"req-{i}") for i in range(20))))

        results = asyncio.run(run())

        assert results == [f"req-{i}" for i in range(20)]
