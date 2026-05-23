"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException

from directorai_context import __version__
from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import (
    BeatRequest,
    BeatResult,
    EmbedRequest,
    EmbedResult,
    IngestRequest,
    IngestResult,
    SceneRequest,
    SceneResult,
    SearchHit,
    SearchRequest,
    SearchResult,
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

    @app.post("/embeddings/index", response_model=EmbedResult)
    async def post_embed(req: EmbedRequest) -> EmbedResult:
        from directorai_context.modules.embeddings import embed_ingest_result

        try:
            count = embed_ingest_result(req.ingest)
            return EmbedResult(media_path=req.ingest.media_path, indexed_count=count)
        except Exception as e:  # noqa: BLE001
            log.error("embed_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/embeddings/search", response_model=SearchResult)
    async def post_search(req: SearchRequest) -> SearchResult:
        from directorai_context.modules.embeddings import search

        try:
            raw = search(req.query, top_k=req.top_k, media_path=req.media_path, kind=req.kind)
            return SearchResult(
                query=req.query,
                hits=[
                    SearchHit(
                        id=h.id,
                        text=h.text,
                        media_path=h.media_path,
                        kind=h.kind,
                        start=h.start,
                        end=h.end,
                        score=h.score,
                    )
                    for h in raw
                ],
            )
        except Exception as e:  # noqa: BLE001
            log.error("search_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/embeddings/delete")
    async def post_delete(payload: dict[str, str]) -> dict[str, object]:
        from directorai_context.modules.embeddings import delete_media

        media_path = payload.get("media_path", "")
        if not media_path:
            raise HTTPException(status_code=400, detail="media_path required")
        return {"deleted": delete_media(media_path)}

    @app.get("/embeddings/stats")
    async def get_stats() -> dict[str, object]:
        from directorai_context.modules.embeddings import collection_stats

        return collection_stats()

    log.info("app_created", version=__version__, host=get_settings().host, port=get_settings().port)
    return app


app = create_app()
