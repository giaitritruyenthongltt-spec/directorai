"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException

from directorai_context import __version__
from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import (
    BeatRequest,
    BeatResult,
    IngestRequest,
    IngestResult,
    SceneRequest,
    SceneResult,
    TranscribeRequest,
    TranscribeResult,
    VisionRequest,
    VisionResult,
)


def create_app() -> FastAPI:
    """Build the FastAPI application."""
    app = FastAPI(
        title="DirectorAI Context Engine",
        version=__version__,
        description="ML service for transcription, scene detection, beat tracking, vision analysis",
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @app.post("/transcribe", response_model=TranscribeResult)
    async def post_transcribe(req: TranscribeRequest) -> TranscribeResult:
        from directorai_context.modules.transcribe import transcribe

        try:
            return transcribe(req.media_path, language=req.language)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            log.error("transcribe_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/scenes", response_model=SceneResult)
    async def post_scenes(req: SceneRequest) -> SceneResult:
        from directorai_context.modules.scene import detect_scenes

        try:
            return detect_scenes(
                req.media_path,
                threshold=req.threshold,
                min_scene_len_sec=req.min_scene_len_sec,
            )
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

    @app.post("/beats", response_model=BeatResult)
    async def post_beats(req: BeatRequest) -> BeatResult:
        from directorai_context.modules.beat import detect_beats

        try:
            return detect_beats(req.media_path)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

    @app.post("/vision", response_model=VisionResult)
    async def post_vision(req: VisionRequest) -> VisionResult:
        from directorai_context.modules.vision import analyze_video

        try:
            return analyze_video(req.media_path, sample_interval_sec=req.sample_interval_sec)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

    @app.post("/ingest", response_model=IngestResult)
    async def post_ingest(req: IngestRequest) -> IngestResult:
        from directorai_context.modules.ingest import ingest

        try:
            return ingest(req)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

    log.info("app_created", version=__version__, host=get_settings().host, port=get_settings().port)
    return app


app = create_app()
