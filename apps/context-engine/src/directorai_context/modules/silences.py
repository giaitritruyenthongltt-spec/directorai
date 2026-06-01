"""P1-2 — Standalone silence detection wrapper.

Wraps `audio_analyze.detect_silences` behind a simple media-path API so
DirectorAI composite tools can call `/audio/silences` like any other
sidecar endpoint.
"""

from __future__ import annotations

from pathlib import Path

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.modules.audio_analyze import detect_silences


def detect_silences_in_file(
    media_path: str,
    threshold_db: float = -40.0,
    min_silence_sec: float = 0.3,
) -> dict[str, object]:
    """Load an audio/video file and return silent intervals.

    Returns a dict with `media_path` + `silences` (list of {start, end})
    so it serializes 1:1 to JSON for the TS caller.
    """
    import librosa

    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    cfg = get_settings()
    log.info("silences_detect_start", media=str(path))

    audio, sr = librosa.load(str(path), sr=cfg.beat_sample_rate, mono=True)
    silences = detect_silences(
        audio,
        sr,
        threshold_db=threshold_db,
        min_silence_sec=min_silence_sec,
    )

    log.info("silences_detect_done", count=len(silences))
    return {
        "media_path": str(path),
        "silences": [
            {"start": s.start_sec, "end": s.end_sec} for s in silences
        ],
    }
