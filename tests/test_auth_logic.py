"""Tests for authentication logic and registration validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.schemas import LoginRequest, RegisterRequest


def test_login_request_validation():
    """LoginRequest should validate email and password length."""
    # Valid
    req = LoginRequest(email="test@nexus.net", password="password123")
    assert req.email == "test@nexus.net"

    # Invalid email
    with pytest.raises(ValidationError):
        LoginRequest(email="not-an-email", password="password123")

    # Password too short
    with pytest.raises(ValidationError):
        LoginRequest(email="test@nexus.net", password="abc")


def test_register_request_validation():
    """RegisterRequest should validate email and password requirements."""
    # Valid
    req = RegisterRequest(email="new@nexus.net", password="securepassword")
    assert req.email == "new@nexus.net"

    # Password too short
    with pytest.raises(ValidationError):
        RegisterRequest(email="new@nexus.net", password="short")
