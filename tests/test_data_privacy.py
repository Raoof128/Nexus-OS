"""Tests for data privacy and PII leakage prevention."""

from __future__ import annotations

import pytest

from backend.schemas import AuthSessionResponse, SessionUser


def test_session_user_strips_sensitive_data():
    """SessionUser model must only include safe fields."""
    # Data containing sensitive internal fields that shouldn't be here
    raw_data = {
        "id": "u1",
        "email": "runner@nexus.net",
        "password_hash": "argon2$...",
        "secret_token": "hidden",
    }

    # Validation via SessionUser schema
    user = SessionUser(**raw_data)

    # Convert to dict
    user_dict = user.model_dump()

    # Assert sensitive fields are absent
    assert "password_hash" not in user_dict
    assert "secret_token" not in user_dict
    assert user_dict["id"] == "u1"
    assert user_dict["email"] == "runner@nexus.net"


def test_auth_session_response_structure():
    """AuthSessionResponse must have a nested user and safe top-level fields."""
    user = SessionUser(id="u1", email="test@nexus.net")
    resp = AuthSessionResponse(user=user, expires_at=123456789, access_token="token")

    resp_dict = resp.model_dump()
    assert resp_dict["user"]["id"] == "u1"
    assert resp_dict["expires_at"] == 123456789
    assert resp_dict["access_token"] == "token"


def test_rate_limiter_logic():
    """RateLimiter should correctly block after exceeding limit."""
    from backend.rate_limit import SlidingWindowRateLimiter

    # 2 requests per minute
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)
    key = "test-key"

    from litestar.exceptions import HTTPException

    assert limiter.enforce(key) is None
    assert limiter.enforce(key) is None
    with pytest.raises(HTTPException) as excinfo:
        limiter.enforce(key)
    assert excinfo.value.status_code == 429
