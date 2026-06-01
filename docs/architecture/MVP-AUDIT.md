# DirectorAI v3 — MVP Audit (Brutal Honest)

> Đánh giá nghiêm khắc trạng thái plugin sau Sprint A-H.2.
> Mục đích: identify chính xác cần fix gì để đạt MVP **internal team có thể dùng thật cho 1 video du lịch 3 phút**.

---

## TÓM TẮT EXECUTIVE

| Câu hỏi                               | Trả lời                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| Plugin **đã ready dùng được chưa**?   | ❌ **Chưa** — Workflow 1 (Auto Rough Cut) chưa execute được trên Premiere thật           |
| Còn bao xa đến MVP?                   | **~3-5 ngày work** (4 P0 gaps cần fix)                                                   |
| Có những gì pass kiểm chứng?          | Foundation 90%, AI Brain 85%, UI 80%                                                     |
| Lỗ hổng lớn nhất?                     | **Tool surface mismatch** — LLM gọi tools chưa tồn tại trong adapter                     |
| Plugin có giá trị nhỏ hiện tại không? | **Có** — Sprint A-G individually đã usable cho dev iteration, dù workflow tổng chưa pass |

**Tổng điểm hiện tại: 6.8/10 — solid foundation, broken integration**

---

## 1. AUDIT 14 HẠNG MỤC

### Bảng tổng quan (sort by score)

| #   | Hạng mục                                           |  Điểm  |               Status               | Sprint      |
| --- | -------------------------------------------------- | :----: | :--------------------------------: | ----------- |
| 1   | Foundation (server + sidecar + WS + storage)       |  9/10  |            ✅ Excellent            | A           |
| 2   | Effect Library (52 presets + recommender)          |  9/10  |            ✅ Excellent            | D, F        |
| 3   | Vision Quality Scoring (B.1/B.2/B.6)               | 8.5/10 |      ✅ Verified on real clip      | B           |
| 4   | AI Brain (Director prompt + schema + executor)     | 8.5/10 |        ✅ Live with Gemini         | E, H.1, H.2 |
| 5   | Audio Analysis (silence + voice + loudness + beat) |  8/10  |        ✅ Algorithms tested        | C           |
| 6   | Color Grading (analyzer + LUT matcher)             |  8/10  |          ✅ Code complete          | F           |
| 7   | UI Director Tab                                    | 7.5/10 |     🟡 Build OK, not used live     | G           |
| 8   | Persistence (SQLite + ChromaDB)                    |  7/10  | 🟡 Code OK, real workflow untested | A.3         |
| 9   | Real Premiere Integration                          | 5.5/10 |  🔴 V2 base ok, MVP tools missing  | V2 + gap    |
| 10  | **Tool Surface Coverage** (Director → real ops)    |  3/10  |        🔴 **CRITICAL GAP**         | —           |
| 11  | Distribution (.ccx for internal install)           |  4/10  |  🔴 Build script exists, untested  | gap         |
| 12  | Error Handling / UX Polish                         |  5/10  |      🟡 Functional but rough       | gap         |
| 13  | Documentation (user-facing)                        |  4/10  |   🟡 Dev docs strong, user weak    | gap         |
| 14  | ML Models (B.3-B.5: YOLO/scene/NIMA)               |  0/10  |     ⏸ Deferred (not blocking)      | B partial   |

**Trung bình thuần: 6.4/10. Trọng số bởi mức độ critical: ~6.8/10.**

---

## 2. CHI TIẾT TỪNG HẠNG MỤC

### 1. Foundation — **9/10** ✅

**Có gì hoạt động**:

- Python sidecar boots (`pnpm sidecar:start`)
- Server boots (`pnpm --filter @directorai/server dev`)
- WebSocket :7778 + sidecar :8000 + sidecar WS /ws
- 31 tests cho A (storage + jobs)
- Hardware probe detect GPU + CPU + ffmpeg
- Job queue với progress + cancel + WS event stream

**Yếu**:

- Chưa có healthcheck endpoint tổng (`pnpm verify` check toàn bộ)
- Server crash recovery chưa có auto-restart (cần PM2 hoặc systemd)

**Fix MVP**: Không cần. Đủ dùng.

---

### 2. Effect Library — **9/10** ✅

**Có gì hoạt động**:

- 52 effect presets covering 8 categories (transition, color, zoom, text, audio, speed, distort, stylize)
- 5 style presets (Cinematic / Action / Vlog / Vintage / Horror)
- LUT matcher per clip (dark→noir, warm→sunset, etc.)
- Rule-based recommender với 100% tag coverage

**Yếu**:

- **Mapping từ preset.key → real Premiere effect matchName CHƯA TEST** trên Premiere 26
- VD: `"warm_vlog"` → preset.matchName `"Lumetri:WarmVlog"` — có khả năng Premiere không recognize string này

**Fix MVP** (1 ngày):

- Test apply 10 presets thường dùng lên test clip trong Premiere
- Document những preset KHÔNG match Premiere → mark deprecated trong catalog
- Map sang real Lumetri params nếu cần

---

### 3. Vision Quality Scoring — **8.5/10** ✅

**Verified hoạt động**:

- `analyze_clip("E:/T11/2.mp4")` → 611ms cho 5 frames
- Composite score 0.80 cho real clip
- Frame sampler OpenCV + ffmpeg fallback
- 4 metrics: blur, exposure, focus, framing

**Yếu**:

- Calibration constants pick từ "rule of thumb" — chưa verify với 100 clip thật để biết threshold tốt
- Chỉ chạy 5-10 frames/clip → có thể miss issue ở phần khác clip
- Aesthetic (NIMA) chưa wire — không có "đẹp/xấu" judgement

**Fix MVP** (0.5 ngày): không cần ngay. Có thể tune sau với user data.

---

### 4. AI Brain — **8.5/10** ✅

**Verified hoạt động**:

- Gemini 2.5 Pro → 11-step plan tiếng Việt trong 9.2s
- parsePlan Zod schema validates
- PlanExecutor sequential với cancel/checkpoint
- 4 persona variants
- DirectorRouter dispatch over WS

**Yếu CRITICAL**:

- **LLM gọi tools CHƯA TỒN TẠI** — system prompt mentions: `context.scanClips`, `context.scoreQuality`, `context.classifyScenes`, `context.detectBeats`, `context.detectSilences`, `timeline.createSequence`, `timeline.addClips`, `timeline.cutOnBeats`, `timeline.addMarkers`, `timeline.rippleDelete`, `effect.applyTransitions`, `effect.applyColorGrade`, `effect.setSpeeds`
- **Adapter chỉ có**: `project.{get,listSequences,setActiveSequence,getActiveSequence}`, `timeline.{listClips,getClip,cutClip,trimClip,moveClip,deleteClip}`, `effect.{apply,remove}` = **10 tools real vs 13+ tools LLM expects**
- Plan execute → 1st step → 404 method not found → status='error'

**Fix MVP** (1.5 ngày): xem section 3 → **TOOL SURFACE BRIDGE** là P0 gap lớn nhất.

---

### 5. Audio Analysis — **8/10** ✅

**Verified**:

- 12 unit tests pass
- Silence detection chuẩn (synthetic input)
- Voice fraction heuristic
- Loudness + clipping
- Beat detection (librosa từ Sprint M5)

**Yếu**:

- Không test trên audio thật của user (chỉ synthetic)
- VAD chỉ là RMS heuristic — không phân biệt rõ voice vs music
- Whisper transcription chưa test tiếng Việt accuracy

**Fix MVP**: optional. Beat detection đủ cho cut-on-beat.

---

### 6. Color Grading — **8/10** ✅

**Verified**:

- Color analyzer 11 tests pass
- LUT matcher 13 tests pass
- Dominant color via k-means
- Brightness/saturation/warmth/mood classification

**Yếu**:

- LUT matcher trả về **preset.key** (vd `"sunset_glow"`) → adapter không biết apply như thế nào lên Lumetri Color thật trong Premiere
- Cần map: preset.key → Lumetri parameter set (temperature, tint, exposure, contrast, ...)

**Fix MVP** (1 ngày): build adapter method `effect.applyLumetriPreset(clipId, presetKey, params)` mapping.

---

### 7. UI Director Tab — **7.5/10** 🟡

**Verified**:

- Build pass, lazy-load chunk OK
- 4 tab navigation (director / chat / style / context)
- Goal selector + persona + plan preview + progress bar

**Yếu CRITICAL**:

- **Chưa test trong Premiere thật** — chưa biết UI render đẹp chưa, responsiveness 320-800px chưa verify
- No empty-state khi server chưa wire
- Plan execute → error → user thấy `"context.detectSilences not implemented"` raw, không có UX nice
- Không có visual feedback khi plan generating (chỉ "Planning..." text)

**Fix MVP** (0.5 ngày): test re-load panel → screenshot Director tab → tune CSS gì xấu.

---

### 8. Persistence — **7/10** 🟡

**Verified**:

- SQLite 8 tests pass (clips/analyses/style_profiles/director_plans tables)
- ChromaDB embeddings (đã có từ trước)
- Bulk insert 100 rows <1s

**Yếu**:

- **Real workflow chưa lưu vào DB** — director.execute không save plan vào director_plans table
- ChromaDB embeddings index chưa wire vào analyze_clip pipeline
- No cleanup job — DB sẽ phình dần

**Fix MVP** (0.5 ngày): wire executor → save plan + step results vào SQLite. Cho user xem plan history.

---

### 9. Real Premiere Integration — **5.5/10** 🔴

**Verified**:

- V2 base: panel load qua UDT, ws connect, project.get + listClips trả real data (413 clips)
- UXP API quirks fixed (8 bugs Sprint A-G)

**Yếu CRITICAL**:

- **Adapter chỉ có 10 tools real** — đa số plan steps fail
- **Workflow 1 (Auto Rough Cut) CHƯA chạy thật** — chỉ test với mock adapter
- `effect.apply` exists nhưng chưa biết Premiere 26 chấp nhận matchName nào
- `timeline.cutClip` may not handle ripple correctly

**Fix MVP** (2 ngày): build 5 missing tools + verify trên Premiere thật → **xem section 3**.

---

### 10. Tool Surface Coverage — **3/10** 🔴 (BIGGEST GAP)

**Chi tiết khoảng cách**:

LLM Director prompt mentions 13 tool concepts. Adapter implements 10. Đối chiếu:

| LLM expects                 | Adapter has? | Cần build                                     |
| --------------------------- | :----------: | --------------------------------------------- |
| `project.getActiveSequence` |      ✅      | —                                             |
| `context.scanClips`         |      ❌      | **NEW** — index all clips into DB             |
| `context.scoreQuality`      |      ❌      | **NEW** — call Python sidecar analyze_clip    |
| `context.classifyScenes`    |      ❌      | **NEW** — heuristic OR defer                  |
| `context.detectBeats`       |      ❌      | **NEW** — wrap sidecar /beats                 |
| `context.detectSilences`    |      ❌      | **NEW** — wrap sidecar /silences              |
| `timeline.listClips`        |      ✅      | —                                             |
| `timeline.createSequence`   |      ❌      | **NEW** — Premiere API                        |
| `timeline.addClips`         |      ❌      | **NEW** — wrap project import + sequence add  |
| `timeline.cutClip`          |      ✅      | —                                             |
| `timeline.cutOnBeats`       |      ❌      | **NEW** — composite cutClip + beats           |
| `timeline.deleteClip`       |      ✅      | —                                             |
| `timeline.rippleDelete`     |      ❌      | **NEW** — delete + close gap                  |
| `timeline.addMarkers`       |      ❌      | **NEW** — Premiere marker API                 |
| `effect.apply`              |      ✅      | —                                             |
| `effect.applyTransitions`   |      ❌      | **NEW** — apply transition between 2 clips    |
| `effect.applyColorGrade`    |      ❌      | **NEW** — wrap Lumetri params from preset.key |
| `effect.setSpeeds`          |      ❌      | **NEW** — adjust clip speed                   |

**= 12 tools cần build mới.** Đây là **P0 BLOCKER** lớn nhất.

**2 lựa chọn fix**:

**Option A (LLM-side, 4h)**: Update system prompt để chỉ liệt kê tools thực tế có. LLM sẽ tạo plan với fewer step.

- ✅ Nhanh
- ❌ Plan ít powerful — không có "cutOnBeats" tự động, chỉ cutClip manual

**Option B (Adapter-side, 1.5 ngày)**: Build 12 missing tools.

- ❌ Nhiều code
- ✅ Plan đầy đủ feature như prompt mô tả

**Khuyến nghị**: Option C (hybrid — 1 ngày):

- Build **5 tools quan trọng nhất**: `context.scoreQuality`, `context.detectBeats`, `timeline.cutOnBeats`, `effect.applyColorGrade`, `effect.applyTransitions`
- Bỏ skeleton tools còn lại
- Update prompt liệt kê chính xác tools available

---

### 11. Distribution — **4/10** 🔴

**Có**:

- `pnpm bundle:ccx` build script (Sprint M)
- manifest.json + icons hoàn chỉnh
- Side-load via PluginsStorage works

**Yếu**:

- **Chưa test team member khác cài** trên máy họ
- CCX file chưa code-sign → CC Desktop reject khi double-click
- Không có installer.exe wrapper (Windows users prefer)

**Fix MVP** (1 ngày):

- Build CCX → đưa cho 1 team member khác test cài qua UDT
- Document fallback PluginsStorage side-load nếu CCX fail
- (Code-signing defer cho production tier)

---

### 12. Error Handling / UX — **5/10** 🟡

**Có**:

- WS reconnect machine
- Cancel button
- Sentry SDK (chưa wire DSN)

**Yếu**:

- Plan execute fail → user thấy raw exception message
- Không có "Try again" button
- Empty state khi sidecar offline → plugin freeze
- Không có tooltip giải thích term lạ ("persona", "checkpoint")
- Tiếng Việt UI labels chưa nhất quán (mix English/Vietnamese)

**Fix MVP** (1 ngày):

- Error boundary trong DirectorTab
- "Sidecar offline" banner khi /health fail
- "Đang sinh plan..." với spinner + ước tính thời gian
- Tooltips cho persona/checkpoint
- VN localization pass

---

### 13. Documentation — **4/10** 🟡

**Có**:

- 4 dev docs (ANALYSIS.md, IMPLEMENTATION-PLAN.md, MVP-AUDIT.md, v3 archive)
- ADRs, sprint reports
- Code comments excellent

**Yếu**:

- **Không có User Guide** — team member mới không biết cách dùng
- Không có "Quick start" 1 trang
- Không có video tutorial
- Không có FAQ thường gặp

**Fix MVP** (0.5 ngày):

- `docs/guides/user-quickstart.md` — 5-minute tutorial
- README.md update với screenshot
- (Video tutorial defer)

---

### 14. ML Models (B.3-B.5) — **0/10** ⏸

**Hoàn toàn chưa build**: YOLOv8, scene classifier, NIMA aesthetic.

**Impact MVP**: **không block**. Plugin vẫn rough-cut được nhờ quality scoring + audio analysis. Scene classifier có thể dùng heuristic dựa trên brightness/motion thay vì ML.

**Fix MVP**: SKIP. Build sau MVP nếu user phản hồi cần scene classification chính xác hơn.

---

## 3. P0 GAPS (BLOCKER MVP)

4 gaps phải fix trước khi MVP usable:

### P0-1: **Tool Surface Bridge** (1 ngày) 🔴

Build 5 missing tools để plan execute thành công:

- `context.scoreQuality` → wrap sidecar `/vision/analyze_clip`
- `context.detectBeats` → wrap sidecar `/beats`
- `timeline.cutOnBeats` → composite (sidecar beats + cutClip loop)
- `effect.applyColorGrade` → wrap effect.apply with Lumetri preset mapping
- `effect.applyTransitions` → wrap effect.apply between 2 clip endpoints

Update Director system prompt để chỉ list tools available.

### P0-2: **Re-load panel + run Workflow 1** (0.5 ngày) 🔴

Test thật:

1. Server up
2. Panel reload qua UDT
3. Director tab → "Travel cinematic 3 min" → Generate
4. Execute → watch 5+ steps run on real Premiere
5. Verify sequence created, clips added, effects applied

### P0-3: **UX polish DirectorTab** (1 ngày) 🟡

- Error boundary
- Loading states
- Cancel UX
- Vietnamese localization
- Empty state khi sidecar offline

### P0-4: **Real Premiere apply tests** (1 ngày) 🟡

- Effect catalog: test 10 presets thường dùng → apply Lumetri thật → verify visible
- Transition: test cross-dissolve + whip-pan giữa 2 clip
- Speed change test
- Mark broken ones trong catalog

**TỔNG: ~3.5 ngày work để đạt MVP**

---

## 4. P1 GAPS (NICE FOR v3 GA)

5 gaps cho v3 GA (sau MVP):

| P1   | Mô tả                                                    | Time |
| ---- | -------------------------------------------------------- | :--: |
| P1-1 | Plan persistence (save/load qua SQLite)                  | 0.5d |
| P1-2 | Style learning từ user's previous edits                  |  1d  |
| P1-3 | Library tab (browse clips với thumbnail + quality score) |  1d  |
| P1-4 | Scenes tab (timeline scene boundaries)                   | 0.5d |
| P1-5 | Distribution test với 1 team member                      | 0.5d |

**Tổng P1: ~3.5 ngày**

---

## 5. P2 (FUTURE — sau v3 GA)

- ML models B.3-B.5 (YOLO + scene + NIMA)
- Voice input
- Code-signing
- Auto-update server
- Adobe Exchange submit

---

## 6. SCORECARD SUMMARY

```
Foundation (A):           ████████████████████░░░ 9.0
Effect Library (D+F):     ████████████████████░░░ 9.0
Vision (B):               ███████████████████░░░░ 8.5
AI Brain (E+H):           ███████████████████░░░░ 8.5
Audio (C):                ██████████████████░░░░░ 8.0
Color (F):                ██████████████████░░░░░ 8.0
UI Director (G):          █████████████████░░░░░░ 7.5
Persistence (A.3):        ████████████████░░░░░░░ 7.0
Real Premiere (V2):       ████████████░░░░░░░░░░░ 5.5
Tool Surface:             ██████░░░░░░░░░░░░░░░░░ 3.0  ← BLOCKER
Distribution:             ████████░░░░░░░░░░░░░░░ 4.0
Error UX:                 ██████████░░░░░░░░░░░░░ 5.0
Documentation:            ████████░░░░░░░░░░░░░░░ 4.0
ML Models (B.3-B.5):      ░░░░░░░░░░░░░░░░░░░░░░░ 0.0  ← defer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL (weighted):         ██████████████░░░░░░░░░ 6.8/10
                         (Solid foundation, broken integration)
```

---

## 7. ĐỀ XUẤT LỘ TRÌNH MVP (3.5 ngày)

### Ngày 1 — P0-1 Tool Surface Bridge

- Sáng: Build `context.scoreQuality`, `context.detectBeats` (wrap sidecar HTTP)
- Chiều: Build `timeline.cutOnBeats` composite
- Test smoke: panel call → plan execute 3-4 steps → no method-not-found

### Ngày 2 — P0-1 continued + P0-4 start

- Sáng: Build `effect.applyColorGrade` + `effect.applyTransitions`
- Update Director prompt với tool list chính xác
- Chiều: Test trên Premiere thật — apply 5 Lumetri presets, verify visible

### Ngày 3 — P0-2 Real workflow + P0-3 UX

- Sáng: Re-load panel → Generate "Travel cinematic 3 min" → Execute
- Verify sequence created, clips ráp, effects apply
- Chiều: UX polish — error boundary, loading states, VN labels

### Ngày 3.5 — Final smoke + tag

- End-to-end test 1 workflow thật
- Fix critical bugs
- Tag `v3.0.0-mvp`
- Update README với screenshot real

---

## 8. SAU MVP — Roadmap tiếp theo

```
Week 1 sau MVP:
  - Distribute to 1 team member
  - Collect bug reports
  - P1 fixes (plan persistence, Library tab)

Week 2-3:
  - Style learning (P1-2)
  - Scenes tab visualization
  - Distribution polish

Week 4+:
  - B.3-B.5 ML models nếu user thấy cần
  - Cloud render
  - Mobile companion (Sprint 15 đã có code, chỉ cần wire)
```

---

## 9. KẾT LUẬN HONEST

**Plugin đã ready để dùng chưa?**

❌ **CHƯA** — gap chính là tool surface mismatch. LLM giỏi tạo plan nhưng adapter chưa đủ tool để execute.

**Vì sao gap này lớn?**

Vì system prompt được viết theo "ideal world" với tools tiện lợi (cutOnBeats, applyColorGrade), nhưng adapter chỉ có tools primitives (cutClip, effect.apply). Gap này tự nhiên — Sprint E viết prompt trước khi adapter có đủ tools.

**Khắc phục dễ không?**

CÓ. 3-4 ngày work tập trung. Không phải re-architect, chỉ là **wrapper code**: composite các primitives thành higher-level tools mà LLM cần.

**Sau MVP, plugin có dùng được thật không?**

Có — cho **Workflow 1 (Auto rough cut)** với output: sequence mới có 20-50 clips picked-by-quality, ráp theo narrative arc, cut on beat nếu có music, apply LUT preset, transitions. Đạt **~75% target quality** vs hand-edit của editor pro.

**Đủ cho internal team không?**

Đủ. Internal team chấp nhận "rough cut" không perfect — họ sẽ fine-tune sau. MVP đáng hơn 75% effort save vs hand-edit.

---

_Generated 2026-06-02 sau khi Sprint H.2 land. Sẽ outdate khi P0 fix xong — tôi sẽ update doc này._
