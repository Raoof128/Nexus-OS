"""Background email poller: syncs connected accounts on a configurable interval.

Each cycle:

1. Loads the active ``email_accounts`` rows (one service client per cycle).
2. Syncs accounts concurrently (bounded), each under its own timeout.
3. Per account: refreshes the OAuth token if it is near expiry, fetches the
   recent page of messages, detects ghosts (inbox rows that disappeared
   remotely) and upserts the messages.

Blocking PostgREST calls run in worker threads via :func:`run_blocking` so the
event loop keeps serving requests.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import json
import logging
import re
from collections.abc import Iterable
from typing import TYPE_CHECKING, Any, TypedDict

import httpx

try:
    from .config import get_settings
    from .email_service import (
        _MAX_ID_PAGES,
        EmailMessage,
        decrypt_oauth_token,
        encrypt_oauth_token,
        get_provider,
    )
    from .services import create_supabase_service_client, run_blocking
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from email_service import (
        _MAX_ID_PAGES,
        EmailMessage,
        decrypt_oauth_token,
        encrypt_oauth_token,
        get_provider,
    )
    from services import create_supabase_service_client, run_blocking

if TYPE_CHECKING:
    from litestar import Litestar

    from .config import BackendSettings
    from .email_service import GmailProvider, GraphProvider

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

#: Refresh the access token when less than this many seconds remain.
_REFRESH_WINDOW_SECONDS = 300
#: Lifetime assumed when the provider omits or garbles ``expires_in``.
_DEFAULT_TOKEN_LIFETIME_SECONDS = 3600
#: Timeouts for the token endpoint call (httpx default read timeout is 5 s).
_TOKEN_HTTP_TIMEOUT = httpx.Timeout(5.0, connect=5.0)
#: Attempts to persist a refreshed token before giving up (logged at error).
_PERSIST_ATTEMPTS = 3
_PERSIST_RETRY_DELAY_SECONDS = 0.5

#: Page size used by the remote id listing in ``email_service`` (Gmail/Graph).
_ID_LIST_PAGE_SIZE = 500
#: Remote id listing stops at this many ids; beyond it ghost detection is unsafe.
_ID_LIST_CAP = _MAX_ID_PAGES * _ID_LIST_PAGE_SIZE

#: PostgREST ``max_rows`` on the local Supabase config is 1000
#: (``supabase/config.toml``); pages must not exceed it.
_DB_PAGE_SIZE = 1000
#: Guard against a server that ignores ``offset`` and returns the same page.
_DB_MAX_ROWS = 500_000

#: Ghost updates are sent in chunks of at most this many ids and characters.
_GHOST_BATCH_MAX_IDS = 100
_GHOST_BATCH_MAX_CHARS = 4000

#: Ghost sets that look like a bulk failure (see ``_is_anomalous_ghost_set``).
_GHOST_MIN_SAMPLE = 20
_GHOST_RATIO_THRESHOLD = 0.5

_MAX_CONCURRENT_ACCOUNTS = 4
_ACCOUNT_SYNC_TIMEOUT_SECONDS = 120
_SHUTDOWN_TIMEOUT_SECONDS = 5.0

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"  # nosec B105
_MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"  # nosec B105
_MICROSOFT_SCOPE = "Mail.ReadWrite Mail.Send MailboxSettings.Read offline_access"

#: Columns the user (or a local action) owns once a row exists. The poller
#: never writes them on conflict, so a poll cannot undo a move, read or star.
_USER_STATE_COLUMNS = frozenset({"folder", "is_read", "is_starred"})

_OAUTH_ERROR_RE = re.compile(r"[a-z_]{1,64}")


class EmailAccountRow(TypedDict, total=False):
    """Shape of an ``email_accounts`` row as the poller reads it."""

    id: str
    user_id: str
    provider: str
    email_address: str
    access_token_enc: str
    refresh_token_enc: str
    token_expires_at: str | None
    status: str


class EmailAccountNeedsReauth(Exception):
    """The provider rejected the refresh grant; the user must reconnect."""


class TokenRefreshError(Exception):
    """The token endpoint answered, but not with a usable token response."""


# Per-process state. Lost on restart, which only costs one extra write per row
# and one extra ghost cycle.
_pending_ghosts: dict[str, frozenset[str]] = {}
_row_fingerprints: dict[str, dict[str, str]] = {}
_warned_unconfigured: set[str] = set()

# ---------------------------------------------------------------------------
# Pure helpers (easily unit-tested)
# ---------------------------------------------------------------------------


def detect_ghost_emails(db_ids: set[str], remote_ids: set[str]) -> set[str]:
    """Return IDs that exist in the DB but are no longer on the remote.

    'Ghosts' are messages that were previously synced but are no longer in
    the remote inbox list. The caller decides how to record them.

    Args:
        db_ids:     Set of provider_id values currently stored in Supabase.
        remote_ids: Set of provider_id values returned by the live provider.

    Returns:
        The difference ``db_ids - remote_ids``.
    """
    return db_ids - remote_ids


def _is_anomalous_ghost_set(ghosts: set[str], db_ids: set[str]) -> bool:
    """Return True when a ghost set is too large to trust in one cycle.

    A small inbox legitimately empties, so the check only applies once the DB
    holds at least ``_GHOST_MIN_SAMPLE`` inbox rows. An empty remote list is
    covered too: every row is then a ghost, so the ratio is 1.0.
    """
    if len(db_ids) < _GHOST_MIN_SAMPLE:
        return False
    return len(ghosts) / len(db_ids) > _GHOST_RATIO_THRESHOLD


def _chunk_ids(ids: Iterable[str]) -> list[list[str]]:
    """Split ids into batches bounded by count and by encoded URL length.

    Provider ids differ a lot in length (Gmail ids are short, Graph ids are
    long), so a count alone does not bound the ``in.(...)`` query string. Each
    id is charged its length plus three characters for quotes and separator.
    An id longer than the budget still gets a batch of its own.
    """
    chunks: list[list[str]] = []
    current: list[str] = []
    size = 0
    for provider_id in ids:
        cost = len(provider_id) + 3
        if current and (
            len(current) >= _GHOST_BATCH_MAX_IDS or size + cost > _GHOST_BATCH_MAX_CHARS
        ):
            chunks.append(current)
            current, size = [], 0
        current.append(provider_id)
        size += cost
    if current:
        chunks.append(current)
    return chunks


def _strip_user_state(row: dict) -> dict:
    """Return a copy of a message row without the user-owned columns."""
    return {k: v for k, v in row.items() if k not in _USER_STATE_COLUMNS}


def _fingerprint(payload: dict) -> str:
    """Hash the remote-owned content of a row, ignoring the sync timestamp."""
    content = {k: v for k, v in payload.items() if k != "synced_at"}
    encoded = json.dumps(content, sort_keys=True, default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def _oauth_error_code(resp: httpx.Response) -> str | None:
    """Return the OAuth ``error`` code from a token response, if it is safe to log.

    Only a short lowercase token is returned, so neither the response body nor
    anything that resembles a credential reaches the logs.
    """
    try:
        body = resp.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    code = body.get("error")
    if isinstance(code, str) and _OAUTH_ERROR_RE.fullmatch(code):
        return code
    return None


# ---------------------------------------------------------------------------
# Blocking DB helpers (always run through run_blocking)
# ---------------------------------------------------------------------------


# 'active' is the only connected state allowed by email_accounts_status_check
# (20260817000001_backend_integrity_hardening.sql, applied in production).
POLLABLE_ACCOUNT_STATUSES: tuple[str, ...] = ("active",)


def _select_active_accounts(db: Any) -> list[EmailAccountRow]:
    resp = (
        db.postgrest.from_("email_accounts")
        .select("*")
        .in_("status", list(POLLABLE_ACCOUNT_STATUSES))
        .execute()
    )
    return resp.data or []


def _select_provider_ids(db: Any, account_id: str, folder: str | None) -> set[str]:
    """Read every provider_id for an account, paging by ``provider_id``.

    Pages are requested until one comes back empty, not until one comes back
    short. That stays correct when the server caps pages below ``_DB_PAGE_SIZE``.
    """
    ids: set[str] = set()
    offset = 0
    while offset < _DB_MAX_ROWS:
        query = (
            db.postgrest.from_("nexus_emails")
            .select("provider_id")
            .eq("account_id", account_id)
        )
        if folder is not None:
            query = query.eq("folder", folder)
        resp = (
            query.order("provider_id")
            .range(offset, offset + _DB_PAGE_SIZE - 1)
            .execute()
        )
        page = resp.data or []
        if not page:
            break
        ids.update(row["provider_id"] for row in page)
        offset += len(page)
    else:
        logger.warning("Inbox id read for account %s hit the row guard", account_id)
    return ids


def _mark_ghosts_deleted(db: Any, account_id: str, chunk: list[str]) -> None:
    (
        db.postgrest.from_("nexus_emails")
        .update({"folder": "deleted"})
        .in_("provider_id", chunk)
        .eq("account_id", account_id)
        .eq("folder", "inbox")
        .execute()
    )


def _upsert_messages(
    db: Any, rows: list[dict], *, insert_only: bool, default_to_null: bool
) -> None:
    db.postgrest.from_("nexus_emails").upsert(
        rows,
        on_conflict="account_id,provider_id",
        ignore_duplicates=insert_only,
        default_to_null=default_to_null,
    ).execute()


def _write_account_row(account_id: str, update_row: dict) -> None:
    db = create_supabase_service_client()
    (
        db.postgrest.from_("email_accounts")
        .update(update_row)
        .eq("id", account_id)
        .execute()
    )


def _mark_account_disconnected(account_id: str) -> None:
    db = create_supabase_service_client()
    (
        db.postgrest.from_("email_accounts")
        .update({"status": "disconnected"})
        .eq("id", account_id)
        .execute()
    )


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------


def _access_token_expiring(account: EmailAccountRow) -> bool:
    """Return True when the stored access token is within the refresh window."""
    expires_at_str = account.get("token_expires_at")
    if not expires_at_str:
        return False
    try:
        expires_at = dt.datetime.fromisoformat(expires_at_str)
    except (ValueError, TypeError):
        logger.warning(
            "Could not parse token_expires_at for account %s", account.get("id")
        )
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=dt.timezone.utc)
    remaining = (expires_at - dt.datetime.now(dt.timezone.utc)).total_seconds()
    return remaining < _REFRESH_WINDOW_SECONDS


def _build_refresh_request(
    provider_name: str, refresh_token: str, settings: BackendSettings
) -> tuple[str, dict] | None:
    """Return ``(token_url, form_payload)`` or None when refresh cannot run.

    Refresh needs both the client id and the client secret. Without them the
    provider would reject an empty secret on every cycle, so the refresh is
    skipped with one warning per provider instead.
    """
    if provider_name == "google":
        client_id = settings.google_oauth_client_id
        client_secret = settings.google_oauth_client_secret
        token_url = _GOOGLE_TOKEN_URL
        extra: dict[str, str] = {}
    elif provider_name == "microsoft":
        client_id = settings.microsoft_oauth_client_id
        client_secret = settings.microsoft_oauth_client_secret
        token_url = _MICROSOFT_TOKEN_URL
        extra = {"scope": _MICROSOFT_SCOPE}
    else:
        logger.warning("Unknown provider '%s', skipping token refresh", provider_name)
        return None

    if not client_id or not client_secret:
        if provider_name not in _warned_unconfigured:
            _warned_unconfigured.add(provider_name)
            logger.warning(
                "OAuth client id or secret missing for %s; token refresh disabled",
                provider_name,
            )
        return None

    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
        **extra,
    }
    return token_url, payload


def _parse_expires_in(raw: object, account_id: str | None) -> int:
    """Return the token lifetime in seconds, or the default if it is unusable.

    A bad value must not discard a rotated refresh token that arrived in the
    same response, so this falls back instead of raising.
    """
    try:
        value = int(raw)  # type: ignore[call-overload]
    except (TypeError, ValueError):
        value = 0
    if value <= 0:
        logger.warning(
            "Unusable expires_in from token endpoint for account %s; assuming %ds",
            account_id,
            _DEFAULT_TOKEN_LIFETIME_SECONDS,
        )
        return _DEFAULT_TOKEN_LIFETIME_SECONDS
    return value


async def _persist_token_update(account_id: str | None, update_row: dict) -> None:
    """Write refreshed tokens, retrying briefly. Logs at error level on failure.

    The new access token is still returned after a failed write, because it is
    valid now. The next cycle may then fail with invalid_grant if the provider
    rotated the refresh token, which is handled by the reauth path.
    """
    for attempt in range(1, _PERSIST_ATTEMPTS + 1):
        try:
            await run_blocking(_write_account_row, account_id, update_row)
            return
        except Exception as exc:
            if attempt == _PERSIST_ATTEMPTS:
                logger.error(
                    "Failed to persist refreshed token for account %s after %d "
                    "attempts (%s)",
                    account_id,
                    attempt,
                    type(exc).__name__,
                )
                return
            logger.warning(
                "Token persist attempt %d failed for account %s (%s); retrying",
                attempt,
                account_id,
                type(exc).__name__,
            )
            await asyncio.sleep(_PERSIST_RETRY_DELAY_SECONDS * attempt)


async def refresh_token_if_needed(
    account: EmailAccountRow, settings: BackendSettings
) -> str:
    """Return a valid access token, refreshing if it is within 5 minutes of expiry.

    Returns the plaintext access token for API calls. The refreshed tokens
    are encrypted and written back to ``email_accounts``.

    Failure modes:

    * Transport errors, 5xx and 429 responses keep the current token, so the
      caller tries it and the next cycle retries the refresh.
    * ``invalid_grant`` marks the account ``disconnected`` and raises
      :class:`EmailAccountNeedsReauth`. The poller stops syncing it until the
      user reconnects.
    * A 200 response without an ``access_token`` raises :class:`TokenRefreshError`
      and nothing is written, so the stale token never gets a fresh expiry.
    """

    access_token = decrypt_oauth_token(account["access_token_enc"])
    account_id = account.get("id")
    refresh_token_enc = account.get("refresh_token_enc", "")

    if not _access_token_expiring(account) or not refresh_token_enc:
        return access_token

    request = _build_refresh_request(
        account.get("provider", ""),
        decrypt_oauth_token(refresh_token_enc),
        settings,
    )
    if request is None:
        return access_token
    token_url, payload = request

    try:
        async with httpx.AsyncClient(timeout=_TOKEN_HTTP_TIMEOUT) as http:
            resp = await http.post(token_url, data=payload)
    except httpx.HTTPError as exc:
        logger.warning(
            "Token refresh transport error for account %s (%s); keeping current token",
            account_id,
            type(exc).__name__,
        )
        return access_token

    if resp.status_code >= 400:
        oauth_error = _oauth_error_code(resp)
        if oauth_error == "invalid_grant":
            try:
                await run_blocking(_mark_account_disconnected, account_id)
            except Exception as exc:
                logger.error(
                    "Could not mark account %s disconnected (%s)",
                    account_id,
                    type(exc).__name__,
                )
            logger.error(
                "Refresh grant rejected for account %s (invalid_grant); "
                "account marked disconnected, reauthorisation needed",
                account_id,
            )
            raise EmailAccountNeedsReauth(str(account_id))
        logger.warning(
            "Token refresh rejected for account %s (HTTP %d, error=%s); "
            "keeping current token",
            account_id,
            resp.status_code,
            oauth_error,
        )
        return access_token

    try:
        token_data = resp.json()
    except ValueError as exc:
        raise TokenRefreshError(
            f"token response for account {account_id} was not JSON"
        ) from exc

    new_access_token = (
        token_data.get("access_token") if isinstance(token_data, dict) else None
    )
    if not isinstance(new_access_token, str) or not new_access_token:
        raise TokenRefreshError(
            f"token response for account {account_id} had no access_token"
        )

    expires_in = _parse_expires_in(token_data.get("expires_in"), account_id)
    update_row: dict = {
        "access_token_enc": encrypt_oauth_token(new_access_token),
        "token_expires_at": (
            dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=expires_in)
        ).isoformat(),
    }
    rotated = token_data.get("refresh_token")
    if isinstance(rotated, str) and rotated:
        update_row["refresh_token_enc"] = encrypt_oauth_token(rotated)

    await _persist_token_update(account_id, update_row)
    return new_access_token


# ---------------------------------------------------------------------------
# Per-account sync
# ---------------------------------------------------------------------------


def _parse_messages(
    raw_messages: list[dict], provider_name: str, account_id: str, user_id: str
) -> list[dict]:
    """Convert raw provider messages to rows. A bad message is logged and skipped."""
    rows: list[dict] = []
    for raw in raw_messages:
        try:
            if provider_name == "google":
                msg = EmailMessage.from_gmail(
                    raw, account_id=account_id, user_id=user_id
                )
            else:
                msg = EmailMessage.from_graph(
                    raw, account_id=account_id, user_id=user_id
                )
            rows.append(msg.to_supabase_row())
        except Exception:
            logger.exception("Failed to parse message for account %s", account_id)
    return rows


async def _fetch_remote_ids(
    provider: GmailProvider | GraphProvider, access_token: str, account_id: str
) -> set[str] | None:
    """Return the full remote inbox id set, or None if the listing failed."""
    try:
        return set(await provider.fetch_message_ids(access_token))
    except Exception:
        logger.exception(
            "Failed to fetch full message id list for account %s; "
            "skipping ghost detection this cycle",
            account_id,
        )
        return None


async def _run_ghost_detection(db: Any, account_id: str, remote_ids: set[str]) -> None:
    """Mark inbox rows that vanished remotely as deleted, with safety guards.

    A bulk ghost set (for example an empty remote list on a large inbox) is
    logged at error level and applied only when the same set is seen on two
    consecutive cycles. Ghost updates are sent in chunks, and a failed chunk
    does not stop the rest.
    """
    try:
        db_ids = await run_blocking(_select_provider_ids, db, account_id, "inbox")
    except Exception:
        logger.exception("Ghost detection failed for account %s", account_id)
        return

    ghosts = detect_ghost_emails(db_ids, remote_ids)
    if not ghosts:
        _pending_ghosts.pop(account_id, None)
        return

    if _is_anomalous_ghost_set(ghosts, db_ids):
        logger.error(
            "Anomalous ghost set for account %s: %d of %d inbox row(s) missing "
            "remotely (remote list size %d); applying only if unchanged next cycle",
            account_id,
            len(ghosts),
            len(db_ids),
            len(remote_ids),
        )
        key = frozenset(ghosts)
        if _pending_ghosts.get(account_id) != key:
            _pending_ghosts[account_id] = key
            return
        logger.warning(
            "Applying anomalous ghost set for account %s after a second cycle",
            account_id,
        )

    _pending_ghosts.pop(account_id, None)
    logger.info("Detected %d ghost email(s) for account %s", len(ghosts), account_id)

    for index, chunk in enumerate(_chunk_ids(sorted(ghosts))):
        try:
            await run_blocking(_mark_ghosts_deleted, db, account_id, chunk)
        except Exception:
            logger.exception(
                "Ghost update failed for account %s (chunk %d, %d id(s)); continuing",
                account_id,
                index,
                len(chunk),
            )


async def _upsert_messages_for_account(
    db: Any, account_id: str, rows: list[dict]
) -> None:
    """Insert new messages and refresh existing ones without touching user state.

    * Rows whose provider_id is new get the full row, inserted with
      ``ignore_duplicates`` so a concurrent insert cannot be overwritten.
    * Rows that already exist get only remote-owned columns. ``folder``,
      ``is_read`` and ``is_starred`` are never sent for them. Unchanged rows
      are skipped, which avoids rewriting every row every cycle.
    """
    try:
        existing = await run_blocking(_select_provider_ids, db, account_id, None)
    except Exception:
        logger.exception("Failed to read existing messages for account %s", account_id)
        return

    fingerprints = _row_fingerprints.setdefault(account_id, {})
    new_rows = [r for r in rows if r["provider_id"] not in existing]
    changed: list[dict] = []
    for row in rows:
        if row["provider_id"] not in existing:
            continue
        stripped = _strip_user_state(row)
        if fingerprints.get(row["provider_id"]) != _fingerprint(stripped):
            changed.append(stripped)

    try:
        if new_rows:
            await run_blocking(
                _upsert_messages, db, new_rows, insert_only=True, default_to_null=True
            )
        if changed:
            await run_blocking(
                _upsert_messages, db, changed, insert_only=False, default_to_null=False
            )
    except Exception:
        logger.exception("Failed to upsert messages for account %s", account_id)
        return

    for row in new_rows:
        fingerprints[row["provider_id"]] = _fingerprint(_strip_user_state(row))
    for row in changed:
        fingerprints[row["provider_id"]] = _fingerprint(row)


async def sync_account(
    account: EmailAccountRow, settings: BackendSettings, *, db: Any | None = None
) -> None:
    """Fetch new messages for one account and upsert them into Supabase.

    Also detects ghost messages (in DB but gone from the remote inbox) and
    marks them as deleted locally. ``db`` is the per-cycle service client;
    when omitted, a client is created for this call.
    """

    account_id = account.get("id", "")
    user_id = account.get("user_id", "")
    provider_name = account.get("provider", "")

    logger.debug("Syncing account %s (%s)", account_id, provider_name)

    try:
        access_token = await refresh_token_if_needed(account, settings)
    except EmailAccountNeedsReauth:
        return
    except TokenRefreshError as exc:
        logger.error("Skipping account %s this cycle: %s", account_id, exc)
        return
    except Exception:
        logger.exception("Could not obtain token for account %s", account_id)
        return

    try:
        provider = get_provider(provider_name)
    except ValueError:
        logger.warning(
            "Unknown provider '%s' for account %s", provider_name, account_id
        )
        return

    try:
        raw_messages = await provider.fetch_messages(access_token)
    except Exception:
        logger.exception("Failed to fetch messages for account %s", account_id)
        return

    rows = _parse_messages(raw_messages, provider_name, account_id, user_id)
    client = db if db is not None else create_supabase_service_client()

    # ``fetch_messages`` returns only a recent page, so it must NOT be used as
    # the "what still exists remotely" set. ``fetch_message_ids`` lists the
    # full inbox. If that listing is capped or fails, ghost detection is
    # skipped for this cycle and no row is marked deleted.
    remote_ids = await _fetch_remote_ids(provider, access_token, account_id)
    if remote_ids is not None:
        if len(remote_ids) >= _ID_LIST_CAP:
            logger.warning(
                "Remote id list for account %s reached the %d-id cap; "
                "skipping ghost detection this cycle",
                account_id,
                _ID_LIST_CAP,
            )
        else:
            await _run_ghost_detection(client, account_id, remote_ids)

    if rows:
        await _upsert_messages_for_account(client, account_id, rows)

    logger.debug("Synced %d message(s) for account %s", len(rows), account_id)


# ---------------------------------------------------------------------------
# Poll loop
# ---------------------------------------------------------------------------


async def poll_all_accounts() -> None:
    """Fetch all active email accounts and sync them with bounded concurrency.

    One service client is built per cycle and shared by the accounts. Each
    account runs under its own timeout, and a failure in one account does not
    affect the others.
    """

    settings = get_settings()
    try:
        db = create_supabase_service_client()
        accounts = await run_blocking(_select_active_accounts, db)
    except Exception:
        logger.exception("Failed to fetch email accounts for polling")
        return

    logger.debug("Polling %d active email account(s)", len(accounts))
    gate = asyncio.Semaphore(_MAX_CONCURRENT_ACCOUNTS)

    async def _sync_one(account: EmailAccountRow) -> None:
        account_id = account.get("id")
        async with gate:
            try:
                async with asyncio.timeout(_ACCOUNT_SYNC_TIMEOUT_SECONDS):
                    await sync_account(account, settings, db=db)
            except TimeoutError:
                logger.error(
                    "Sync for account %s exceeded %ds; aborted this cycle",
                    account_id,
                    _ACCOUNT_SYNC_TIMEOUT_SECONDS,
                )
            except Exception:
                logger.exception("Unexpected error syncing account %s", account_id)

    await asyncio.gather(*(_sync_one(account) for account in accounts))


async def _poller_loop(interval: int) -> None:
    """Run poll_all_accounts() every *interval* seconds until cancelled."""

    logger.info("Email poller started (interval=%ds)", interval)
    while True:
        try:
            await poll_all_accounts()
        except Exception:
            logger.exception("Email poller cycle failed")
        await asyncio.sleep(interval)


# ---------------------------------------------------------------------------
# Litestar lifecycle hooks
# ---------------------------------------------------------------------------


async def start_email_poller(app: Litestar) -> None:
    """Litestar on_startup hook that launches the background poller task.

    The poller is skipped when no OAuth client IDs are configured, so the app
    starts cleanly without email integration. Each provider also needs its
    client secret for token refresh. A provider without one is still polled
    for accounts that do not need refresh, and a warning is logged.
    The task handle is stored on ``app.state`` so the shutdown hook can cancel it.
    """

    settings = get_settings()
    if not settings.google_oauth_client_id and not settings.microsoft_oauth_client_id:
        logger.info("Email poller disabled: no OAuth client IDs configured")
        return

    for name, client_id, secret in (
        (
            "google",
            settings.google_oauth_client_id,
            settings.google_oauth_client_secret,
        ),
        (
            "microsoft",
            settings.microsoft_oauth_client_id,
            settings.microsoft_oauth_client_secret,
        ),
    ):
        if client_id and not secret:
            logger.warning(
                "%s has a client id but no client secret; token refresh is disabled",
                name,
            )

    task = asyncio.create_task(
        _poller_loop(settings.email_poll_interval_seconds),
        name="email_poller",
    )
    app.state.email_poller_task = task
    logger.info("Email poller task scheduled")


async def stop_email_poller(app: Litestar) -> None:
    """Litestar on_shutdown hook that cancels the poller and waits briefly.

    Only the poller's own cancellation is absorbed. If the shutdown hook itself
    is cancelled, the ``CancelledError`` propagates. A poller that does not
    stop within ``_SHUTDOWN_TIMEOUT_SECONDS`` is logged and left behind.
    """

    task = getattr(app.state, "email_poller_task", None)
    if task is None:
        return
    app.state.email_poller_task = None
    if task.done():
        return

    task.cancel()
    done, _pending = await asyncio.wait({task}, timeout=_SHUTDOWN_TIMEOUT_SECONDS)
    if not done:
        logger.warning(
            "Email poller did not stop within %.1fs", _SHUTDOWN_TIMEOUT_SECONDS
        )
    elif task.cancelled():
        logger.info("Email poller task cancelled")
    elif (exc := task.exception()) is not None:
        logger.error("Email poller failed during shutdown", exc_info=exc)
