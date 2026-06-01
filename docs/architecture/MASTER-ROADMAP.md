# DirectorAI — LỘ TRÌNH TỔNG (Master Roadmap)

> Tài liệu CANONICAL — gộp 3 thiết kế thành 1 tầm nhìn nhất quán:
>
> - `ai-understanding.md` — AI hiểu nội dung 4 tầng (triết lý cốt lõi)
> - `module-system.md` — kiến trúc "module checklist + Run"
> - `module-specs.md` — spec chi tiết từng module
>
> Đọc file này trước; 3 file kia là phụ lục chi tiết.

---

## 0. Triết lý (1 câu)

> **AI HIỂU nội dung như editor → QUYẾT ĐỊNH có lý do → CƠ HỌC thực thi
> an toàn, không phá hủy.**

Không bao giờ để "luật cứng" tự xoá nội dung. Mọi quyết định phá-bỏ đều
qua hiểu biết của AI + bạn duyệt + hoàn tác được.

---

## 1. Hiện trạng (đã xong, verify thật)

| Mảng                                                 | Trạng thái                      |
| ---------------------------------------------------- | ------------------------------- |
| Foundation (server/sidecar/WS/storage)               | ✅ Live                         |
| Tín hiệu thô CV (blur/motion/màu/beat/silence/scene) | ✅ Có sẵn                       |
| Gemini lập kế hoạch văn bản                          | ✅ Live (15-45s)                |
| **Ghi thẳng Premiere 26** (executeTransaction)       | ✅ **VERIFIED** (disable 10ms)  |
| disable / trim / move / transition                   | ✅ Code xong (disable verified) |
| Giao diện tiếng Việt + nút hướng dẫn + sơ đồ         | ✅ Live                         |
| Ops log + panel telemetry + auto-reload-verify       | ✅ Công cụ debug                |
| **Tầng 2 — AI XEM + HIỂU clip** (Gemini Vision)      | ✅ **VERIFIED** (7/7 Nerf thật) |
| **Tầng 3 — Bản đồ video tổng** (gộp LLM)             | ✅ **VERIFIED** (8 clip Nerf)   |
| **Tầng 4 — Kế hoạch edit có lý do** (AI-3)           | ✅ **VERIFIED** (24 bước safe)  |

**TẦNG TRÍ TUỆ ĐÃ THÔNG SUỐT** (CV → Vision → Video map → Edit plan), tất cả
verify trên clip Nerf thật. **Mảnh còn THIẾU cốt lõi**: **SAFE-1 (Tầng an
toàn)** — nối kế hoạch AI-3 vào: checkpoint tự động → **preview bắt buộc**
(map media_path → clipId thật trên timeline) → bạn duyệt → ghi không phá huỷ
→ undo. Đây là cầu cuối từ "kế hoạch" → "chạm timeline" một cách an toàn.

---

## 2. KIẾN TRÚC TỔNG HỢP

```
╔══════════════════════════════════════════════════════════════╗
║  TẦNG TRÍ TUỆ (Intelligence Stack)                           ║
║                                                              ║
║  ① Tín hiệu thô (Python CV)   blur/motion/màu/beat/scene    ║
║         │  rẻ, chạy hết 413 clip — CHỈ gợi ý                 ║
║         ▼                                                    ║
║  ② Hiểu từng clip (Gemini Vision)   xem keyframe → mô tả    ║
║         │  "bắn/né/trúng đạn", mờ-do-action vs mờ-do-lỗi    ║
║         ▼                                                    ║
║  ③ Hiểu TỔNG video (LLM)   gộp → bản đồ video               ║
║         │  cốt truyện, cao trào, clip trùng/bỏ được         ║
║         ▼                                                    ║
║  ④ Kế hoạch edit (LLM + mục tiêu)   quyết định CÓ LÝ DO     ║
╚═══════════════════════════╤══════════════════════════════════╝
                            │ (hiểu biết + kế hoạch)
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ╔═══════════════════╗       ╔═══════════════════╗
    ║ CHẾ ĐỘ ⚡ TỰ ĐỘNG ║       ║ CHẾ ĐỘ 🎬 ĐẠO DIỄN║
    ║ (module checklist)║       ║ (mô tả tự nhiên)  ║
    ║ tích module → Run ║       ║ AI tự lập kế hoạch║
    ╚═════════╤═════════╝       ╚═════════╤═════════╝
              └─────────────┬─────────────┘
                            ▼
    ╔══════════════════════════════════════════════╗
    ║  TẦNG AN TOÀN (Safety)                       ║
    ║  Checkpoint → Xem trước → Bạn duyệt →         ║
    ║  Thực thi không phá hủy → Undo được          ║
    ╚═══════════════════════╤══════════════════════╝
                            ▼
    ╔══════════════════════════════════════════════╗
    ║  NỀN GHI (Track A — executeTransaction)       ║
    ║  disable / trim / move / transition (verified)║
    ╚══════════════════════════════════════════════╝
```

**Mấu chốt**: Cả 2 chế độ (Tự động + Đạo diễn) đều dùng CHUNG Tầng trí tuệ

- Tầng an toàn + Nền ghi. Khác nhau ở cách bạn ra lệnh (tích checkbox vs
  mô tả lời).

---

## 3. Module = Signals + Judgment + Execute

Mỗi module (dù ở chế độ Tự động) KHÔNG còn là luật cứng. Cấu trúc 3 phần:

```ts
interface EditModule {
  id;
  category;
  name;
  icon;
  feasibility;
  help;
  params;
  signals(ctx): Promise<Signals>; // ① CV thô — gợi ý ứng viên
  judge(ctx, signals): Promise<Decision>; // ②③ Vision/LLM — HIỂU + quyết định
  execute(ctx, decision): ModuleStep[]; // ④ thực thi an toàn
}
```

Ví dụ "Lọc clip kém":

1. `signals`: CV chấm blur (gợi ý 30 clip nghi ngờ).
2. `judge`: Vision xem 30 clip → "18 hỏng thật (rung/trượt), 12 mờ-do-action
   GIỮ LẠI".
3. `execute`: disable 18 clip (an toàn, undo được).

---

## 4. DANH SÁCH TÍNH NĂNG (20 module, 4 tầng khả thi)

### ✅ Tầng 1 — Ghi thẳng (6)

Lọc clip kém _(disable, verified)_ · Cắt khoảng lặng _(trim)_ · Tỉa phần thừa ·
Xếp lại theo chất lượng _(move)_ · Đổi tên theo cảnh · Thêm chuyển cảnh.

### 📊 Tầng 2 — Phân tích/báo cáo (6, read-only)

Báo cáo chất lượng · **Phát hiện cảnh action (motion_score — đắt giá cho Nerf)** ·
Phân loại cảnh · Phân tích màu · Dò nhịp · Tách ranh giới cảnh.

### ⚠️ Tầng 3 — Màu Lumetri (3, beta — cần verify component chain)

Màu theo template · Màu từng phân cảnh · Cân bằng exposure.

### 📄 Tầng 4 — Chỉ FCPXML (4, Premiere 26 chưa cho write)

Speed tự động · Cắt theo nhịp (split) · Auto-build từ thô (insert) · Marker.

> Chi tiết tham số + thuật toán: xem `module-specs.md`.

---

## 5. BỐ CỤC FILE (gộp, dễ mở rộng)

```
packages/
  vision/                 ← MỚI: Tầng 2 — sample keyframe + Gemini Vision
    src/clip-understanding.ts   (mô tả ngữ nghĩa 1 clip)
    src/video-map.ts            (Tầng 3 — gộp → bản đồ video)
  modules/                ← MỚI: Tầng "năng lực" (signals+judge+execute)
    src/types.ts, registry.ts, pipeline.ts
    src/modules/<category>/<module>.ts   (thêm chức năng = +1 file)
  fcpxml/                 ← MỚI (Tầng 4, sau): sinh FCPXML
  premiere-adapter/       ← Nền ghi (Track A — Action model) ✅
  effect-library/         ← preset màu/transition ✅
  llm-client/             ← Gemini text + vision ✅

apps/
  server/
    src/module-router.ts        ← MỚI: module.list/run/preview
    src/vision-router.ts        ← MỚI: vision.analyze
    src/checkpoint-*            ← an toàn (đã có P4.06)
  panel/src/components/
    AutoTab.tsx, ModuleCard.tsx, ModuleParams.tsx   ← MỚI (chế độ Tự động)
    UnderstandingView.tsx       ← MỚI (hiện bản đồ video + lý do)
    DirectorTab.tsx             ← chế độ Đạo diễn (đã có)
    AnalysisTab.tsx             ← báo cáo (Tầng 2)
  context-engine/         ← Python CV (Tầng 1) ✅
```

**Nguyên tắc mở rộng**: thêm module = thêm 1 file trong `modules/src/modules/`.
Tab tự render từ registry. Không sửa UI, không sửa server.

---

## 6. LỘ TRÌNH THỰC THI (thứ tự, gộp nhất quán)

| GĐ          | Tên                        | Nội dung                                                                | Trạng thái                                                                                                      |
| ----------- | -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Track A** | Nền ghi                    | executeTransaction + Action model                                       | ✅ XONG                                                                                                         |
| **AI-1**    | Vision pipeline (Tầng 2)   | sample keyframe → Gemini Vision → "clip understanding"                  | ✅ **VERIFIED** (7/7 clip Nerf thật, 3.9s/clip)                                                                 |
| **AI-2**    | Video map (Tầng 3)         | gộp understanding → bản đồ video                                        | ✅ **VERIFIED** (8 clip → cốt truyện+4 đoạn+6 key; cache 41→8s)                                                 |
| **AI-3**    | Editorial planner (Tầng 4) | bản đồ + mục tiêu → kế hoạch có lý do                                   | ✅ **VERIFIED** (24 bước safe-only, 0 op cấm; tự nêu giới hạn)                                                  |
| **SAFE-1**  | Tầng an toàn               | checkpoint tự động + preview bắt buộc + chế độ báo-cáo                  | ✅ preview + apply(disable/rename/trim/move) + cổng duyệt; **dry-run VERIFIED live** (tap 11); transition defer |
| **MOD-1**   | Khung module               | package modules: types+registry+pipeline                                | ⬜                                                                                                              |
| **MOD-2**   | Tab Tự động                | checklist + Run + xem trước + cổng duyệt                                | ✅ AutoTab (5 module, preview→duyệt→ghi); cần verify live trên panel                                            |
| **MOD-3**   | 6 module Tầng 1            | lọc/cắt-lặng/tỉa/xếp/đổi-tên/transition (mỗi cái signals+judge+execute) | ⬜                                                                                                              |
| **MOD-4**   | Verify màu Lumetri         | introspect component chain → Tầng 3 ready hay FCPXML                    | ⬜                                                                                                              |
| **MOD-5**   | Tab Phân tích              | báo cáo CSV/HTML (Tầng 2)                                               | ⬜                                                                                                              |
| **COST-1**  | Tối ưu Vision              | cụm hoá + cache theo file hash                                          | 🟡 cache xong (AI-2a); còn cụm hoá                                                                              |
| **MOD-6**   | FCPXML (Tầng 4)            | speed/beat-cut/auto-build                                               | ⬜ (quyết định sau)                                                                                             |
| **MOD-7**   | Template Nerf              | lưu template + nút preset 1-click                                       | ⬜                                                                                                              |

**Đường tới hành**: Track A ✅ → AI-1 ✅ → AI-2 ✅ → **AI-3** → SAFE-1 →
MOD-1 → MOD-3. Mỗi mốc verify live trên video Nerf thật.

---

## 7. GIỚI HẠN TRUNG THỰC (Premiere 26)

| Làm được (ghi thẳng) | KHÔNG làm được (cần FCPXML)  |
| -------------------- | ---------------------------- |
| Tắt/bật clip ✅      | Chèn clip mới ❌             |
| Tỉa in/out ✅        | Cắt-đôi 1 clip (split) ❌    |
| Di chuyển clip ✅    | Đổi speed ❌                 |
| Thêm chuyển cảnh ✅  | Marker ❌                    |
| Đổi tên ✅           | (màu Lumetri: ⚠️ cần verify) |

→ "Auto-build từ đầu", "cắt theo nhịp", "slow-mo" thuộc Tầng 4 (FCPXML) —
để sau theo quyết định của bạn.

---

## 8. CÂU HỎI MỞ (duyệt trước khi code AI-1)

1. **Cost Vision**: chấp nhận ~60-100 frame/video gửi Gemini (vài nghìn
   đồng/video) đổi lấy "hiểu thật" — hay muốn giới hạn cứng số frame?
2. **Mức tự động**: AI tự quyết rồi báo, hay LUÔN dừng cho bạn duyệt từng
   nhóm quyết định? (mình nghiêng về: luôn preview trước khi ghi).
3. **Bắt đầu AI-1**: xây Vision pipeline + verify trên 5-10 clip Nerf thật
   của bạn trước (chứng minh AI mô tả đúng "cú trúng đạn") rồi mới mở rộng?

---

## 9. Tóm tắt

DirectorAI = **trợ lý editor biết XEM + HIỂU + thực thi AN TOÀN**, không
phải máy chạy luật. Một Tầng trí tuệ chung nuôi 2 chế độ (Tự động checklist

- Đạo diễn tự nhiên), tất cả qua Tầng an toàn, đứng trên Nền ghi đã verify.
  Mở rộng vô hạn bằng cách thêm module — mỗi module có "bộ não" AI bên trong.
