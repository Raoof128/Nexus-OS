"""Browser-to-backend CORS contract tests."""

from litestar.testing import TestClient

from backend.app import app


def test_preflight_allows_the_headers_the_frontend_sends() -> None:
    """apiClient.js sends Content-Type and the X-Requested-With CSRF marker."""

    with TestClient(app=app, base_url="http://testserver.local") as client:
        response = client.options(
            "/api/tasks/lists",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-requested-with",
            },
        )

    assert response.status_code == 204
    allowed = response.headers["access-control-allow-headers"].lower()
    for header in ("content-type", "x-requested-with"):
        assert header in allowed
