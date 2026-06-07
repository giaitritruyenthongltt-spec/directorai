"""LF1-LF3 — Test logic thuần của editorial_planner (không gọi Gemini).

Khóa hành vi: chỉ thị long-form sinh đúng từ tham số, sanitize giữ chương hợp
lệ + loại step không an toàn, và chương rỗng clip bị bỏ.
"""

from __future__ import annotations

from directorai_context.modules.editorial_planner import (
    _fmt_duration,
    _longform_directive,
    _sanitize_chapters,
    _sanitize_plan,
)


def test_fmt_duration() -> None:
    assert _fmt_duration(605) == "10 phút 05 giây (605s)"
    assert _fmt_duration(45) == "45 giây"


def test_longform_directive_empty_when_no_params() -> None:
    # Không tham số → rỗng (giữ hành vi short-form cũ).
    assert _longform_directive(None, None, None, None) == ""


def test_longform_directive_3act() -> None:
    d = _longform_directive(600, 0.3, "cinematic", "3act")
    assert "10 phút" in d  # thời lượng mục tiêu
    assert "30%" in d  # tỉ lệ giữ
    assert "cinematic" in d  # nhịp
    assert "3 HỒI" in d  # cấu trúc


def test_longform_directive_recap_structure() -> None:
    d = _longform_directive(None, None, None, "recap")
    assert "HIỆP" in d or "VÒNG" in d


def test_sanitize_chapters_drops_empty_and_normalizes() -> None:
    chapters = [
        {"name": "Hồi 1", "purpose": "setup", "pacing": "weird", "clip_paths": ["a.mp4", ""]},
        {"bad": 1},  # rác, không clip → bỏ
        {"name": "", "purpose": "climax", "clip_paths": ["b.mp4"]},
    ]
    out = _sanitize_chapters(chapters)
    assert len(out) == 2
    # "setup" map sang "establishing"; pacing rác → "balanced".
    assert out[0]["purpose"] == "establishing"
    assert out[0]["pacing"] == "balanced"
    assert out[0]["clip_paths"] == ["a.mp4"]  # path rỗng bị loại
    # tên rỗng → tự đặt; purpose hợp lệ giữ nguyên.
    assert out[1]["name"].startswith("Chương")
    assert out[1]["purpose"] == "climax"


def test_sanitize_plan_keeps_safe_rejects_unsafe_and_attaches_chapters() -> None:
    plan = {
        "steps": [
            {"action": "disable", "target_path": "x.mp4", "params": {}, "reason": "trùng"},
            {"action": "split", "target_path": "y.mp4", "params": {}, "reason": "cắt đôi"},
            {
                "action": "trim",
                "target_path": "z.mp4",
                "params": {"in_sec": 1, "out_sec": 5},
                "reason": "bỏ lặng",
            },
        ],
        "chapters": [
            {"name": "Mở đầu", "purpose": "intro", "pacing": "build", "clip_paths": ["x.mp4"]}
        ],
    }
    out = _sanitize_plan(plan)
    actions = [s["action"] for s in out["steps"]]
    assert actions == ["disable", "trim"]  # split bị loại
    assert out["rejected_unsafe_steps"] == 1
    assert out["requires_preview"] is True
    assert len(out["chapters"]) == 1
    assert out["chapters"][0]["purpose"] == "intro"
    # split rơi vào out_of_scope.
    assert any("split" in (o.get("want") or "") for o in out["out_of_scope"])
