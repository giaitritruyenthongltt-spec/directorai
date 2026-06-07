"""Sprint C — Composite audio analysis.

Combines beat detection (already in modules/beat.py), silence detection,
voice activity, and loudness/quality measurements into one pass over the
clip's audio track.

Heavy ML (pyannote VAD, Whisper transcription) is lazy-loaded via the
existing modules — this module exists to give the AI Director a single
audio-context call.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class Silence:
    start_sec: float
    end_sec: float


@dataclass(frozen=True)
class AudioAnalysis:
    path: str
    duration_sec: float
    sample_rate: int
    tempo_bpm: float | None
    beat_count: int
    beats_sec: list[float]
    silences: list[Silence] = field(default_factory=list)
    voice_fraction: float = 0.0
    """0-1 — fraction of the clip with detected voice activity. Heuristic
       only (RMS-based) until pyannote is wired."""
    loudness_lufs: float | None = None
    """Integrated loudness (negative dB). None if measurement failed."""
    clipped_pct: float = 0.0
    """Fraction of samples at ±0.99 or beyond — audio clipping indicator."""

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


# ─── Silence + VAD heuristic (no ML) ────────────────────────────────────


def detect_silences(
    audio: np.ndarray,
    sr: int,
    threshold_db: float = -40.0,
    min_silence_sec: float = 0.3,
) -> list[Silence]:
    """Find sub-threshold runs ≥ min_silence_sec. Returns absolute timestamps."""
    if audio.size == 0:
        return []
    # Convert to dBFS (0 dB = full scale)
    eps = 1e-10
    db = 20.0 * np.log10(np.maximum(np.abs(audio), eps))
    silent = db < threshold_db
    if not silent.any():
        return []
    # Edges of silent runs
    diff = np.diff(silent.astype(np.int8))
    starts = np.where(diff == 1)[0] + 1
    ends = np.where(diff == -1)[0] + 1
    if silent[0]:
        starts = np.r_[0, starts]
    if silent[-1]:
        ends = np.r_[ends, len(audio)]
    min_samples = int(min_silence_sec * sr)
    out: list[Silence] = []
    for s, e in zip(starts, ends, strict=False):
        if e - s >= min_samples:
            out.append(Silence(start_sec=float(s / sr), end_sec=float(e / sr)))
    return out


def estimate_voice_fraction(audio: np.ndarray, sr: int) -> float:
    """Quick RMS-based proxy: any 50ms window with RMS above a voice-band
    threshold counts as voiced. Not as accurate as pyannote but fast and
    dependency-free.
    """
    if audio.size == 0:
        return 0.0
    win = max(1, int(0.05 * sr))
    if audio.size < win:
        return 0.0
    # Pad to a multiple of win
    pad = (-audio.size) % win
    if pad:
        audio = np.concatenate([audio, np.zeros(pad, dtype=audio.dtype)])
    frames = audio.reshape(-1, win)
    rms = np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1))
    # Voice ~ -30 dBFS upwards in typical recordings
    threshold = 0.03
    voiced = (rms > threshold).sum()
    return float(voiced) / float(len(rms))


def measure_loudness(audio: np.ndarray, sr: int) -> tuple[float | None, float]:
    """Returns (integrated LUFS-ish, clipped fraction).

    Real LUFS needs K-weighting; we approximate with simple RMS dBFS.
    The number is consistent across clips so it's good enough to compare
    relative loudness — re-calibrate against ffmpeg-ebur128 in Sprint H.
    """
    if audio.size == 0:
        return (None, 0.0)
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
    if rms <= 0:
        return (None, 0.0)
    lufs_approx = 20.0 * np.log10(rms)
    clipped = float((np.abs(audio) >= 0.99).sum()) / float(audio.size)
    return (lufs_approx, clipped)


# ─── Public composite ──────────────────────────────────────────────────


def analyze_audio(media_path: str, *, sample_rate: int = 22050) -> AudioAnalysis:
    """Load audio once, run every analyzer."""
    import librosa

    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    audio, sr = librosa.load(str(path), sr=sample_rate, mono=True)
    duration = float(len(audio) / sr) if sr else 0.0

    # Beat detection
    try:
        tempo, beats = librosa.beat.beat_track(y=audio, sr=sr, units="time")
        # Newer librosa returns np.ndarray for tempo even on single estimate.
        if hasattr(tempo, "__len__"):
            tempo_val: float | None = float(tempo[0])
        else:
            tempo_val = float(tempo)
        beats_list = [float(b) for b in beats]
    except Exception:
        tempo_val = None
        beats_list = []

    silences = detect_silences(audio, sr)
    voice_fraction = estimate_voice_fraction(audio, sr)
    loudness, clipped = measure_loudness(audio, sr)

    return AudioAnalysis(
        path=str(path),
        duration_sec=duration,
        sample_rate=sr,
        tempo_bpm=tempo_val,
        beat_count=len(beats_list),
        beats_sec=beats_list,
        silences=silences,
        voice_fraction=voice_fraction,
        loudness_lufs=loudness,
        clipped_pct=clipped,
    )
