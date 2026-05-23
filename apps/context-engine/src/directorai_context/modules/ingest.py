"""Orchestrator: run all enabled modules on a media file."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import IngestRequest, IngestResult
from directorai_context.modules import beat, scene, transcribe, vision


def _cache_key(req: IngestRequest) -> str:
    """Hash file path + size + mtime + enabled flags for cache key."""
    p = Path(req.media_path)
    stat = p.stat()
    key = json.dumps(
        {
            "path": str(p.resolve()),
            "size": stat.st_size,
            "mtime": stat.st_mtime,
            "t": req.enable_transcribe,
            "s": req.enable_scene,
            "b": req.enable_beat,
            "v": req.enable_vision,
        },
        sort_keys=True,
    )
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _cache_path(key: str) -> Path:
    return get_settings().cache_dir / f"{key}.json"


def _video_duration(media_path: str) -> float:
    """Use ffprobe via vision module's helper (simple reuse)."""
    from directorai_context.modules.vision import _probe_duration

    return _probe_duration(media_path)


def ingest(req: IngestRequest, use_cache: bool = True) -> IngestResult:
    """Run all enabled modules on the given media."""
    key = _cache_key(req)
    cpath = _cache_path(key)

    if use_cache and cpath.exists():
        log.info("ingest_cache_hit", key=key)
        return IngestResult.model_validate_json(cpath.read_text(encoding="utf-8"))

    log.info("ingest_start", media=req.media_path, key=key)

    duration = _video_duration(req.media_path)
    result = IngestResult(media_path=req.media_path, duration_sec=duration)

    if req.enable_transcribe:
        result.transcribe = transcribe.transcribe(req.media_path)
    if req.enable_scene:
        result.scenes = scene.detect_scenes(req.media_path)
    if req.enable_beat:
        result.beats = beat.detect_beats(req.media_path)
    if req.enable_vision:
        result.vision = vision.analyze_video(req.media_path)

    cpath.write_text(result.model_dump_json(indent=2), encoding="utf-8")

    # Auto-index into vector store so semantic search works post-ingest.
    try:
        from directorai_context.modules.embeddings import embed_ingest_result

        indexed = embed_ingest_result(result)
        log.info("ingest_indexed", key=key, indexed=indexed)
    except Exception as e:  # noqa: BLE001
        # Indexing is best-effort — failure shouldn't block ingest result.
        log.warn("ingest_index_failed", key=key, error=str(e))

    log.info("ingest_done", key=key)
    return result
