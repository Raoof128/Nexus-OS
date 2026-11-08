"""Tests for authentication logic and registration validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.schemas import (
    MAX_RECOVERY_TOKEN_LENGTH,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SessionUser,
)


def test_login_request_validation():
    """LoginRequest validates email but does NOT enforce a password min-length.

    Policy (12-char minimum) only applies when creating or changing a password.
    Users with pre-existing shorter passwords must still be able to log in.
    """
    # Valid: any non-empty password accepted on login, even a short one
    req = LoginRequest(email="test@nexus.net", password="short8")
    assert req.email == "test@nexus.net"

    # Invalid email
    with pytest.raises(ValidationError):
        LoginRequest(email="not-an-email", password="anypassword")

    # Empty password rejected
    with pytest.raises(ValidationError):
        LoginRequest(email="test@nexus.net", password="")


def test_register_request_validation():
    """RegisterRequest should validate email and password requirements."""
    # Valid: 12+ chars
    req = RegisterRequest(email="new@nexus.net", password="SecurePass123!")
    assert req.email == "new@nexus.net"

    # Password too short (under 12 chars)
    with pytest.raises(ValidationError):
        RegisterRequest(email="new@nexus.net", password="short")


@pytest.mark.parametrize("length", [11, 12])
def test_register_password_minimum_boundary(length: int):
    """Exactly 12 characters is accepted; 11 is rejected."""
    password = "a" * length
    if length == 11:
        with pytest.raises(ValidationError):
            RegisterRequest(email="new@nexus.net", password=password)
    else:
        assert (
            RegisterRequest(email="new@nexus.net", password=password).password
            == password
        )


@pytest.mark.parametrize("length", [128, 129])
def test_register_password_maximum_boundary(length: int):
    """128 characters is accepted; 129 is rejected."""
    password = "a" * length
    if length == 129:
        with pytest.raises(ValidationError):
            RegisterRequest(email="new@nexus.net", password=password)
    else:
        assert (
            len(RegisterRequest(email="new@nexus.net", password=password).password)
            == 128
        )


def test_register_rejects_whitespace_only_password():
    """Twelve spaces pass the length rule but are not a password."""
    with pytest.raises(ValidationError):
        RegisterRequest(email="new@nexus.net", password=" " * 12)


def test_register_keeps_internal_and_outer_spaces_unchanged():
    """The stored value is not stripped; only blank input is rejected."""
    password = "  correct horse battery  "

    req = RegisterRequest(email="new@nexus.net", password=password)

    assert req.password == password


def test_reset_password_minimum_boundary():
    """new_password follows the same 12-character minimum as registration."""
    with pytest.raises(ValidationError):
        ResetPasswordRequest(new_password="a" * 11)
    assert ResetPasswordRequest(new_password="a" * 12).new_password == "a" * 12


def test_reset_password_maximum_boundary():
    """new_password accepts 128 characters and rejects 129."""
    assert len(ResetPasswordRequest(new_password="a" * 128).new_password) == 128
    with pytest.raises(ValidationError):
        ResetPasswordRequest(new_password="a" * 129)


def test_reset_password_rejects_whitespace_only():
    """Whitespace-only replacement passwords are rejected."""
    with pytest.raises(ValidationError):
        ResetPasswordRequest(new_password=" " * 12)


def test_reset_password_tokens_default_to_empty():
    """Tokens default to empty, so a header-only reset still validates."""
    req = ResetPasswordRequest(new_password="SecurePass123!")

    assert req.access_token == ""
    assert req.refresh_token == ""


def test_reset_password_token_length_boundary():
    """Body tokens are bounded at MAX_RECOVERY_TOKEN_LENGTH characters."""
    limit = MAX_RECOVERY_TOKEN_LENGTH
    ok = ResetPasswordRequest(new_password="SecurePass123!", access_token="t" * limit)
    assert len(ok.access_token) == limit

    with pytest.raises(ValidationError):
        ResetPasswordRequest(
            new_password="SecurePass123!", access_token="t" * (limit + 1)
        )
    with pytest.raises(ValidationError):
        ResetPasswordRequest(
            new_password="SecurePass123!", refresh_token="t" * (limit + 1)
        )


def test_reset_password_rejects_million_character_token():
    """A 1,000,000-character body token is rejected by the schema."""
    with pytest.raises(ValidationError):
        ResetPasswordRequest(
            new_password="SecurePass123!", access_token="t" * 1_000_000
        )


def test_session_user_accepts_malformed_email_claim():
    """A malformed email claim must not raise inside the /session response.

    The value is a verified JWT claim, so SessionUser keeps it as text rather
    than failing the whole response with a ValidationError.
    """
    user = SessionUser(id="u1", email="not an address")

    assert user.email == "not an address"
    assert SessionUser(id="u1", email=None).email is None
