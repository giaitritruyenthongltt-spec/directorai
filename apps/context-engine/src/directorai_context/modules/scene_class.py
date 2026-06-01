"""F6 — Heuristic scene classification (no ML model).

Buckets a clip into one of 6 scene classes from features we already
compute (color + motion + brightness). Trade-off:

  - Honest fallback when YOLO/NIMA isn't installed.
  - O(seconds) per clip vs. minutes for ultralytics download + inference.
  - Good enough to disambiguate landscape vs. closeup vs. action.

If you want real YOLO-based class detection later:
  uv pip install ultralytics
  then implement modules/yolo_scene.py and have CompositeTools prefer it
  when it returns a high-confidence label.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from directorai_context.logger import log
from directorai_context.modules.color import analyze_clip_color

SceneClass = str  # 'landscape' | 'closeup' | 'action' | 'dialog' | 'static' | 'lowlight'

VALID_CLASSES: tuple[SceneClass, ...] = (
    "landscape",
    "closeup",
    "action",
    "dialog",
    "static",
    "lowlight",
)


@dataclass(frozen=True)
class SceneClassResult:
    """All signals + the chosen class."""

    media_path: str
    sample_count: int
    motion_score: float  # 0-1 — mean inter-frame pixel diff
    brightness: float  # 0-1
    contrast: float  # 0-1
    edge_density: float  # 0-1 — Canny edges / pixels
    aesthetic: float  # 0-1 — NIMA-lite proxy: contrast + saturation + composition
    scene_class: SceneClass

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _motion_score(frames_gray: list[np.ndarray]) -> float:
    """Mean absolute pixel difference between consecutive frames."""
    if len(frames_gray) < 2:
        return 0.0
    diffs: list[float] = []
    for a, b in zip(frames_gray[:-1], frames_gray[1:], strict=False):
        if a.shape != b.shape:
            continue
        d = cv2.absdiff(a, b).astype(np.float32).mean() / 255.0
        diffs.append(float(d))
    if not diffs:
        return 0.0
    return float(np.mean(diffs))


def _edge_density(frames_gray: list[np.ndarray]) -> float:
    """Canny edge fraction averaged across frames. High = busy scene."""
    if not frames_gray:
        return 0.0
    fractions: list[float] = []
    for f in frames_gray:
        edges = cv2.Canny(f, 80, 200)
        fractions.append(float((edges > 0).mean()))
    return float(np.mean(fractions))


def _aesthetic_lite(
    contrast: float, saturation: float, edge_density: float, motion: float
) -> float:
    """NIMA-lite proxy in [0,1]. Higher = visually richer.

    Tuned so:
      - flat boring footage scores 0.2-0.4
      - balanced scenic shots score 0.5-0.7
      - highly composed shots score 0.7+
    """
    # Weighted sum then squash. Edge_density caps at 0.20 typical.
    raw = (
        0.35 * min(1.0, contrast * 2.0)
        + 0.30 * min(1.0, saturation * 1.5)
        + 0.20 * min(1.0, edge_density * 5.0)
        + 0.15 * min(1.0, motion * 4.0)
    )
    return float(round(min(1.0, max(0.0, raw)), 3))


def _classify(
    motion: float, brightness: float, contrast: float, edge_density: float
) -> SceneClass:
    """Rule-based bucket. Cascade-style — first match wins."""
    if brightness < 0.18:
        return "lowlight"
    if motion > 0.08:
        return "action"
    if motion < 0.005:
        return "static"
    if edge_density > 0.15 and brightness > 0.45:
        return "landscape"
    if edge_density < 0.06 and contrast < 0.20:
        return "closeup"
    return "dialog"


def classify_clip(media_path: str, sample_count: int = 7) -> SceneClassResult:
    """Sample `sample_count` evenly-spaced frames, compute features,
    classify. Returns also an aesthetic proxy score."""
    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open media: {media_path}")
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if total <= 0:
            raise RuntimeError(f"No frames in media: {media_path}")
        n = max(2, min(sample_count, total))
        idxs = [int(round(i * (total - 1) / max(1, n - 1))) for i in range(n)]
        frames_bgr: list[np.ndarray] = []
        frames_gray: list[np.ndarray] = []
        for idx in idxs:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            frames_bgr.append(frame)
            frames_gray.append(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
        if not frames_bgr:
            raise RuntimeError(f"Failed to read frames from {media_path}")
    finally:
        cap.release()

    color_stats = analyze_clip_color(frames_bgr)
    motion = _motion_score(frames_gray)
    edge_density = _edge_density(frames_gray)

    cls = _classify(
        motion=motion,
        brightness=color_stats.brightness,
        contrast=color_stats.contrast,
        edge_density=edge_density,
    )
    aesthetic = _aesthetic_lite(
        contrast=color_stats.contrast,
        saturation=color_stats.saturation,
        edge_density=edge_density,
        motion=motion,
    )

    log.info(
        "scene_class_done",
        media=str(path),
        scene_class=cls,
        motion=round(motion, 4),
        edge=round(edge_density, 4),
        aesthetic=aesthetic,
    )

    return SceneClassResult(
        media_path=str(path),
        sample_count=len(frames_bgr),
        motion_score=float(round(motion, 4)),
        brightness=color_stats.brightness,
        contrast=color_stats.contrast,
        edge_density=float(round(edge_density, 4)),
        aesthetic=aesthetic,
        scene_class=cls,
    )
