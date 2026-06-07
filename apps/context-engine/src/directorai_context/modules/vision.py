"""Vision analysis: sample frames + describe via Claude vision."""

from __future__ import annotations

import base64
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import VisionResult, VisionTag


def _probe_duration(media_path: str) -> float:
    """Get media duration in seconds via ffprobe."""
    out = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            media_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(out.stdout.strip())


def _extract_frame(media_path: str, time_sec: float, max_size: int = 768) -> bytes:
    """Extract a single frame as JPEG bytes via ffmpeg."""
    result = subprocess.run(
        [
            "ffmpeg",
            "-ss", str(time_sec),
            "-i", media_path,
            "-vframes", "1",
            "-f", "image2pipe",
            "-vcodec", "mjpeg",
            "-",
        ],
        capture_output=True,
        check=True,
    )
    img = Image.open(BytesIO(result.stdout))
    img.thumbnail((max_size, max_size))
    buf = BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def analyze_frame_with_claude(jpeg_bytes: bytes) -> tuple[str, list[str]]:
    """Send a frame to Claude vision and return (caption, tags)."""
    from anthropic import Anthropic

    cfg = get_settings()
    if not cfg.anthropic_api_key:
        return ("(no api key)", [])

    client = Anthropic(api_key=cfg.anthropic_api_key)
    b64 = base64.standard_b64encode(jpeg_bytes).decode("ascii")

    resp = client.messages.create(
        model=cfg.vision_model,
        max_tokens=300,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": b64},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Describe this video frame in 1 sentence, then list 3-7 short tags "
                            "(scene type, subject, lighting, mood). Format:\n"
                            "Caption: <sentence>\nTags: tag1, tag2, tag3"
                        ),
                    },
                ],
            }
        ],
    )

    text = resp.content[0].text if resp.content else ""  # type: ignore[union-attr]
    caption = ""
    tags: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if line.lower().startswith("caption:"):
            caption = line[len("caption:") :].strip()
        elif line.lower().startswith("tags:"):
            tags = [t.strip() for t in line[len("tags:") :].split(",") if t.strip()]
    return (caption, tags)


def analyze_video(
    media_path: str, sample_interval_sec: float | None = None
) -> VisionResult:
    """Sample frames and analyze each with Claude vision."""
    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    cfg = get_settings()
    interval = sample_interval_sec or cfg.vision_sample_interval_sec
    duration = _probe_duration(str(path))

    frames: list[VisionTag] = []
    t = 0.0
    while t < duration:
        try:
            jpeg = _extract_frame(str(path), t)
            caption, tags = analyze_frame_with_claude(jpeg)
            frames.append(VisionTag(time=t, caption=caption, tags=tags))
        except Exception as e:
            log.warn("vision_frame_failed", time=t, error=str(e))
        t += interval

    return VisionResult(media_path=str(path), frames=frames)
