"""Operational health endpoints."""

from litestar import get


@get("/healthz", include_in_schema=False)
async def healthcheck() -> dict[str, str]:
    """Expose a lightweight health probe for uptime checks."""

    return {"status": "ok"}
