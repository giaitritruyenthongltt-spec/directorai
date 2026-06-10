# DirectorAI — LỘ TRÌNH 7.0 → 10/10 (toàn diện, loop-hardened, không band-aid)

> Xuất phát: audit có-căn-cứ-research **7.0/10** (xem `PLUGIN-AUDIT.md`). Mục tiêu: 10/10 thật —
> mọi trục verify trên **Premiere/data THẬT**, lặp được trong CI, không nợ kỹ thuật mới.

## 0. NGUYÊN TẮC BẤT BIẾN (áp cho mọi phase)

1. **Spike trước khi build.** Mỗi giả định chưa-verify = 1 rủi ro mở. PHẢI spike trên Premiere/data
   thật → đo vs tiêu chí → quyết (đóng/đổi-cách/scope-out) → propagate → re-audit. KHÔNG code lượng lớn
   trước khi đóng ẩn-số.
2. **Tắc thì NGHIÊN CỨU SÂU, không band-aid.** Khi 1 API/khâu không chạy: đọc Adobe UXP docs + introspect
   API thật (`_debug.introspect`) + samples chính chủ + cộng đồng. CẤM: timeout-race, try/catch nuốt lỗi,
   "đổi hướng cho xong", hard-code né. Mỗi quyết định đổi-cách phải có lý do verify được + ghi ADR.
3. **Mỗi tính năng ghi-thật phải:** (a) verify LIVE read-back, (b) self-revert sạch, (c) checkpoint trước
   ghi, (d) test LẶP ĐƯỢC (CI hoặc 1-lệnh). Không "verify thủ công 1 lần rồi quên".
4. **Không phá tương thích ngược.** Tính năng mới = thêm, không sửa hành vi cũ đang xanh. Có rollback.
5. **Trung thực realtime.** Điểm/claim trong doc CHỈ tăng sau khi cổng verify xanh. Không tự cộng lạc quan.

## 1. Bảng GAP (hiện tại → 10) + chiến lược

| Trục              | Nay | 10 nghĩa là                                                  | Khoá chính                                              |
| ----------------- | --- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Lõi ghi Premiere  | 5.5 | Dựng được CẢ sequence TRONG Premiere + mọi op verify live/CI | **wire `SequenceEditor.createInsertProjectItemAction`** |
| Trí tuệ AI/CV     | 8.0 | Tín hiệu chính xác hơn + đo độ chính xác trên ground-truth   | optical-flow + frame-interp + NIMA + eval               |
| Đường ra headless | 7.5 | Mọi đường ra verify IMPORT/PHÁT thật (không chỉ well-formed) | verify FCPXML import LIVE hoặc pivot OTIO/AAF           |
| UX                | 8.0 | 1 luồng dẫn dắt folder→phim, test usability                  | gộp thật 3 cửa + onboarding                             |
| Tin cậy/test      | 7.0 | Ghi-thật verify TỰ ĐỘNG (CI/scheduled) + coverage ngưỡng     | live-write job + panel component tests                  |
| Kỷ luật phạm vi   | 7.0 | Mọi package trong workspace ĐỀU được plugin dùng             | xử lý orphan + 3 web-app + pkg rìa                      |
| Trung thực        | 6.5 | 0 claim sai; log milestone khớp thực tế                      | reconcile MEMORY + task log                             |

## 2. CỔNG NGHIÊN CỨU (RG) — spike LIVE TRƯỚC, quyết hướng cả lộ trình

> Đây là các ẩn-số làm-hay-bỏ. Làm TRƯỚC mọi build. Mỗi RG = 1 spike nhỏ trên Premiere thật.

| RG      | Ẩn số sống-còn                                                                         | Spike (Premiere/data thật)                                                                            | Quyết theo kết quả                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RG1** | `SequenceEditor.createInsertProjectItemAction` có CHÈN clip live được? giữ trim/speed? | import 1 clip→ProjectItem; insert vào sequence tại t; read-back vị trí/độ-dài; thử kèm in/out + speed | ✅ **ĐÓNG (probe live + Adobe docs 2026-06-10)**: API có thật (arity 5/4 khớp probe). Chữ ký: `createInsertProjectItemAction(projectItem, time, vTrackIdx, aTrackIdx, limitShift)` — chèn CẢ clip, **KHÔNG có param in/out/speed**. → Thiết kế Phase 1: import→insert→`setClipInOut` (trim sau, đã verify); clip cần speed dùng **file Lane-B pre-render chèn ở 1.0×** (hybrid). Còn: 1 test insert+read-back+remove live (đầu Phase 1) |
| **RG2** | Premiere IMPORT được FCPXML ta xuất? giữ speed?                                        | File▸Import .fcpxml ta tạo → kiểm timeline: số clip, thứ tự, **speed có qua không**                   | PASS→giữ ASM-4; speed-mất→research **OTIO/AAF** (Premiere hỗ trợ); FAIL cả→bỏ FCPXML, đường editable = Phase 1                                                                                                                                                                                                                                                                                                                          |
| **RG3** | Reload-panel + live-write có chạy tự-động lặp được?                                    | dùng `tools/reload-panel.ps1` + `test:job-write` trong 1 script; đo ổn định 3 lần                     | PASS→Phase 6 đưa vào CI-scheduled; FAIL→nghiên cứu UXP CLI (`@adobe/uxp-devtools-cli` + port 12345)                                                                                                                                                                                                                                                                                                                                     |

## 3. PHASES (mỗi phase = vòng có CỔNG, theo thứ tự đòn-bẩy + phụ-thuộc)

### Phase 1 — DỰNG PHIM TRONG PREMIERE (Lõi ghi 5.5 → 9) ⟸ phụ thuộc RG1

Đóng đúng lỗ hổng lõi research bóc ra. **Không né bằng file nữa — làm phần khó.**

- 1a. Adapter: wire `insertClip(projectItem, trackIndex, timeTick)` qua `SequenceEditor.createInsertProjectItemAction`
  trong `executeTransaction` (đã có pattern). Thêm `importAsProjectItem(path)` nếu cần.
- 1b. Server tool `timeline.assembleSequence`: clip_paths → (order/CV) → import → insert nối tiếp lên track
  → (nếu RG1 cho phép) set in/out + speed native; nếu không, insert nguyên + ghi chú.
- 1c. Self-revert qua `createRemoveItemsAction`; checkpoint trước; verify read-back số-clip/thứ-tự/độ-dài.
- 1d. UI: nút "Dựng THẲNG vào timeline" (cạnh "xuất file"). Live verify trên sequence Nerf thật.
- **CỔNG:** dựng 5 clip vào 1 sequence rỗng, đúng thứ tự/độ-dài, self-revert sạch, integrity 100%.
- _Nếu tắc:_ introspect đủ tham số `createInsertProjectItemAction` (arity, kiểu), đọc samples Adobe `uxp-premiere-pro-samples` — KHÔNG quay lại file-export để né.

### Phase 2 — transition/reorder → VERIFIED (Lõi ghi 9 → 9.5)

- 2a. transition: đã 15/15 live → promote registry beta→verified + test backing.
- 2b. reorder thật: move ngang đã OK; move khi có gap → dùng insert+remove (Phase 1) thay vì để "dry-run".
- **CỔNG:** reorder 1 sequence thật (đảo 2 clip) verify + self-revert; registry không còn "beta" sai.

### Phase 3 — ĐƯỜNG RA bulletproof (Headless 7.5 → 10) ⟸ phụ thuộc RG2

- 3a. Theo RG2: FCPXML import-OK→thêm verify-import vào test; speed-mất→**OTIO exporter** (research +
  spike import) hoặc dùng Phase 1 làm đường editable; cả hai fail→bỏ FCPXML khỏi UI, ghi rõ.
- 3b. MP4 concat hardening: mixed res/fps/codec/SAR, clip lỗi giữa chừng, phim >30 phút, audio thiếu →
  test integration tự-sinh (mở rộng `test_assemble_integration`).
- **CỔNG:** mỗi đường ra còn-lại verify IMPORT/PHÁT thật (không chỉ well-formed) + edge-case test xanh.

### Phase 4 — AI/CV chính xác hơn (8.0 → 10)

- 4a. Optical-flow Farneback → vận tốc chính xác hơn cho speed (thay/bổ-sung mean-diff).
- 4b. Frame-interpolation (RIFE/minterpolate) → slow-mo mượt clip <50fps.
- 4c. NIMA/aesthetic scoring → điểm chất lượng tốt hơn heuristic blur.
- 4d. **EVAL:** bộ ground-truth nhỏ (cảnh động/tĩnh gán nhãn tay) → đo precision/recall của motion/scene.
- **CỔNG:** mỗi nâng cấp có số đo cải thiện vs baseline trên data thật (không "cảm tính tốt hơn").

### Phase 5 — UX 1 luồng dẫn dắt (8.0 → 10)

- 5a. Gộp THẬT: Đạo diễn/Phim dài thành "chế độ" TRONG Tự động (không phải tab riêng) → 1 cửa.
- 5b. Onboarding cho luồng: folder → mục tiêu → preview → dựng(timeline)/xuất(file).
- 5c. Reload-verify trực quan (đã giải) làm bước verify chuẩn mỗi đổi UI.
- **CỔNG:** người mới đi folder→phim trong 1 đường rõ; screenshot xác nhận; 0 tab trùng-chức-năng.

### Phase 6 — Test/CI tới 10 (7.0 → 10) ⟸ phụ thuộc RG3

- 6a. Live-write job: `tools/reload-panel.ps1` + `test:job-write` thành 1 lệnh + tự đọc kết quả (PASS/FAIL).
  Đưa vào CI self-hosted (có Premiere) hoặc scheduled-local; nếu không có runner → research UXP CLI headless.
- 6b. Panel component tests: thêm jsdom + @testing-library/react; test AutoTab render + handler chính.
- 6c. Coverage ngưỡng (vitest + pytest --cov) + báo cáo trong CI.
- **CỔNG:** đường ghi-thật verify TỰ ĐỘNG; coverage panel ≥ ngưỡng; CI 1 nút xanh toàn bộ.

### Phase 7 — Kỷ luật phạm vi + Trung thực tới 10 (7.0/6.5 → 10)

- 7a. Quyết từng package rìa: wire vào plugin (davinci/style-engine/cut-planner) HOẶC chuyển `future/`.
  3 web-app (docs-site/landing/marketing): tách repo hoặc `future/` nếu chưa bán.
- 7b. Reconcile log: MEMORY + task list — đánh dấu rõ milestone "aspirational/scaffold" vs "shipped".
- 7c. Quét toàn doc: mọi claim phải verify được; sửa/xoá claim sai.
- **CỔNG:** mọi package active đều được plugin import; 0 claim sai; log khớp thực tế.

## 4. THỨ TỰ THỰC THI (phụ thuộc + đòn bẩy)

```
RG1,RG2,RG3 (research song song)  →  Phase 1 (lõi, +1.5đ)  →  Phase 2
                                  →  Phase 3 (theo RG2)
Phase 4 (AI/CV, độc lập) ║ Phase 5 (UX, độc lập) ║ Phase 6 (test, theo RG3)  →  Phase 7 (chốt)
```

Ưu tiên: **RG → Phase 1** (đòn bẩy lớn nhất, đóng lỗ hổng lõi). Phase 4/5/6 chạy song song được.

## 5. ĐỊNH NGHĨA 10/10 (Gate cuối — tất cả phải xanh)

- T1 Dựng phim TRONG Premiere (insert) verify live + self-revert + CI.
- T2 Mọi op ghi (trim/move/disable/rename/transition/color/marker/audio/insert) verified, 0 beta sai.
- T3 Mỗi đường ra (timeline + ≥1 file) verify IMPORT/PHÁT thật.
- T4 AI/CV có số đo precision cải thiện vs baseline trên ground-truth.
- T5 1 cửa vào dẫn dắt; 0 tab/chức-năng trùng.
- T6 Ghi-thật verify TỰ ĐỘNG trong CI; coverage ngưỡng.
- T7 Mọi package active được dùng; 0 claim sai; doc/log khớp thực tế.
- T8 0 nợ kỹ thuật mới: không try/catch nuốt lỗi, không timeout-race, không hard-code né.

## 6. Lượng hoá điểm kỳ vọng sau từng phase

6.2(gốc) → 7.0(nay) → **8.5**(Phase 1+2: lõi ghi 5.5→9.5) → **9.0**(Phase 3: output 10) →
**9.4**(Phase 4) → **9.7**(Phase 5+6) → **10**(Phase 7 chốt sạch).
