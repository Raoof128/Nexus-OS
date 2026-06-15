"""Notes field-level encryption helpers."""

from __future__ import annotations

from backend.data_protection import hydrate_note_record, protect_note_text


def test_protect_note_text_none_passthrough():
    assert protect_note_text(None) is None


def test_protect_then_hydrate_roundtrip_plaintext_when_no_key(monkeypatch):
    # With no encryption key configured, content stores as plaintext (graceful).
    import backend.data_protection as dp

    monkeypatch.setattr(dp, "get_takeaway_cipher", lambda: None)
    stored = dp.protect_note_text("buy milk")
    assert stored == "buy milk"
    record = {
        "title_encrypted": dp.protect_note_text("Shopping"),
        "content_encrypted": stored,
    }
    hydrated = dp.hydrate_note_record(record)
    assert hydrated["title_encrypted"] == "Shopping"
    assert hydrated["content_encrypted"] == "buy milk"
