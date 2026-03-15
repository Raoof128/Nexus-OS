"""Locust scenarios for recommendation endpoint load testing."""

from __future__ import annotations

import os

from locust import HttpUser, between, task

BEARER_TOKEN = os.getenv("LOCUST_BEARER_TOKEN", "")


class SuggestionUser(HttpUser):
    """Exercise the AI recommendation endpoint with authenticated traffic."""

    wait_time = between(1, 3)

    @task
    def request_book_suggestion(self) -> None:
        """Hit the suggestion endpoint with a Supabase bearer token."""

        if not BEARER_TOKEN:
            raise RuntimeError("Set LOCUST_BEARER_TOKEN before running load tests")

        self.client.get(
            "/books/suggest",
            headers={"Authorization": f"Bearer {BEARER_TOKEN}"},
            name="/books/suggest",
        )
