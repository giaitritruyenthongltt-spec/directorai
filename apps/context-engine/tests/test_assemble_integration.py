"""P2b — Integration test KHÉP KÍN cho assemble: ffmpeg sinh clip tổng hợp →
concat thật → assert độ dài. TỰ ĐỘNG (CI-able): không cần media người dùng, chỉ cần
ffmpeg (CI đã cài). Skip sạch nếu thiếu ffmpeg.

Đây là "smoke ghi-thật lặp được" mà audit chỉ thiếu — biến verify thủ công thành test.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from directorai_context.modules.assemble import assemble_film
from directorai_context.modules.recut_pipeline import has_ffmpeg, probe_media

pytestmark = pytest.mark.skipif(not has_ffmpeg(), reason="cần ffmpeg")


def _make_clip(path: Path, seconds: float, color: str = "blue") -> None:
    """Sinh 1 clip tổng hợp: testsrc video + sine audio, H.264/aac."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c={color}:s=320x240:d={seconds}:r=30",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def test_assemble_concat_real_ffmpeg(tmp_path: Path) -> None:
    a, b, c = tmp_path / "a.mp4", tmp_path / "b.mp4", tmp_path / "c.mp4"
    _make_clip(a, 3.0, "red")
    _make_clip(b, 4.0, "green")
    _make_clip(c, 2.0, "blue")
    out = tmp_path / "film.mp4"

    # a: trim 0..2 @1.0 = 2s ; b: full 4s @2.0 = 2s ; c: full 2s @0.5 = 4s → ~8s
    segs = [
        {"path": str(a), "in_sec": 0.0, "out_sec": 2.0, "speed": 1.0},
        {"path": str(b), "speed": 2.0},
        {"path": str(c), "speed": 0.5},
    ]
    r = assemble_film(segs, str(out), use_nvenc=False)  # CI không có NVENC → x264

    assert r["ok"] is True
    assert out.exists()
    assert r["clips"] == 3
    # expected ≈ 2 + 2 + 4 = 8s; cho sai số GOP/encode.
    assert abs(r["duration_sec"] - r["expected_duration"]) <= 0.5
    assert abs(r["duration_sec"] - 8.0) <= 1.0
    # output có cả video + audio.
    info = probe_media(str(out))
    assert info["has_audio"] is True
    assert info["width"] == 320 and info["height"] == 240


def test_assemble_handles_missing_audio_clip(tmp_path: Path) -> None:
    # 1 clip KHÔNG audio + 1 clip có audio → anullsrc giữ concat a=1 không vỡ.
    silent = tmp_path / "silent.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "color=c=black:s=320x240:d=2:r=30",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(silent),
        ],
        check=True,
        capture_output=True,
    )
    voiced = tmp_path / "voiced.mp4"
    _make_clip(voiced, 2.0, "white")
    out = tmp_path / "mixed.mp4"

    r = assemble_film([{"path": str(silent)}, {"path": str(voiced)}], str(out), use_nvenc=False)
    assert r["ok"] is True
    assert probe_media(str(out))["has_audio"] is True  # vẫn có audio nhờ anullsrc
