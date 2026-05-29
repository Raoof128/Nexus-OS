"""Background email poller: syncs connected accounts on a configurable interval."""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
from typing import TYPE_CHECKING

import httpx

try:
    from .config import get_settings
    from .email_service import (
        EmailMessage,
        decrypt_oauth_token,
        encrypt_oauth_token,
        get_provider,
    )
    from .services import create_supabase_service_client
except ImportError:  # pragma: no cover - supports backend cwd execution
    from config import get_settings
    from email_service import (
        EmailMessage,
        decrypt_oauth_token,
        encrypt_oauth_token,
        get_provider,
    )
    from services import create_supabase_service_client

if TYPE_CHECKING:
    from litestar import Litestar

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pure helpers (easily unit-tested)
# ---------------------------------------------------------------------------


def detect_ghost_emails(db_ids: set, remote_ids: set) -> set:
    """Return IDs that exist in the DB but are no longer on the remote.

    'Ghosts' are messages that were previously synced but have since been
    deleted or moved on the provider.  The caller can soft-delete or mark
    them accordingly.

    Args:
        db_ids:     Set of provider_id values currently stored in Supabase.
        remote_ids: Set of provider_id values returned by the live provider.

    Returns:
        The difference ``db_ids - remote_ids``.
    """
    return db_ids - remote_ids


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------


async def refresh_token_if_needed(account: dict, settings) -> str:
    """Return a valid access token, refreshing proactively if within 5 min of expiry.

    If the stored token is still fresh, the encrypted access token is
    decrypted and returned as-is.  When the expiry is within 300 s the
    refresh flow is executed and the new tokens are written back to the
    ``email_accounts`` table.

    Returns the plaintext access token ready for API calls.
    """

    access_token = decrypt_oauth_token(account["access_token_enc"])
    refresh_token_enc = account.get("refresh_token_enc", "")
    expires_at_str = account.get("token_expires_at")

    # Determine if we need to refresh
    should_refresh = False
    if expires_at_str:
        try:
            expires_at = dt.datetime.fromisoformat(expires_at_str)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=dt.timezone.utc)
            remaining = (expires_at - dt.datetime.now(dt.timezone.utc)).total_seconds()
            if remaining < 300:
                should_refresh = True
        except (ValueError, TypeError):
            logger.warning(
                "Could not parse token_expires_at for account %s", account.get("id")
            )

    if not should_refresh or not refresh_token_enc:
        return access_token

    refresh_token = decrypt_oauth_token(refresh_token_enc)
    provider_name = account.get("provider", "")

    if provider_name == "google":
        token_url = "https://oauth2.googleapis.com/token"  # nosec B105
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
        }
    elif provider_name == "microsoft":
        token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"  # nosec B105
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": settings.microsoft_oauth_client_id,
            "client_secret": settings.microsoft_oauth_client_secret,
            "scope": ("Mail.ReadWrite Mail.Send MailboxSettings.Read offline_access"),
        }
    else:
        logger.warning("Unknown provider '%s', skipping token refresh", provider_name)
        return access_token

    try:
        async with httpx.AsyncClient() as http:
            resp = await http.post(token_url, data=payload)
            resp.raise_for_status()
            token_data = resp.json()
    except Exception:
        logger.exception("Token refresh failed for account %s", account.get("id"))
        return access_token  # Best-effort: use existing token

    new_access_token = token_data.get("access_token", access_token)
    new_expires_in = int(token_data.get("expires_in", 3600))

    encrypted_access = encrypt_oauth_token(new_access_token)
    new_expires_at = (
        dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=new_expires_in)
    ).isoformat()

    update_row: dict = {
        "access_token_enc": encrypted_access,
        "token_expires_at": new_expires_at,
    }
    if "refresh_token" in token_data:
        update_row["refresh_token_enc"] = encrypt_oauth_token(
            token_data["refresh_token"]
        )

    try:
        db = create_supabase_service_client()
        (
            db.postgrest.from_("email_accounts")
            .update(update_row)
            .eq("id", account["id"])
            .execute()
        )
    except Exception:
        logger.exception(
            "Failed to persist refreshed token for account %s", account.get("id")
        )

    return new_access_token


# ---------------------------------------------------------------------------
# Per-account sync
# ---------------------------------------------------------------------------


async def sync_account(account: dict, settings) -> None:
    """Fetch new messages for one account and upsert them into Supabase.

    Also detects ghost messages (in DB but gone from remote) and marks
    them as deleted locally.
    """

    account_id = account.get("id", "")
    user_id = account.get("user_id", "")
    provider_name = account.get("provider", "")

    logger.debug("Syncing account %s (%s)", account_id, provider_name)

    try:
        access_token = await refresh_token_if_needed(account, settings)
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

    # Fetch remote messages
    try:
        raw_messages = await provider.fetch_messages(access_token)
    except Exception:
        logger.exception("Failed to fetch messages for account %s", account_id)
        return

    # Build EmailMessage objects and upsert
    rows = []
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

    if rows:
        try:
            db = create_supabase_service_client()
            db.postgrest.from_("nexus_emails").upsert(
                rows, on_conflict="account_id,provider_id"
            ).execute()
        except Exception:
            logger.exception("Failed to upsert messages for account %s", account_id)

    # Ghost detection.
    #
    # ``fetch_messages`` only returns a small recent page (Gmail ~100, Graph
    # defaults to 10), so it must NOT be used as the "what still exists
    # remotely" set — doing so would flag the entire older inbox as deleted on
    # every poll.  ``fetch_message_ids`` returns the full inbox id list (capped
    # at 500) for exactly this comparison.  Both the DB read and the delete are
    # scoped to ``folder == "inbox"`` so messages the user has moved locally
    # (trash/sent/archive) are never clobbered.  If the full id fetch fails we
    # skip ghost detection entirely rather than fall back to the partial set.
    try:
        full_remote_ids = set(await provider.fetch_message_ids(access_token))
    except Exception:
        logger.exception(
            "Failed to fetch full message id list for account %s; "
            "skipping ghost detection this cycle",
            account_id,
        )
        return

    try:
        db = create_supabase_service_client()
        db_resp = (
            db.postgrest.from_("nexus_emails")
            .select("provider_id")
            .eq("account_id", account_id)
            .eq("folder", "inbox")
            .execute()
        )
        db_ids = {row["provider_id"] for row in (db_resp.data or [])}
        ghosts = detect_ghost_emails(db_ids, full_remote_ids)
        if ghosts:
            logger.info(
                "Detected %d ghost email(s) for account %s", len(ghosts), account_id
            )
            db.postgrest.from_("nexus_emails").update({"folder": "deleted"}).in_(
                "provider_id", list(ghosts)
            ).eq("account_id", account_id).eq("folder", "inbox").execute()
    except Exception:
        logger.exception("Ghost detection failed for account %s", account_id)

    logger.debug("Synced %d message(s) for account %s", len(rows), account_id)


# ---------------------------------------------------------------------------
# Poll loop
# ---------------------------------------------------------------------------


async def poll_all_accounts() -> None:
    """Fetch all active email accounts and sync each one."""

    settings = get_settings()
    try:
        db = create_supabase_service_client()
        resp = (
            db.postgrest.from_("email_accounts")
            .select("*")
            .eq("status", "active")
            .execute()
        )
        accounts = resp.data or []
    except Exception:
        logger.exception("Failed to fetch email accounts for polling")
        return

    logger.debug("Polling %d active email account(s)", len(accounts))
    for account in accounts:
        try:
            await sync_account(account, settings)
        except Exception:
            logger.exception("Unexpected error syncing account %s", account.get("id"))


async def _poller_loop(interval: int) -> None:
    """Run poll_all_accounts() every *interval* seconds indefinitely."""

    logger.info("Email poller started (interval=%ds)", interval)
    while True:
        try:
            await poll_all_accounts()
        except Exception:
            logger.exception("Email poller cycle failed")
        await asyncio.sleep(interval)


# ---------------------------------------------------------------------------
# Litestar on_startup hook
# ---------------------------------------------------------------------------


async def start_email_poller(app: "Litestar") -> None:
    """Litestar on_startup hook that launches the background poller task.

    The poller is skipped silently when no OAuth client IDs are configured
    so that the app starts cleanly in environments without email integration.
    The task handle is stashed on ``app.state`` so a shutdown hook can
    cancel it cleanly — otherwise SIGTERM leaves a dangling poll in flight.
    """

    settings = get_settings()
    if not settings.google_oauth_client_id and not settings.microsoft_oauth_client_id:
        logger.info("Email poller disabled: no OAuth client IDs configured")
        return

    task = asyncio.create_task(
        _poller_loop(settings.email_poll_interval_seconds),
        name="email_poller",
    )
    app.state.email_poller_task = task
    logger.info("Email poller task scheduled")


async def stop_email_poller(app: "Litestar") -> None:
    """Litestar on_shutdown hook that cancels the poller if it was started."""

    task = getattr(app.state, "email_poller_task", None)
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001 — shutdown best-effort
        pass
    logger.info("Email poller task cancelled")
