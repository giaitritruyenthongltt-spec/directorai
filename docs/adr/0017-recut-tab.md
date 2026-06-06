# ADR-0017: "Tách & Tái dựng" (Re-cut) — kế hoạch xây dựng

- **Status**: Proposed (v3 — sau 2 vòng phản biện độc lập, đã hội tụ chuẩn build-MVP)
- **Date**: 2026-06-06
- **Liên quan**: ADR-0016 (UXP PPro26), `jobtest-runbook.md`, `premiere-26-known-issues.md`

## Context

Kho **~3000 tập Nerf ĐÃ DỰNG XONG** (~10'/tập). Đưa video cũ → tách cảnh → **tái dựng
video MỚI** để **giảm trùng lặp YouTube** (re-exploit kho). Bot cũ
`D:\CODE AI\AUTOCUT-VIDEO\Cut_only ver2` (headless FFmpeg, đủ stage: scene_detect/select/
speed-atempo/color-noise/Demucs BGM/reframe/render NVENC) — TỒN TẠI, cày 3000 được nhờ headless.

## 3 sự thật cốt lõi (từ phản biện — định hình kế hoạch)

1. **Content-ID là AUDIO-FIRST.** Không biến đổi audio (bỏ/thay BGM, tempo/pitch) thì
   đảo cảnh/đổi màu/lật hình KHÔNG thoát claim.
2. **Premiere DỞ ở "set giá trị param effect".** `effect.apply` **chỉ append component
   với giá trị MẶC ĐỊNH**; đặt value (flip scaleX=−100, crop Scale, grain) phải qua
   `effect.apply`→`keyframe.add` — nhánh PPro26 hay treo (`premiere-26-known-issues.md`).
   matchName trong EFFECT_PRESETS là **tên thân thiện GIẢ**; tên thật ở `ADOBE_MATCH_REGISTRY`
   (`AE.ADBE Transform`), **không có entry grain/flip**. PPro26 **không có API speed**.
   → Các đòn flip/crop/grain/speed **KHÔNG nên làm trong Premiere** cho MVP.
3. **Batch 3000 phải headless (FFmpeg), KHÔNG qua Premiere** (không headless, leak memory).
   FFmpeg làm flip/crop/speed/color/grain/audio **tầm thường + bot cũ đã verify**.

→ **Phân vai dứt khoát:** Premiere = cắt cảnh + sắp xếp + tỉa + chỉnh màu (op ĐÃ verify
live), editable cho tập HOT. FFmpeg/sidecar = mọi đòn chống-trùng nặng + audio + quy mô.

## Decision — Kiến trúc 2 LANE

```
            ┌──────────── TAB "Tách & Tái dựng" (UXP) ───────────┐
            │ [Chọn video]  ◉ Lane A: Tinh chỉnh 1 tập (Premiere) │
            │               ◉ Lane B: Cày hàng loạt (headless)    │
            └──────┬──────────────────────────────┬──────────────┘
       recut.* (composite onComposite)            │ recut.batch.* → sidecar
   ┌──────────────▼────────────────┐   ┌──────────▼─────────────────────────┐
   │ LANE A — Premiere (CHỈ op live)│   │ LANE B — sidecar headless (bot cũ)  │
   │ • SED cắt cảnh        ✅verify  │   │ • PySceneDetect + select keep_ratio │
   │ • reorder (move)      ✅        │   │ • flip/crop/speed/atempo  (FFmpeg)  │
   │ • trim                ✅        │   │ • color curves + grain    (FFmpeg)  │
   │ • regrade màu (Lumetri)✅       │   │ • Demucs strip/replace BGM ★ audio  │
   │   (flip/crop/grain ⇒ Lane B)   │   │ • render NVENC                       │
   └────────────────────────────────┘   └─────────────────────────────────────┘
        USP: tỉa sâu tập HOT, editable        Đòn chống-trùng THẬT, quy mô 3000
```

## Phạm vi MVP (hội tụ — CHỈ thứ build chắc hôm nay)

### MVP-A — Lane A (Premiere), chỉ op ĐÃ verify live

- **R1 — Tab `recut`** + nút **Phân mảnh cảnh** (`recut.detectScenes`, SED native ✅).
- **R2 — Nút Tái dựng** (`recut.applyDedup`) chỉ 3 đòn ĐÃ-LIVE:
  - ① **Đảo thứ tự cảnh** (move/`to_index`) · ② **Tỉa đầu/đuôi** (trim/`in_sec,out_sec`)
    · ③ **Regrade màu** (`color.setParams` 9-slider Lumetri, đã-live 17/17).
  - Bọc trong `undo.begin/undo.end` → 1 Ctrl-Z gỡ sạch.
- ❌ **KHÔNG** flip/crop/grain/speed trong Lane A (Premiere set-param vướng) → Lane B.

### MVP-B — Lane B (sidecar headless), đòn chống-trùng THẬT

- **R3 — Nút "Xử lý chống-trùng (headless)"** → `recut.batch.process` → sidecar
  `recut_pipeline` (đóng gói bot cũ) làm: flip + crop-zoom + speed 0.92–1.18 + atempo +
  color + grain + **Demucs strip/replace BGM** → render NVENC → file mới.
- Audio (Demucs) = đòn ★★★★★ → **nằm trong MVP**, không để pha sau.

> **Lý do gộp:** MVP-A một mình KHÔNG chống-trùng (giữ audio gốc). MVP-B (headless FFmpeg+
> Demucs) mới ra "video khác gốc thật". Cả hai = MVP. Lane A là USP editable; Lane B là
> cỗ máy chống-trùng 3000 tập.

### Sau MVP

- R4 — Reframe YOLO-aware · phụ đề Whisper · import stem ngược vào Lane A (spike S4).
- R5 — Hàng đợi batch 3000 (UI queue + ops.log, `/jobs` đã có) + đa-dạng-hoá **metadata/
  title/intro** (chống "reused content" ngoài pixel/audio — G4).
- R6 — Real-ESRGAN upscale (offline).

## SPIKES (chạy TRƯỚC; quyết định phạm vi chắc)

| ID           | Xác minh                                                         | Nếu PASS                 | Nếu FAIL                     |
| ------------ | ---------------------------------------------------------------- | ------------------------ | ---------------------------- |
| **S1**       | `color.setParams` ghi + đọc-lại value persist trên clip cảnh     | ③ regrade chắc           | ③ rớt, màu → Lane B          |
| **S2**       | SED ra đủ cảnh trên **footage Nerf THẬT** (không phải clip test) | R1 dùng SED              | fallback `/scenes` threshold |
| **S3**       | Demucs htdemucs chạy trên RTX 2060 6GB + đo thời gian/tập        | R3 khả thi               | giảm chất lượng model / CPU  |
| **S4** (R4)  | Chèn audio stem vào track theo thời gian (import ngược Lane A)   | audio trong Lane A       | audio chỉ ở Lane B           |
| **S5** (sau) | `effect.apply`+`keyframe.add` set scaleX/Scale (flip/crop) live  | đem flip/crop vào Lane A | giữ ở Lane B (mặc định)      |

> Hôm nay ĐÃ chắc: SED cắt cảnh (verify 21 cảnh), move/trim/rename (17/17), color append
> Lumetri. CHƯA chắc: color value persist (S1), SED trên gameplay (S2), set-param effect (S5).

### KẾT QUẢ SPIKE (chạy live 2026-06-06 — CHỐT phạm vi)

| Spike                     | Kết quả                                                                                                                                                                                 | Quyết định                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **S1** màu persist        | ❌ `getStartValue` Lumetri Exposure trả **null** trước/sau set → KHÔNG verify được value (cùng lớp lỗi audio-gain)                                                                      | Regrade Lane A = **best-effort không kiểm được** → màu THẬT làm ở **Lane B (FFmpeg curves)**     |
| **S2** SED episode thật   | ⏳ **CHỜ** 1 đường dẫn episode đã-dựng của bạn (kho 3000 không ở E:\T11)                                                                                                                | SED đã bắt cắt cứng (21 cảnh). Episode đã-dựng vốn CÓ cắt → kỳ vọng chạy; cần xác nhận file thật |
| **S3** Demucs             | 🟡 `uv` 0.11.15 ✓ nhưng **torch là bản `+cpu` (cuda False)** + venv không pip → cần `uv pip install demucs` **+ cài lại torch-CUDA cu121 (~2.5GB)** cho GTX1660S. CPU quá chậm cho 3000 | Lane B audio: provision torch-CUDA trước; FFmpeg đã có (8.0.1)                                   |
| **S4** chèn audio Lane A  | ❌ audioTrack chỉ `addEventListener/getTrackItems` — **KHÔNG có insert/overwrite clip**                                                                                                 | Audio dedup → **Lane B (FFmpeg)**, KHÔNG import-back vào Lane A                                  |
| **S5** flip/crop Premiere | ❌ `'AE.ADBE Transform'` **không phải matchName hợp lệ**; Motion intrinsic + lỗi read-back (S1)                                                                                         | flip/crop → **Lane B (FFmpeg hflip/crop)**                                                       |

**CHỐT phạm vi sau spike (đã de-risk):**

- **Lane A (Premiere) MVP = CHỈ 3 op ĐÃ chứng minh:** ① cắt cảnh (SED) · ② đảo (move) ·
  ③ tỉa (trim). Regrade màu = best-effort (component add OK, value không kiểm được).
- **Lane B (FFmpeg + Demucs) = TOÀN BỘ dedup thật:** flip/crop/speed/color/grain (FFmpeg
  8.0.1 SẴN) + tách/thay BGM (Demucs — provision torch-CUDA). Đây là cỗ máy chống-trùng.
- 5 spike đã loại sạch giả định sai → kế hoạch giờ build được trên nền chắc.

## Đặc tả RPC (đã sửa theo code thật — vòng 2)

### `recut.detectScenes` — PANEL handler (productionize `sedProbe`, BỎ bước tự-dọn)

- `{ videoPath }` → importFiles → createSequenceFromMedia → SED `'ApplyCuts'` →
  **gọi `timeline.listClips` lấy clipId thật** (`video-<track>:<tick>:<name>`).
- Returns `{ sequenceId, sceneCount, scenes:[{index,clipId,startSec,durationSec}] }`.
- Wire: `ws-client.ts` thêm route `recut.detectScenes → recutDetectScenes` (như `_debug.*`).

### `recut.applyDedup` — composite qua **`onComposite`** (KHÔNG router mới)

- Lý do: composite cần gọi `safe.applyPlan` IN-PROCESS (không gọi WS từ trong server) →
  đặt trong `CompositeTools` để dùng chung `applyPlan` + adapter (callPanel chokepoint→ops.log).
- `{ sequenceId, keep:number[], options:{ reorder?, trimHeadSec?, trimTailSec?, regrade?:'warm'|'cool'|'filmic' } }`
- Thực thi dưới 1 `undo.begin/undo.end`:
  1. reorder+trim → build `EditPlan` THỦ CÔNG (steps `{action:'move',params:{to_index}}`,
     `{action:'trim',params:{in_sec,out_sec}}`) → `applyPlan({sequenceId, editPlan, dryRun:false, approved:true})` (CÓ editPlan ⇒ KHÔNG gọi LLM).
  2. regrade → **map preset→9 slider** (`'warm'`→`{temperature:+15, tint:+3, saturation:+8,…}`)
     rồi loop từng clip `color.setParams(clipId, sliders)`.
- Returns `{ applied, steps:[{clipId,ops,ok}] }`. (Undo = Ctrl-Z, KHÔNG dựa checkpoint-restore.)

### `recut.batch.process` (R3) — composite → sidecar `POST /recut/render`

- `{ videoPath, recipe:{ flip?, cropPct?, speedMin?, speedMax?, atempo?, color?, grain?,
bgm:{ mode:'keep'|'strip'|'replace', source?:'lib'|'aigen', libDir? } } }`
- Sidecar `recut_pipeline` (đóng gói bot cũ) → `{ ok, out_path, report:{ scenes, droppedPct, audioChanged } }`.
- **Nguồn nhạc thay BGM (G3):** thư mục nhạc **royalty-free** do user cấu hình (`libDir`)
  hoặc AI-gen (sau); KHÔNG thay bằng nhạc bản-quyền khác.

## File phải sửa (chốt — không mò)

- `apps/panel/src/components/RecutTab.tsx` (MỚI) + `App.tsx` (4 điểm: ActiveTab, TAB_META,
  TAB_GROUPS.build, render).
- `apps/panel/src/bridge/uxp-api.ts` (`recutDetectScenes`) + `ws-client.ts` (route).
- `apps/server/src/composite-tools.ts` (thêm `recut.detectScenes` forward-panel +
  `recut.applyDedup` + `recut.batch.process` vào `maybeHandle`) — đi qua `onComposite` sẵn có.
- `apps/context-engine/.../modules/recut_pipeline.py` (MỚI, R3) + endpoint `/recut/render`.

## Chiến lược chống-trùng (đòn / lane / sức)

| Đòn                              | Lane     | Sức   | Ghi chú                                       |
| -------------------------------- | -------- | ----- | --------------------------------------------- |
| Bỏ/thay BGM (Demucs)             | B        | ★★★★★ | Audio-first, mạnh nhất                        |
| Tempo/pitch voice                | B        | ★★★★  | atempo + rubberband                           |
| Lật ngang                        | B        | ★★★★  | FFmpeg `hflip` (Premiere vướng)               |
| Crop-zoom/reframe                | B        | ★★★   | FFmpeg crop/scale                             |
| Đảo cảnh + trim (bỏ ~10%)        | A/B      | ★★★   | `keep_ratio`                                  |
| Speed 0.92–1.18                  | B        | ★★    | FFmpeg setpts                                 |
| Regrade + grain                  | A(màu)/B | ★★    | A: Lumetri; B: curves+noise                   |
| **Đa-dạng metadata/title/intro** | B (R5)   | ★★    | Chống "reused content" ngoài pixel/audio (G4) |

## Tiêu chí nghiệm thu (ĐO ĐƯỢC + ngưỡng cụ thể)

1. Tab hiện + Phân mảnh → sequence **N≥2 cảnh** (đối chiếu `timeline.listClips`).
2. Tái dựng (reorder+trim+regrade) → ghi THẬT + **Ctrl-Z gỡ sạch** (fingerprint khớp) +
   ops.log `adapter=real` đủ bước.
3. **Lane B output khác gốc đủ ngưỡng:** `chromaprint distance ≥ 0.30` (audio) **và**
   `pHash hamming ≥ 12/64` trên 5 khung mẫu (script `tools/dedup-distance.mjs`).
4. **Hiệu chuẩn thật 1 lần (G2):** upload 1 clip Lane B lên YouTube **unlisted** → KHÔNG
   bị Content-ID claim → chốt ngưỡng ở (3). (Thủ công, ghi lại kết quả.)
5. `npm run build` + typecheck + test PASS; `tools/recut-smoke.mjs` live.

## Throughput 3000 tập (G7 — ước lượng)

- Demucs htdemucs (6GB) ~ 0.5–1×realtime → 10' video ≈ 5–10' GPU. + render NVENC ~1-2'.
- ⇒ ~7–12'/tập × 3000 ≈ **15–25 ngày máy chạy liên tục** (1 GPU). → Lane B phải có hàng
  đợi bền + resume (ops.log/checkpoint); cân nhắc giảm stem/model nhanh để rút còn ~1 tuần.

## Rủi ro

- **Spikes S1/S2/S5 chưa chạy** → đòn nào fail rớt khỏi Lane A (mặc định đã đẩy đòn nặng sang B).
- **Đo trùng ≠ Content-ID thật** → bắt buộc hiệu chuẩn (4) trước khi tin ngưỡng.
- **Nhạc thay BGM bản quyền** → chỉ dùng royalty-free/AI-gen (G3).
- **Metadata clone 3000 tập** → R5 đa-dạng-hoá (G4), nếu không vẫn bị "reused content".
- **Demucs/torch nặng** → service tách, cache model.

## Test plan

- Unit: `recut-tools` build EditPlan (đúng `to_index/in_sec/out_sec`) + map preset→slider — không cần Premiere.
- Live: `tools/recut-smoke.mjs` (detectScenes→≥2 cảnh→applyDedup reorder→Ctrl-Z→khớp).
- Dedup: `tools/dedup-distance.mjs` (pHash + chromaprint, assert ngưỡng).
- Audit: ops.log `mutate adapter=real`.

## Alternatives đã loại

- FCPXML bridge (CHẾT). Razor UXP (không có). Cày 3000 qua Premiere (không headless).
- Flip/crop/grain/speed trong Premiere (set-param effect vướng PPro26) → làm ở FFmpeg.
- Bỏ Premiere hết headless → mất USP "tỉa tót editable tập hot" → giữ Lane A.
  </content>
