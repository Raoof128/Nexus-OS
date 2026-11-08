"""Observability bootstrap: Sentry initialisation and sensitive-data scrubbing.

Sentry sends request data, query strings, cookies, frame locals, breadcrumbs
and ``extra`` to the service. Everything that leaves the process passes through
``_scrub_event`` (``before_send`` for errors, ``before_send_transaction`` for
performance events) and the SDK's ``EventScrubber``. Both share one denylist,
``_SCRUB_KEYS``.

References used for these choices (verified against the installed SDK):
- sentry_sdk/consts.py: ``include_local_variables`` defaults to True.
- sentry_sdk/scrubber.py: ``EventScrubber.scrub_event`` matches denylist keys
  exactly and only at the top level of each dict (``recursive=False``), so
  nested bodies and URL strings need ``_scrub_event``. It also does not touch
  ``url`` or ``http.query`` values, which can carry ``code=`` or ``state=``.
- sentry_sdk/integrations/_asgi_common.py: ``request.url`` excludes the query
  string; the query is sent separately as ``request.query_string``.
- sentry_sdk/client.py: ``before_send_transaction`` is a separate hook. The
  installed SDK ignores ``before_send_span`` unless ``trace_lifecycle`` is set.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterator
from typing import Any

import sentry_sdk
from sentry_sdk.scrubber import DEFAULT_DENYLIST, EventScrubber

try:
    from .config import get_settings
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings

logger = logging.getLogger(__name__)

_FILTERED = "[Filtered]"

# Credential-bearing names that must never reach Sentry. Stored lowercase;
# matching is case-insensitive. ``code`` and ``state`` are the OAuth callback
# parameters; ``code_verifier`` is the PKCE secret.
_SCRUB_KEYS: frozenset[str] = frozenset(
    {
        "access_token",
        "api_key",
        "authorization",
        "client_secret",
        "code",
        "code_verifier",
        "id_token",
        "new_password",
        "password",
        "provider_refresh_token",
        "provider_token",
        "refresh_token",
        "state",
        "token_hash",
    }
)

# Request headers that carry credentials. The SDK's own header filter only drops
# ``authorization`` and ``cookie``; the password-reset flow sends its recovery
# session in ``X-Recovery-*`` headers, which would otherwise reach Sentry verbatim.
_SCRUB_HEADERS: frozenset[str] = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "proxy-authorization",
        "x-api-key",
        "x-recovery-access-token",
        "x-recovery-refresh-token",
    }
)

_KEY_ALTERNATION = "|".join(
    re.escape(key) for key in sorted(_SCRUB_KEYS, key=len, reverse=True)
)
# ``key=value`` pairs in form-encoded bodies and query strings. The lookbehind
# keeps ``promo_code=`` and ``xtoken=`` from matching a credential key.
_FORM_PAIR_RE = re.compile(
    rf"(?<![A-Za-z0-9_])({_KEY_ALTERNATION})=[^&\"'\s]*",
    re.IGNORECASE,
)
# ``"key": "value"`` pairs in raw JSON text.
_JSON_PAIR_RE = re.compile(
    rf'("(?:{_KEY_ALTERNATION})"\s*:\s*)"[^"]*"',
    re.IGNORECASE,
)


def _redact_text(text: str) -> str:
    """Redact credential values in form-encoded or JSON-style raw text."""

    text = _JSON_PAIR_RE.sub(lambda m: f'{m.group(1)}"{_FILTERED}"', text)
    return _FORM_PAIR_RE.sub(lambda m: f"{m.group(1)}={_FILTERED}", text)


def _redact_in_place(value: Any) -> None:
    """Replace values of credential-named keys, recursing into dicts and lists."""

    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(key, str) and key.lower() in _SCRUB_KEYS:
                value[key] = _FILTERED
            else:
                _redact_in_place(item)
    elif isinstance(value, list):
        for item in value:
            _redact_in_place(item)


def _scrub_body(body: Any) -> Any:
    """Redact a request body given as a parsed structure or as raw text."""

    if isinstance(body, (dict, list)):
        _redact_in_place(body)
        return body
    if not isinstance(body, str):
        return body
    try:
        parsed = json.loads(body)
    except ValueError:
        return _redact_text(body)
    if isinstance(parsed, (dict, list)):
        _redact_in_place(parsed)
        return json.dumps(parsed)
    return _redact_text(body)


def _scrub_query(query: Any) -> Any:
    """Redact a query string given as text or as a parsed mapping."""

    if isinstance(query, str):
        return _redact_text(query)
    if isinstance(query, dict):
        _redact_in_place(query)
    return query


_URL_FIELDS: frozenset[str] = frozenset(
    {"url", "http.url", "http.query", "query_string", "query"}
)


def _redact_url_fields(data: dict[str, Any]) -> None:
    """Redact credential parameters inside URL-like string fields of a mapping."""

    for key, value in data.items():
        if isinstance(key, str) and key.lower() in _URL_FIELDS:
            if isinstance(value, str):
                data[key] = _redact_text(value)
            elif isinstance(value, dict):
                _redact_in_place(value)


def _is_secret_header(name: Any) -> bool:
    if not isinstance(name, str):
        return False
    lowered = name.lower()
    return lowered in _SCRUB_HEADERS or lowered in _SCRUB_KEYS


def _scrub_headers(headers: Any) -> Any:
    """Redact credential headers given as a mapping or as [name, value] pairs."""

    if isinstance(headers, dict):
        for name in headers:
            if _is_secret_header(name):
                headers[name] = _FILTERED
    elif isinstance(headers, list):
        for pair in headers:
            if isinstance(pair, list) and len(pair) == 2 and _is_secret_header(pair[0]):
                pair[1] = _FILTERED
    return headers


def _iter_spans(event: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Yield every span dict on a transaction event."""

    spans = event.get("spans")
    if not isinstance(spans, list):
        return
    for span in spans:
        if isinstance(span, dict):
            yield span


def _iter_frames(event: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Yield every exception stack frame dict in an event."""

    exception = event.get("exception")
    if not isinstance(exception, dict):
        return
    for value in exception.get("values") or []:
        if not isinstance(value, dict):
            continue
        stacktrace = value.get("stacktrace")
        if not isinstance(stacktrace, dict):
            continue
        for frame in stacktrace.get("frames") or []:
            if isinstance(frame, dict):
                yield frame


def _scrub_event(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    """Strip credentials from a Sentry event or transaction before transmission.

    Covers request cookies, body, query string and URL; ``extra``; breadcrumb
    and span data (including ``url`` and ``http.query``); and exception frame
    locals. Works on error events and transactions alike.
    """

    request = event.get("request")
    if isinstance(request, dict):
        if request.get("cookies"):
            request["cookies"] = _FILTERED
        if request.get("headers"):
            request["headers"] = _scrub_headers(request["headers"])
        if "data" in request:
            request["data"] = _scrub_body(request["data"])
        if request.get("query_string"):
            request["query_string"] = _scrub_query(request["query_string"])
        _redact_url_fields(request)

    extra = event.get("extra")
    if isinstance(extra, dict):
        _redact_in_place(extra)

    breadcrumbs = event.get("breadcrumbs")
    crumbs: Any = breadcrumbs
    if isinstance(breadcrumbs, dict):
        crumbs = breadcrumbs.get("values") or []
    if isinstance(crumbs, list):
        for crumb in crumbs:
            if isinstance(crumb, dict) and isinstance(crumb.get("data"), dict):
                _redact_in_place(crumb["data"])
                _redact_url_fields(crumb["data"])

    for span in _iter_spans(event):
        if isinstance(span.get("data"), dict):
            _redact_in_place(span["data"])
            _redact_url_fields(span["data"])

    for frame in _iter_frames(event):
        if isinstance(frame.get("vars"), dict):
            _redact_in_place(frame["vars"])

    return event


def _build_event_scrubber() -> EventScrubber:
    """Return the SDK scrubber with the shared credential denylist added."""

    return EventScrubber(
        denylist=list(DEFAULT_DENYLIST) + sorted(_SCRUB_KEYS),
        send_default_pii=False,
    )


def configure_observability() -> None:
    """Initialise Sentry when a DSN is configured; otherwise do nothing."""

    settings = get_settings()
    if not settings.backend_sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.backend_sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.backend_sentry_traces_sample_rate,
        send_default_pii=False,
        # Frame locals often hold tokens or passwords; the SDK default is True.
        include_local_variables=False,
        event_scrubber=_build_event_scrubber(),
        before_send=_scrub_event,
        before_send_transaction=_scrub_event,
    )
    logger.info("Sentry observability enabled for backend")
