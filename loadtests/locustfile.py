"""Locust scenarios for recommendation endpoint load testing."""

from __future__ import annotations

import os

from locust import HttpUser, between, task

EMAIL = os.getenv("LOCUST_EMAIL", "")
PASSWORD = os.getenv("LOCUST_PASSWORD", "")


class SuggestionUser(HttpUser):
    """Exercise the AI recommendation endpoint with authenticated traffic."""

    wait_time = between(1, 3)

    def on_start(self) -> None:
        """Authenticate through the real cookie-backed login flow."""

        if not EMAIL or not PASSWORD:
            raise RuntimeError(
                "Set LOCUST_EMAIL and LOCUST_PASSWORD before running load tests"
            )
        response = self.client.post(
            "/auth/login",
            json={"email": EMAIL, "password": PASSWORD},
            name="/auth/login",
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Login failed with status {response.status_code}")

    @task
    def request_book_suggestion(self) -> None:
        """Hit the suggestion endpoint with a Supabase bearer token."""

        self.client.get("/books/suggest", name="/books/suggest")
