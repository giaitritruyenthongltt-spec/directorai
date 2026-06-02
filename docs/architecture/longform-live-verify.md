# Long-form — Các mục CẦN Premiere live (checklist khi bạn mở app)

> Toàn bộ phần làm được headless đã xong (S1, DM1, LF1-8, UI1-6, UI8). Các mục
> dưới đây **bắt buộc phải mở Premiere 2026 + panel** mới verify/hoàn tất được.
> Đây là giới hạn bản chất (cần host thật), không phải thiếu sót thiết kế.

## 0. Chuẩn bị (1 lần)

1. Sửa **Gemini billing 403** (project `394701514567`) — cần để bước AI lập
   kế hoạch (`context.buildEditPlan`) chạy thật. Dead-air (`planDeadAir`) +
   báo cáo CV KHÔNG cần Gemini.
2. Mở Premiere → mở 1 **sequence test** → mở panel DirectorAI (UDT) → **Reload**
   panel để nạp bản mới (tab "🎞️ Phim dài" sẽ là mặc định).

## 1. C9 — Verify ghi thật (an toàn)

```
npm run smoke:live-write   # đổi tên 1 clip → kiểm tra → nhắc Ctrl-Z
```

Hoặc qua panel: tab Phim dài → "Cắt khoảng chết" → "Xem trước" → "Duyệt & Ghi"
→ kiểm tra timeline → Ctrl-Z. Xác nhận: trim/disable ghi đúng + hoàn tác sạch.

## 2. DM2/DM3 — Đọc/ghi chapter-marker (cần introspect live)

- `_debug.introspect` đã có sẵn (dump API). Khi panel mở, gọi nó để xem
  **marker API thật** của Premiere 26 (createMarker? sequence.markers?).
- Sau khi biết API: viết `adapter.listChapters()` (đọc marker kind=chapter →
  `Chapter[]` của DM1) + `adapter.createChapterMarker(name, time)`.
- Khi có DM2/DM3: `EditPlan.chapters` từ planner sẽ được ghi thành
  chapter-marker thật trên timeline (hiện mới hiển thị ở UI).

## 3. S5 — Perf smoke 413 clip

- Mở sequence "tap 11" (413 clip). Đo thời gian:
  - `context.activeSequenceClips` (listClips lần 1) — kỳ vọng ~20s lần đầu,
    **gần tức thì** các lần sau (S1 cache).
  - `safe.previewPlan` — không gọi lại listClips từ host (S1) → nhanh.
- Nếu apply 100+ step vẫn chậm/treo → mở lại **S3/S4** (cache findTrackItem
  bền + gộp transaction) đã hoãn.

## 4. UI7 — Màu/nhạc theo chương (feature riêng, sau cùng)

- Cần `color.applyLookByScene` chạy theo từng chương (map chapter→clip→Lumetri).
- Verify màu cần mắt người trên timeline thật → để sau khi DM2/DM3 + ghi thật ổn.

## 5. LF6 — (đã chốt) KHÔNG làm được

Premiere 26 **không có split action** → không cắt-đôi clip qua plugin. Muốn
nhiều highlight từ 1 clip dài: phải xuất **FCPXML** (đã có package `@directorai/fcpxml`)
để cắt sẵn rồi import. Đây là đường vòng duy nhất.
