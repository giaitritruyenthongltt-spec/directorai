"""P2-2 — Color analysis wrapper for the /color/analyze endpoint.

Wraps `color.analyze_clip_color` so the TS sidecar caller can ask
"what does this clip look like — warm? cool? neutral?" without
sampling frames itself.
"""

from __future__ import annotations

from pathlib import Path

import cv2

from directorai_context.logger import log
from directorai_context.modules.color import analyze_clip_color


def analyze_clip_path(media_path: str, sample_count: int = 5) -> dict[str, object]:
    """Sample `sample_count` evenly-spaced frames from the clip and run
    the Sprint-F color analyzer. Returns JSON-ready dict:

      {
        "media_path": ...,
        "sample_count": <actual>,
        "dominants": [{r,g,b,fraction}, ...],
        "brightness": float,
        "saturation": float,
        "contrast": float,
        "warmth": float,
        "mood": "warm" | "cool" | "neutral" | "dark" | "bright",
      }
    """
    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    log.info("color_analyze_start", media=str(path), sample_count=sample_count)
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open media: {media_path}")
    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if total_frames <= 0:
            raise RuntimeError(f"No frames in media: {media_path}")
        n = max(1, min(sample_count, total_frames))
        indices = [round(i * (total_frames - 1) / max(1, n - 1)) for i in range(n)]
        frames = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if ok and frame is not None:
                frames.append(frame)
        if not frames:
            raise RuntimeError(f"Failed to read any frame: {media_path}")
    finally:
        cap.release()

    result = analyze_clip_color(frames)
    out = result.to_dict()
    out["media_path"] = str(path)
    out["sample_count"] = len(frames)
    log.info(
        "color_analyze_done",
        mood=result.mood,
        brightness=round(result.brightness, 3),
        warmth=round(result.warmth, 3),
    )
    return out
