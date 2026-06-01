"""AI-3c — Smoke test: kế hoạch edit có lý do (Tầng 4) trên clip Nerf thật.

Gọi /vision/build_edit_plan với 1 mục tiêu cụ thể, in kế hoạch tiếng Việt:
chiến lược + từng bước (thao tác + clip + lý do) + phần ngoài tầm (chưa
ghi được). Kiểm: kế hoạch CHỈ chứa thao tác an toàn, bắt buộc preview.

Usage:
    python tools/smoke-edit-plan.py
    python tools/smoke-edit-plan.py "dựng bản hài 30s"
"""

from __future__ import annotations

import sys
import time

import httpx

SIDECAR = "http://127.0.0.1:8000"
SAFE = {"disable", "trim", "move", "rename", "transition"}

CLIPS = [
    "E:/T11/2.mp4",
    "E:/T11/3.mp4",
    "E:/T11/6.mp4",
    "E:/T11/7.mp4",
    "E:/T11/8.mp4",
    "E:/T11/DJI_20251126100756_0001_D.MP4",
    "E:/T11/DJI_20251126100842_0003_D.MP4",
    "E:/T11/DJI_20251126100944_0004_D.MP4",
]

DEFAULT_GOAL = (
    "Dựng một bản action ~45s gay cấn nhất: loại bỏ clip trùng hoặc yếu, "
    "GIỮ các khoảnh khắc đắt giá (trúng đạn, ngắm bắn, tạo dáng ngầu), "
    "sắp xếp theo cao trào và thêm chuyển cảnh mượt giữa các pha hành động."
)


def main() -> int:
    goal = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_GOAL
    print("═" * 72)
    print("AI-3c — Kế hoạch edit từ clip Nerf thật (Tầng 4)")
    print(f"🎯 Mục tiêu: {goal}")
    print("═" * 72)

    try:
        httpx.get(f"{SIDECAR}/health", timeout=5.0).raise_for_status()
    except Exception as e:  # noqa: BLE001
        print(f"✗ Sidecar không phản hồi: {e}")
        return 1

    t0 = time.time()
    try:
        r = httpx.post(
            f"{SIDECAR}/vision/build_edit_plan",
            json={"clip_paths": CLIPS, "goal": goal, "sample_interval_sec": 0.33},
            timeout=300.0,
        )
    except Exception as e:  # noqa: BLE001
        print(f"✗ Lỗi gọi build_edit_plan: {e}")
        return 1
    dt = time.time() - t0

    if r.status_code != 200:
        print(f"✗ HTTP {r.status_code}: {r.text[:400]}")
        return 1

    data = r.json()
    plan = data["edit_plan"]
    print(f"\n⏱  {dt:.1f}s | hiểu {data['clips_understood']} clip | lỗi {data['clips_failed']}\n")

    print(f"🧠 HIỂU MỤC TIÊU: {plan.get('goal_understanding')}")
    print(f"♟  CHIẾN LƯỢC: {plan.get('strategy')}")

    steps = plan.get("steps", [])
    print(f"\n📋 KẾ HOẠCH ({len(steps)} bước — chỉ thao tác ghi được):")
    bad = []
    for s in steps:
        action = str(s.get("action", "")).lower()
        if action not in SAFE:
            bad.append(action)
        tgt = str(s.get("target_path", "")).split("/")[-1]
        rev = "↩" if s.get("reversible") else "⚠"
        print(f"   {s.get('order')}. [{action}] {tgt}  {rev}")
        if s.get("params"):
            print(f"      ⚙  {s.get('params')}")
        print(f"      💡 {s.get('reason')}")

    oos = plan.get("out_of_scope", [])
    if oos:
        print(f"\n🚧 NGOÀI TẦM (chưa ghi được, cần FCPXML) — {len(oos)}:")
        for o in oos:
            print(f"   • {o.get('want')} → cần {o.get('needs')}")
            if o.get("why"):
                print(f"     ({o.get('why')})")

    print(f"\n📊 Tác động: {plan.get('estimated_impact')}")
    print(f"🔒 Bắt buộc preview: {plan.get('requires_preview')}"
          f" | bước không an toàn bị loại: {plan.get('rejected_unsafe_steps')}")

    # Tiêu chí PASS
    ok_steps = len(steps) >= 1
    ok_safe = len(bad) == 0
    ok_preview = plan.get("requires_preview") is True
    print("\n" + "═" * 72)
    if ok_steps and ok_safe and ok_preview:
        print(f"✅ AI-3c PASS — {len(steps)} bước, 100% thao tác an toàn, bắt buộc preview.")
        return 0
    print(f"❌ AI-3c FAIL — steps={ok_steps} safe={ok_safe}(bad={bad}) preview={ok_preview}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
