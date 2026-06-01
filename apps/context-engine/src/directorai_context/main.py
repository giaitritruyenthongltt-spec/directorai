"""FastAPI application entry point."""

from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from directorai_context import __version__
from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.modules.hardware import probe as probe_hardware
from directorai_context.storage import init_db
from directorai_context.storage import repositories as store
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

    # Sprint A.3 — ensure SQLite schema exists on startup. Idempotent.
    init_db()

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @app.get("/hardware")
    async def hardware() -> dict[str, object]:
        """Sprint A.5 — hardware report for the Node server to pick model variants."""
        return probe_hardware().to_dict()

    @app.get("/storage/stats")
    async def storage_stats() -> dict[str, int]:
        """Sprint A.3 — row counts for clips / analyses / plans / styles."""
        return store.stats()

    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket) -> None:
        """Sprint A.2 — WS bridge for the Node server to stream commands / progress.

        Protocol: JSON-RPC 2.0 style messages.
            request:  { "id": <int>, "method": "ping", "params": {...} }
            response: { "id": <int>, "result": ... }  or  { "id": <int>, "error": {...} }
            event:    { "event": "progress", "params": { "op": "...", "pct": 0.42 } }
        """
        await ws.accept()
        log.info("ws_client_connected")
        try:
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await ws.send_text(
                        json.dumps({"error": {"code": -32700, "message": "Parse error"}})
                    )
                    continue

                msg_id = msg.get("id")
                method = msg.get("method", "")
                params = msg.get("params") or {}

                try:
                    if method == "ping":
                        result: object = {"pong": True, "version": __version__}
                    elif method == "hardware":
                        result = probe_hardware().to_dict()
                    elif method == "health":
                        result = {"status": "ok", "version": __version__}
                    elif method == "storage.stats":
                        result = store.stats()
                    else:
                        await ws.send_text(
                            json.dumps(
                                {
                                    "id": msg_id,
                                    "error": {
                                        "code": -32601,
                                        "message": f"Method not found: {method}",
                                    },
                                }
                            )
                        )
                        continue
                    await ws.send_text(json.dumps({"id": msg_id, "result": result}))
                except Exception as e:  # noqa: BLE001
                    log.error("ws_handler_error", method=method, error=str(e))
                    await ws.send_text(
                        json.dumps(
                            {"id": msg_id, "error": {"code": -32603, "message": str(e)}}
                        )
                    )
        except WebSocketDisconnect:
            log.info("ws_client_disconnected")
        except asyncio.CancelledError:
            log.info("ws_handler_cancelled")
            raise

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
