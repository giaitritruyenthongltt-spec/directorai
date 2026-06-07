"""LF4 — Test hàm thuần _trim_for_clip (không cần librosa/file audio)."""

from __future__ import annotations

from directorai_context.modules.audio_analyze import Silence
from directorai_context.modules.dead_air import _trim_for_clip

_KW = dict(
    min_silence_sec=1.0,
    keep_padding_sec=0.25,
    disable_if_silent_ratio=0.85,
    min_kept_sec=0.5,
)


def test_trims_leading_and_trailing_silence() -> None:
    # Clip 10s: lặng 0..2 (đầu) và 8..10 (cuối), giữa có tiếng.
    sils = [Silence(0.0, 2.0), Silence(8.0, 10.0)]
    step = _trim_for_clip("a.mp4", 10.0, sils, **_KW)
    assert step is not None
    assert step["action"] == "trim"
    # in = 2.0 - 0.25 padding; out = 8.0 + 0.25 padding.
    assert step["params"]["in_sec"] == 1.75
    assert step["params"]["out_sec"] == 8.25


def test_no_step_when_no_edge_silence() -> None:
    # Lặng chỉ ở GIỮA clip → không cắt được (cần split, ngoài phạm vi).
    sils = [Silence(4.0, 6.0)]
    assert _trim_for_clip("b.mp4", 10.0, sils, **_KW) is None


def test_ignores_short_silence_below_threshold() -> None:
    # Lặng đầu chỉ 0.4s < min_silence_sec=1.0 → bỏ qua.
    sils = [Silence(0.0, 0.4)]
    assert _trim_for_clip("c.mp4", 10.0, sils, **_KW) is None


def test_disable_when_mostly_silent() -> None:
    # Lặng 0..9.5 trên clip 10s = 95% → disable.
    sils = [Silence(0.0, 9.5)]
    step = _trim_for_clip("d.mp4", 10.0, sils, **_KW)
    assert step is not None
    assert step["action"] == "disable"


def test_no_step_when_kept_too_short() -> None:
    # Clip 3s, lặng 0..1.3 và 1.7..3 (tỉ lệ 0.867 < ngưỡng disable 0.99 ở đây,
    # padding=0 để cô lập guard) → phần giữ 0.4s < min_kept 0.5 → None.
    sils = [Silence(0.0, 1.3), Silence(1.7, 3.0)]
    step = _trim_for_clip(
        "e.mp4",
        3.0,
        sils,
        min_silence_sec=1.0,
        keep_padding_sec=0.0,
        disable_if_silent_ratio=0.99,
        min_kept_sec=0.5,
    )
    assert step is None


def test_zero_duration_returns_none() -> None:
    assert _trim_for_clip("f.mp4", 0.0, [], **_KW) is None
