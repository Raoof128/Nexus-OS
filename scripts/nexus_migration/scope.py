"""Exact Nexus-owned objects for the standalone migration."""

NEXUS_TABLES = frozenset(
    {
        "chat_messages",
        "chat_sessions",
        "email_accounts",
        "email_drafts",
        "media",
        "nexus_emails",
        "nexus_note_items",
        "nexus_note_label_links",
        "nexus_note_labels",
        "nexus_notes",
        "nexus_task_lists",
        "nexus_tasks",
    }
)
NEXUS_VIEWS = frozenset({"email_accounts_safe"})


def nexus_data_dump_filters() -> list[str]:
    """Use exact, schema-qualified names for the data-only transfer."""
    return [f"--table=public.{name}" for name in sorted(NEXUS_TABLES)]
