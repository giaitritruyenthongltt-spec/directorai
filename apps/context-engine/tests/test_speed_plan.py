"""SPEED P2 — Test engine quyet toc do (ham thuan, khong can cv2/file media).

Phan bo motion bom san => khong goi probe/sampler. Kiem cac bat bien:
slow-mo/speed-up theo percentile, fps-gate, clamp, 4 mode.
"""

from __future__ import annotations

from directorai_context.modules.speed_plan import plan_clip_speed, plan_speed_batch


def _batch() -> dict:
    return {
        "clips": [
            {"path": "action_hi.mp4", "motion": 0.30, "fps": 60.0, "duration": 10.0},
            {"path": "mid.mp4", "motion": 0.15, "fps": 60.0, "duration": 10.0},
            {"path": "calm.mp4", "motion": 0.05, "fps": 60.0, "duration": 10.0},
        ]
    }


def test_content_high_motion_slowmo_low_motion_speedup() -> None:
    r = plan_speed_batch(_batch(), mode="content")
    by = {d["path"]: d for d in r["decisions"]}
    assert by["action_hi.mp4"]["category"] == "slowmo"
    assert by["action_hi.mp4"]["speed"] < 1.0
    assert by["calm.mp4"]["category"] == "speedup"
    assert by["calm.mp4"]["speed"] > 1.0
    assert by["mid.mp4"]["category"] == "keep"
    assert by["mid.mp4"]["speed"] == 1.0


def test_speed_always_within_hard_bounds() -> None:
    # motion cuc cao -> van >= 0.5 (san atempo); cuc thap -> <= 2.0.
    hi = plan_clip_speed({"path": "x", "motion": 99.0, "fps": 60, "duration": 5}, 0.1, 0.2)
    lo = plan_clip_speed({"path": "y", "motion": 0.001, "fps": 60, "duration": 5}, 0.1, 0.2)
    assert 0.5 <= hi["speed"] <= 2.0
    assert 0.5 <= lo["speed"] <= 2.0


def test_fps_gate_blocks_strong_slowmo_on_low_fps() -> None:
    # Clip 24fps motion cao: slow-mo manh -> judder => bi nang ve floor.
    d = plan_clip_speed(
        {"path": "a", "motion": 0.30, "fps": 24.0, "duration": 10.0, "_motion_max": 0.30},
        0.1,
        0.2,
        smooth_fps=50.0,
        slowmo_fps_floor=0.8,
        slowmo_floor=0.5,
    )
    assert d["fps_gated"] is True
    assert d["speed"] >= 0.8  # khong cham hon floor


def test_fps_gate_not_triggered_on_high_fps() -> None:
    d = plan_clip_speed(
        {"path": "a", "motion": 0.30, "fps": 60.0, "duration": 10.0, "_motion_max": 0.30},
        0.1,
        0.2,
        smooth_fps=50.0,
    )
    assert d["fps_gated"] is False
    assert d["speed"] < 0.8  # duoc slow-mo manh


def test_error_clip_keeps_speed_one() -> None:
    # Clip khong co 'motion' (loi P1) -> giu 1.0x, confidence 0, khong crash summary.
    analysis = {"clips": [{"path": "broken.mp4", "error": "boom"}]}
    r = plan_speed_batch(analysis, mode="content")
    d = r["decisions"][0]
    assert d["speed"] == 1.0
    assert d["category"] == "error"
    assert d["confidence"] == 0.0


def test_duration_mode_hits_target() -> None:
    # 3 clip x 10s = 30s noi dung -> ep ve 20s.
    r = plan_speed_batch(_batch(), mode="duration", target_duration_sec=20.0)
    assert abs(r["summary"]["total_out_sec"] - 20.0) < 0.5


def test_normalize_mode_inverse_to_motion() -> None:
    # speed = target/motion: motion cao -> speed thap (cham), motion thap -> nhanh.
    r = plan_speed_batch(_batch(), mode="normalize")
    by = {d["path"]: d for d in r["decisions"]}
    assert by["action_hi.mp4"]["speed"] < by["calm.mp4"]["speed"]


def test_thresholds_come_from_batch_percentile() -> None:
    # Doi phan bo => doi nguong (khong hardcode).
    r = plan_speed_batch(_batch(), mode="content", p_lo=20.0, p_hi=80.0)
    th = r["summary"]["thresholds"]
    assert th["p_lo"] <= th["p_hi"]
    assert 0.05 <= th["p_lo"] <= 0.30
