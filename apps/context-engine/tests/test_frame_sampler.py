"""Sprint B.1 — Frame sampler tests.

Uses synthetic videos written via cv2.VideoWriter so the suite has no
external dependency on a sample-clips folder.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import numpy as np
import pytest

from directorai_context.modules import frame_sampler as fs


def _make_synthetic_video(
    path: str,
    duration_sec: float = 2.0,
    fps: int = 24,
    width: int = 640,
    height: int = 360,
) -> None:
    """Write a clip whose frames are coloured per-second so we can
    verify the sample times come back correctly."""
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, fps, (width, height))
    n_frames = int(duration_sec * fps)
    for i in range(n_frames):
        # Color cycles 0..255 over the clip — distinct value per frame
        v = int(255 * i / max(1, n_frames - 1))
        frame = np.full((height, width, 3), v, dtype=np.uint8)
        # Draw frame index so we can also visually distinguish
        cv2.putText(
            frame,
            f"#{i}",
            (10, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (0, 0, 0),
            2,
        )
        writer.write(frame)
    writer.release()


@pytest.fixture
def synthetic_clip() -> str:
    """2-second 720p-ish synthetic clip."""
    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / "synth.mp4")
        _make_synthetic_video(path)
        yield path


def test_probe_reports_duration(synthetic_clip: str) -> None:
    info = fs.probe(synthetic_clip)
    assert info.width == 640
    assert info.height == 360
    assert info.fps > 0
    assert 1.5 < info.duration_sec < 2.5  # 2s ± slop
    assert info.frame_count > 30


def test_sample_returns_requested_count(synthetic_clip: str) -> None:
    frames = fs.sample(synthetic_clip, count=5)
    assert len(frames) == 5
    # First sample is near t=0, last near end
    assert frames[0].time_sec < 0.2
    assert frames[-1].time_sec > 1.5
    # Times are monotonic
    times = [f.time_sec for f in frames]
    assert times == sorted(times)


def test_sample_one_frame_returns_middle(synthetic_clip: str) -> None:
    [frame] = fs.sample(synthetic_clip, count=1)
    assert frame.index == 0
    # Should be roughly mid-clip
    assert 0.5 < frame.time_sec < 1.5


def test_resize_max_dim(synthetic_clip: str) -> None:
    """640x360 source with max_dim=320 should downscale longest side to 320."""
    frames = fs.sample(synthetic_clip, count=2, max_dim=320)
    for f in frames:
        assert max(f.width, f.height) <= 320


def test_missing_file_raises() -> None:
    with pytest.raises(FileNotFoundError):
        fs.sample("Z:/does/not/exist.mp4", count=3)


def test_jpeg_encode_roundtrip(synthetic_clip: str) -> None:
    [frame] = fs.sample(synthetic_clip, count=1)
    jpeg = frame.to_jpeg(quality=80)
    assert jpeg[:3] == b"\xff\xd8\xff"  # JPEG SOI marker
    # Decode back via cv2 and ensure same shape
    arr = np.frombuffer(jpeg, dtype=np.uint8)
    decoded = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    assert decoded is not None
    assert decoded.shape == frame.image.shape


def test_invalid_count_raises(synthetic_clip: str) -> None:
    with pytest.raises(ValueError):
        fs.sample(synthetic_clip, count=0)
