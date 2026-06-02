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

**Đường tới hành**: C1→C2→C3 (3 thao tác còn lại: move/transition/color) →
C4 (khung module sống) → C5 (FCPXML thật) → C6/C7/C8 (chất lượng) → C9 (live).
Mỗi phase unit-test + 1 commit; trung thực code-vs-verify.
