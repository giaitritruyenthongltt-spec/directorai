"""Sprint C — Audio pipeline tests using synthetic numpy arrays.

Avoids librosa.load() which needs an actual file with a codec ffmpeg can
read; instead we exercise the silence/voice/loudness helpers directly.
"""

from __future__ import annotations

import numpy as np

from directorai_context.modules.audio_analyze import (
    Silence,
    detect_silences,
    estimate_voice_fraction,
    measure_loudness,
)


def _sine(duration_sec: float, sr: int = 22050, freq: float = 440.0, amp: float = 0.3) -> np.ndarray:
    t = np.arange(int(duration_sec * sr)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def _silence(duration_sec: float, sr: int = 22050) -> np.ndarray:
    return np.zeros(int(duration_sec * sr), dtype=np.float32)


# ─── Silence detection ─────────────────────────────────────────────────


def test_silence_detected_in_pure_silence() -> None:
    audio = _silence(2.0)
    result = detect_silences(audio, sr=22050)
    assert len(result) == 1
    assert result[0].start_sec < 0.01
    assert 1.9 < result[0].end_sec < 2.1


def test_no_silence_in_loud_audio() -> None:
    audio = _sine(2.0, amp=0.5)
    result = detect_silences(audio, sr=22050)
    assert result == []


def test_silence_between_two_tones() -> None:
    """1s tone + 1s silence + 1s tone → exactly one detected silent run."""
    audio = np.concatenate([_sine(1.0), _silence(1.0), _sine(1.0)])
    result = detect_silences(audio, sr=22050)
    assert len(result) == 1
    s = result[0]
    assert 0.9 < s.start_sec < 1.1
    assert 1.9 < s.end_sec < 2.1


def test_short_silence_below_threshold_ignored() -> None:
    """100ms silence inside tone — below default 300ms threshold → 0 hits."""
    audio = np.concatenate([_sine(0.5), _silence(0.1), _sine(0.5)])
    assert detect_silences(audio, sr=22050) == []


def test_empty_audio_returns_empty() -> None:
    assert detect_silences(np.array([], dtype=np.float32), sr=22050) == []


# ─── Voice fraction heuristic ──────────────────────────────────────────


def test_voice_fraction_high_for_loud_audio() -> None:
    audio = _sine(2.0, amp=0.5)
    frac = estimate_voice_fraction(audio, sr=22050)
    assert frac > 0.9


def test_voice_fraction_zero_for_silence() -> None:
    audio = _silence(2.0)
    assert estimate_voice_fraction(audio, sr=22050) == 0.0


def test_voice_fraction_in_range() -> None:
    """Half tone half silence → fraction near 0.5."""
    audio = np.concatenate([_sine(1.0, amp=0.5), _silence(1.0)])
    frac = estimate_voice_fraction(audio, sr=22050)
    assert 0.3 < frac < 0.7


# ─── Loudness ──────────────────────────────────────────────────────────


def test_loudness_negative_for_quiet() -> None:
    audio = _sine(1.0, amp=0.05)
    lufs, clipped = measure_loudness(audio, sr=22050)
    assert lufs is not None
    assert lufs < -20  # quiet tone
    assert clipped == 0.0


def test_clipping_detected() -> None:
    """Square wave at ±1.0 → 100% clipped."""
    audio = np.ones(22050, dtype=np.float32)
    audio[::2] = -1.0
    _lufs, clipped = measure_loudness(audio, sr=22050)
    assert clipped == 1.0


def test_loudness_none_for_silence() -> None:
    lufs, clipped = measure_loudness(_silence(1.0), sr=22050)
    assert lufs is None
    assert clipped == 0.0


# ─── Silence dataclass roundtrip ───────────────────────────────────────


def test_silence_is_frozen_dataclass() -> None:
    s = Silence(start_sec=1.0, end_sec=2.0)
    assert s.start_sec == 1.0
    assert s.end_sec == 2.0
