"""FastAPI application entry point."""

from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from directorai_context import __version__
from directorai_context.config import get_settings
from directorai_context.jobs import JobNotFound, get_queue
from directorai_context.logger import log
from directorai_context.modules.hardware import probe as probe_hardware
from directorai_context.storage import init_db
from directorai_context.storage import repositories as store
from directorai_context.models import (
    BeatRequest,
    BeatResult,
    ClusterRequest,
    EditPlanRequest,
    EmbedRequest,
    EmbedResult,
    FilterBadRequest,
    IngestRequest,
    IngestResult,
    SceneRequest,
    SceneResult,
    SearchHit,
    SearchRequest,
    SearchResult,
    TranscribeRequest,
    TranscribeResult,
    VideoMapRequest,
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

    @app.get("/jobs")
    async def jobs_list() -> list[dict[str, object]]:
        """Sprint A.4 — list all known jobs."""
        return [j.to_dict() for j in get_queue().list()]

    @app.get("/jobs/{job_id}")
    async def job_get(job_id: str) -> dict[str, object]:
        try:
            return get_queue().get(job_id).to_dict()
        except JobNotFound as e:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}") from e

    @app.post("/jobs/{job_id}/cancel")
    async def job_cancel(job_id: str) -> dict[str, object]:
        try:
            ok = get_queue().cancel(job_id)
            return {"job_id": job_id, "cancelled": ok}
        except JobNotFound as e:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}") from e

    @app.post("/vision/analyze_clip")
    async def post_analyze_clip(payload: dict[str, object]) -> dict[str, object]:
        """Sprint B.6 — sync wrapper around analyze_clip().

        For batch jobs prefer POST /vision/analyze_clip_async which schedules
        on the job queue and returns a job_id.
        """
        from directorai_context.modules.analyze_clip import analyze_clip

        path = str(payload.get("path", ""))
        sample_count = int(payload.get("sample_count", 10))
        max_dim = int(payload.get("max_dim", 1280))
        if not path:
            raise HTTPException(status_code=400, detail="path required")
        try:
            return analyze_clip(path, sample_count=sample_count, max_dim=max_dim).to_dict()
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

    @app.post("/vision/analyze_clip_async")
    async def post_analyze_clip_async(payload: dict[str, object]) -> dict[str, str]:
        """Background variant — returns a job_id to poll."""
        from directorai_context.modules.analyze_clip import analyze_clip

        path = str(payload.get("path", ""))
        sample_count = int(payload.get("sample_count", 10))
        max_dim = int(payload.get("max_dim", 1280))
        if not path:
            raise HTTPException(status_code=400, detail="path required")

        def _job(ctx, p: str, n: int, d: int) -> dict[str, object]:  # type: ignore[no-untyped-def]
            return analyze_clip(
                p, sample_count=n, max_dim=d, progress_cb=ctx.set_progress
            ).to_dict()

        job_id = get_queue().submit(
            _job, args=(path, sample_count, max_dim), label=f"analyze:{path}"
        )
        return {"job_id": job_id}

    @app.post("/jobs/demo")
    async def job_demo(seconds: int = 5) -> dict[str, str]:
        """Submit a sleep job for end-to-end smoke testing."""
        import time as _t

        def _sleep(ctx, total: int) -> dict[str, int]:  # type: ignore[no-untyped-def]
            for i in range(total * 10):
                if ctx.cancelled:
                    return {"cancelled_at_decis": i}
                ctx.set_progress(
                    (i + 1) / (total * 10),
                    message=f"tick {i + 1}/{total * 10}",
                )
                _t.sleep(0.1)
            return {"slept_for_seconds": total}

        job_id = get_queue().submit(_sleep, args=(seconds,), label="demo-sleep")
        return {"job_id": job_id}

    @app.websocket("/jobs/{job_id}/events")
    async def job_events(ws: WebSocket, job_id: str) -> None:
        """Sprint A.4 — stream job progress over WS until terminal."""
        await ws.accept()
        try:
            async for evt in get_queue().events(job_id):
                await ws.send_text(json.dumps(evt))
        except JobNotFound:
            await ws.send_text(
                json.dumps({"error": {"code": 404, "message": f"job not found: {job_id}"}})
            )
        except WebSocketDisconnect:
            pass

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

    @app.post("/vision/understand_clip")
    async def post_understand_clip(req: VisionRequest) -> dict[str, object]:
        """AI-1 — Hiểu ngữ nghĩa 1 clip bằng Gemini Vision (Tầng 2).

        Dùng VisionRequest (media_path + sample_interval_sec). Số frame
        suy từ sample_interval (hoặc mặc định config).
        """
        from directorai_context.modules.vision_understand import understand_clip

        try:
            frames = None
            try:
                if req.sample_interval_sec and req.sample_interval_sec > 0:
                    frames = max(1, min(8, round(1.0 / req.sample_interval_sec)))
            except (TypeError, ValueError):
                frames = None
            return understand_clip(req.media_path, frames=frames)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            log.error("understand_clip_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/vision/build_video_map")
    async def post_build_video_map(req: VideoMapRequest) -> dict[str, object]:
        """AI-2 — Gộp nhiều clip → bản đồ video tổng (Tầng 3).

        Chạy understand_clip (có cache) cho từng clip rồi gộp bằng Gemini
        text. Clip lỗi được bỏ qua + ghi vào `errors`, không chặn cả mẻ.
        """
        from directorai_context.modules.video_map import build_video_map
        from directorai_context.modules.vision_understand import understand_clip

        if not req.clip_paths:
            raise HTTPException(status_code=400, detail="clip_paths rỗng")

        frames = None
        try:
            if req.sample_interval_sec and req.sample_interval_sec > 0:
                frames = max(1, min(8, round(1.0 / req.sample_interval_sec)))
        except (TypeError, ValueError):
            frames = None

        understandings: list[dict[str, object]] = []
        errors: list[dict[str, str]] = []
        for path in req.clip_paths:
            try:
                understandings.append(understand_clip(path, frames=frames))
            except Exception as e:  # noqa: BLE001
                log.error("video_map_clip_failed", media=path, error=str(e))
                errors.append({"clip_path": path, "error": str(e)})

        if not understandings:
            raise HTTPException(
                status_code=500,
                detail=f"Không hiểu được clip nào ({len(errors)} lỗi)",
            )

        try:
            video_map = build_video_map(understandings, goal=req.goal)
        except Exception as e:  # noqa: BLE001
            log.error("video_map_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

        return {
            "video_map": video_map,
            "understandings": understandings,
            "errors": errors,
            "clips_understood": len(understandings),
            "clips_failed": len(errors),
        }

    @app.post("/vision/build_edit_plan")
    async def post_build_edit_plan(req: EditPlanRequest) -> dict[str, object]:
        """AI-3 — Lập kế hoạch edit có lý do (Tầng 4).

        Pipeline: understand_clip (cache) → build_video_map → build_edit_plan.
        Kế hoạch CHỈ chứa thao tác đã verify ghi được; KHÔNG tự chạy — đi
        vào Tầng an toàn (preview → duyệt → ghi).
        """
        from directorai_context.modules.editorial_planner import build_edit_plan
        from directorai_context.modules.video_map import build_video_map
        from directorai_context.modules.vision_understand import understand_clip

        if not req.clip_paths:
            raise HTTPException(status_code=400, detail="clip_paths rỗng")
        if not req.goal or not req.goal.strip():
            raise HTTPException(status_code=400, detail="goal rỗng")

        frames = None
        try:
            if req.sample_interval_sec and req.sample_interval_sec > 0:
                frames = max(1, min(8, round(1.0 / req.sample_interval_sec)))
        except (TypeError, ValueError):
            frames = None

        understandings: list[dict[str, object]] = []
        errors: list[dict[str, str]] = []
        for path in req.clip_paths:
            try:
                understandings.append(understand_clip(path, frames=frames))
            except Exception as e:  # noqa: BLE001
                log.error("edit_plan_clip_failed", media=path, error=str(e))
                errors.append({"clip_path": path, "error": str(e)})

        if not understandings:
            raise HTTPException(
                status_code=500, detail=f"Không hiểu được clip nào ({len(errors)} lỗi)"
            )

        try:
            video_map = build_video_map(understandings, goal=req.goal)
            edit_plan = build_edit_plan(video_map, goal=req.goal)
        except Exception as e:  # noqa: BLE001
            log.error("build_edit_plan_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

        return {
            "edit_plan": edit_plan,
            "video_map": video_map,
            "clips_understood": len(understandings),
            "clips_failed": len(errors),
            "errors": errors,
        }

    @app.post("/vision/cluster_clips")
    async def post_cluster_clips(req: ClusterRequest) -> dict[str, object]:
        """COST-1 — Gom clip gần giống bằng perceptual hash → chỉ cần hiểu
        1 đại diện/cụm, giảm số lần gọi Gemini."""
        from directorai_context.modules.cluster import cluster_clips

        if not req.clip_paths:
            raise HTTPException(status_code=400, detail="clip_paths rỗng")
        try:
            return cluster_clips(req.clip_paths, max_distance=req.max_distance)
        except Exception as e:  # noqa: BLE001
            log.error("cluster_clips_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/vision/filter_bad")
    async def post_filter_bad(req: FilterBadRequest) -> dict[str, object]:
        """MOD-3 — Lọc clip kém: CV chấm hết → Vision chỉ xem clip nghi →
        keep/review/discard. Tiết kiệm chi phí Gemini (chỉ gọi trên subset)."""
        from directorai_context.modules.prefilter import filter_bad

        if not req.clip_paths:
            raise HTTPException(status_code=400, detail="clip_paths rỗng")
        frames = None
        try:
            if req.sample_interval_sec and req.sample_interval_sec > 0:
                frames = max(1, min(8, round(1.0 / req.sample_interval_sec)))
        except (TypeError, ValueError):
            frames = None
        try:
            return filter_bad(req.clip_paths, threshold=req.threshold, frames=frames)
        except Exception as e:  # noqa: BLE001
            log.error("filter_bad_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/scenes/classify")
    async def post_scene_classify(req: VisionRequest) -> dict[str, object]:
        """F6 — Heuristic scene class + aesthetic-lite score.

        Buckets clip into landscape/closeup/action/dialog/static/lowlight
        from color + motion + edge features. No ML model required.
        """
        from directorai_context.modules.scene_class import classify_clip

        try:
            sample_count = int(max(2, round(1.0 / max(0.001, req.sample_interval_sec))))
        except (TypeError, ValueError):
            sample_count = 7
        try:
            r = classify_clip(req.media_path, sample_count=sample_count)
            return r.to_dict()
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            log.error("scene_classify_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/color/analyze")
    async def post_color_analyze(req: VisionRequest) -> dict[str, object]:
        """P2-2 — Sample frames + compute color mood/warmth/dominants."""
        from directorai_context.modules.color_analyze import analyze_clip_path

        try:
            sample_count = int(max(1, round(1.0 / max(0.001, req.sample_interval_sec))))
        except (TypeError, ValueError):
            sample_count = 5
        try:
            return analyze_clip_path(req.media_path, sample_count=sample_count)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            log.error("color_analyze_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/audio/silences")
    async def post_silences(req: BeatRequest) -> dict[str, object]:
        """P1-2 — Detect silent intervals in an audio/video file.

        Reuses BeatRequest shape (`media_path`) so callers don't need a
        new model. Returns `{ media_path, silences: [{start, end}] }`.
        """
        from directorai_context.modules.silences import detect_silences_in_file

        try:
            return detect_silences_in_file(req.media_path)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            log.error("silences_failed", error=str(e))
            raise HTTPException(status_code=500, detail=str(e)) from e

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
