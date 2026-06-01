"""AI-2d — Smoke test: bản đồ video (Tầng 3) trên clip Nerf thật.

Gọi /vision/build_video_map với ~10-15 clip, in bản đồ video tiếng Việt:
cốt truyện, phân đoạn, khoảnh khắc đắt, clip trùng, thứ tự lắp ráp.
Lần 2 chạy sẽ nhanh nhờ cache understand_clip (AI-2a).

Usage:
    python tools/smoke-video-map.py
    python tools/smoke-video-map.py "làm trailer 60s gay cấn"
"""

from __future__ import annotations

import sys
import time

import httpx

SIDECAR = "http://127.0.0.1:8000"

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


def main() -> int:
    goal = sys.argv[1] if len(sys.argv) > 1 else None
    print("═" * 72)
    print(f"AI-2d — Bản đồ video từ {len(CLIPS)} clip Nerf thật")
    if goal:
        print(f"Mục tiêu: {goal}")
    print("═" * 72)

    try:
        httpx.get(f"{SIDECAR}/health", timeout=5.0).raise_for_status()
    except Exception as e:  # noqa: BLE001
        print(f"✗ Sidecar không phản hồi: {e}")
        return 1

    t0 = time.time()
    try:
        r = httpx.post(
            f"{SIDECAR}/vision/build_video_map",
            json={"clip_paths": CLIPS, "goal": goal, "sample_interval_sec": 0.33},
            timeout=300.0,
        )
    except Exception as e:  # noqa: BLE001
        print(f"✗ Lỗi gọi build_video_map: {e}")
        return 1
    dt = time.time() - t0

    if r.status_code != 200:
        print(f"✗ HTTP {r.status_code}: {r.text[:400]}")
        return 1

    data = r.json()
    vm = data["video_map"]
    print(f"\n⏱  {dt:.1f}s | hiểu {data['clips_understood']} clip"
          f" | lỗi {data['clips_failed']}\n")

    print(f"🎬 TÊN GỢI Ý: {vm.get('title_suggestion')}")
    print(f"📖 TÓM TẮT: {vm.get('overall_summary')}")
    print(f"\n🎞  CỐT TRUYỆN:\n   {vm.get('story_arc')}")

    print(f"\n📚 PHÂN ĐOẠN ({len(vm.get('segments', []))}):")
    for i, s in enumerate(vm.get("segments", []), 1):
        print(f"   {i}. [{s.get('purpose')}] {s.get('name')}"
              f"  ({len(s.get('clip_paths', []))} clip)")
        print(f"      {s.get('description')}")

    print(f"\n⭐ KHOẢNH KHẮC ĐẮT ({len(vm.get('key_moments', []))}):")
    for k in vm.get("key_moments", []):
        name = k.get("clip_path", "").split("/")[-1]
        print(f"   • {name} [{k.get('type')}] → {k.get('suggested_emphasis')}")
        print(f"     {k.get('why')}")

    dups = vm.get("duplicates", [])
    if dups:
        print(f"\n🔁 CLIP TRÙNG ({len(dups)}):")
        for d in dups:
            names = [p.split("/")[-1] for p in d.get("clip_paths", [])]
            keep = (d.get("keep_suggestion") or "").split("/")[-1]
            print(f"   • {names} → giữ {keep}: {d.get('reason')}")

    disc = vm.get("discard_candidates", [])
    if disc:
        print(f"\n🗑  CÂN NHẮC BỎ: {[p.split('/')[-1] for p in disc]}")

    print(f"\n🔢 THỨ TỰ LẮP RÁP GỢI Ý:")
    for i, p in enumerate(vm.get("assembly_suggestion", []), 1):
        print(f"   {i}. {p.split('/')[-1]}")

    q = vm.get("quality_summary", {})
    print(f"\n📊 CHẤT LƯỢNG: giữ {q.get('keep')} | xem {q.get('review')}"
          f" | bỏ {q.get('discard')}")
    print(f"📝 GHI CHÚ EDITOR: {vm.get('editorial_notes')}")

    # Tiêu chí PASS: có cốt truyện + ≥2 phân đoạn + assembly phủ hết clip.
    ok_story = bool(vm.get("story_arc"))
    ok_seg = len(vm.get("segments", [])) >= 2
    ok_assembly = len(vm.get("assembly_suggestion", [])) >= data["clips_understood"] - 1
    print("\n" + "═" * 72)
    if ok_story and ok_seg and ok_assembly:
        print("✅ AI-2d PASS — bản đồ video mạch lạc (cốt truyện + phân đoạn + lắp ráp).")
        return 0
    print(f"❌ AI-2d FAIL — story={ok_story} segments={ok_seg} assembly={ok_assembly}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
