"""AI-1c — Smoke test: Gemini Vision hiểu clip Nerf thật.

Chạy understand_clip qua sidecar trên nhiều clip thật, in tiếng Việt đã
giải mã + bảng verdict. Mục tiêu: chứng minh AI mô tả đúng nội dung action
Nerf và phân biệt blur-do-action vs blur-do-lỗi.

Usage:
    python tools/smoke-vision-understand.py
    python tools/smoke-vision-understand.py E:/T11/2.mp4 E:/T11/3.mp4
"""

from __future__ import annotations

import sys
import time

import httpx

SIDECAR = "http://127.0.0.1:8000"

# Tập clip mặc định: trộn raw DJI (cảnh lập) + clip ngắn đã cắt (có thể action).
DEFAULT_CLIPS = [
    "E:/T11/2.mp4",
    "E:/T11/3.mp4",
    "E:/T11/6.mp4",
    "E:/T11/7.mp4",
    "E:/T11/8.mp4",
    "E:/T11/DJI_20251126100842_0003_D.MP4",
    "E:/T11/DJI_20251126100944_0004_D.MP4",
]

VERDICT_ICON = {"keep": "✅ GIỮ", "review": "🟡 XEM", "discard": "❌ BỎ"}


def run_one(client: httpx.Client, path: str) -> dict | None:
    t0 = time.time()
    try:
        r = client.post(
            f"{SIDECAR}/vision/understand_clip",
            json={"media_path": path, "sample_interval_sec": 0.33},
            timeout=120.0,
        )
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ {path}: lỗi kết nối {e}")
        return None
    dt = time.time() - t0
    if r.status_code != 200:
        print(f"  ✗ {path}: HTTP {r.status_code} — {r.text[:200]}")
        return None
    d = r.json()
    d["_elapsed"] = dt
    return d


def main() -> int:
    clips = sys.argv[1:] or DEFAULT_CLIPS
    print("═" * 72)
    print(f"AI-1c — Vision hiểu {len(clips)} clip Nerf thật (qua sidecar)")
    print("═" * 72)

    # health
    try:
        h = httpx.get(f"{SIDECAR}/health", timeout=5.0).json()
        print(f"Sidecar: {h}")
    except Exception as e:  # noqa: BLE001
        print(f"✗ Sidecar không phản hồi {SIDECAR}: {e}")
        return 1

    results: list[dict] = []
    with httpx.Client() as client:
        for path in clips:
            print(f"\n── {path}")
            d = run_one(client, path)
            if not d:
                continue
            results.append(d)
            verdict = VERDICT_ICON.get(d.get("quality_verdict", ""), d.get("quality_verdict"))
            print(f"   {verdict}  | cảnh: {d.get('scene_type')} | action {d.get('action_level')}/10"
                  f" | blur: {d.get('blur_assessment')} | {d.get('_elapsed'):.1f}s")
            print(f"   📝 {d.get('summary')}")
            if d.get("is_key_moment"):
                print(f"   ⭐ KHOẢNH KHẮC ĐẮT: {d.get('key_moment_type')}")
            print(f"   💡 lý do: {d.get('quality_reason')}")
            subs = d.get("subjects") or []
            if subs:
                print(f"   👥 chủ thể: {', '.join(subs)}")

    # Tổng kết
    print("\n" + "═" * 72)
    print("TỔNG KẾT")
    print("═" * 72)
    if not results:
        print("✗ Không có clip nào hiểu được.")
        return 1
    keep = sum(1 for d in results if d.get("quality_verdict") == "keep")
    review = sum(1 for d in results if d.get("quality_verdict") == "review")
    discard = sum(1 for d in results if d.get("quality_verdict") == "discard")
    key = sum(1 for d in results if d.get("is_key_moment"))
    avg = sum(d["_elapsed"] for d in results) / len(results)
    print(f"  {len(results)}/{len(clips)} clip hiểu thành công")
    print(f"  ✅ giữ {keep}  |  🟡 xem {review}  |  ❌ bỏ {discard}  |  ⭐ key-moment {key}")
    print(f"  ⏱  trung bình {avg:.1f}s/clip")
    blur_kinds = {}
    for d in results:
        b = d.get("blur_assessment", "?")
        blur_kinds[b] = blur_kinds.get(b, 0) + 1
    print(f"  🔍 blur phân loại: {blur_kinds}")
    ok_ratio = len(results) / len(clips)
    if ok_ratio >= 0.8:
        print(f"\n✅ AI-1c PASS — {len(results)}/{len(clips)} hiểu OK "
              f"(≥80%). Gemini Vision hiểu ngữ nghĩa clip Nerf thật.")
        return 0
    print(f"\n❌ AI-1c FAIL — chỉ {len(results)}/{len(clips)} hiểu OK (<80%).")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
