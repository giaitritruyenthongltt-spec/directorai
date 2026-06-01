# Kiến trúc Module System — DirectorAI v3

> 📌 Đây là PHỤ LỤC. Lộ trình tổng canonical: **MASTER-ROADMAP.md**

> Thiết kế "module checklist + Run": người dùng tích các chức năng muốn
> chạy, mỗi tích = 1 module độc lập đã test, nhấn Chạy → plugin gom thành
> pipeline và thực thi tuần tự. Khoa học, mở rộng dễ, không phụ thuộc LLM.

---

## 1. Đánh giá phương án "module checklist"

| Tiêu chí                  | Đánh giá                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------- |
| **Khả thi?**              | ✅ Rất khả thi — kiến trúc adapter + composite tools hiện tại đã sẵn sàng              |
| **Tính cơ động?**         | ⭐⭐⭐ Cao — thêm 1 chức năng = thêm 1 file module, không đụng chỗ khác                |
| **So với "AI Director"?** | Tốt hơn cho việc lặp lại: deterministic (không hallucination), bạn kiểm soát chính xác |
| **Nhược điểm?**           | Cần định nghĩa rõ từng module; không "sáng tạo" như LLM                                |

**Kết luận**: Nên xây. Giữ cả 2 chế độ:

- **Tự động (module checklist)** — chế độ chính, cho quy trình Nerf lặp lại.
- **Đạo diễn AI (LLM)** — chế độ nâng cao, mô tả tự nhiên.

---

## 2. Kiến trúc Module (cốt lõi)

### Package mới: `@directorai/modules`

```
packages/modules/
  src/
    types.ts                 # interface EditModule + ModuleContext + ModuleStep
    registry.ts              # đăng ký + tra cứu tất cả module
    pipeline.ts              # gom module đã chọn → sắp thứ tự → chạy
    modules/
      cleanup/
        disable-low-quality.ts    # Lọc clip kém ✅
        trim-silence.ts           # Cắt khoảng lặng ✅
      color/
        apply-template.ts         # Màu theo template ⚠️
        per-scene-color.ts        # Màu từng cảnh ⚠️
      pace/
        auto-speed.ts             # Speed tự động (FCPXML)
        beat-cut.ts               # Cắt theo nhịp (FCPXML)
      analysis/
        quality-report.ts         # Báo cáo chất lượng ✅
        scene-detect.ts           # Tách cảnh ✅
      arrange/
        reorder-by-quality.ts     # Sắp xếp lại ✅
    index.ts
```

### Interface EditModule

```ts
export type Feasibility = 'ready' | 'beta' | 'fcpxml-only' | 'blocked';
export type ModuleCategory =
  | 'cleanup'
  | 'color'
  | 'pace'
  | 'analysis'
  | 'arrange'
  | 'export';

export interface EditModule {
  id: string; // 'cleanup.disable-low-quality'
  category: ModuleCategory;
  name: string; // 'Lọc clip chất lượng kém'  (tiếng Việt)
  description: string; // mô tả ngắn
  icon: string; // '🧹'
  feasibility: Feasibility; // ready / beta / fcpxml-only / blocked
  help: { lines: string[]; example?: string }; // nội dung nút '?'
  params?: ModuleParam[]; // tham số chỉnh được (ngưỡng, preset…)

  /** Pha 1: phân tích (gọi Python sidecar). Trả dữ liệu cho pha apply. */
  analyze?(ctx: ModuleContext): Promise<unknown>;
  /** Pha 2: sinh các bước ghi (PlanStep) từ kết quả analyze. */
  buildSteps(ctx: ModuleContext, analysis: unknown): Promise<ModuleStep[]>;
}

export interface ModuleParam {
  key: string;
  label: string; // 'Ngưỡng chất lượng'
  type: 'number' | 'select' | 'boolean';
  default: unknown;
  options?: { value: string; label: string }[]; // cho select
  min?: number;
  max?: number; // cho number
}

export interface ModuleContext {
  sequenceId: string;
  clips: ClipSummary[]; // đã quét sẵn 1 lần, dùng chung
  params: Record<string, unknown>;
  call: (method: string, params?: unknown) => Promise<unknown>; // RPC tới server
}

export interface ModuleStep {
  tool: string; // 'timeline.setClipDisabled'
  params: Record<string, unknown>;
  label: string; // mô tả tiếng Việt để hiển thị tiến độ
}
```

### Pipeline runner

```ts
// pipeline.ts
async function runPipeline(
  selected: { module: EditModule; params: Record<string, unknown> }[],
  ctx: ModuleContext,
  onProgress: (e: ProgressEvent) => void
): Promise<PipelineReport> {
  // 1. Quét clip 1 lần, dùng chung cho mọi module (tránh quét lặp).
  // 2. Sắp thứ tự: analysis → cleanup → arrange → color → pace → export.
  // 3. Mỗi module: analyze() → buildSteps() → chạy từng step qua ctx.call.
  // 4. Gom report: module nào ok/fail, bao nhiêu clip bị ảnh hưởng.
}
```

---

## 3. Sơ đồ giao diện tối ưu

```
┌─────────────────────────────────────────────┐
│ 🎬 DirectorAI                  ● Đã kết nối   │
│ 📁 tap 11 · 413 clip                          │
├─────────────────────────────────────────────┤
│ [⚡ Tự động] [🎬 Đạo diễn] [📊 Phân tích] [⚙️]│  ← Tabs
├─────────────────────────────────────────────┤
│  TAB "TỰ ĐỘNG" — chọn module rồi Chạy:        │
│                                               │
│  🧹 DỌN DẸP                                   │
│   ☑ Lọc clip chất lượng kém      ✅  [⚙️][?] │
│   ☐ Cắt khoảng lặng audio        ✅  [⚙️][?] │
│   ☐ Tỉa phần thừa đầu/cuối       ✅  [⚙️][?] │
│                                               │
│  🎨 MÀU SẮC                                   │
│   ☑ Sửa màu theo template        ⚠️  [⚙️][?] │
│   ☐ Sửa màu từng phân cảnh       ⚠️  [⚙️][?] │
│                                               │
│  ⚡ TỐC ĐỘ & NHỊP                             │
│   ☐ Speed tự động                📄  [⚙️][?] │
│   ☐ Cắt theo nhịp nhạc           📄  [⚙️][?] │
│                                               │
│  📐 SẮP XẾP                                   │
│   ☐ Xếp lại theo chất lượng      ✅  [⚙️][?] │
│   ☐ Thêm chuyển cảnh             ✅  [⚙️][?] │
│  ─────────────────────────────────────────   │
│  Đã chọn 2 chức năng · ~30 clip bị ảnh hưởng │
│  Ghi: ● Trực tiếp   ○ Xuất FCPXML            │
│  [ ▶ CHẠY TẤT CẢ ]      [ Xem trước ]        │
└─────────────────────────────────────────────┘

Chú thích trạng thái:
  ✅ = ghi thẳng được ngay (verified)
  ⚠️ = beta, cần xác minh thêm
  📄 = chỉ qua FCPXML (Premiere 26 chưa cho write)
```

**Khi nhấn "⚙️"** → mở panel tham số module (ngưỡng, preset…).
**Khi nhấn "?"** → hiện hướng dẫn tiếng Việt (component HelpButton đã có).
**"Xem trước"** → chạy analyze (không ghi), hiện sẽ ảnh hưởng clip nào.

---

## 4. Danh sách tính năng — CẦN & ĐỦ (trung thực theo Premiere 26)

### ✅ TẦNG 1 — Ghi thẳng được (verified / high-confidence)

| #   | Module                      | Phân tích dùng       | Ghi dùng                       | Trạng thái       |
| --- | --------------------------- | -------------------- | ------------------------------ | ---------------- |
| 1   | **Lọc clip kém**            | scoreQuality         | setClipDisabled                | ✅ VERIFIED LIVE |
| 2   | **Cắt khoảng lặng**         | detectSilences       | trimClip                       | ✅               |
| 3   | **Tỉa phần thừa**           | — (theo % hoặc giây) | trimClip                       | ✅               |
| 4   | **Xếp lại theo chất lượng** | scoreQuality         | moveClip                       | ✅               |
| 5   | **Đổi tên clip theo cảnh**  | classifyScene        | createSetNameAction            | ✅               |
| 6   | **Thêm chuyển cảnh**        | sceneDetect          | createAddVideoTransitionAction | ✅ (API có)      |

### 📊 TẦNG 2 — Phân tích / Báo cáo (read-only, đều chạy)

| #   | Module                      | Output                                          |
| --- | --------------------------- | ----------------------------------------------- |
| 7   | **Báo cáo chất lượng**      | Bảng CSV/HTML: blur/sáng/nét/khung từng clip    |
| 8   | **Phát hiện cảnh action**   | motion_score → đoạn bắn nhau (CHO NERF)         |
| 9   | **Phân loại cảnh**          | landscape/action/closeup/dialog/static/lowlight |
| 10  | **Phân tích màu từng cảnh** | mood/warmth/dominant colors                     |
| 11  | **Dò nhịp nhạc**            | BPM + mảng beat                                 |
| 12  | **Tách ranh giới cảnh**     | danh sách shot (cho việc tách)                  |

### ⚠️ TẦNG 3 — Beta, cần xác minh (màu Lumetri)

| #   | Module                        | Vướng                                            |
| --- | ----------------------------- | ------------------------------------------------ |
| 13  | **Sửa màu theo template**     | Component.create từng treo — cần thử action path |
| 14  | **Sửa màu từng phân cảnh**    | như trên                                         |
| 15  | **Cân bằng exposure tự động** | như trên                                         |

### 📄 TẦNG 4 — Chỉ qua FCPXML (Premiere 26 chưa mở write API)

| #   | Module                         | Vì sao chỉ FCPXML             |
| --- | ------------------------------ | ----------------------------- |
| 16  | **Điều chỉnh speed (slow-mo)** | Không có createSetSpeedAction |
| 17  | **Cắt theo nhịp (split)**      | Không có split action         |
| 18  | **Auto-build từ file thô**     | Không có insert-clip action   |
| 19  | **Đánh marker**                | Không có marker API           |

---

## 5. Kế hoạch nâng cấp (giai đoạn)

| GĐ        | Việc                                                                               | Phụ thuộc            |
| --------- | ---------------------------------------------------------------------------------- | -------------------- |
| **MOD-1** | Package `@directorai/modules` + interface + registry + pipeline                    | —                    |
| **MOD-2** | Tab "Tự động" trong panel (checklist + params + Run)                               | MOD-1                |
| **MOD-3** | 6 module Tầng 1 (ghi thẳng) — Lọc kém, Cắt lặng, Tỉa, Xếp lại, Đổi tên, Transition | MOD-1, A3            |
| **MOD-4** | Verify màu Lumetri (Tầng 3) → nâng 13-15 lên ready hoặc đẩy FCPXML                 | introspect component |
| **MOD-5** | Tab "Phân tích" với báo cáo CSV/HTML (Tầng 2)                                      | sidecar              |
| **MOD-6** | Bộ xuất FCPXML (Tầng 4) — speed/beat-cut/auto-build                                | N4                   |
| **MOD-7** | Template lưu được (~/.directorai/templates) + nút preset Nerf                      | MOD-2                |

---

## 6. Bố cục file sau nâng cấp (dễ mở rộng)

```
packages/
  modules/              ← MỚI: bộ não pipeline (thêm chức năng = thêm 1 file)
  premiere-adapter/     ← ghi/đọc UXP (Action model — đã sửa Track A)
  effect-library/       ← preset màu/transition
  llm-client/           ← Gemini (chế độ Đạo diễn)
  fcpxml/               ← MỚI: sinh FCPXML cho Tầng 4

apps/
  server/               ← orchestration + ops log
    src/module-router.ts   ← MỚI: RPC module.list / module.run / module.preview
  panel/
    src/components/
      AutoTab.tsx          ← MỚI: checklist module + Run
      ModuleCard.tsx       ← MỚI: 1 dòng module + checkbox + ⚙️ + ?
      ModuleParams.tsx     ← MỚI: panel chỉnh tham số
      AnalysisTab.tsx      ← MỚI: báo cáo
      DirectorTab.tsx      ← giữ (chế độ Đạo diễn AI)
  context-engine/       ← Python phân tích (đã đủ)
```

**Nguyên tắc mở rộng**: muốn thêm "Module X mới" → tạo 1 file trong
`packages/modules/src/modules/<category>/x.ts`, đăng ký vào registry.
KHÔNG cần sửa UI (tab tự render từ registry), KHÔNG cần sửa server.

---

## 7. Tổng kết khả thi

- **Ngay được (Tầng 1+2)**: 12 module dùng thật cho video Nerf — lọc, tỉa,
  xếp, đổi tên, transition, báo cáo, phát hiện action.
- **Cần xác minh (Tầng 3)**: 3 module màu — sẽ rõ sau 1 buổi test.
- **Cần FCPXML (Tầng 4)**: 4 module speed/split/build/marker.

Module system biến plugin từ "1 nút AI" thành "bộ công cụ checklist" —
đúng như bạn hình dung, và mở rộng vô hạn về sau.
