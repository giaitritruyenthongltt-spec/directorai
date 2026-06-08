"""SPEED P3 — Test orchestration speed_render (dry_run, mock analyze → khong can ffmpeg).

Kiem: dat ten output, skip_unity bo qua clip 1.0x, clip loi -> skip, action dung.
Render that da verify LIVE (3.mp4 0.7x out 12.91s, 6.mp4 1.3x out 7.75s, fps giu 60).
"""

from __future__ import annotations

from directorai_context.modules import speed_render
from directorai_context.modules.speed_render import _out_path_for, render_speed_batch


def test_out_path_naming() -> None:
    assert _out_path_for("E:/x/3.mp4", 0.7, "E:/out").endswith("3_speed0_7x.mp4")
    assert _out_path_for("E:/x/clip.mov", 2.0, None).endswith("clip_speed2x.mov")
    assert _out_path_for("E:/x/a.mp4", 1.3, "E:/out").endswith("a_speed1_3x.mp4")


def _fake_analysis() -> dict:
    return {
        "clips": [
            {"path": "hi.mp4", "motion": 0.30, "fps": 60.0, "duration": 10.0},
            {"path": "mid.mp4", "motion": 0.15, "fps": 60.0, "duration": 10.0},
            {"path": "calm.mp4", "motion": 0.05, "fps": 60.0, "duration": 10.0},
            {"path": "broken.mp4", "error": "boom"},
        ]
    }


def test_dry_run_skips_unity_and_errors(monkeypatch) -> None:
    monkeypatch.setattr(speed_render, "analyze_speed_batch", lambda *a, **k: _fake_analysis())
    out = render_speed_batch(["hi.mp4", "mid.mp4", "calm.mp4", "broken.mp4"], dry_run=True, out_dir="E:/out")
    by = {r["path"]: r for r in out["results"]}
    # hi (slowmo) + calm (speedup) duoc len ke hoach; mid (1.0x) keep; broken skip.
    assert by["hi.mp4"]["action"] == "plan"
    assert by["hi.mp4"]["speed"] < 1.0
    assert by["calm.mp4"]["action"] == "plan"
    assert by["calm.mp4"]["speed"] > 1.0
    assert by["mid.mp4"]["action"] == "keep"
    assert by["broken.mp4"]["action"] == "skip"
    assert out["summary"]["rendered"] == 0
    assert out["summary"]["dry_run"] is True


def test_dry_run_provides_out_paths_for_rendered(monkeypatch) -> None:
    monkeypatch.setattr(speed_render, "analyze_speed_batch", lambda *a, **k: _fake_analysis())
    out = render_speed_batch(["hi.mp4", "mid.mp4", "calm.mp4", "broken.mp4"], dry_run=True, out_dir="E:/out")
    by = {r["path"]: r for r in out["results"]}
    assert "out_path" in by["hi.mp4"]
    assert "out_path" in by["calm.mp4"]
    assert "out_path" not in by["mid.mp4"]  # keep khong co out


def test_no_skip_unity_plans_all(monkeypatch) -> None:
    monkeypatch.setattr(speed_render, "analyze_speed_batch", lambda *a, **k: _fake_analysis())
    out = render_speed_batch(
        ["hi.mp4", "mid.mp4", "calm.mp4", "broken.mp4"], dry_run=True, skip_unity=False, out_dir="E:/out"
    )
    by = {r["path"]: r for r in out["results"]}
    # khong skip_unity: mid (1.0x) cung len ke hoach (van render giu nguyen toc do).
    assert by["mid.mp4"]["action"] == "plan"
    assert by["broken.mp4"]["action"] == "skip"  # clip loi van skip
