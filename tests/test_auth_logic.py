"""Tests for authentication logic and registration validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.schemas import LoginRequest, RegisterRequest


def test_login_request_validation():
    """LoginRequest should validate email and password length (min 12 chars)."""
    # Valid — 12+ chars
    req = LoginRequest(email="test@nexus.net", password="Secure@Pass1!")
    assert req.email == "test@nexus.net"

    # Invalid email
    with pytest.raises(ValidationError):
        LoginRequest(email="not-an-email", password="Secure@Pass1!")

    # Password too short (under 12 chars)
    with pytest.raises(ValidationError):
        LoginRequest(email="test@nexus.net", password="short")


def test_register_request_validation():
    """RegisterRequest should validate email and password requirements."""
    # Valid — 12+ chars
    req = RegisterRequest(email="new@nexus.net", password="SecurePass123!")
    assert req.email == "new@nexus.net"

    # Password too short (under 12 chars)
    with pytest.raises(ValidationError):
        RegisterRequest(email="new@nexus.net", password="short")
