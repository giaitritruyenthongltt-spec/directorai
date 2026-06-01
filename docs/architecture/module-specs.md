# Spec chi tiết từng Module — DirectorAI

> 📌 Đây là PHỤ LỤC. Lộ trình tổng canonical: **MASTER-ROADMAP.md**

> Tài liệu để DUYỆT trước khi code. Mỗi module ghi rõ: mục đích, tham số
> (kèm mặc định + khoảng), thuật toán 2 pha (phân tích → ghi), công cụ
> dùng, giới hạn. Trạng thái: ✅ ghi thẳng · ⚠️ beta · 📄 chỉ FCPXML.
>
> Tầng 4 (📄) để quyết định sau — chưa spec sâu trong bản này.

---

## TẦNG 1 — Module ghi thẳng được (verified / high-confidence)

### M1.1 — 🧹 Lọc clip chất lượng kém ✅

**Mục đích**: Tự tìm clip mờ/thiếu sáng/lệch khung → tắt (disable) để không
render. An toàn, bật lại được. _Đã verify write live (10ms)._

| Tham số       | Mặc định  | Khoảng           | Ý nghĩa                                         |
| ------------- | --------- | ---------------- | ----------------------------------------------- |
| `threshold`   | 0.40      | 0.2–0.8          | Điểm composite dưới mức này = "kém"             |
| `sampleCount` | 5         | 3–10             | Số frame lấy mẫu/clip                           |
| `mode`        | `disable` | disable / report | Tắt clip, hay chỉ liệt kê                       |
| `minDuration` | 0         | 0–5s             | Bỏ qua clip ngắn hơn (tránh tắt nhầm cut nhanh) |

**Thuật toán**:

1. _Phân tích_: `context.scanClips { rankByQuality:true, sampleCount }` →
   mỗi clip có `composite` (blur+exposure+focus+framing).
2. _Ghi_: với clip `composite < threshold` và `duration ≥ minDuration` →
   `timeline.setClipDisabled(clipId, true)`.
3. _Report_: số clip tắt + danh sách (tên, điểm, lý do).

**Giới hạn**: clip bị tắt vẫn nằm trên timeline (không xóa hẳn). Đúng ý
"lọc an toàn" — bạn xem lại rồi tự xóa nếu muốn.

---

### M1.2 — 🔇 Cắt khoảng lặng audio ✅

**Mục đích**: Bỏ đoạn im lặng dài (chờ, setup) bằng cách tỉa clip.

| Tham số       | Mặc định | Khoảng  | Ý nghĩa                         |
| ------------- | -------- | ------- | ------------------------------- |
| `thresholdDb` | −40      | −60…−20 | Dưới mức này coi là "lặng"      |
| `minSilence`  | 0.5s     | 0.3–3s  | Khoảng lặng ngắn hơn thì giữ    |
| `padding`     | 0.1s     | 0–0.5s  | Chừa lại đệm 2 đầu cho tự nhiên |

**Thuật toán**:

1. _Phân tích_: `context.detectSilences { audioPath }` → mảng `{start,end}`.
2. _Ghi_: với khoảng lặng ở ĐẦU/CUỐI clip → `timeline.trimClip` bỏ phần
   lặng (chừa padding).
3. _Report_: tổng giây cắt được.

**Giới hạn**: chỉ tỉa được lặng ở RÌA clip. Lặng ở GIỮA clip cần split →
Tầng 4 (FCPXML). Module sẽ cảnh báo nếu gặp lặng giữa.

---

### M1.3 — ✂️ Tỉa phần thừa đầu/cuối ✅

**Mục đích**: Cắt cứng N giây hoặc N% đầu/cuối mỗi clip (bỏ phần khởi động
camera, tay che ống kính…).

| Tham số     | Mặc định  | Khoảng            | Ý nghĩa  |
| ----------- | --------- | ----------------- | -------- |
| `trimStart` | 0.5s      | 0–5s              | Cắt đầu  |
| `trimEnd`   | 0.5s      | 0–5s              | Cắt cuối |
| `unit`      | `seconds` | seconds / percent | Đơn vị   |
| `applyTo`   | `all`     | all / video-only  | Phạm vi  |

**Thuật toán**:

1. Không cần phân tích.
2. _Ghi_: mỗi clip → `timeline.trimClip` với newRange thu vào theo tham số.

**Giới hạn**: clip ngắn hơn tổng trim sẽ bị bỏ qua + cảnh báo.

---

### M1.4 — 📐 Xếp lại theo chất lượng ✅

**Mục đích**: Đưa clip đẹp nhất lên đầu (cho highlight/montage).

| Tham số    | Mặc định     | Khoảng                 | Ý nghĩa                          |
| ---------- | ------------ | ---------------------- | -------------------------------- |
| `order`    | `high-first` | high-first / low-first | Hướng sắp                        |
| `keepTopN` | 0 (tất cả)   | 0–100                  | Chỉ giữ N clip đầu (0 = giữ hết) |

**Thuật toán**:

1. _Phân tích_: `context.scanClips { rankByQuality:true }`.
2. _Ghi_: tính vị trí mới theo điểm → `timeline.moveClip` từng clip.

**Giới hạn**: move trong CÙNG track; có thể tạo khoảng trống → module tự
dồn (ripple) bằng cách tính lại start tuần tự.

---

### M1.5 — 🏷️ Đổi tên clip theo cảnh ✅

**Mục đích**: Gắn nhãn clip (Action 01, Closeup 02…) để bạn dễ tìm.

| Tham số     | Mặc định         | Ý nghĩa        |
| ----------- | ---------------- | -------------- |
| `prefix`    | (theo loại cảnh) | Tiền tố tên    |
| `numbering` | `true`           | Thêm số thứ tự |

**Thuật toán**:

1. _Phân tích_: `context.classifyScene` mỗi clip → loại (action/closeup…).
2. _Ghi_: `createSetNameAction` với tên = `${loại} ${index}`.

---

### M1.6 — 🎞️ Thêm chuyển cảnh ✅

**Mục đích**: Chèn transition (Cross Dissolve…) giữa các clip.

| Tham số      | Mặc định         | Khoảng                | Ý nghĩa                        |
| ------------ | ---------------- | --------------------- | ------------------------------ |
| `type`       | `cross_dissolve` | (catalog)             | Loại chuyển cảnh               |
| `duration`   | 0.5s             | 0.2–2s                | Thời lượng                     |
| `applyEvery` | `all-cuts`       | all-cuts / scene-only | Mọi cut hay chỉ ranh giới cảnh |

**Thuật toán**:

1. _Phân tích_ (nếu scene-only): `context.detectScenes` → ranh giới.
2. _Ghi_: `createAddVideoTransitionAction` tại điểm nối.

**Giới hạn**: cần xác minh tham số chính xác của action (đang ở API nhưng
chưa test tham số). Verify ở MOD-3.

---

## TẦNG 2 — Module phân tích / báo cáo (read-only, đều chạy)

### M2.1 — 📋 Báo cáo chất lượng clip ✅

- Quét toàn bộ → xuất bảng (tên, blur, sáng, nét, khung, composite),
  sắp giảm dần. Định dạng: bảng trong tab "Phân tích" + nút xuất CSV/HTML.

### M2.2 — 🎯 Phát hiện cảnh action (CHO NERF) ✅

- `context.classifyScene` → `motion_score` mỗi clip. Liệt kê đoạn motion
  cao = bắn nhau/hành động. **Đây là tính năng đắt giá nhất cho video Nerf.**

### M2.3 — 🏞️ Phân loại cảnh ✅

- Mỗi clip → landscape/closeup/action/dialog/static/lowlight + điểm aesthetic.

### M2.4 — 🎨 Phân tích màu từng cảnh ✅

- mood (warm/cool/neutral/dark/bright) + warmth + dominant colors.

### M2.5 — 🥁 Dò nhịp nhạc ✅

- BPM + mảng beat (chuẩn bị cho cắt-theo-nhịp Tầng 4).

### M2.6 — 🎬 Tách ranh giới cảnh ✅

- PySceneDetect → danh sách shot {start,end}. Xuất ra để bạn biết cắt ở
  đâu (ghi thật cần split → Tầng 4).

---

## TẦNG 3 — Module màu Lumetri (BETA — cần xác minh)

> Vướng: `Component.create('AE.ADBE Lumetri')` từng treo. Cần kiểm tra
> introspection xem component chain có action-based insert không. Sau MOD-4
> sẽ rõ ready hay đẩy xuống FCPXML.

### M3.1 — 🎨 Sửa màu theo template ⚠️

| Tham số   | Mặc định    | Ý nghĩa                   |
| --------- | ----------- | ------------------------- |
| `preset`  | `warm_vlog` | 1 trong 12 preset Lumetri |
| `applyTo` | `all`       | Tất cả / chỉ video        |

- _Phân tích_: không.
- _Ghi_: mỗi clip → `color.applyPreset { presetName }` (recipe 9 slider).
- **Cần verify**: liệu component-chain ghi được qua transaction không.

### M3.2 — 🌈 Sửa màu từng phân cảnh ⚠️

- _Phân tích_: `context.analyzeColor` mỗi clip → mood.
- _Ghi_: `color.applyLookByScene` (mood → preset phù hợp tự động).
- **Cần verify**: như M3.1.

### M3.3 — ☀️ Cân bằng exposure tự động ⚠️

- _Phân tích_: exposure score mỗi clip.
- _Ghi_: `color.setParams { exposure: bù }` để cân về mức chuẩn.
- **Cần verify**: như M3.1.

---

## Cơ chế tham số (ModuleParams UI)

Khi nhấn ⚙️ trên 1 module → mở panel nhỏ render từ `module.params`:

- `number` → slider + ô nhập (min/max).
- `select` → dropdown (options).
- `boolean` → toggle.

Tham số lưu kèm template (MOD-7) để tái dùng.

---

## Thứ tự chạy pipeline (tự sắp)

Khi chọn nhiều module, runner sắp theo nhóm để tránh xung đột:

```
1. analysis   (chỉ đọc — chạy trước, cache kết quả dùng chung)
2. cleanup    (lọc kém, cắt lặng, tỉa)   ← giảm số clip trước
3. arrange    (xếp lại, đổi tên)
4. color      (áp màu sau khi đã chốt clip)
5. pace       (speed/beat — Tầng 4)
6. export     (FCPXML/report — cuối cùng)
```

Mỗi module báo tiến độ riêng; runner gom thành 1 report tổng.

---

## Câu hỏi cần bạn duyệt trước khi code

1. **Ngưỡng mặc định** M1.1 = 0.40 — hợp lý cho video Nerf của bạn? (clip
   bắn nhanh thường motion-blur cao, có thể cần ngưỡng thấp hơn ~0.30 để
   không tắt nhầm cảnh action).
2. **M1.2 cắt lặng**: chỉ tỉa rìa được, lặng giữa cần FCPXML — chấp nhận
   giới hạn này ở giai đoạn đầu chứ?
3. **M1.4 xếp lại**: bạn muốn "ripple dồn sát" hay "giữ nguyên vị trí, chỉ
   đổi thứ tự"? (ảnh hưởng thuật toán move).
4. **6 module Tầng 1** đã đúng & đủ cho nhu cầu đầu tiên chưa, hay cần thêm
   module nào nữa vào danh sách trước khi tôi dựng khung?

Duyệt xong → tôi bắt đầu MOD-1 (khung) + MOD-3 (6 module Tầng 1).
