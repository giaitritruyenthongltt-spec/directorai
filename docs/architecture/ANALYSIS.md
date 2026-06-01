# DirectorAI — Phân tích chiến lược (Master Doc)

> Tài liệu hợp nhất trả lời 7 câu hỏi của bạn về plugin.
> Mọi quyết định build từ đây dựa trên doc này.

---

## TÓM TẮT EXECUTIVE (đọc 60 giây)

**Hiện tại**: Plugin có infrastructure ~75% nhưng "AI brain" chỉ đáp ứng **~26%** mục tiêu bạn.
Có thể đọc clip, render UI, connect Premiere — nhưng KHÔNG có khả năng tự dựng video, phân tích chất lượng, hiểu intent NL, hay color grade.

**Cần**: 10 tuần build thêm 5 capabilities core (Computer Vision, Audio Analyzer, Effect Recommender, AI Director, Color Grading).

**Kết quả sau 10 tuần**: ~84% mục tiêu — tự dựng vlog/action/wedding từ raw footage trong ~50 phút user effort (vs 6+ giờ manual).

**Khuyến nghị**: Giải pháp C (Hybrid local CV + cloud LLM), không voice input, 8-10 tuần.

---

## 1. MỤC TIÊU 4 ĐIỂM CỦA BẠN

|  #  | Mục tiêu                                       | Bạn diễn đạt                                                            |
| :-: | ---------------------------------------------- | ----------------------------------------------------------------------- |
|  1  | **Dựng video từ raw + auto effects**           | "Hỗ trợ dựng video từ tệp thô, tự động thêm hiệu ứng/kỹ xảo phù hợp"    |
|  2  | **Phân tích chất lượng + auto cut + assembly** | "Phân tích chất lượng các mảnh video, tự động cắt + tạo thành 1 video"  |
|  3  | **Hiểu intent ngôn ngữ tự nhiên**              | "Nghe hiểu mục đích: dựng thô action, thêm transition, adjust speed..." |
|  4  | **Auto color grading per scene**               | "Tự động phân tích + chỉnh tone màu cho từng cảnh"                      |

---

## 2. PLUGIN HIỆN TẠI ĐÁP ỨNG ĐƯỢC GÌ

### Coverage per mục tiêu (sau V2 hôm nay)

```
Mục tiêu 1 (Auto edit + effects):    ████░░░░░░ 25%
Mục tiêu 2 (Phân tích + auto cut):   ███░░░░░░░ 30%
Mục tiêu 3 (NL intent):              ████░░░░░░ 40%
Mục tiêu 4 (Color grading):          █░░░░░░░░░ 10%
                                      ─────────────
TỔNG:                                 ███░░░░░░░ ~26%
```

### Chi tiết từng mục tiêu

**Mục tiêu 1 — 25%**:

- ✅ Đọc 413 clip từ Premiere thật
- ✅ Schema effect/transition catalog có
- ❌ Không có catalog data (chỉ skeleton)
- ❌ Không có brain "scene này dùng effect gì"
- ❌ Không có VFX composer

**Mục tiêu 2 — 30%**:

- ✅ Đọc metadata clip (name, duration, source)
- ✅ Whisper code có (untested)
- ✅ Cut-planner algorithm có (untested)
- ❌ Không có quality scorer (blur/exposure/focus)
- ❌ Không có best take selector
- ❌ Không có beat detection

**Mục tiêu 3 — 40%**:

- ✅ Multi-LLM router (Anthropic + OpenAI + Gemini) code
- ✅ 36 MCP tools registered
- ❌ Không có Director system prompt
- ❌ Không có multi-step planner
- ❌ Không có visual context (LLM không thấy thumbnail)

**Mục tiêu 4 — 10%**:

- 🟡 Lumetri API surface có (chưa test)
- ❌ Không có color analyzer
- ❌ Không có LUT library
- ❌ Không có shot matching

---

## 3. CẦN BỔ SUNG NÂNG CẤP GÌ (5 capabilities)

### 3.1 Computer Vision Pipeline (CRITICAL — 2 tuần)

**Phục vụ**: Mục tiêu 2 + 4

**Build**:

- Frame sampler (extract 10 frames/clip)
- Quality scorer: blur (Laplacian), exposure (histogram), focus, framing
- Object/face detector (YOLOv8 nano + MediaPipe)
- Scene classifier (action/dialog/landscape/closeup)
- Aesthetic score (NIMA model)

**Stack**: Python sidecar + OpenCV + ONNX Runtime + RTX 2060

### 3.2 Audio Analyzer (HIGH — 1 tuần)

**Phục vụ**: Mục tiêu 2 + 3

**Build**:

- Silence detection (librosa)
- **Beat detection** (BPM tracking) → critical cho action montage
- Voice Activity Detection (pyannote / Silero)
- Whisper transcription (faster-whisper VN+EN)
- Audio quality (LUFS, clipping, noise)

### 3.3 Effect Recommendation Engine (HIGH — 1.5 tuần)

**Phục vụ**: Mục tiêu 1

**Build**:

- JSON catalog 50+ effects (Lumetri, Audio, Video)
- 20+ transitions với metadata "best for action/calm"
- 30+ LUT .cube files
- Recommendation logic: scene + mood → top 3 effect
- Rule-based v1, LLM-assisted v2

### 3.4 AI Director Orchestrator (CRITICAL — 2 tuần)

**Phục vụ**: Mục tiêu 3

**Build**:

- "Video Director" system prompt với 36 MCP tools
- Plan schema JSON (multi-step, có checkpoint)
- Plan executor với progress + cancel
- Visual context (thumbnail base64 → multimodal Claude)
- Persona variants: Cinematic / Action / Vlog / Vintage

### 3.5 Color Grading Engine (MEDIUM — 1.5 tuần)

**Phục vụ**: Mục tiêu 4

**Build**:

- Color analyzer (dominant color, mood, brightness)
- LUT matcher per scene type
- Shot matching (cluster shots → đồng nhất màu)
- Lumetri API integration tested
- 5 style presets: Cinematic / Action / Vlog / Vintage / Horror

---

## 4. KHÔNG THỂ TRIỂN KHAI ĐƯỢC (limits Premiere UXP)

| Limit                                           | Lý do                              | Workaround                                  |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| **Real-time effect preview**                    | UXP không expose render API        | Thumbnail offline qua ffmpeg                |
| **Generative VFX (motion graphics, particles)** | UXP chỉ có Lumetri + basic effects | Tạo MOGRT trước trong AE, plugin chỉ insert |
| **4K realtime per-frame analysis**              | RTX 2060 6GB không đủ throughput   | Sample 1 frame/s thay vì 24fps              |
| **Tự generate dialogue/voice-over**             | UXP không tạo audio                | Tích hợp ElevenLabs/OpenAI TTS API (cost)   |
| **Auto-pick background music phù hợp**          | License + library issue            | User import music, plugin sync beats        |
| **Multi-cam 8+ camera live switching**          | UXP API hạn chế multi-cam          | Manual workflow                             |
| **After Effects-level compositing**             | Out of scope                       | User dùng AE riêng                          |
| **Subtitle perfect VN timing**                  | Whisper VN accuracy 85-95%         | Human review required                       |
| **Python in-process Premiere**                  | UXP không support Python embedded  | Sidecar process + WS bridge (đã plan)       |

---

## 5. SƠ ĐỒ VẬN HÀNH (PROPOSED)

### 5.1 Architecture high-level

```
┌──────────────────────────────────────────────────────┐
│ USER: "Dựng video du lịch 3 phút cinematic"          │
└────────────────────────┬─────────────────────────────┘
                         ▼
                 ┌──────────────┐
                 │ Panel (UXP)  │ ◀── tab Director / Chat / Library / Scenes
                 └──────┬───────┘
                        │ WebSocket :7778
                        ▼
                 ┌──────────────────────┐
                 │ DirectorAI Server    │
                 │  - MCP dispatcher    │
                 │  - 36+ tools         │
                 │  - LLM router        │
                 └──────┬───────────────┘
                        │
        ┌───────────────┼────────────────┬─────────────┐
        ▼               ▼                ▼             ▼
   ┌─────────┐   ┌──────────────┐  ┌──────────┐  ┌─────────┐
   │ LLM     │   │ Python       │  │ ChromaDB │  │ SQLite  │
   │ (Claude)│   │ Sidecar      │  │ (vectors)│  │ (meta)  │
   │ Cloud   │   │ Local        │  └──────────┘  └─────────┘
   └─────────┘   └──────┬───────┘
                        │
            ┌───────────┼────────────┬─────────────┐
            ▼           ▼            ▼             ▼
       ┌────────┐  ┌────────┐  ┌─────────┐  ┌──────────┐
       │ Vision │  │ Audio  │  │ Effect  │  │ Color    │
       │ pipeln │  │ pipeln │  │ recomm  │  │ grader   │
       └────────┘  └────────┘  └─────────┘  └──────────┘

                        │ (results)
                        ▼
                 ┌──────────────────┐
                 │ UXP Adapter      │ ── apply edits via premierepro API
                 └──────┬───────────┘
                        ▼
                ╔══════════════════════╗
                ║  PREMIERE PRO 2026   ║
                ║  (real timeline)     ║
                ╚══════════════════════╝
```

### 5.2 Data flow ví dụ — "Dựng vlog du lịch 3 phút"

```
[1] User gõ goal trong Panel Director
       ↓
[2] Server: Director system prompt + 20 thumbnail → Claude
       ↓
[3] Claude trả plan JSON (12 steps)
       ↓
[4] User approve plan trong UI
       ↓
[5] Plan executor loop:
       step.1 → Python sidecar: analyze all clips (vision + audio)
       step.2 → Pick best takes per scene
       step.3 → Order by narrative arc
       step.4 → Cut on beat
       step.5 → Apply transitions
       step.6 → Apply LUT per scene
       step.7 → Set speed
       ...
       ↓
[6] Server forward mỗi step → UXP Adapter
       ↓
[7] UXP Adapter call premierepro API → real Premiere edit
       ↓
[8] Premiere sequence ready, user review
```

### 5.3 Storage layer

```
┌────────────────────────────────────────────────┐
│ Local storage (per project)                    │
├────────────────────────────────────────────────┤
│ ChromaDB                                       │
│  ├─ clip embeddings (vision features)          │
│  ├─ transcript embeddings (text search)        │
│  └─ scene boundaries                            │
│                                                │
│ SQLite                                         │
│  ├─ clips table (id, path, scores, scene_type) │
│  ├─ analyses table (timestamps, model versions)│
│  ├─ plans table (saved director plans)         │
│  └─ style_profiles table                       │
│                                                │
│ Filesystem cache                               │
│  ├─ /thumbs/<clip-id>.jpg                       │
│  ├─ /frames/<clip-id>/<frame-n>.jpg             │
│  └─ /audio/<clip-id>.wav (extracted for libroSA)│
└────────────────────────────────────────────────┘
```

---

## 6. GIAO DIỆN TỐI ƯU

### 6.1 Hiện tại (3 tab — sẽ thay)

```
┌─ DirectorAI v0.2 ──────────────┐
│  [chat] [style] [context]       │
│                                 │
│  Activity log                   │
│                                 │
│  [type command...] [▶]          │
└─────────────────────────────────┘
```

### 6.2 Mới đề xuất (4 tab)

```
┌─ DirectorAI v3.0 ──────────────────────┐
│  [Director] [Chat] [Library] [Scenes]   │
├────────────────────────────────────────┤
│                                        │
│  🎬 DIRECTOR MODE                       │
│  ─────────────────────────────         │
│                                        │
│  Goal:                                 │
│  [Travel vlog cinematic 3 min  ▼]      │
│                                        │
│  Persona:                              │
│  [Editor cinematic           ▼]        │
│                                        │
│  Source:                               │
│  📂 413 clips analyzed                 │
│     ▸ 187 landscape                    │
│     ▸ 124 closeup                      │
│     ▸ 102 transitional                 │
│                                        │
│  Plan preview (12 steps):              │
│  1. ✓ Select 47 best takes             │
│  2. ✓ Cut on beat (BPM: 110)           │
│  3. ✓ Apply cinematic LUT              │
│  4. ✓ Add cross-dissolves              │
│  ...                                   │
│                                        │
│  [▶ Generate Rough Cut] [⚙ Customize] │
│                                        │
├────────────────────────────────────────┤
│ ⚡ UXP | proj | seq | Director ON       │
└────────────────────────────────────────┘
```

### 6.3 Vai trò từng tab

| Tab          | Mục đích                                 | Use case                           |
| ------------ | ---------------------------------------- | ---------------------------------- |
| **Director** | Main mode: goal → AI plan → execute      | "Dựng từ raw thành finished video" |
| **Chat**     | Lệnh ad-hoc khi đang dựng tay            | "Cut bỏ silence trên track 1"      |
| **Library**  | Browse + search clips theo quality/scene | "Tìm clip có cảnh hoàng hôn"       |
| **Scenes**   | Xem AI phân tích từng scene + adjust     | Review + override AI decision      |

---

## 7. 5 GIẢI PHÁP XÂY DỰNG — ƯU/NHƯỢC

| Tiêu chí                  | A: Local+Cloud | B: All cloud | **C: Hybrid ⭐** | D: MVP rules | E: Assistant |
| ------------------------- | :------------: | :----------: | :--------------: | :----------: | :----------: |
| **Đáp ứng vision**        |      85%       |     80%      |     **90%**      |     40%      |     60%      |
| **Privacy**               |      High      |     Low      |     **High**     |     High     |     High     |
| **Cost / session**        |     $0.10      |    $1.50     |    **$0.20**     |      $0      |    $0.10     |
| **Offline-able**          |      Yes       |      No      |   **Partial**    |     Yes      |   Partial    |
| **Build time**            |    6-8 tuần    |   3-4 tuần   |   **5-7 tuần**   |   2-3 tuần   |   4-5 tuần   |
| **Hardware**              |   RTX 2060+    |     None     |  **RTX 2060+**   |     None     |  RTX 2060+   |
| **Setup phức tạp (team)** |     Medium     |     Low      |    **Medium**    |     Low      |    Medium    |
| **Maintainability**       |     Medium     |     Low      |    **Medium**    |     High     |     High     |

### Chi tiết 5 giải pháp

**A — Local + Cloud LLM**

- Stack: Vision/audio Python local, LLM Anthropic cloud
- ✅ Privacy cao, cost thấp, offline-able một phần
- ❌ Setup Python sidecar phức tạp, occupy CPU/GPU khi analyze
- Đáp ứng: 85% | Effort: 6-8 tuần

**B — All Cloud**

- Stack: Vision API + LLM API + Edit UXP local
- ✅ Setup đơn giản nhất, quality model cao
- ❌ Privacy thấp, cost $1.50/session, bandwidth lớn
- Đáp ứng: 80% | Effort: 3-4 tuần (nhanh nhất)

**C — Hybrid ⭐ (RECOMMENDED)**

- Stack: Local CV + cloud LLM + thumbnail to multimodal
- ✅ Best balance: privacy + cost + quality + Đáp ứng vision tốt nhất
- ❌ Vẫn cần Python sidecar + LLM key
- Đáp ứng: 90% | Effort: 5-7 tuần

**D — MVP Rules-based**

- Stack: Local algorithm only, no AI
- ✅ Đơn giản, free, fast build, predictable
- ❌ Không "thông minh", không hiểu NL, cảm giác máy móc
- Đáp ứng: 40% | Effort: 2-3 tuần

**E — Smart Assistant (Advisor)**

- Stack: AI suggest, user click manual
- ✅ User control hoàn toàn, ít rủi ro AI sai
- ❌ Không tự động hoàn toàn như mục tiêu bạn
- Đáp ứng: 60% | Effort: 4-5 tuần

### Khuyến nghị: **Giải pháp C**

Lý do:

1. Đáp ứng cao nhất với mục tiêu bạn (90%)
2. Bạn có RTX 2060 sẵn → tận dụng hardware
3. Cost $0.20/session chấp nhận được
4. Privacy quan trọng cho internal team use case
5. Maintenance medium, không quá phức tạp

---

## 8. ROADMAP 10 TUẦN (sau khi chọn C)

```
Tuần 1-2  Sprint A  — Python Sidecar Foundation
Tuần 3-4  Sprint B  — Vision Pipeline (quality + scene + aesthetic)
Tuần 5    Sprint C  — Audio Pipeline (beat + VAD + Whisper)
Tuần 6    Sprint D  — Effect Catalog + Recommender
Tuần 7-8  Sprint E  — AI Director Orchestrator (LLM)
Tuần 9    Sprint F  — Color Grading Engine
Tuần 10   Sprint G  — UI Redesign (4 tab)
+ buffer  Sprint H  — Polish + real-user test
```

Chi tiết task cho mỗi sprint xem `docs/architecture/v3-master-plan.md`.

---

## 9. KẾT QUẢ CUỐI — PLUGIN SẼ LÀM ĐƯỢC GÌ

### Workflow chính (Auto rough cut)

**Scenario**: 413 raw clips → vlog du lịch 3 phút

```
User effort:    ~50 phút thao tác
Wall-clock:     ~1h30 (incl. background processing)
Manual baseline: ~6h40
─────────────────────────────────────
Tiết kiệm:      80% user effort, 75% wall-clock
```

### Coverage 4 mục tiêu sau v3

| Mục tiêu                      | Hôm nay  |       Sau v3       |
| ----------------------------- | :------: | :----------------: |
| 1. Dựng từ raw + auto effects |   25%    |      **85%**       |
| 2. Phân tích + auto cut       |   30%    |      **90%**       |
| 3. NL intent                  |   40%    | **80%** (no voice) |
| 4. Color grading              |   10%    |      **80%**       |
| **Tổng**                      | **~26%** |      **~84%**      |

### Loại video plugin sẽ làm tốt

```
✅ TỐT (target use case):
  Vlog du lịch        90%
  Action montage      85%
  Sport highlight     85%
  Wedding highlight   80%
  Family memory       80%
  Real estate tour    80%
  Product showcase    75%
  YouTube tutorial    70%

🟡 TRUNG BÌNH:
  Music video         60%
  Documentary         50%
  Podcast             50%

❌ KHÔNG LÀM:
  Animation
  VFX cinema features
  Multi-cam 8+ live switching
```

---

## 10. QUYẾT ĐỊNH ĐÃ CHỐT (FINAL)

### ❶ Solution: **C — Hybrid** ✅

- Vision/audio: Python sidecar local (RTX 2060)
- LLM director: Claude Opus cloud (multimodal)
- Edit dispatch: UXP adapter local

### ❷ Voice input: **KHÔNG** ✅

Text only. Tiết kiệm 1 tuần build.

### ❸ Timeline: **8-10 tuần kỹ với buffer** ✅

Full Sprint A-H, không cắt scope.

### ❹ Branch strategy: **Direct trên `main`** ✅

Tôi commit + push thẳng main mỗi sub-task xong.
Bạn thấy progress real-time qua GitHub commits.

### ❺ Critical workflow: **WF1 — Auto rough cut từ raw footage** ✅

- Sprint E system prompt focus vào WF1 trước
- Các workflow khác (chat command, search, color match, style learning)
  vẫn build nhưng test acceptance trên WF1 trước

### ❻ Capability cuts: **KHÔNG cắt — full power plugin** ✅

- Giữ tất cả 5 capabilities (CV + Audio + Effect + Director + Color)
- Giữ semantic search, style learning, multi-persona
- Plugin mạnh mẽ xử lý nhiều vấn đề video

---

## 11. SẴN SÀNG BẮT ĐẦU SPRINT A

Tất cả 6 decision đã chốt. Plan validated.

**Sprint A — Python Sidecar Foundation (Tuần 1-2)** starts next:

- A.1 Python project structure (uv + pyproject + mypy)
- A.2 WS bridge protocol (FastAPI + websockets)
- A.3 Storage layer (ChromaDB + SQLite)
- A.4 Job queue (RQ/Celery-lite)
- A.5 Hardware probe (CUDA detect)
- A.6 Logging + telemetry

**Deliverable end of week 2**:

- `pnpm sidecar:start` boots Python service
- Smoke test: server ↔ sidecar ping/pong
- Hardware report khi start
- Unit tests 80%+

4 docs cũ giữ trong `docs/architecture/_archive/` nếu cần reference.

**Bước tiếp theo**:

1. Bạn đọc ANALYSIS.md (doc này)
2. Trả lời 6 quyết định section 10
3. Tôi update master plan reflect quyết định
4. Bắt đầu Sprint A khi bạn ack

---

_Created: 2026-06-01 — gộp current-state + product-vision-gap + v3-master-plan + v3-capabilities_
