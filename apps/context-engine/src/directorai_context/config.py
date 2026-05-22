"""Configuration loaded from environment / .env."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="CONTEXT_", extra="ignore")

    # Service
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "INFO"

    # Whisper
    whisper_model: str = "base"
    whisper_device: str = "auto"
    whisper_compute_type: str = "int8"

    # Scene detect
    scene_threshold: float = 27.0
    scene_min_scene_len: float = 1.0

    # Beat
    beat_sample_rate: int = 22_050

    # Vision
    vision_sample_interval_sec: float = 2.0
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    vision_model: str = "claude-haiku-4-5-20251001"

    # Cache
    cache_dir: Path = Field(default_factory=lambda: Path.home() / ".directorai" / "cache")

    # Embeddings
    embeddings_model: str = "all-MiniLM-L6-v2"


_settings: Settings | None = None


def get_settings() -> Settings:
    """Return cached settings instance."""
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.cache_dir.mkdir(parents=True, exist_ok=True)
    return _settings
