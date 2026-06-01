# DirectorAI v3 — Implementation Plan (Autonomous Execution)

> Phase-by-phase build với acceptance criteria + self-test cho mỗi phase.
> Quy tắc: phase chưa pass → KHÔNG sang phase sau.

---

## Quy tắc execution

Mỗi phase phải:

1. **Implement code thật** (không stub, không placeholder)
2. **Self-test ngay sau implement** (acceptance criteria liệt kê dưới)
3. **Báo cáo 4 mục**:
   - Sửa gì
   - File nào
   - Kết quả test
   - Lỗi còn lại
4. **Pass mới sang phase tiếp** — fail thì fix trong phase đó
5. **Commit + push** sau khi pass

---

## Sprint A — Python Sidecar (đang thực hiện)

### A.1 — Project structure ✅ DONE

### A.2 — WS bridge ✅ DONE (commit 9fca5ac)

### A.3 — Storage layer (SQLite + Alembic) — đang làm

**Mục tiêu**: persistent metadata storage cho 413+ clips analysis results.

**Files** (NEW):

- `apps/context-engine/src/directorai_context/storage/__init__.py`
- `apps/context-engine/src/directorai_context/storage/db.py` — engine + session
- `apps/context-engine/src/directorai_context/storage/models.py` — SQLAlchemy ORM
- `apps/context-engine/src/directorai_context/storage/repositories.py` — CRUD wrappers
- `apps/context-engine/alembic.ini`
- `apps/context-engine/alembic/env.py`
- `apps/context-engine/alembic/versions/0001_initial.py`
- `apps/context-engine/tests/test_storage.py`

**Acceptance**:

- [ ] `uv run alembic upgrade head` tạo bảng thành công
- [ ] Insert 1 clip → query back trùng data
- [ ] Bulk insert 100 clips < 1 giây
- [ ] `pnpm sidecar:test` includes storage tests, 100% pass
- [ ] FastAPI endpoint `/storage/stats` trả về row counts

### A.4 — Job queue (background workers)

**Mục tiêu**: analyze 100 clips ở background, không block HTTP.

**Files** (NEW):

- `apps/context-engine/src/directorai_context/jobs/queue.py`
- `apps/context-engine/src/directorai_context/jobs/worker.py`
- `apps/context-engine/tests/test_jobs.py`

**Acceptance**:

- [ ] Submit job → return job_id
- [ ] Query job_id → status (pending/running/done/error)
- [ ] Cancel job → state changes
- [ ] WS event stream cho progress
- [ ] Test job 5 seconds → progress 0→100% với updates

**Sprint A complete** khi A.3 + A.4 pass + tag `v3.0.0-alpha-a`.

---

## Sprint B — Vision Pipeline (Tuần 3-4)

### B.1 — Frame sampler

**Files**: `modules/vision_sampler.py`
**Acceptance**: extract 10 frames từ 1 video clip < 5 giây, kể cả HEVC

### B.2 — Quality scorer

**Files**: `modules/quality.py`
**Acceptance**:

- Score blur (Laplacian) + exposure + framing
- Test 5 clip biết trước (good/blurry/dark) → score correctly
- Composite 0-100 score returned

### B.3 — Object/face detector

**Files**: `modules/detect.py`
**Acceptance**:

- YOLOv8 nano model load + warmup < 3 giây
- Detect 5 objects trong test image
- Bounding box + confidence trả về

### B.4 — Scene classifier

**Files**: `modules/scene_classify.py`
**Acceptance**:

- Classify action/dialog/landscape/closeup
- Test 10 clip → 80%+ accuracy với labels manual

### B.5 — Aesthetic scorer (NIMA)

**Files**: `modules/aesthetic.py`
**Acceptance**: score 1-10 cho 10 frame test, correlation với human judgment

### B.6 — Pipeline orchestration

**Files**: `modules/analyze_clip.py`
**Acceptance**:

- `analyze_clip("test.mp4")` trả full ClipAnalysis < 30 giây
- Batch mode: 50 clips concurrent
- Resume từ checkpoint

**Sprint B complete** khi 413 clips của user phân tích hết < 2 giờ trên GTX 1660 SUPER + tag `v3.0.0-alpha-b`.

---

## Sprint C — Audio Pipeline (Tuần 5)

### C.1 — Silence detection (đã có code, cần wire)

### C.2 — Beat detection

**Files**: `modules/beat.py` (extend)
**Acceptance**: detect BPM trong 1 music clip ± 5 BPM error

### C.3 — VAD

**Files**: `modules/vad.py`
**Acceptance**: voice/non-voice segments, accuracy ≥ 90% trên test set

### C.4 — Whisper transcription

**Files**: `modules/transcribe.py` (existing, test)
**Acceptance**: VN clip 30s → transcript correct ≥ 85%

### C.5 — Audio quality

**Files**: `modules/audio_quality.py`
**Acceptance**: LUFS measurement match ffmpeg ebur128

**Sprint C complete** khi tất cả audio analyses pass + tag.

---

## Sprint D — Effect Catalog + Recommender (Tuần 6)

### D.1 — Effect catalog JSON

**Files**: `packages/effect-library/data/effects.json` (50+ entries)
**Acceptance**: Zod validation pass, 50+ entries với metadata complete

### D.2 — Transition catalog

**Files**: `packages/effect-library/data/transitions.json` (20+)

### D.3 — LUT catalog

**Files**: `packages/effect-library/luts/*.cube` (30+)

### D.4 — Recommendation rules

**Files**: `packages/effect-library/src/recommend.ts`
**Acceptance**: `recommend("action", "intense")` returns 3 ranked effects

### D.5 — LLM-assisted recommendation

**Files**: `packages/effect-library/src/recommend-llm.ts`
**Acceptance**: với thumbnail + scene tag → Claude returns top 3 với reasoning

### D.6 — Premiere apply test

**Acceptance**: apply mỗi loại effect lên test clip thật → render OK

**Sprint D complete** khi catalog + recommender working trên Premiere thật.

---

## Sprint E — AI Director (Tuần 7-8)

### E.1 — Director system prompt

**Files**: `packages/llm-client/src/prompts/director.ts`
**Acceptance**: prompt < 8K tokens, có few-shot examples

### E.2 — Plan schema (Zod)

**Files**: `packages/llm-client/src/plans/schema.ts`
**Acceptance**: validate generated plans, reject malformed

### E.3 — Plan executor

**Files**: `apps/server/src/plan-executor.ts`
**Acceptance**:

- Execute plan 12 steps end-to-end
- Cancel mid-execution
- Checkpoint pause + resume

### E.4 — Visual context (thumbnails)

**Files**: `tools/thumbnail-gen.ts` + integration
**Acceptance**: 20 thumbnails 1280×720 generated < 10 giây

### E.5 — Multi-tool loop

**Acceptance**: Claude calls tool → result → continues; full conversation thread works

### E.6 — Persona variants

**Files**: `packages/llm-client/src/personas/`
**Acceptance**: 4 persona switch correctly, distinct outputs

**Sprint E complete** khi WF1 (auto rough cut) execute end-to-end với data thật + tag.

---

## Sprint F — Color Grading (Tuần 9)

### F.1 — Color analyzer

**Files**: `apps/context-engine/src/.../modules/color.py`
**Acceptance**: dominant color extraction, LAB histogram

### F.2 — LUT matcher

**Files**: `packages/effect-library/src/lut-match.ts`
**Acceptance**: score top-3 LUT per clip metadata

### F.3 — Shot matching

**Files**: `packages/effect-library/src/shot-match.ts`
**Acceptance**: cluster shots cùng scene → cùng LUT

### F.4 — Lumetri API test

**Acceptance**: apply LUT via UXP adapter trên 5 test clip, visible change

### F.5 — 5 style presets

**Files**: `packages/effect-library/data/presets.json`
**Acceptance**: Cinematic/Action/Vlog/Vintage/Horror presets defined

**Sprint F complete** khi user apply preset → 413 clips color-graded.

---

## Sprint G — UI Redesign (Tuần 10)

### G.1 — Tab Director

**Files**: `apps/panel/src/tabs/Director.tsx`
**Acceptance**: goal selector + persona picker + plan preview + Generate button

### G.2 — Tab Library

**Files**: `apps/panel/src/tabs/Library.tsx`
**Acceptance**: grid clip với thumbnail + filter/sort + search bar

### G.3 — Tab Scenes

**Files**: `apps/panel/src/tabs/Scenes.tsx`
**Acceptance**: timeline visualization của AI scenes

### G.4 — Tab Chat (improved)

**Files**: `apps/panel/src/tabs/Chat.tsx` (refactor)

### G.5 — Settings + status

**Files**: `apps/panel/src/components/Settings.tsx`

### G.6 — Adobe Spectrum design

**Files**: `apps/panel/src/styles/`
**Acceptance**: dark theme match Adobe + responsive 320-800px

**Sprint G complete** khi 4 tab working trên Premiere thật + smoke test panel UI.

---

## Sprint H — Polish + Real-User Test (Buffer)

### H.1 — Self-test (bạn dựng 1 video thật)

### H.2 — Performance profiling

### H.3 — Documentation + tutorial

### H.4 — Final .ccx + distribution

**Sprint H complete** = v3.0.0 GA tag.

---

## Sau Sprint H

- Distribution cho team (.ccx bundle + install guide)
- Sentry wire (V3) — optional
- Marketing prep (V6 domain) — optional cho public launch

---

## Tracking real-time

- Mỗi sub-task xong → commit + push main
- Mỗi Sprint xong → tag `v3.0.0-alpha-{a..h}`
- Mỗi Sprint xong → update progress chart trong README.md
- Failure → rollback commit + fix + retry

---

## Self-test commands (mỗi phase phải pass)

```powershell
# Sprint A
pnpm smoke:sidecar           # WS + HTTP + hardware
pnpm sidecar:test            # Python unit tests
pnpm typecheck               # TS type check
pnpm test                    # Workspace tests

# Sprint B-C (sau khi build)
pnpm smoke:vision            # analyze 1 test clip
pnpm smoke:audio             # analyze 1 audio file

# Sprint D
pnpm smoke:effects           # apply effect lên test Premiere project

# Sprint E
pnpm smoke:director          # generate plan + execute trên test footage

# Sprint F
pnpm smoke:color             # apply LUT + match shots

# Sprint G
pnpm smoke:panel             # UI smoke test (manual + automated)

# Sprint H
pnpm verify                  # all gates green
```

---

_Created 2026-06-01 after user requested autonomous phase-by-phase execution._
