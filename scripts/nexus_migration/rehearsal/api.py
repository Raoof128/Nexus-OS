"""A disposable Litestar adapter for the direct PostgreSQL target."""

import os
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import httpx
import psycopg
from litestar import Litestar, Request, get, post, put
from litestar.exceptions import HTTPException, NotAuthorizedException, NotFoundException
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from backend.schemas import MediaCreate, MediaUpdate, media_status_allowed

MEDIA_FIELDS = "id, user_id, title, type, creator, status, rating, created_at"


def create_app() -> Litestar:
    root = Path(os.environ["NEXUS_REHEARSAL_ROOT"])
    auth_url = os.environ["NEXUS_REHEARSAL_AUTH_URL"]
    origin = os.environ["NEXUS_REHEARSAL_API_URL"]
    if (
        os.environ.get("PGHOST") != str(root / "socket")
        or os.environ.get("PGDATABASE") != "nexus_rehearsal"
        or any(
            urlsplit(url).scheme != "http" or urlsplit(url).hostname != "127.0.0.1"
            for url in (auth_url, origin)
        )
    ):
        raise RuntimeError("A private Nexus rehearsal workspace is required")

    pool = ConnectionPool(
        "",
        kwargs={"user": "nexus_rehearsal_api", "row_factory": dict_row},
        min_size=1,
        max_size=2,
        timeout=3,
        open=False,
    )
    session_client = httpx.Client(base_url=auth_url, timeout=3, trust_env=False)

    def user_id(request: Request) -> UUID:
        cookie = request.headers.get("cookie")
        if not cookie:
            raise NotAuthorizedException()
        try:
            response = session_client.get(
                "/api/auth/get-session",
                headers={"cookie": cookie, "accept": "application/json"},
            )
            response.raise_for_status()
            identity = response.json()
            if identity is None:
                raise NotAuthorizedException()
            verified = UUID(identity["user"]["id"])
            if verified != UUID(identity["session"]["userId"]):
                raise ValueError("mismatched session owner")
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(
                status_code=503, detail="Identity service unavailable"
            ) from None
        return verified

    @contextmanager
    def media_connection(request: Request) -> Generator[psycopg.Connection]:
        owner = user_id(request)
        try:
            with pool.connection() as conn:
                # Restrict the verified identity to this transaction so the
                # setting resets when a pooled connection is reused.
                conn.execute(
                    "SELECT set_config('nexus.user_id', %s, true)", (str(owner),)
                )
                yield conn
        except psycopg.Error:
            raise HTTPException(
                status_code=503, detail="Media database unavailable"
            ) from None

    def require_write_origin(request: Request) -> None:
        if (
            request.headers.get("origin") != origin
            or request.headers.get("x-requested-with") != "XMLHttpRequest"
        ):
            raise HTTPException(status_code=403, detail="Invalid write origin")

    @get("/healthz", sync_to_thread=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @get("/media", sync_to_thread=True)
    def list_media(request: Request) -> list[dict[str, Any]]:
        with media_connection(request) as conn:
            return conn.execute(
                f"SELECT {MEDIA_FIELDS} FROM public.media ORDER BY created_at, id"
            ).fetchall()

    @post("/media", sync_to_thread=True)
    def add_media(request: Request, data: MediaCreate) -> dict[str, Any]:
        require_write_origin(request)
        if data.model_fields_set - {"title", "type", "creator", "status", "rating"}:
            raise HTTPException(status_code=422, detail="Field outside rehearsal scope")
        with media_connection(request) as conn:
            # The existing PostgreSQL default assigns the owner from the RLS context.
            return conn.execute(
                f"""
                INSERT INTO public.media (title, type, creator, status, rating)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING {MEDIA_FIELDS}
                """,
                (data.title, data.type, data.creator, data.status, data.rating),
            ).fetchone()

    @put("/media/{media_id:uuid}", sync_to_thread=True)
    def update_media(
        request: Request, media_id: UUID, data: MediaUpdate
    ) -> dict[str, Any]:
        require_write_origin(request)
        fields = data.model_fields_set
        if not fields or fields - {"status", "rating"}:
            raise HTTPException(status_code=422, detail="Field outside rehearsal scope")
        with media_connection(request) as conn:
            row = conn.execute(
                "SELECT type FROM public.media WHERE id = %s FOR UPDATE", (media_id,)
            ).fetchone()
            if row is None:
                raise NotFoundException()
            if "status" in fields and (
                data.status is None
                or not media_status_allowed(row["type"], data.status)
            ):
                raise HTTPException(status_code=422, detail="Invalid media status")
            return conn.execute(
                f"""
                UPDATE public.media
                SET status = CASE WHEN %s THEN %s ELSE status END,
                    rating = CASE WHEN %s THEN %s ELSE rating END
                WHERE id = %s
                RETURNING {MEDIA_FIELDS}
                """,
                (
                    "status" in fields,
                    data.status,
                    "rating" in fields,
                    data.rating,
                    media_id,
                ),
            ).fetchone()

    def open_pool() -> None:
        pool.open(wait=True, timeout=3)

    def close_clients() -> None:
        session_client.close()
        pool.close()

    return Litestar(
        [health, list_media, add_media, update_media],
        openapi_config=None,
        on_startup=[open_pool],
        on_shutdown=[close_clients],
    )
