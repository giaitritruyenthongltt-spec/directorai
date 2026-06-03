# Audit chức năng & logic vận hành từng tab (trung thực, không tô hồng)

> Đối soát 7 tab với backend THẬT (RPC nào chạy, ghi timeline qua đường nào).
> Kết luận lớn: plugin có **7 tab** nhưng thực chất chỉ cần **~3** — đang
> **trùng lặp 3 động cơ plan→execute** và có **tab demo dùng dữ liệu giả**.

## 0. Phát hiện cốt lõi — 3 động cơ "plan→ghi" song song (TRÙNG LẶP)

| Đường ghi                                         | Tab dùng             | An toàn?                                      | Trạng thái            |
| ------------------------------------------------- | -------------------- | --------------------------------------------- | --------------------- |
| `safe.applyPlan` (preview→checkpoint→approval)    | **FilmTab, AutoTab** | ✅ đầy đủ                                     | HIỆN ĐẠI, verified    |
| `director.execute` (SDK PlanExecutor, chạy async) | DirectorTab          | ⚠️ KHÔNG qua cổng duyệt/checkpoint giống safe | ĐƯỜNG CŨ (Sprint H.2) |
| `style.apply` (style-router)                      | StylePicker          | có checkpoint nhưng **context GIẢ**           | DEMO                  |

→ Người dùng bối rối "dùng tab nào để dựng?". Nên **gom về 1 đường an toàn** (`safe.applyPlan`).

---

## 1. 🎞️ Phim dài (FilmTab) — TRỤ CỘT

**Chức năng:** nạp clip (dùng chung) → 🎯 lấy path → chọn kiểu phim (template
long-form) → Lập kế hoạch (planner LF) → xem Chương + Cắt dead-air → Xem trước
→ Duyệt & Ghi.
**RPC:** activeSequenceClips, resolveFromProject/Folders, buildEditPlan,
planDeadAir, safe.applyPlan. **Đường ghi:** safe (an toàn).
**Verdict: ✅ ĐÚNG, là tab chính.**
**Thiếu:**

- ❌ **Thanh tiến độ khi GHI** (100 step không có feedback — ProgressBar global
  chưa nối vào applyPlan).
- ❌ **Chọn/bỏ từng bước** trước khi ghi (giờ all-or-nothing).
- ❌ **Thumbnail clip** trong bảng (chỉ tên/path, không xem được hình).
- ❌ **Nhạc nền / soundtrack** (phim cần nhạc — chưa có chỗ thêm).
- ❌ **Undo/checkpoint UI** (checkpoint tạo ngầm, không có nút khôi phục).

## 2. ⚡ Tự động (AutoTab) — TRÙNG MỘT PHẦN với FilmTab

**Chức năng:** tick module (lọc/tỉa/xếp/đổi-tên/transition/màu) + nguồn clip
(dùng chung, đã có map sau R5) + mục tiêu → Xem trước → Ghi.
**RPC:** safe.applyPlan. **Đường ghi:** safe (an toàn).
**Verdict: ✅ chạy đúng, NHƯNG ~70% chồng FilmTab** (cùng safe.applyPlan, khác
ở chỗ "chọn module" vs "chọn template").
**Thừa:** template "montage ngắn" trùng ý FilmTab.
**Đề xuất:** giữ làm chế độ "tự chọn từng việc" (advanced) HOẶC gộp module-picker
thành 1 mục trong FilmTab. Không nên là tab riêng ngang hàng.

## 3. 🎬 Đạo diễn (DirectorTab) — ĐƯỜNG CŨ, GHI KHÔNG-AN-TOÀN

**Chức năng:** gõ mục tiêu tự do + chọn persona → director.plan (LLM) →
director.execute (chạy async, có progress/cancel/refine).
**RPC:** director.plan/execute/progress/cancel/refine/listPlans.
**Đường ghi:** `director.execute` — **KHÔNG qua preview→duyệt→checkpoint** như
safe. **Verdict: ⚠️ TRÙNG + RỦI RO.** Đây là bản LLM-orchestrator Sprint H.2,
ra đời trước tầng an toàn. Chức năng "chat mục tiêu → tự làm" hay, nhưng đang
đi đường ghi cũ.
**Đề xuất:** (a) chuyển execute của Director sang `safe.applyPlan` (thống nhất
an toàn), HOẶC (b) biến Director thành "trợ lý hội thoại" sinh ra editPlan rồi
đẩy vào luồng safe của FilmTab. Không để 2 đường ghi.
**Thiếu:** không dùng clip đã map (chỉ goal text) → AI không biết clip thật.

## 4. 🔍 Báo cáo (AnalysisTab) — ĐÚNG, hơi lẻ

**Chức năng:** chấm chất lượng CV (nét/blur) + gom cụm trùng → bảng + CSV/HTML.
Sau R6 đã dùng clip chung + guard kết nối.
**RPC:** context.qualityReport. **Không ghi timeline.**
**Verdict: ✅ ĐÚNG, hữu ích.** **Thừa/Thiếu:** nên là **một bước TRONG** luồng
FilmTab ("lọc clip xấu trước khi dựng") thay vì tab tách rời; thiếu nút "ẩn clip
nghi kém" ngay từ báo cáo (giờ phải sang tab khác).

## 5. 🎨 Phong cách (StylePicker) — DEMO, DỮ LIỆU GIẢ ❌

**Chức năng:** chọn preset YAML hoặc gõ YAML tay + **gõ context JSON GIẢ** →
style.plan/apply.
**RPC:** style.list/plan/dryRun/apply. **Đường ghi:** style (có checkpoint).
**Verdict: ❌ DEMO — KHÔNG dùng clip thật từ sequence** (bắt người dùng gõ JSON
mô phỏng). Lạc khỏi luồng thật, gây hiểu nhầm.
**Đề xuất:** **BỎ tab này** (gập "phong cách màu/nhịp" thành tuỳ chọn trong
FilmTab), hoặc wire lại để đọc clip thật. Hiện tại là nợ kỹ thuật.

## 6. 📊 Ngữ cảnh (ContextTab) — CÔNG CỤ THẤP, hợp lý làm "nâng cao"

**Chức năng:** kiểm tra engine (health) + thao tác sidecar trên 1 file:
ingest/transcribe/findScenes/findBeats/analyzeVisual/searchClips.
**RPC:** context-router (thật). **Verdict: ✅ chạy, nhưng là CÔNG CỤ DEBUG/
nâng cao** — dùng 1 ô mediaPath, không dùng clip chung.
**Đề xuất:** giữ nhưng dồn vào nhóm "Nâng cao/Chẩn đoán"; nối ô mediaPath với
clip đang chọn ở bảng để đỡ gõ tay.

## 7. 💬 Trò chuyện (ChatLog) — ĐÚNG vai trò

**Chức năng:** hiển thị log tool-call/lỗi từ server (stateless).
**Verdict: ✅ ĐÚNG** — là cửa sổ nhật ký, giữ nguyên. Có thể nâng thành
"hội thoại 2 chiều" (gõ lệnh tiếng Việt → chạy) nếu muốn.

---

## TỔNG HỢP — Thừa / Thiếu / Bổ sung

### A. THỪA (trùng lặp / demo — nên gọn lại)

1. **3 động cơ ghi** → gom về `safe.applyPlan` duy nhất (Director, Style ngừng
   tự ghi đường riêng).
2. **StylePicker** — demo dữ liệu giả → bỏ hoặc gập vào FilmTab.
3. **DirectorTab** — đường ghi cũ → đổi sang safe hoặc thành trợ lý hội thoại.
4. **7 tab ngang hàng** → nên còn **3 nhóm**: _Dựng phim_ (Film, gồm module+
   báo cáo+phong cách), _Trợ lý/Chat_ (Director+ChatLog), _Nâng cao_ (Context).

### B. THIẾU (chức năng cốt lõi chưa có — nên BỔ SUNG)

| #      | Chức năng                                                    | Vì sao cần (phim dài Nerf)                  |
| ------ | ------------------------------------------------------------ | ------------------------------------------- |
| **G1** | **Thanh tiến độ khi GHI** (nối ProgressBar vào applyPlan)    | 100+ step không feedback → tưởng treo       |
| **G2** | **Nhạc nền / soundtrack** (chọn track, đặt vào timeline)     | Phim cần nhạc; hiện chưa có                 |
| **G3** | **Thumbnail clip** trong bảng                                | Nhìn hình để quyết, không chỉ tên           |
| **G4** | **Undo/checkpoint UI** (xem + khôi phục bản chụp)            | Ghi sai → khôi phục nhanh, không chỉ Ctrl-Z |
| **G5** | **Chọn/bỏ từng bước** trước khi ghi                          | Duyệt có chọn lọc, không all-or-nothing     |
| **G6** | **Lịch sử kế hoạch** (director.listPlans có sẵn, chưa lộ UI) | So sánh/quay lại bản dựng trước             |
| **G7** | **Marker chương GHI lên timeline** (DM2/DM3)                 | Chương hiện chỉ ở UI, chưa lên Premiere     |
| **G8** | **Trực quan dead-air / waveform**                            | Đang cắt "mù", nên thấy chỗ lặng            |
| **G9** | **Nhớ phiên** (module đã tích, thư mục) qua reload (F6)      | Đỡ làm lại sau mỗi reload                   |

### C. Ưu tiên đề xuất (giá trị ÷ công sức)

1. **G1 (progress khi ghi)** + **G4 (undo UI)** — an toàn/niềm tin, rẻ.
2. **Gộp tab**: bỏ/sửa StylePicker, đưa AnalysisTab + module-picker thành bước
   trong FilmTab → còn 3 nhóm rõ ràng.
3. **Thống nhất đường ghi** Director → safe.
4. **G2 (nhạc)** + **G7 (marker chương)** — cần live + introspect, làm sau.
