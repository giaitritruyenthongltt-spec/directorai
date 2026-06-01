"""Sprint B.6 — Per-clip analysis pipeline.

Composes frame_sampler + quality scoring into one `analyze_clip()` call.
B.3 (object detect), B.4 (scene classify), B.5 (aesthetic) plug in later
via the `extras` dict — pipeline degrades gracefully when an analyzer
isn't installed yet.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from typing import Any

from directorai_context.logger import log
from directorai_context.modules import frame_sampler as fs
from directorai_context.modules import quality as q


@dataclass(frozen=True)
class ClipAnalysis:
    """Single-clip output of the v3 vision pipeline."""

    path: str
    duration_sec: float
    width: int
    height: int
    fps: float
    codec: str
    sample_count: int
    elapsed_ms: int
    quality: dict[str, float]
    extras: dict[str, Any] = field(default_factory=dict)
    """Reserved for B.3 (objects), B.4 (scene), B.5 (aesthetic) once wired."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def analyze_clip(
    path: str,
    *,
    sample_count: int = 10,
    max_dim: int = 1280,
    progress_cb: "callable | None" = None,
) -> ClipAnalysis:
    """Sample N frames, score quality, return composite analysis.

    progress_cb(fraction, message) gets called periodically — pass the
    JobContext.set_progress when running inside a worker.
    """
    start = time.perf_counter()

    def _emit(frac: float, msg: str) -> None:
        if progress_cb is not None:
            progress_cb(frac, msg)

    _emit(0.05, "probing")
    info = fs.probe(path)

    _emit(0.20, "sampling frames")
    frames = fs.sample(path, count=sample_count, max_dim=max_dim)

    _emit(0.60, "scoring quality")
    images = [f.image for f in frames]
    score = q.score_frames(images)

    _emit(1.0, "done")
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    log.info(
        "clip_analyzed",
        path=path,
        sample_count=len(frames),
        elapsed_ms=elapsed_ms,
        composite_quality=round(score.composite, 3),
    )
    return ClipAnalysis(
        path=path,
        duration_sec=info.duration_sec,
        width=info.width,
        height=info.height,
        fps=info.fps,
        codec=info.codec,
        sample_count=len(frames),
        elapsed_ms=elapsed_ms,
        quality=score.to_dict(),
        extras={},
    )
