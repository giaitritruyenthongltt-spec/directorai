# Lộ trình nâng cấp DirectorAI — Video Nerf Action

> Mục tiêu: plugin hỗ trợ dựng video hành động Nerf gun. Use case chính:
>
> 1. Đưa file thô → tự động phân tích nội dung → dựng hợp lý
> 2. Phân tích file thô → xử lý màu sắc/chất lượng từng cảnh
> 3. Đưa file đã dựng → tách từng cảnh ra để dễ chỉnh sửa
>
> Quyết định người dùng (2026-06-01):
>
> - Triển khai lần lượt toàn bộ N1-N5
> - Ưu tiên CỐ SỬA cho ghi thẳng UXP (không chỉ xuất file)

---

## 🔑 Phát hiện gốc rễ — Vì sao write treo trên Premiere 26

Code hiện tại gọi mutation TRỰC TIẾP trong `lockedAccess`:

```ts
await proj.lockedAccess(async () => {
  await item.setOutPoint(newOut); // ← treo
  await track.insertClip(projItem, t); // ← treo
});
```

Nhưng Premiere Pro 2026 (apiVersion 2) dùng mô hình **Transaction + Action**:

```ts
await proj.executeTransaction((compoundAction) => {
  const a = trackItem.createSetOutPointAction(tickTime);
  compoundAction.addAction(a);
}, 'Cắt clip');
```

- `lockedAccess` = chỉ để ĐỌC an toàn khi Premiere đang render.
- `executeTransaction` = để GHI (edit có undo).

→ Code gọi sai API: dùng read-lock cho write → treo vô hạn. **`executeTransaction` đã có sẵn trong type `PProProject` nhưng chưa được dùng.**

Đây là root cause giải thích MỌI write treo (cutClip, marker.add, applyEffect…) trong khi read (listClips, getStartTime…) chạy tốt.

---

## TRACK A (ƯU TIÊN) — Sửa ghi thẳng UXP

| Mã     | Việc                                                                                                                                                     | Output                              | Trạng thái |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------- |
| **A1** | Introspection runtime: dump toàn bộ API thật của Premiere 26 (method trên trackItem/sequence/project + action factories)                                 | Danh sách `createXxxAction` có thật | ⬜         |
| **A2** | Viết lại `mutate()` dùng `executeTransaction` + compoundAction                                                                                           | mutate mới                          | ⬜         |
| **A3** | Viết lại từng mutation theo Action pattern: cutClip, deleteClip, trimClip, moveClip, marker.add, applyEffect, applyColorPreset, setColorParams, audio.\* | Adapter ghi được                    | ⬜         |
| **A4** | Verify từng cái qua `smoke:plan-a` + ops log                                                                                                             | 1 plan chạy trọn vẹn                | ⬜         |

**Nếu A thành công** → mọi N1-N5 ghi thẳng được, không cần xuất file.
**Nếu A thất bại** (Adobe chưa expose action) → fallback sang N4 (FCPXML export).

---

## N1 — Bộ tách cảnh (Scene Splitter)

> "Đưa file đã dựng → tách từng cảnh ra để dễ chỉnh sửa"

| Việc                                 | Khả thi                    | Ghi chú                    |
| ------------------------------------ | -------------------------- | -------------------------- |
| PySceneDetect tìm ranh giới shot     | ✅ Có sẵn (`detectScenes`) |                            |
| Composite `timeline.splitAtScenes`   | ✅ (sau A3)                | Cắt clip tại mỗi ranh giới |
| 1-click "✂️ Tách cảnh video đã dựng" | ✅                         | Nút preset                 |
| Fallback: xuất markers CSV           | ✅                         | Nếu A chưa xong            |

**Giá trị**: dùng được sớm nhất. Cho cả video Nerf đã dựng.

---

## N2 — Báo cáo phân tích (Analysis Report)

> "Phân tích nội dung toàn bộ video để sắp xếp dựng hợp lý"

| Việc                                              | Khả thi                    |
| ------------------------------------------------- | -------------------------- |
| Quét 400+ clip: chất lượng + màu + motion(action) | ✅ Có sẵn                  |
| `motion_score` phát hiện đoạn bắn nhau            | ✅ Có sẵn (scene_class.py) |
| Xuất bảng CSV/HTML sắp xếp theo điểm              | ✅                         |
| Tab "📊 Phân tích" hiển thị bảng trong panel      | ✅                         |

**Giá trị**: bạn nhìn 1 bảng là biết clip nào giữ/bỏ, đoạn nào action.

---

## N3 — 1-click + Template

| Việc                                                  | Khả thi |
| ----------------------------------------------------- | ------- |
| Nút preset Nerf: Montage / Cinematic / Highlight      | ✅      |
| Lưu/đọc template riêng (JSON ~/.directorai/templates) | ✅      |
| Chế độ Nhanh / Nâng cao trong giao diện               | ✅      |

**Template Nerf đề xuất**:

| Template       | Nhịp                | Màu                    | Cấu trúc               |
| -------------- | ------------------- | ---------------------- | ---------------------- |
| Nerf Montage   | Nhanh, theo beat    | Teal-cam, contrast cao | Action liên tục        |
| Nerf Cinematic | Chậm-nhanh          | Ấm, điện ảnh           | Intro → cao trào → kết |
| Nerf Highlight | Chỉ khoảnh khắc hit | Punchy                 | Top-10 motion cao nhất |

---

## N4 — Bộ xuất FCPXML (fallback + bổ trợ)

> Né bug Premiere 26 vĩnh viễn — plugin xuất file, bạn import.

| Việc                                                 | Khả thi | Thời gian |
| ---------------------------------------------------- | ------- | --------- |
| Sinh FCPXML chuẩn (timecode/fps/đường dẫn chính xác) | ✅ Vừa  | 1-2 tuần  |
| Xuất sequence đã dựng → import = có bản dựng         | ✅      |           |

Dùng làm phương án dự phòng nếu Track A không sửa hết được.

---

## N5 — Tích hợp cuối + chờ Adobe 26.1

| Việc                                               | Phụ thuộc |
| -------------------------------------------------- | --------- |
| Khi Adobe sửa UXP write (26.1) → ưu tiên ghi thẳng | ⏳ Adobe  |
| Hợp nhất: ghi thẳng (nếu A ok) + FCPXML (dự phòng) | —         |
| Đóng gói CCX ký số, phát hành nội bộ               | —         |

---

## Thứ tự thực thi

```
A1 (introspection)  →  A2/A3 (rewrite write)  →  A4 (verify)
                                                     │
                          ┌──────────────────────────┤
                          ▼                          ▼
                    N1 Scene Splitter          N2 Báo cáo
                          │                          │
                          └────────────┬─────────────┘
                                       ▼
                              N3 1-click + Template
                                       ▼
                        N4 FCPXML (nếu A chưa hoàn hảo)
                                       ▼
                              N5 Tích hợp + phát hành
```

Mỗi mốc A4 / N1 / N2 / N3 đều cho ra thứ **dùng được ngay** trên video Nerf.
