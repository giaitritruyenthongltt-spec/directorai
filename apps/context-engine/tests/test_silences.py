"""P1-2 — Unit tests for silence detection wrapper."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest


def _write_wav(path: Path, audio: np.ndarray, sr: int = 22050) -> None:
    """Write a 16-bit PCM WAV file using the stdlib `wave` module so we
    don't pull soundfile/scipy into the test deps."""
    import wave

    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(pcm)


def test_detect_silences_finds_quiet_run(tmp_path: Path) -> None:
    from directorai_context.modules.silences import detect_silences_in_file

    sr = 22050
    # 1s tone @440Hz, 1s silence, 1s tone again
    t = np.arange(sr) / sr
    tone = 0.5 * np.sin(2 * np.pi * 440 * t).astype(np.float32)
    silence = np.zeros(sr, dtype=np.float32)
    audio = np.concatenate([tone, silence, tone])
    wav_path = tmp_path / "test.wav"
    _write_wav(wav_path, audio, sr=sr)

    result = detect_silences_in_file(str(wav_path))
    assert result["media_path"] == str(wav_path)
    silences = result["silences"]
    assert isinstance(silences, list)
    assert len(silences) >= 1
    # The middle silence should be roughly at 1.0-2.0s
    first = silences[0]
    assert isinstance(first, dict)
    assert 0.5 <= first["start"] <= 1.5  # type: ignore[operator]
    assert 1.5 <= first["end"] <= 2.5  # type: ignore[operator]


def test_detect_silences_missing_file(tmp_path: Path) -> None:
    from directorai_context.modules.silences import detect_silences_in_file

    with pytest.raises(FileNotFoundError):
        detect_silences_in_file(str(tmp_path / "does-not-exist.wav"))
