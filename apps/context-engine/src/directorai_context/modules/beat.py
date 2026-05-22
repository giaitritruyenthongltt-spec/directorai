"""Beat tracking via librosa."""

from __future__ import annotations

from pathlib import Path

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import BeatResult


def detect_beats(media_path: str) -> BeatResult:
    """Detect tempo and beat times in an audio/video file."""
    import librosa

    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    cfg = get_settings()
    log.info("beat_detect_start", media=str(path))

    audio, sr = librosa.load(str(path), sr=cfg.beat_sample_rate, mono=True)
    tempo, beats = librosa.beat.beat_track(y=audio, sr=sr, units="time")
    tempo_val = float(tempo if not hasattr(tempo, "__len__") else tempo[0])  # type: ignore[arg-type]

    log.info("beat_detect_done", tempo=tempo_val, beats=len(beats))
    return BeatResult(
        media_path=str(path),
        tempo_bpm=tempo_val,
        beats_sec=[float(b) for b in beats],
    )
