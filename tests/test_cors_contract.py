"""Browser-to-backend CORS contract tests."""

from litestar.testing import TestClient

from backend.app import app


def test_auth_preflight_allows_frontend_and_recovery_headers() -> None:
    with TestClient(app=app, base_url="http://testserver.local") as client:
        response = client.options(
            "/auth/reset-password",
            headers={
                "Origin": "http://testserver.local",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": (
                    "content-type,x-requested-with,idempotency-key,"
                    "x-recovery-access-token,"
                    "x-recovery-refresh-token"
                ),
            },
        )

    assert response.status_code == 204
    allowed = response.headers["access-control-allow-headers"].lower()
    for header in (
        "content-type",
        "x-requested-with",
        "idempotency-key",
        "x-recovery-access-token",
        "x-recovery-refresh-token",
    ):
        assert header in allowed
