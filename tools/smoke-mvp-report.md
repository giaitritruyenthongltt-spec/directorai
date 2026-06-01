# DirectorAI MVP smoke report

Run at: 2026-06-01T15:03:27.021Z

| Suite        | Status     | Duration |
| ------------ | ---------- | -------- |
| director-ws  | ✅ pass    | 47.7s    |
| effect-apply | ❌ fail    | 0.9s     |
| rough-cut    | ⏭ skipped | 0.0s     |

---

## director-ws

```
Connecting to ws://127.0.0.1:7778…
✔ ws open

Calling director.plan…
✔ director.plan returned in 46387ms
  title: Xoá khoảng lặng trên Audio Track 1
  ETA:   5 min
  steps: 3
    1. project.getActiveSequence — Xác định sequence đang hoạt động để thực hiện các thay đổi.
    2. context.detectSilences — Phân tích và tìm tất cả các khoảng im lặng trên track audio 1.
    3. timeline.deleteClip — Tự động xoá các clip im lặng đã được xác định và dồn các clip còn lại lại với nhau.

Calling director.execute…
✔ execute → planId=4kp3wht9
  progress: 1/3 · error

✅ PASS — director.* RPC pipeline alive over WS
```

## effect-apply

```
Connecting to ws://127.0.0.1:7778…
✔ ws open

Step 1 — Get active sequence
  project.getActiveSequence… ✔
  → sequence: Sample Sequence (seq-1)

Step 2 — List clips
  timeline.listClips… ✔

❌ Sequence has no clips — add at least one clip on V1.
```
