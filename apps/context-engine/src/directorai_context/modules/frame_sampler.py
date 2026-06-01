"""Sprint B.1 — Sample N frames evenly from a video clip.

Uses OpenCV (cv2.VideoCapture) which is faster than spawning ffmpeg per
frame. Falls back to ffmpeg if OpenCV can't decode the codec (HEVC on
some Windows builds, ProRes, etc).

Returns frames as numpy arrays in BGR order — OpenCV's native format.
Callers that need RGB should convert.
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from directorai_context.logger import log


@dataclass(frozen=True)
class SampledFrame:
    """One sample from the clip."""

    index: int  # 0-based within this sample
    time_sec: float  # timestamp in the source
    width: int
    height: int
    image: np.ndarray  # H × W × 3 uint8, BGR

    def to_jpeg(self, quality: int = 85) -> bytes:
        """Encode the frame as JPEG bytes. Useful for sending to vision APIs."""
        ok, buf = cv2.imencode(".jpg", self.image, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not ok:
            raise RuntimeError("cv2.imencode failed")
        return buf.tobytes()


@dataclass(frozen=True)
class ClipInfo:
    """Cheap probe — doesn't decode any frames."""

    path: str
    duration_sec: float
    fps: float
    width: int
    height: int
    frame_count: int
    codec: str


def probe(path: str) -> ClipInfo:
    """Get duration + dimensions + codec without decoding."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open: {path}")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        # CAP_PROP_FOURCC encoded as 4-byte little-endian int → ASCII
        fourcc_int = int(cap.get(cv2.CAP_PROP_FOURCC))
        codec = "".join(chr((fourcc_int >> (8 * i)) & 0xFF) for i in range(4))
        duration = frame_count / fps if fps > 0 else 0.0
    finally:
        cap.release()
    return ClipInfo(
        path=path,
        duration_sec=duration,
        fps=fps,
        width=width,
        height=height,
        frame_count=frame_count,
        codec=codec.strip("\x00"),
    )


def _sample_via_opencv(
    path: str, count: int, max_dim: int
) -> list[SampledFrame] | None:
    """Returns None if OpenCV can't decode this codec — caller falls back to ffmpeg."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return None
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        if total <= 0 or fps <= 0:
            return None
        # Evenly spaced sample indices including first & last
        if count == 1:
            indices = [total // 2]
        else:
            indices = [round(i * (total - 1) / (count - 1)) for i in range(count)]
        frames: list[SampledFrame] = []
        for i, idx in enumerate(indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            frame = _resize_max_dim(frame, max_dim)
            h, w = frame.shape[:2]
            frames.append(
                SampledFrame(
                    index=i,
                    time_sec=idx / fps,
                    width=w,
                    height=h,
                    image=frame,
                )
            )
        return frames if frames else None
    finally:
        cap.release()


def _resize_max_dim(image: np.ndarray, max_dim: int) -> np.ndarray:
    """Downscale longest side to max_dim, keeping aspect ratio. No-op if smaller."""
    h, w = image.shape[:2]
    longest = max(h, w)
    if longest <= max_dim:
        return image
    scale = max_dim / longest
    new_size = (int(round(w * scale)), int(round(h * scale)))
    return cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)


def _sample_via_ffmpeg(
    path: str, count: int, max_dim: int
) -> list[SampledFrame]:
    """Slower but more codec-tolerant fallback.

    Extracts N PNGs into a tempdir then reads them with OpenCV.
    """
    info = probe(path)
    duration = info.duration_sec
    if duration <= 0:
        raise RuntimeError(f"Cannot determine duration of {path}")
    # Evenly spaced timestamps
    if count == 1:
        timestamps = [duration / 2]
    else:
        timestamps = [duration * i / (count - 1) for i in range(count)]
    frames: list[SampledFrame] = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, t in enumerate(timestamps):
            out_path = Path(tmp) / f"f_{i:03d}.png"
            try:
                subprocess.run(
                    [
                        "ffmpeg",
                        "-loglevel", "error",
                        "-ss", str(t),
                        "-i", path,
                        "-frames:v", "1",
                        "-vf", f"scale='min({max_dim},iw)':'-1'",
                        "-y",
                        str(out_path),
                    ],
                    check=True,
                    capture_output=True,
                )
            except subprocess.CalledProcessError as e:
                log.warn("ffmpeg_extract_failed", time=t, stderr=e.stderr.decode("utf-8", "ignore"))
                continue
            if not out_path.exists():
                continue
            img = cv2.imread(str(out_path))
            if img is None:
                continue
            h, w = img.shape[:2]
            frames.append(
                SampledFrame(index=i, time_sec=t, width=w, height=h, image=img)
            )
    return frames


def sample(path: str, count: int = 10, max_dim: int = 1280) -> list[SampledFrame]:
    """Extract `count` evenly-spaced frames from the clip.

    Tries OpenCV first; falls back to ffmpeg per-frame if OpenCV can't
    decode the codec.
    """
    if count < 1:
        raise ValueError("count must be >= 1")
    if not Path(path).exists():
        raise FileNotFoundError(path)

    via_cv = _sample_via_opencv(path, count, max_dim)
    if via_cv is not None and len(via_cv) == count:
        log.info("frames_sampled_cv", path=path, count=len(via_cv))
        return via_cv
    log.info("frames_sampled_ffmpeg", path=path, requested=count)
    return _sample_via_ffmpeg(path, count, max_dim)
