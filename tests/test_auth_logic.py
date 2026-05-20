"""Tests for authentication logic and registration validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.schemas import LoginRequest, RegisterRequest


def test_login_request_validation():
    """LoginRequest validates email but does NOT enforce a password min-length.

    Policy (12-char minimum) only applies when creating or changing a password.
    Users with pre-existing shorter passwords must still be able to log in.
    """
    # Valid — any non-empty password accepted on login
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
    # Valid — 12+ chars
    req = RegisterRequest(email="new@nexus.net", password="SecurePass123!")
    assert req.email == "new@nexus.net"

    # Password too short (under 12 chars)
    with pytest.raises(ValidationError):
        RegisterRequest(email="new@nexus.net", password="short")
