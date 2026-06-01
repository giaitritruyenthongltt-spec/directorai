# DirectorAI MVP smoke report

Run at: 2026-06-01T14:47:16.921Z

| Suite        | Status     | Duration |
| ------------ | ---------- | -------- |
| director-ws  | ✅ pass    | 18.0s    |
| effect-apply | ❌ fail    | 61.1s    |
| rough-cut    | ⏭ skipped | 0.0s     |

---

## director-ws

```
Connecting to ws://127.0.0.1:7778…
✔ ws open

Calling director.plan…
✔ director.plan returned in 16655ms
  title: Xoá khoảng lặng trên track audio 1
  ETA:   5 min
  steps: 3
    1. project.getActiveSequence — Xác định sequence đang hoạt động để thao tác.
    2. context.detectSilences — Tìm tất cả các đoạn không có tiếng trên track audio 1.
    3. timeline.deleteClip — Cắt và xoá các đoạn im lặng đã tìm thấy để video liền mạch hơn.

Calling director.execute…
✔ execute → planId=fa2yeam2
  progress: 1/3 · error

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
