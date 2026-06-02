# DirectorAI — CHUỖI PHASE C (đóng 10 gap audit, triển khai full)

> Sau audit 3-agent + deep introspect Premiere 26 (panel reloaded). Mỗi gap
> trong báo cáo audit → 1 phase C. Grounded vào API THẬT đã introspect.

## Dữ liệu introspect THẬT (2026-06-02, panel reloaded)

**Transition** (trackItem + module):

- `TransitionFactory.createVideoTransition(matchName)` · `getVideoTransitionMatchNames()`
- `VideoTransition.TRANSITIONPOSITION_START` / `_END`
- `new AddTransitionOptions()` · `item.createAddVideoTransitionAction(trans, options)`

**Color/Lumetri** (componentChain Action model):

- `item.getComponentChain()` → chain có `createInsertComponentAction`,
  `createAppendComponentAction`, `createRemoveComponentAction`,
  `getComponentAtIndex`, `getComponentCount`
- `VideoFilterFactory.createComponent(matchName)` · `getMatchNames()` · `getDisplayNames()`
- component: `getParam(i)`, `getParamCount`, `getMatchName`, `getDisplayName`

→ Cả hai GHI ĐƯỢC qua executeTransaction (mô hình Track A đã verify).

## Phase C

| Phase  | Gap | Nội dung                                                                                                                      | Build?                    |
| ------ | --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **C1** | #2  | **move ripple-aware** — sắp lại theo đúng track, dời không chồng lấn (re-pack contiguous)                                     | ✅ pure algo              |
| **C2** | #5  | **transition implement** — createVideoTransition + AddTransitionOptions + createAddVideoTransitionAction; map kind→matchName  | ✅ code (verify live sau) |
| **C3** | #4  | **color Lumetri implement** — VideoFilterFactory.createComponent + chain.createInsertComponentAction + set param exposure/màu | ✅ code (verify live sau) |
| **C4** | #3  | **module behavior** — viết signals/judge/execute thật cho filter_bad/trim/reorder/rename (gọi sidecar), pipeline chạy thật    | ✅                        |
| **C5** | #6  | **FCPXML producer + NTSC** — videoMap→FcpTimeline; sửa rational NTSC (1001/30000); conform-rate                               | ✅                        |
| **C6** | #7  | **validate params LLM** — schema-check từng step trong planner + executor (trim bound, move index, transition kind)           | ✅                        |
| **C7** | #8  | **cluster all-black fix** — bỏ qua frame phẳng/đen khỏi gom cụm (entropy guard)                                               | ✅                        |
| **C8** | #10 | **dọn dead code** — xoá/đánh dấu pipeline scaffolding thừa; gộp logic trùng 2 tab                                             | ✅                        |
| **C9** | #1  | **LIVE verify ghi thật** — runbook + smoke ghi 1 clip (rename, reversible) trên sequence test                                 | 🔴 cần bạn                |
| —      | #9  | Gemini billing (project Google)                                                                                               | 🔴 cần bạn                |

## TRẠNG THÁI (cập nhật)

| Phase                     | Trạng thái                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| C1 move ripple-aware      | ✅ XONG — 5 test no-overlap, 107 test server pass                                                         |
| C5 FCPXML NTSC + producer | ✅ XONG — 9 test (NTSC nguyên + auto-build)                                                               |
| C6 validate params        | ✅ XONG — trim/move bậy bị loại                                                                           |
| C7 cluster flat-frame     | ✅ XONG — std guard                                                                                       |
| C8 dọn trùng lặp          | ✅ XONG — clip-paths util chung                                                                           |
| C2 transition             | 🟡 adapter path sẵn (B9); cần introspect matchNames + verify live                                         |
| C3 color Lumetri          | 🟡 đường ghi đã rõ; cần introspect param API + verify live                                                |
| C4 module behavior        | ⏸ QUYẾT ĐỊNH: trí tuệ ở sidecar (1 nguồn); khung module = điểm mở rộng SDK/plugin, KHÔNG nhân bản sidecar |
| C9 live verify            | 🔴 cần bạn mở sequence test nhỏ                                                                           |

**Còn lại để "full" thật sự**: C2/C3 cần **reload panel 1 lần nữa** (lấy
matchNames + param API tôi vừa thêm vào introspect), rồi tôi viết adapter
ghi màu/transition; C9 cần sequence test để verify ghi live.
