"""P0 ASM — Test phần THUẦN của assemble (không cần ffmpeg/cv2/librosa).

Render thật đã verify LIVE (concat 3-4 clip Nerf -> 1 MP4, expected=actual khớp,
1280x720@60, audio aac). Đây kiểm logic tính độ dài + dựng filtergraph + auto-segments.
"""

from __future__ import annotations

from directorai_context.modules.assemble import (
    _atempo_chain,
    _build_filtergraph,
    _seg_out_duration,
    build_auto_segments,
)


def test_seg_out_duration_trim_and_speed() -> None:
    # clip 10s, không trim, 1.0x -> 10s
    assert _seg_out_duration(10.0, None, None, 1.0) == 10.0
    # trim 2..8 (6s) @ 1.0x -> 6s
    assert _seg_out_duration(10.0, 2.0, 8.0, 1.0) == 6.0
    # full 10s @ 2.0x -> 5s ; @ 0.5x -> 20s
    assert _seg_out_duration(10.0, None, None, 2.0) == 5.0
    assert _seg_out_duration(10.0, None, None, 0.5) == 20.0
    # out vượt duration -> kẹp về duration
    assert _seg_out_duration(10.0, 0.0, 99.0, 1.0) == 10.0


def test_atempo_clamped() -> None:
    assert _atempo_chain(1.3) == "atempo=1.3"
    assert _atempo_chain(0.2) == "atempo=0.5"  # kẹp sàn
    assert _atempo_chain(9.0) == "atempo=2.0"  # kẹp trần


def test_filtergraph_has_concat_and_labels() -> None:
    segs = [{"path": "a.mp4", "speed": 0.7}, {"path": "b.mp4"}]
    fg, vout, aout = _build_filtergraph(segs, [True, True], {}, 1920, 1080, 30.0)
    assert vout == "[vout]" and aout == "[aout]"
    assert "concat=n=2:v=1:a=1[vout][aout]" in fg
    assert "scale=1920:1080" in fg
    assert "setpts=PTS/0.7" in fg  # speed áp cho clip 0
    assert "atempo=0.7" in fg


def test_filtergraph_silent_input_for_missing_audio() -> None:
    segs = [{"path": "a.mp4"}, {"path": "b.mp4"}]
    # clip 1 KHÔNG có audio -> map từ input câm (index 2)
    fg, _, _ = _build_filtergraph(segs, [True, False], {1: 2}, 1280, 720, 60.0)
    assert "[2:a]aformat" in fg  # silent input dùng cho clip 1


def test_build_auto_segments_keeps_order_no_flags() -> None:
    # Không bật cờ nào -> giữ nguyên list, không gọi librosa/cv2.
    out = build_auto_segments(["x.mp4", "y.mp4", "z.mp4"])
    assert [s["path"] for s in out["segments"]] == ["x.mp4", "y.mp4", "z.mp4"]
    assert out["dropped"] == []
    assert all("speed" not in s for s in out["segments"])
