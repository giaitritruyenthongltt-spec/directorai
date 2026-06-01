"""Sprint B.6 — Pipeline orchestrator tests."""

from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import numpy as np
import pytest

from directorai_context.modules.analyze_clip import analyze_clip


def _write_clip(path: str, dur: float = 1.5, w: int = 640, h: int = 360) -> None:
    fps = 24
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for i in range(int(dur * fps)):
        # Mostly mid-gray frame with a moving white box — gives non-zero
        # quality scores instead of saturated zeros.
        frame = np.full((h, w, 3), 120, dtype=np.uint8)
        x = int((i / (dur * fps)) * (w - 80))
        cv2.rectangle(frame, (x, 100), (x + 80, 200), (240, 240, 240), -1)
        writer.write(frame)
    writer.release()


@pytest.fixture
def clip_path() -> str:
    with tempfile.TemporaryDirectory() as tmp:
        p = str(Path(tmp) / "t.mp4")
        _write_clip(p)
        yield p


def test_analyze_returns_full_struct(clip_path: str) -> None:
    result = analyze_clip(clip_path, sample_count=5)
    assert result.path == clip_path
    assert result.sample_count == 5
    assert 1.0 < result.duration_sec < 2.0
    assert result.width == 640
    assert result.height == 360
    assert result.fps > 0
    assert result.elapsed_ms >= 0
    # Quality dict has all 5 keys
    assert set(result.quality.keys()) == {"blur", "exposure", "focus", "framing", "composite"}
    for v in result.quality.values():
        assert 0.0 <= v <= 1.0


def test_progress_callback_invoked(clip_path: str) -> None:
    fractions: list[float] = []
    messages: list[str] = []

    def cb(frac: float, msg: str) -> None:
        fractions.append(frac)
        messages.append(msg)

    analyze_clip(clip_path, sample_count=3, progress_cb=cb)
    # Expect 4 progress events: probing, sampling, scoring, done
    assert len(fractions) >= 3
    assert fractions[-1] == 1.0
    assert "done" in messages[-1].lower()


def test_to_dict_serialisable(clip_path: str) -> None:
    import json

    result = analyze_clip(clip_path, sample_count=2)
    payload = json.dumps(result.to_dict())
    assert "quality" in payload


def test_missing_file_raises() -> None:
    with pytest.raises(FileNotFoundError):
        analyze_clip("Z:/nope.mp4", sample_count=3)
