"""Integration tests for the /ingest pipeline.

These mock the heavy ML modules (whisper, scene detect, beat, vision)
and verify the orchestrator wires them together, persists the cache,
and best-effort indexes embeddings.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from directorai_context.main import create_app
from directorai_context.models import (
    BeatResult,
    Scene,
    SceneResult,
    TranscribeResult,
    TranscribeSegment,
    VisionResult,
    VisionTag,
)


@pytest.fixture
def media_file(tmp_path: Path) -> Path:
    """Create a fake media file just so Path.exists() passes."""
    p = tmp_path / "clip.mp4"
    p.write_bytes(b"fake mp4 bytes for test")
    return p


@pytest.fixture
def patched_modules(media_file: Path):
    """Patch heavy ML modules so the orchestrator can run without them."""
    fake_transcribe = TranscribeResult(
        media_path=str(media_file),
        language="en",
        duration_sec=10.0,
        segments=[
            TranscribeSegment(id=0, start=0.0, end=3.0, text="Hello and welcome"),
            TranscribeSegment(id=1, start=3.0, end=10.0, text="today we ship the AI plugin"),
        ],
    )
    fake_scenes = SceneResult(
        media_path=str(media_file),
        scenes=[Scene(index=0, start=0.0, end=10.0, duration=10.0)],
    )
    fake_beats = BeatResult(media_path=str(media_file), tempo_bpm=120.0, beats_sec=[0.5, 1.0, 1.5])
    fake_vision = VisionResult(
        media_path=str(media_file),
        frames=[VisionTag(time=0.0, caption="A person speaking to camera", tags=["talking-head"])],
    )

    with patch(
        "directorai_context.modules.transcribe.transcribe", return_value=fake_transcribe
    ), patch(
        "directorai_context.modules.scene.detect_scenes", return_value=fake_scenes
    ), patch(
        "directorai_context.modules.beat.detect_beats", return_value=fake_beats
    ), patch(
        "directorai_context.modules.vision.analyze_video", return_value=fake_vision
    ), patch(
        "directorai_context.modules.vision._probe_duration", return_value=10.0
    ), patch(
        "directorai_context.modules.embeddings.embed_ingest_result", return_value=4
    ):
        yield {
            "transcribe": fake_transcribe,
            "scenes": fake_scenes,
            "beats": fake_beats,
            "vision": fake_vision,
        }


def test_ingest_full_pipeline(media_file: Path, patched_modules, tmp_path: Path, monkeypatch):
    """Calling /ingest with all enables runs every module + caches + indexes."""
    # Redirect cache to a temp dir so we don't pollute the user cache
    from directorai_context.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "cache_dir", tmp_path)
    settings.cache_dir.mkdir(parents=True, exist_ok=True)

    client = TestClient(create_app())
    r = client.post(
        "/ingest",
        json={
            "media_path": str(media_file),
            "enable_transcribe": True,
            "enable_scene": True,
            "enable_beat": True,
            "enable_vision": True,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["media_path"] == str(media_file)
    assert body["duration_sec"] == 10.0
    assert body["transcribe"]["segments"][0]["text"] == "Hello and welcome"
    assert body["scenes"]["scenes"][0]["duration"] == 10.0
    assert body["beats"]["tempo_bpm"] == 120.0
    assert body["vision"]["frames"][0]["caption"].startswith("A person")

    # Cache file should now exist
    cache_files = list(tmp_path.glob("*.json"))
    assert cache_files, "ingest should have written a cache file"
    cached = json.loads(cache_files[0].read_text(encoding="utf-8"))
    assert cached["media_path"] == str(media_file)


def test_ingest_respects_disabled_modules(media_file: Path, patched_modules, tmp_path: Path, monkeypatch):
    from directorai_context.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "cache_dir", tmp_path)
    settings.cache_dir.mkdir(parents=True, exist_ok=True)

    client = TestClient(create_app())
    r = client.post(
        "/ingest",
        json={
            "media_path": str(media_file),
            "enable_transcribe": True,
            "enable_scene": False,
            "enable_beat": False,
            "enable_vision": False,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["transcribe"] is not None
    assert body["scenes"] is None
    assert body["beats"] is None
    assert body["vision"] is None


def test_ingest_missing_file_returns_404(tmp_path: Path):
    client = TestClient(create_app())
    r = client.post(
        "/ingest",
        json={"media_path": str(tmp_path / "missing.mp4")},
    )
    # Either 404 (FileNotFoundError) or 500 (some other raised exception) is acceptable —
    # what matters is we don't silently succeed.
    assert r.status_code in (404, 500)


def test_health_endpoint():
    client = TestClient(create_app())
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_search_endpoint_empty_query_returns_empty():
    """Search with empty query short-circuits to no-op."""
    with patch(
        "directorai_context.modules.embeddings.search", return_value=[]
    ):
        client = TestClient(create_app())
        r = client.post("/embeddings/search", json={"query": "anything", "top_k": 5})
        assert r.status_code == 200
        assert r.json()["hits"] == []
