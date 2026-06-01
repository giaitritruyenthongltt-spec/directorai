# DirectorAI v3 — Master Plan (Hybrid, 10 tuần)

> Roadmap chính thức build feature realization layer.
> Quyết định cuối: **Giải pháp C (Hybrid local CV + cloud LLM)**,
> **không voice input**, **8-10 tuần build kỹ với buffer**.

---

## 0. Constraints + assumptions

| Constraint           | Giá trị                                                             |
| -------------------- | ------------------------------------------------------------------- |
| Stack                | Local Python (RTX 2060) + Cloud Anthropic Claude                    |
| Voice input          | KHÔNG build (text only)                                             |
| Target users         | Internal team (Phase 2 deploy)                                      |
| Hardware giả định    | Win 11, RTX 2060 6GB, 32GB RAM (máy bạn)                            |
| LLM key              | Anthropic — bạn cung cấp khi đến Sprint E                           |
| Timeline             | 10 tuần (2 weeks foundation + 6×1-1.5 week sprints + 1 week buffer) |
| Branch strategy      | `main` always green; feature branches → PR → merge                  |
| Test coverage target | 80%+ cho new code (Python + TS)                                     |

---

## 1. Tổng quan 8 Sprint (10 tuần)

```
Tuần 1-2  Sprint A — Python Sidecar Foundation
Tuần 3-4  Sprint B — Vision Pipeline
Tuần 5    Sprint C — Audio Pipeline
Tuần 6    Sprint D — Effect Catalog + Recommender
Tuần 7-8  Sprint E — AI Director Orchestrator
Tuần 9    Sprint F — Color Grading Engine
Tuần 10   Sprint G — UI Redesign (4 tab)
+ buffer  Sprint H — Real-user test + polish
```

---

## 2. Sprint A — Python Sidecar Foundation (Tuần 1-2)

**Mục tiêu**: Có Python service production-grade chạy local, communicate với
server qua WS, lưu/đọc data từ ChromaDB + SQLite.

### A.1 — Python project structure

- [ ] `apps/context-engine/` reorganize: `src/` + `tests/` + `pyproject.toml`
- [ ] uv hoặc poetry cho dependency management
- [ ] Type hints + mypy strict
- [ ] pytest + coverage setup

### A.2 — WS bridge protocol

- [ ] Define schema: server ↔ Python message format
- [ ] WebSocket server in Python (FastAPI + websockets)
- [ ] Reconnect machine (giống TS panel-side)
- [ ] Heartbeat ping/pong
- [ ] Graceful shutdown

### A.3 — Storage layer

- [ ] ChromaDB cho embeddings (search by similarity)
- [ ] SQLite cho metadata (clip → score, scene type)
- [ ] Migration system (alembic)
- [ ] Backup/restore CLI

### A.4 — Job queue

- [ ] Local job queue (RQ hoặc Celery-lite)
- [ ] Worker process tách riêng UI loop
- [ ] Progress events emit về server

### A.5 — Hardware probe

- [ ] Detect GPU (cuda available, VRAM size)
- [ ] Choose model variants based on hardware
- [ ] CPU fallback paths

### A.6 — Logging + telemetry

- [ ] structlog + JSON output
- [ ] Sentry SDK init (optional, có DSN thì wire)
- [ ] Performance counters (jobs/min, errors/hour)

**Deliverables**:

- ✅ `pnpm sidecar:start` boots Python service
- ✅ Smoke test: server send "ping" → sidecar reply "pong"
- ✅ Hardware report khi start
- ✅ Unit tests 80%+

**Buffer Sprint A**: 2 ngày cho fix Windows/CUDA edge cases.

---

## 3. Sprint B — Vision Pipeline (Tuần 3-4)

**Mục tiêu**: Analyze video clip → trả về quality score + scene type + objects.

### B.1 — Frame sampler

- [ ] `extract_frames(clip_path, n=10)` — sample N evenly
- [ ] Cache extracted frames trong /tmp
- [ ] Handle codec edge cases (HEVC, ProRes, etc.)

### B.2 — Quality scorer

- [ ] **Blur**: Laplacian variance
- [ ] **Exposure**: histogram analysis
- [ ] **Focus**: high-frequency energy
- [ ] **Framing**: rule-of-thirds + composition rules
- [ ] Composite score 0-100

### B.3 — Object/face detection

- [ ] YOLOv8 nano (ONNX) — load + warmup
- [ ] MediaPipe Face (alternative cho mặt người)
- [ ] Detection result schema (bbox + class + confidence)

### B.4 — Scene classifier

- [ ] Train OR use pretrained model:
  - Action / Dialog / Landscape / Closeup / Establishing
  - PlacesCNN hoặc fine-tune từ ResNet
- [ ] Confidence + top-3 predictions

### B.5 — Aesthetic scorer

- [ ] NIMA model (ONNX) — pretrained on AVA
- [ ] Score 1-10

### B.6 — Pipeline orchestration

- [ ] `analyze_clip(path) → ClipAnalysis` (composite all above)
- [ ] Batch mode: process 50 clips concurrent
- [ ] Resume từ checkpoint nếu interrupt

**Deliverables**:

- ✅ `analyze_clip("test.mp4")` trả về full ClipAnalysis trong <30s
- ✅ 413 clips của bạn → analyze hết trong <2 giờ trên RTX 2060
- ✅ Results visible trong panel (sau khi Sprint G build UI)
- ✅ Unit tests cho mỗi component

**Buffer Sprint B**: 3 ngày cho model fine-tune nếu accuracy thấp.

---

## 4. Sprint C — Audio Pipeline (Tuần 5)

**Mục tiêu**: Audio analysis cho cắt + beat sync.

### C.1 — Silence detection

- [ ] librosa.effects.split với threshold
- [ ] Output: [(start, end, is_silence)] segments
- [ ] Wire vào cut-planner

### C.2 — Beat detection

- [ ] `librosa.beat.beat_track` → BPM + beat times
- [ ] Onset detection cho action-cut alignment
- [ ] Visualize beats trên timeline panel

### C.3 — Voice Activity Detection

- [ ] pyannote.audio (hoặc Silero-VAD nhẹ hơn)
- [ ] Detect speech vs ambient vs music
- [ ] Output: voice/non-voice segments

### C.4 — Transcription (Whisper)

- [ ] faster-whisper với CUDA
- [ ] Tiếng Việt + English support
- [ ] Segment-level timestamps

### C.5 — Audio quality

- [ ] Loudness (LUFS)
- [ ] Clipping detection
- [ ] Background noise estimation

**Deliverables**:

- ✅ Mỗi clip → audio analysis bao gồm beats + voice segments + transcript
- ✅ Cut-planner có thể "cut on beat" với data thật
- ✅ Unit tests

**Buffer Sprint C**: 2 ngày cho Vietnamese transcription tuning.

---

## 5. Sprint D — Effect Catalog + Recommender (Tuần 6)

**Mục tiêu**: Database effects + brain quyết định "scene này dùng effect nào".

### D.1 — Effect catalog

- [ ] JSON catalog `packages/effect-library/data/effects.json` với 50+ entries:
  ```json
  {
    "id": "cinematic-tone",
    "premiereName": "Lumetri Color",
    "category": "color",
    "params": { "temperature": 5500, "tint": 0, "contrast": 20, ... },
    "bestFor": ["dialog", "landscape"],
    "mood": ["cinematic", "warm"],
    "complexity": "low"
  }
  ```
- [ ] Validation schema (Zod)

### D.2 — Transition catalog

- [ ] 20+ transitions: cross-dissolve, dip-to-black, whip-pan, glitch, etc.
- [ ] Metadata: bestFor (action/calm), duration recommended

### D.3 — LUT catalog

- [ ] 30+ LUT .cube files trong `packages/effect-library/luts/`
- [ ] Metadata: mood, scene type, intensity

### D.4 — Recommendation logic (v1: rule-based)

- [ ] `recommend_effects(scene, mood) → [Effect]`
- [ ] Sort by score (sceneMatch × moodMatch × complexity-preference)
- [ ] Return top 3 với explanation ("why this effect")

### D.5 — Recommendation logic (v2: LLM-assisted)

- [ ] Pass scene metadata + clip thumbnail (base64) lên Claude
- [ ] Claude pick từ catalog với reasoning
- [ ] Cache decisions để không repeat call

### D.6 — Premiere effect API test

- [ ] Test apply mỗi loại effect lên clip thật
- [ ] Document API quirks (Premiere 26 Lumetri params, etc.)

**Deliverables**:

- ✅ Catalog 50+ effects + 20+ transitions + 30+ LUTs
- ✅ `recommend_effects()` returns sensible suggestions
- ✅ Apply effect through UXP adapter verified

**Buffer Sprint D**: 2 ngày cho Premiere effect API edge cases.

---

## 6. Sprint E — AI Director Orchestrator (Tuần 7-8)

**Mục tiêu**: User nói goal → LLM thiết kế full plan → execute step-by-step.

### E.1 — Director system prompt

- [ ] Write prompt template với:
  - Role: "Chuyên gia editor 10 năm kinh nghiệm"
  - Tools: 36 MCP + new analyze_clip + recommend_effects
  - Output: JSON plan schema
  - Constraints: respect user preferences, ask before destructive ops
- [ ] Few-shot examples (3-5 example goals + plans)

### E.2 — Plan schema

- [ ] Define JSON plan structure:
  ```json
  {
    "title": "Action rough cut",
    "estimated_minutes": 15,
    "steps": [
      { "id": 1, "tool": "context.scanClips", "params": {...}, "why": "..." },
      { "id": 2, "tool": "context.scoreQuality", "params": {...} },
      ...
    ],
    "checkpoints": [3, 7, 10]  // pause after these for user confirm
  }
  ```

### E.3 — Plan executor

- [ ] `execute_plan(plan) → AsyncIterator<Progress>`
- [ ] Per-step error handling + retry (max 3)
- [ ] Cancel support (AbortSignal)
- [ ] Checkpoint pause: server save state, user click "Continue" để resume

### E.4 — Visual context provider

- [ ] Generate thumbnail (1280×720) for each clip via ffmpeg
- [ ] Base64 encode + pass to Claude (multimodal API)
- [ ] Token budget: max 20 thumbnails/request

### E.5 — Multi-tool conversation

- [ ] Loop: LLM calls tool → result → LLM continues
- [ ] Anthropic tool_use API (native)
- [ ] Fallback to single-call if conversation thread fails

### E.6 — Director persona variants

- [ ] "Editor truyền thống" (conservative, dialogue-focus)
- [ ] "Editor trẻ" (fast cuts, viral-style)
- [ ] "Editor cinematic" (slow, mood-driven)
- [ ] User pick từ dropdown

**Deliverables**:

- ✅ Director nhận intent → plan JSON 5-15 steps
- ✅ Plan execute thật trên 413 clips → tạo rough cut Premiere
- ✅ User cancel works
- ✅ Cost <$0.50/session với Claude Opus

**Buffer Sprint E**: 5 ngày — prompt engineering cần iteration.

---

## 7. Sprint F — Color Grading Engine (Tuần 9)

**Mục tiêu**: Auto color grade per scene.

### F.1 — Color analyzer

- [ ] Extract dominant color (k-means trên LAB)
- [ ] Histogram statistics (brightness, contrast, saturation)
- [ ] Mood tag (warm/cool/neutral)

### F.2 — LUT matcher

- [ ] Cho mỗi clip → score top-3 LUT phù hợp
- [ ] Based on: scene type + mood + brightness range

### F.3 — Shot matching

- [ ] Cluster clips có color profile gần → áp cùng LUT
- [ ] Preserve continuity giữa các shot trong cùng scene

### F.4 — Lumetri API integration

- [ ] Apply LUT qua Premiere Lumetri Color
- [ ] Set custom Lumetri params (curves, color wheels)
- [ ] Test trên Premiere 26 thật

### F.5 — Style presets

- [ ] "Cinematic" — orange & teal
- [ ] "Action" — high contrast, desaturated
- [ ] "Vlog" — bright, warm
- [ ] "Vintage" — sepia tones
- [ ] "Horror" — dark, green tint

**Deliverables**:

- ✅ Click "Apply Cinematic color" → all 413 clips graded
- ✅ Color consistency across scene
- ✅ User can override per-clip

**Buffer Sprint F**: 2 ngày cho Lumetri API testing.

---

## 8. Sprint G — UI Redesign (Tuần 10)

**Mục tiêu**: Replace 3 tab cũ với 4 tab mới.

### G.1 — Tab Director

- [ ] Goal selector (dropdown + free text)
- [ ] Persona picker
- [ ] Plan preview (collapsible steps)
- [ ] "Generate" + "Customize" buttons
- [ ] Progress bar khi execute

### G.2 — Tab Library

- [ ] Grid view clip với thumbnail
- [ ] Filter: quality score, scene type, duration
- [ ] Sort: best take, by time, by quality
- [ ] Semantic search bar ("find shots with people running")
- [ ] Bulk select + tag

### G.3 — Tab Scenes

- [ ] Timeline visualization của AI's scene detection
- [ ] Each scene: thumbnail + score + suggested LUT
- [ ] Manual override (drag boundaries, pick LUT)

### G.4 — Tab Chat (giữ + improve)

- [ ] Better activity log với thumbnails inline
- [ ] Tool call status (running/done/error)
- [ ] Replay actions

### G.5 — Notifications & status

- [ ] Toast cho mỗi major event
- [ ] Footer status: ⚡ UXP | proj | seq | sidecar | LLM
- [ ] Progress in tray icon

### G.6 — Settings panel

- [ ] LLM provider/model selector
- [ ] Hardware mode (CPU/GPU)
- [ ] Persona default
- [ ] Telemetry opt-in

**Deliverables**:

- ✅ 4 tab functional, smooth navigation
- ✅ Match design language Adobe (dark theme, Adobe Spectrum)
- ✅ Responsive cho dock size 320-800px

**Buffer Sprint G**: 3 ngày cho Adobe Spectrum component tuning.

---

## 9. Sprint H — Polish + Real-user Test (Week 11+ buffer)

**Mục tiêu**: Bạn dùng thật + báo bug + fix.

### H.1 — Self test

- [ ] Bạn dùng plugin 1 ngày để dựng 1 video → list bugs
- [ ] Fix high-priority bugs
- [ ] Performance profiling (>4K clips bao lâu?)

### H.2 — Optimization

- [ ] Lazy load chunk
- [ ] Reduce LLM tokens
- [ ] Cache aggressive

### H.3 — Documentation

- [ ] User guide với screenshots
- [ ] Video tutorial 5 phút
- [ ] FAQ thường gặp

### H.4 — Distribution

- [ ] Rebuild final .ccx
- [ ] Code-sign (nếu có cert)
- [ ] Internal install guide

**Deliverables**:

- ✅ Bạn dựng được 1 video hoàn chỉnh bằng plugin
- ✅ Ready cho Phase 2 internal team deploy

---

## 10. Risk register

| Risk                                   | Likelihood | Impact | Mitigation                                  |
| -------------------------------------- | :--------: | :----: | ------------------------------------------- |
| RTX 2060 VRAM không đủ cho model       |   Medium   | Medium | Use ONNX nano variants, CPU fallback        |
| Premiere UXP API breaks giữa updates   |    Low     |  High  | safeAsync wrappers (đã có), test mỗi update |
| Claude API rate limit                  |    Low     | Medium | Cache + batch requests                      |
| Vietnamese Whisper accuracy thấp       |   Medium   |  Low   | Use Whisper large model (slow but accurate) |
| Color grading visual results không hay |   Medium   |  High  | Iterate prompts + provide manual override   |
| User abandon plugin do quá phức tạp    |   Medium   |  High  | Onboarding 5 phút + simple mode default     |

---

## 11. Success metrics (cuối 10 tuần)

| Metric                                     | Target                       |
| ------------------------------------------ | ---------------------------- |
| Bạn dựng 1 video 1-2 phút từ scratch trong | <15 phút (vs 1-2 giờ manual) |
| Quality score accuracy                     | >80% agree với expert        |
| LLM cost per video                         | <$0.50                       |
| Plugin cold-start                          | <3 giây                      |
| 413 clips analyze                          | <2 giờ                       |
| Bugs reported sau test                     | <10 critical                 |

---

## 12. Decision gates giữa sprints

Sau **mỗi sprint**, review:

1. Hoàn thành 100% acceptance criteria?
2. Có bugs blocker?
3. Có cần điều chỉnh scope sprint kế?

Nếu sprint trượt 2 tuần → review entire plan, có thể cut feature.

---

## 13. Tracking trên GitHub

Sau khi sprint A start, tôi sẽ:

- Tạo GitHub project board với 8 sprints
- Mỗi sub-task = 1 issue
- PR cho mỗi feature merge vào main
- Tag release mỗi sprint kết thúc (v3.0.0-alpha, v3.0.0-beta, ...)

---

## 14. Bắt đầu Sprint A — checklist

Trước khi tôi bắt đầu code Sprint A.1, bạn confirm:

- [ ] Plan này OK (đọc xong + đồng ý)
- [ ] Branch strategy: tạo branch `v3/sprint-a` hay làm direct trên main?
- [ ] Cần Anthropic API key Sprint E (~tuần 7) — chuẩn bị trước

Sau đó tôi bắt đầu **autonomous** Sprint A. Kết thúc tuần 1 sẽ có demo Python sidecar boot.

---

_Updated: 2026-06-01 sau khi user chọn Solution C + no voice + 8-10 tuần._
_Tài liệu này thay thế cho mọi prior roadmap doc trong sprint context._
