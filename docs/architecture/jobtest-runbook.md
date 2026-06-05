# Job test đầy đủ (live) — runbook

> Kiểm MỌI chức năng qua WS server thật (Premiere + sidecar + Gemini) trên
> sequence đang mở. Ghi thật timeline có TỰ HOÀN TÁC. `npm run test:job`.

## Chạy

1. Đảm bảo đang chạy: server `:7778`, sidecar `:8000`, panel kết nối Premiere với 1 sequence mở (vd "tap 11"). (`pnpm dev` / các script start-\*.)
2. `node tools/jobtest-tap11.mjs` (hoặc `npm run test:job`). Exit 0 = tất cả PASS.

## Bao phủ (20 test, 6 nhóm)

| Nhóm            | Test                                                                                 | Ý nghĩa                                                            |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| A. Đọc          | project.get · getActiveSequence · activeSequenceClips · resolveFromProject           | dự án/sequence/clip; kind video/audio đúng; map path               |
| B. CV/audio     | qualityReport · planDeadAir · detectBeats · clusterClips · listEffects · module.list | phân tích KHÔNG cần Gemini                                         |
| C. AI           | understandClip · buildVideoMap · buildEditPlan(3 hồi)                                | Gemini hiểu clip → bản đồ → kế hoạch (rename/trim/move/transition) |
| D. An toàn      | previewPlan · applyPlan DRY-RUN                                                      | mọi action execution-ready, KHÔNG mutate                           |
| **E. GHI THẬT** | checkpoint.snapshot → rename → verify(đếm tên) → hoàn tác → verify                   | **đường ghi timeline + project về nguyên trạng**                   |
| F. Hệ thống     | checkpoint.list · marker.list(soft)                                                  | liveness                                                           |

## Kết quả tham chiếu (tap 11, 413 clip — 2026-06-05)

```
KẾT QUẢ: 20/20 PASS
A: total=413 kind={video:207, audio:206} · resolved=171 video
C: buildEditPlan steps=15 actions={rename:5,trim:5,move:4,transition:1}
D: previewPlan executable=15/15 · dryRun sẽ-ghi=15
E: rename applied=1 → "clip mang tên mới=1 (video)" → hoàn tác "còn 0 clip tên test"
   → Ghi timeline: rename=OK · hoàn tác=OK
```

## Lưu ý cách VERIFY rename (quan trọng)

Synthetic clip id chứa TÊN (`<track>:<tick>:<name>`) → **id ĐỔI sau rename**.
KHÔNG verify theo id cũ (sẽ "undefined"). Verify ĐÚNG = **đếm số clip mang tên
mới** (rename OK ⇔ đúng 1; hoàn tác OK ⇔ còn 0). Cũng KHÔNG đối chiếu theo
path/name cũ vì có thể trùng nhiều clip (video+audio cùng basename).

## Tồn đọng đã ghi nhận

- **marker.list** lỗi adapter (`getMarkers` undefined trên PPro26) — probe phụ,
  để soft (không tính fail). Cần sửa adapter nếu dùng marker.
- Ghi THẬT mới phủ `rename` (reversible sạch). `disable/transition` chưa có
  inverse-action để auto-revert → đang kiểm qua dry-run; muốn ghi thật cần
  thêm cơ chế revert (enable / remove-transition) hoặc dựa Ctrl-Z.
