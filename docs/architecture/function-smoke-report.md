# Báo cáo job test chức năng (live) — Gemini đã kích hoạt lại

> Chạy `npm run smoke:functions` (tools/function-smoke.mjs) qua server thật
> (Premiere "tap 11" 413 clip + Gemini). Hàm GHI chỉ tới preview/dry-run —
> KHÔNG mutate timeline thật.

## Kết quả: **14/14 PASS** (sau khi restart sidecar)

| Nhóm    | Hàm                                | Kết quả live                                  |
| ------- | ---------------------------------- | --------------------------------------------- |
| Nguồn   | `context.activeSequenceClips`      | seq "tap 11", 413 clip                        |
| Nguồn   | `context.resolveFromProject`       | 202 media → 171 path (171 video)              |
| CV      | `context.qualityReport` (3)        | 3 row, 0 nghi kém                             |
| Audio   | `context.planDeadAir` (3)          | tỉa 2 clip, bỏ ~3.4s chết                     |
| Audio   | `context.detectSilences`           | chạy (0 lặng ở clip đó)                       |
| Audio   | `context.detectBeats`              | 56 beat, tempo 143 BPM                        |
| Cost    | `context.clusterClips` (5)         | 5 cụm                                         |
| Catalog | `context.listEffects`              | 60 effect                                     |
| Catalog | `module.list`                      | 6 module                                      |
| **AI**  | `context.understandClip`           | scene=action, verdict=keep                    |
| **AI**  | `context.buildVideoMap` (3)        | 2 đoạn, 2 key-moment                          |
| **AI**  | `context.buildEditPlan` (5, 3 hồi) | **15 bước + 3 chương, 0 bước bị loại** (~21s) |
| An toàn | `safe.previewPlan`                 | resolve 15/15 clip thật, 15 executable        |
| An toàn | `safe.applyPlan` dry-run           | 15 bước sẽ ghi, 0 hoãn                        |

→ **Toàn bộ chuỗi Dựng phim chạy thông suốt**: nạp clip → lấy path → CV/dead-air
→ Vision hiểu clip → planner LF sinh kế hoạch 3 hồi có chương → tầng an toàn
resolve về clip thật + mô phỏng ghi. Chỉ còn bước GHI THẬT (approved=true) cần
bạn bấm trên panel (tôi không tự ghi lên project của bạn).

## Lỗi tìm thấy + đã sửa

**`context.planDeadAir` → 404 `/audio/dead_air`** (lần chạy đầu).

- Nguyên nhân: **sidecar Python chạy KHÔNG `--reload`** (PID cũ), load app trước
  khi route LF4 được thêm → route chưa đăng ký. (Route `/vision/build_edit_plan`
  cũ vẫn chạy vì handler lazy-import editorial_planner mới → chapters vẫn ra.)
- Sửa: **restart sidecar** (`sidecar:start`). Sau restart route 200, test 14/14.
- Bài học vận hành: **sau khi sửa code Python phải restart sidecar** (hoặc chạy
  `sidecar:dev` có `--reload` khi phát triển).

## Cách chạy lại

```
npm run smoke:functions     # cần: server :7778 + sidecar :8000 + Premiere mở sequence
```
