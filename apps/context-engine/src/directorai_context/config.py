"""Configuration loaded from environment / .env."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env_files() -> list[str]:
    """Tìm .env ở cả thư mục hiện tại lẫn repo root (đi lên tối đa 5 cấp)
    để sidecar đọc được GEMINI_API_KEY đặt ở .env gốc của monorepo."""
    found: list[str] = []
    cur = Path.cwd()
    for _ in range(6):
        candidate = cur / ".env"
        if candidate.exists():
            found.append(str(candidate))
        if (cur / "pnpm-workspace.yaml").exists() or (cur / ".git").exists():
            break
        if cur.parent == cur:
            break
        cur = cur.parent
    return found or [".env"]


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=_find_env_files(), env_prefix="CONTEXT_", extra="ignore"
    )

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

    # Vision (Claude — legacy)
    vision_sample_interval_sec: float = 2.0
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    vision_model: str = "claude-haiku-4-5-20251001"

    # AI-1 — Gemini Vision (hiểu ngữ nghĩa clip)
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    gemini_vision_model: str = "gemini-2.5-flash"
    vision_frames_per_clip: int = 3  # số frame gửi Gemini / clip (cost)

    # AI-2 — Gemini text (gộp understandings → bản đồ video, Tầng 3)
    gemini_text_model: str = "gemini-2.5-flash"

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
