# DirectorAI MVP smoke report

Run at: 2026-06-01T15:12:37.320Z

| Suite        | Status     | Duration |
| ------------ | ---------- | -------- |
| director-ws  | ✅ pass    | 42.1s    |
| effect-apply | ❌ fail    | 61.0s    |
| rough-cut    | ⏭ skipped | 0.0s     |

---

## director-ws

```
Connecting to ws://127.0.0.1:7778…
✔ ws open

Calling director.plan…
✔ director.plan returned in 40808ms
  title: Xóa khoảng lặng khỏi Track Audio 1
  ETA:   5 min
  steps: 4
    1. project.getActiveSequence — Xác định sequence đang hoạt động để làm việc.
    2. tracks.list — Liệt kê các track để xác định clip âm thanh trên Audio Track 1.
    3. context.detectSilences — Phân tích âm thanh trên Track 1 để tìm tất cả các khoảng im lặng.
    4. timeline.deleteClip — Xóa các clip tương ứng với các khoảng im lặng đã tìm thấy.

Calling director.execute…
✔ execute → planId=ppsx682w
  progress: 1/4 · error

✅ PASS — director.* RPC pipeline alive over WS
```

## effect-apply

```
Connecting to ws://127.0.0.1:7778…
✔ ws open

Step 1 — Get active sequence
  project.getActiveSequence… ✔
  → sequence: tap 11 (7cb3fbb9-2423-45a4-a627-3c317acb9dc9)

Step 2 — List clips
  timeline.listClips… ✔
  → 413 clips; first: video-0:0:0530.mp4 0530.mp4

Step 3 — effect.apply (Lumetri Color)
  effect.apply Lumetri… ✗ effect.apply timed out

Step 4 — color.applyPreset
  color.applyPreset warm_vlog… ✗ color.applyPreset timed out

Step 5 — transition.apply (Cross Dissolve)
  transition.apply… ✗ [UXP] applyTransition: no compatible API found for "AE.ADBE Cross Dissolve" between video-0:0:0530.mp4/video-0:7212792787200:DJI_20251126100842_0003_D.MP4. Tried TransitionFactory + track.addTransition probes. See docs/guides/uxp-setup.md to verify on PPro 2024+.

─── Summary ─────────────────────────────────────
  ✔ project.getActiveSequence
  ✔ timeline.listClips
  ✗ effect.apply (Lumetri) — effect.apply timed out
  ✗ color.applyPreset — color.applyPreset timed out
  ✗ transition.apply — [UXP] applyTransition: no compatible API found for "AE.ADBE Cross Dissolve" between video-0:0:0530.mp4/video-0:7212792787200:DJI_20251126100842_0003_D.MP4. Tried TransitionFactory + track.addTransition probes. See docs/guides/uxp-setup.md to verify on PPro 2024+.

❌ FAIL — 3 step(s) failed
```
