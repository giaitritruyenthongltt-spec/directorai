"""Test config loading."""

from __future__ import annotations

from directorai_context.config import Settings


def test_settings_defaults() -> None:
    s = Settings()
    assert s.host == "127.0.0.1"
    assert s.port == 8000
    assert s.whisper_model == "base"
    assert s.scene_threshold == 27.0


def test_settings_env_override(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("CONTEXT_PORT", "9001")
    monkeypatch.setenv("CONTEXT_WHISPER_MODEL", "small")
    s = Settings()
    assert s.port == 9001
    assert s.whisper_model == "small"
