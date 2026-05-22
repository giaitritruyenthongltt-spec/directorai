"""Whisper-based transcription via faster-whisper."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import TranscribeResult, TranscribeSegment, WordTimestamp


@lru_cache(maxsize=1)
def _get_model():  # type: ignore[no-untyped-def]
    """Load and cache the Whisper model. Lazy to avoid startup cost."""
    from faster_whisper import WhisperModel

    cfg = get_settings()
    log.info("loading_whisper_model", model=cfg.whisper_model, device=cfg.whisper_device)
    return WhisperModel(cfg.whisper_model, device=cfg.whisper_device, compute_type=cfg.whisper_compute_type)


def transcribe(media_path: str, language: str | None = None) -> TranscribeResult:
    """Transcribe a media file and return word-level timestamps."""
    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    model = _get_model()
    segments, info = model.transcribe(
        str(path),
        language=language,
        word_timestamps=True,
        beam_size=5,
    )

    out_segments: list[TranscribeSegment] = []
    for i, seg in enumerate(segments):
        words: list[WordTimestamp] = []
        if seg.words:
            for w in seg.words:
                words.append(
                    WordTimestamp(
                        text=w.word,
                        start=float(w.start),
                        end=float(w.end),
                        probability=float(w.probability or 1.0),
                    )
                )
        out_segments.append(
            TranscribeSegment(
                id=i,
                start=float(seg.start),
                end=float(seg.end),
                text=seg.text.strip(),
                words=words,
            )
        )

    return TranscribeResult(
        media_path=str(path),
        language=str(info.language),
        duration_sec=float(info.duration),
        segments=out_segments,
    )
