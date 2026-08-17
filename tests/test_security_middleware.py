"""CSRF middleware contract tests."""

from litestar.testing import TestClient

from backend.app import app


def test_browser_mutation_requires_requested_with_header() -> None:
    with TestClient(app=app, base_url="http://testserver.local") as client:
        rejected = client.post(
            "/auth/logout",
            headers={"Origin": "http://testserver.local"},
        )
        accepted = client.post(
            "/auth/logout",
            headers={
                "Origin": "http://testserver.local",
                "X-Requested-With": "XMLHttpRequest",
            },
        )

    assert rejected.status_code == 403
    assert rejected.json() == {"detail": "CSRF validation failed"}
    assert rejected.headers["x-content-type-options"] == "nosniff"
    assert accepted.status_code == 201


def test_non_browser_client_without_origin_remains_supported() -> None:
    with TestClient(app=app, base_url="http://testserver.local") as client:
        response = client.post("/auth/logout")

    assert response.status_code == 201
