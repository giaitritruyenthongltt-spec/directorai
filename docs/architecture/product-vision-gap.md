# DirectorAI — Gap analysis: từ V2 đến tầm nhìn sản phẩm

> Bạn đã định nghĩa 4 mục tiêu sản phẩm. Tài liệu này chấm điểm plugin
> hiện tại với từng mục tiêu, chỉ ra cần build thêm gì, đề xuất 5 giải
> pháp với ưu/nhược điểm — và UI tối ưu cho dev iteration.
>
> **Quan trọng**: tài liệu này KHÔNG viết code, chỉ plan.

---

## 1. Mapping 4 mục tiêu → trạng thái hiện tại

### 🎯 Mục tiêu 1 — Dựng video từ tệp thô + auto thêm effects/kỹ xảo

| Cần                                 |                 Đã có                 | Còn thiếu                                                              |
| ----------------------------------- | :-----------------------------------: | ---------------------------------------------------------------------- |
| Đọc danh sách clip từ Premiere      |        ✅ V2 pass — 413 clips         | —                                                                      |
| Thư viện effect (catalog)           | 🟡 `effect-library` package có schema | Chưa có catalog thật, chỉ skeleton                                     |
| Áp effect lên clip qua Premiere API |      🟡 `applyEffect` method có       | Chưa test thật, không biết Lumetri API thực hoạt động ra sao           |
| **Effect suitability engine**       |                  ❌                   | **Chưa có** — không có logic "scene type → effect phù hợp"             |
| **Transition library** với preview  |                  ❌                   | **Chưa có** — chỉ có cross-dissolve hardcode                           |
| **Kỹ xảo (VFX) composer**           |                  ❌                   | **Hoàn toàn chưa có** — VFX = chroma key / motion graphics / particles |

**Đáp ứng: ~25%** — đọc được clip nhưng chưa có brain quyết định effect nào.

---

### 🎯 Mục tiêu 2 — Phân tích chất lượng clip + auto cắt + ráp video

| Cần                                                  |               Đã có               | Còn thiếu                                                   |
| ---------------------------------------------------- | :-------------------------------: | ----------------------------------------------------------- |
| Đọc metadata clip                                    |  ✅ name, duration, source path   | —                                                           |
| Whisper transcription                                | 🟡 Code có trong `context-engine` | Chưa chạy với clip thật                                     |
| Silence detection                                    |  🟡 `cut-planner` có thuật toán   | Chưa test với audio thật                                    |
| **Quality scoring** (blur, exposure, focus, framing) |                ❌                 | **Chưa có gì**                                              |
| **Best take selector**                               |                ❌                 | **Chưa có** — không phát hiện take tốt từ 3 take giống nhau |
| **Scene boundary detection** (cảnh đổi)              | 🟡 `enableSceneDetect` config có  | Chưa wire thật                                              |
| **Auto-assembly** (script ráp video tự động)         |    🟡 cut-planner có execute()    | Chưa test với data thật                                     |
| **Beat detection** (cắt theo nhịp nhạc)              |                ❌                 | **Chưa có** — critical cho action video                     |

**Đáp ứng: ~30%** — có framework, không có brain phân tích thật.

---

### 🎯 Mục tiêu 3 — Hiểu intent qua ngôn ngữ tự nhiên

Ví dụ user: "Dựng thô cho tôi thành video hành động chất lượng cao, kịch tính"

| Cần                                                       |                       Đã có                       | Còn thiếu                                              |
| --------------------------------------------------------- | :-----------------------------------------------: | ------------------------------------------------------ |
| LLM API integration                                       | ✅ Multi-LLM router (Anthropic + OpenAI + Gemini) | —                                                      |
| 36 MCP tools để LLM gọi                                   |                 ✅ Catalog đầy đủ                 | Chưa test với real Premiere                            |
| **System prompt cho "Video Director"**                    |                        ❌                         | **Chưa viết** — chỉ có chat generic                    |
| **Multi-step planning** (LLM phân chia → loop tool calls) |              🟡 MCP framework hỗ trợ              | Chưa có planning prompt                                |
| **Voice input** (user nói thay vì gõ)                     |                        ❌                         | **Chưa có** — Whisper trong context engine có thể dùng |
| **Visual context** (LLM thấy thumbnail clip để quyết)     |                        ❌                         | **Chưa có** — LLM hiện chỉ thấy metadata text          |

**Đáp ứng: ~40%** — infrastructure có, brain prompt chưa thiết kế.

---

### 🎯 Mục tiêu 4 — Auto color grading per scene

| Cần                                                              |        Đã có         | Còn thiếu            |
| ---------------------------------------------------------------- | :------------------: | -------------------- |
| Áp Lumetri Color qua Premiere API                                | 🟡 effect surface có | Chưa test param thật |
| **Color analyzer** (histogram, dominant color, mood)             |          ❌          | **Chưa có**          |
| **LUT library** (cinematic, action, vlog presets)                |          ❌          | **Chưa có**          |
| **Auto match shot tones** (cùng scene nhiều góc → màu đồng nhất) |          ❌          | **Chưa có**          |
| **Color-by-scene-type** ("cảnh hành động → high-contrast")       |          ❌          | **Chưa có**          |

**Đáp ứng: ~10%** — gần như chưa có gì.

---

### 📊 Tổng kết coverage

```
Mục tiêu 1 (Auto edit + effects):       ████░░░░░░ 25%
Mục tiêu 2 (Phân tích + auto cut):      ███░░░░░░░ 30%
Mục tiêu 3 (NL intent):                 ████░░░░░░ 40%
Mục tiêu 4 (Color grading):             █░░░░░░░░░ 10%
─────────────────────────────────────────────────
Tổng cộng:                              ███░░░░░░░ ~26%
```

**Plugin hiện tại có infrastructure ~75% nhưng "brain" thực thi mục tiêu chỉ ~26%.**

---

## 2. Capabilities CẦN BUILD MỚI để đáp ứng vision

### 2.1 Computer Vision Pipeline (CRITICAL)

**Phục vụ**: Mục tiêu 2 (quality), Mục tiêu 4 (color)

**Cần**:

- Frame sampler (extract N frames/clip)
- Quality scorer:
  - **Blur**: Laplacian variance
  - **Exposure**: histogram analysis (over/under-exposed)
  - **Focus**: high-frequency content
  - **Framing**: rule-of-thirds detection
  - **Motion blur**: optical flow magnitude
- Object/face detector (YOLO hoặc MediaPipe)
- Scene classifier (action / dialog / landscape / closeup)
- Aesthetic score (NIMA model — đánh giá đẹp/xấu của frame)

**Stack đề xuất**:

- Python sidecar (đã có khung `apps/context-engine`)
- OpenCV cho image processing cơ bản
- ONNX Runtime cho ML models (faster than PyTorch trong production)
- Models: YOLOv8 nano, MediaPipe Face, NIMA aesthetic

**Effort**: ~2 tuần

---

### 2.2 Audio Analyzer (HIGH)

**Phục vụ**: Mục tiêu 2 (cắt cảnh + beat), Mục tiêu 3 (voice input)

**Cần**:

- Silence detection (đã có thuật toán, cần wire)
- **Beat detection** (librosa.beat.beat_track) cho music sync
- **Voice activity detection** (VAD) — phân biệt dialog vs ambient
- **Emotion in speech** (excited/calm) — qua prosody
- **Transcription** (Whisper — đã có code)

**Stack đề xuất**:

- librosa cho audio analysis
- Whisper.cpp hoặc faster-whisper cho STT
- pyannote.audio cho VAD

**Effort**: ~1 tuần

---

### 2.3 Effect/Transition Recommendation Engine (HIGH)

**Phục vụ**: Mục tiêu 1 (auto effects)

**Cần**:

- **Effect taxonomy**: catalog mỗi effect với metadata:
  - "best for": [action, dialog, montage, ...]
  - "mood": [intense, calm, dreamy, ...]
  - "complexity": low / medium / high
  - "Premiere effect path": e.g. `Video Effects/Color Correction/Lumetri Color`
- **Recommendation logic**:
  - Input: scene type + mood + pacing
  - Output: top 3 effect candidates với params suggestions
- **Pre-built presets**: 20-30 effect combos chuẩn cho từng style (action, vlog, wedding, ...)

**Stack đề xuất**:

- JSON catalog trong `packages/effect-library/data/`
- Simple rule-based recommendation cho v1 (LLM cho v2)
- LUT files (.cube) cho Lumetri Color presets

**Effort**: ~1.5 tuần (catalog) + ~1 tuần (recommendation logic)

---

### 2.4 AI Director Orchestrator (CRITICAL)

**Phục vụ**: Mục tiêu 3 (NL intent multi-step)

**Cần**:

- **"Director" system prompt** cho LLM với:
  - Role: "Bạn là editor chuyên nghiệp"
  - Tools available: 36 MCP tools
  - Output format: JSON plan với steps
- **Plan executor**:
  - Parse LLM plan
  - Execute step by step
  - Report progress qua progress bus
  - Allow cancel
- **Visual context provider**:
  - Generate thumbnail mỗi clip → base64 → feed cho LLM
  - LLM thấy visual không chỉ text → quyết định tốt hơn

**Stack đề xuất**:

- Claude Opus 4.7 cho long-context planning
- Tool use API (Anthropic native — best support)
- ffmpeg để generate thumbnails

**Effort**: ~1 tuần (prompt + executor) + ~1 tuần (visual context)

---

### 2.5 Color Grading Engine (MEDIUM)

**Phục vụ**: Mục tiêu 4

**Cần**:

- **LUT library**: 30-50 LUT files có tag (cinematic, action, vlog, vintage, ...)
- **Color analyzer**: extract dominant color, brightness, contrast của mỗi clip
- **Shot matching**: cluster shots với màu gần nhau → áp cùng LUT
- **Style-driven grading**: "action style" → apply preset chuyên cho action

**Stack đề xuất**:

- LUT files từ FreeLUT / Lutify.me (CC0 hoặc bought)
- Premiere Lumetri Color API
- K-means clustering trên LAB color space

**Effort**: ~1 tuần (analyzer) + ~1 tuần (LUT integration)

---

## 3. Gì KHÔNG thể triển khai (limits của Premiere UXP)

### 3.1 Real-time effect preview (KHÔNG được)

Premiere UXP **không có API render frame on demand**. Không thể tạo
preview hiệu ứng trước khi áp. User phải áp xong → xem → undo nếu xấu.

**Workaround**: dùng ffmpeg riêng để render preview thumbnail offline,
nhưng không có Lumetri-grade preview.

---

### 3.2 Generative VFX (motion graphics, particles)

Premiere UXP không tạo motion graphics phức tạp được. Chỉ có Lumetri,
Audio effects, transitions, basic video effects.

**Workaround**: tạo MOGRT templates trước trong After Effects → plugin
chỉ insert MOGRT. Đòi user (hoặc bạn) phải có AE skill.

---

### 3.3 4K/8K real-time analysis

Phân tích 4K video frame-by-frame chạy local sẽ chậm:

- 4K @ 24fps × 60s = 1440 frames × 100ms/frame = 2.4 phút/clip
- 413 clips × 2.4 min = ~16 GIỜ

**Workaround**:

- Sample 1 frame/giây thay vì all frames
- Cache results trong ChromaDB
- GPU acceleration (CUDA cho NVIDIA, Apple Silicon NPU)
- User RTX 2060 6GB của bạn → ~10-15× faster vs CPU

---

### 3.4 Tự động thêm dialogue/voice-over

UXP không generate audio. Chỉ có thể IMPORT audio đã có.

**Workaround**: Tích hợp ElevenLabs / OpenAI TTS API → generate file
WAV → import vào Premiere. Cần network + cost API.

---

### 3.5 Premiere không support Python in-process

Python sidecar phải chạy ngoài Premiere (riêng process). Communication
qua HTTP/WebSocket. Latency 50-200ms cho mỗi call.

**Workaround**: Batch operations, không gọi Python từng frame.

---

## 4. Sơ đồ vận hành tối ưu (Proposed)

### 4.1 High-level workflow

```
┌──────────────────────────────────────────────────────────────┐
│ USER INTENT                                                   │
│ "Dựng thô từ 413 clips này thành video hành động kịch tính"  │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
                ┌─────────────────┐
                │ DirectorAI      │
                │   Panel (Chat)  │
                └────────┬────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
┌───────────────┐               ┌──────────────────┐
│ Voice input   │               │ Text input       │
│ (Whisper STT) │               │ (typed)          │
└───────┬───────┘               └────────┬─────────┘
        └────────────┬──────────────────┘
                     ▼
       ┌──────────────────────────────┐
       │ LLM Director (Claude Opus)   │
       │  - Parse intent              │
       │  - Generate edit plan (JSON) │
       └──────────────┬───────────────┘
                      │
       ┌──────────────┴──────────────┐
       ▼              ▼               ▼
  ┌────────┐    ┌────────┐      ┌────────┐
  │ Scan   │    │ Score  │      │ Plan   │
  │ clips  │ →  │ each   │  →   │ assembly│
  │(meta)  │    │ clip   │      │        │
  └────────┘    └────────┘      └────┬───┘
                                     │
                ┌────────────────────┴─────────────────┐
                ▼                                      ▼
       ┌──────────────────┐                  ┌──────────────────┐
       │ Vision pipeline  │                  │ Audio pipeline   │
       │ (Python sidecar) │                  │ (Python sidecar) │
       │  - Quality       │                  │  - Beat detect   │
       │  - Scene type    │                  │  - Silence       │
       │  - Aesthetic     │                  │  - Voice         │
       │  - Face/motion   │                  │  - Emotion       │
       └────────┬─────────┘                  └────────┬─────────┘
                │                                     │
                └───────────────┬─────────────────────┘
                                ▼
              ┌──────────────────────────────────┐
              │ Recommendation engine            │
              │  - Pick best takes               │
              │  - Order shots by narrative arc  │
              │  - Match transitions to mood     │
              │  - Suggest LUT per scene type    │
              └────────────────┬─────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────┐
              │ Plan executor (server)           │
              │  - Issue MCP tool calls          │
              │  - Progress bus                  │
              │  - Allow user cancel             │
              └────────────────┬─────────────────┘
                               │ WS
                               ▼
              ┌──────────────────────────────────┐
              │ UXP Adapter (panel)              │
              │  - addClipToTrack                │
              │  - applyTransition               │
              │  - applyLumetri (LUT)            │
              │  - setSpeed                      │
              └────────────────┬─────────────────┘
                               ▼
                  ╔══════════════════════════╗
                  ║   Premiere Pro Sequence  ║
                  ║   (real timeline edit)   ║
                  ╚══════════════════════════╝
```

### 4.2 Component additions vs current state

```
NEW components cần build:
├── 📦 quality-analyzer (Python service trong context-engine)
├── 📦 scene-classifier (ML model + service)
├── 📦 beat-detector (audio analysis)
├── 📦 effect-catalog (data + recommendation logic)
├── 📦 color-grader (LUT library + matcher)
├── 📦 director-prompt (system prompt + planner)
└── 📦 voice-input (panel mic capture + STT)

EXISTING components cần wire:
├── ✅ panel UI (chat/style/context)        ← V2 done
├── ✅ ws-client + dispatcher               ← V2 done
├── 🟡 UXP adapter (basic)                  ← Phase 1.1 done
├── 🟡 context-engine (Python sidecar)      ← framework có, không có model
├── 🟡 cut-planner                          ← logic có, chưa test thật
├── 🟡 style-engine                         ← học style nhưng chưa có preset
└── 🟡 effect-library                       ← schema có, không có data
```

---

## 5. UI tối ưu (Proposed)

### 5.1 Layout panel hiện tại

```
┌─────────────────────────────────┐
│ DirectorAI v0.2     ● Connected │
├─────────────────────────────────┤
│  [chat] [style] [context]       │
├─────────────────────────────────┤
│                                 │
│  Activity log                   │
│  ...                            │
│                                 │
├─────────────────────────────────┤
│ [type command...]          [▶] │
│ ⚡ UXP | proj | seq | OK        │
└─────────────────────────────────┘
```

### 5.2 Layout mới đề xuất

```
┌────────────────────────────────────┐
│ DirectorAI v0.3     ● Connected    │
├────────────────────────────────────┤
│ [Director][Chat][Library][Scenes]  │
├────────────────────────────────────┤
│                                    │
│  🎬 DIRECTOR MODE                  │
│  ──────────────────────────────    │
│                                    │
│  Goal:                             │
│  [Action video, dramatic ▼]        │
│                                    │
│  Source:                           │
│  📂 413 clips analyzed             │
│     ▸ 187 action shots             │
│     ▸ 124 dialog shots             │
│     ▸ 102 transitional             │
│                                    │
│  Plan preview:                     │
│  1. ✓ Select 47 best takes         │
│  2. ✓ Cut on beat (BPM: 128)       │
│  3. ✓ Apply cinematic LUT          │
│  4. ✓ Add whip-pan transitions     │
│  5. ⏳ Render preview               │
│                                    │
│  [▶ Generate Rough Cut]            │
│  [⚙ Customize]                     │
│                                    │
├────────────────────────────────────┤
│ 🎤 [Hold to speak...]   or [type] │
│ ⚡ UXP | proj | seq | Director ON │
└────────────────────────────────────┘
```

### 5.3 4 tab mới (thay vì 3 tab hiện tại)

| Tab          | Mục đích                                          | Trạng thái                |
| ------------ | ------------------------------------------------- | ------------------------- |
| **Director** | Mode chính: user nói goal → AI tạo plan → execute | 🆕 Build mới              |
| **Chat**     | Lệnh ngắn ad-hoc ("cut at 0:30", "delete clip 5") | ✅ Có nhưng cần test thật |
| **Library**  | Browse clip + chất lượng + tag (NEW)              | 🆕 Build mới              |
| **Scenes**   | Xem AI phân tích scene + adjust manual            | 🆕 Build mới              |

**Style tab** hiện tại → merge vào Director (pick preset).
**Context tab** hiện tại → merge vào Library (semantic search).

### 5.4 Voice input (CRITICAL cho UX hỗ trợ video)

User đang dựng trong Premiere không muốn dừng để gõ. Voice input:

- Hold-to-talk button (như Discord)
- Whisper STT local (privacy + offline)
- Visual feedback: waveform khi nói + transcript hiện ngay

---

## 6. 5 GIẢI PHÁP build (proposed) — ưu/nhược

### Giải pháp A — Full local + cloud LLM (RECOMMENDED)

**Stack**:

- Vision/audio analysis: Python local (CPU + RTX 2060 GPU)
- LLM director: Anthropic Claude API
- Premiere edit: UXP adapter local
- Storage: SQLite + ChromaDB local

**Ưu**:

- ✅ Privacy: video không upload đâu
- ✅ Hoạt động offline (trừ LLM call)
- ✅ Sử dụng GPU sẵn có
- ✅ No subscription cho analysis
- ✅ Có thể distributed cho team không tốn server

**Nhược**:

- ❌ CPU/GPU bị chiếm khi analyze (~10-15 phút/100 clips)
- ❌ LLM call cost ($0.05-0.20/session với Claude Opus)
- ❌ Setup Python sidecar phức tạp hơn

**Effort**: 6-8 tuần build

---

### Giải pháp B — All cloud (Vision API + LLM API)

**Stack**:

- Vision: OpenAI Vision API / Google Vision / Replicate
- Audio: AssemblyAI / Whisper API
- LLM: Anthropic / OpenAI
- Edit: UXP adapter local

**Ưu**:

- ✅ Setup đơn giản (chỉ cần API keys)
- ✅ Quality cao hơn local model
- ✅ Không cần Python sidecar
- ✅ Update model tự động

**Nhược**:

- ❌ Privacy: upload video frames lên cloud
- ❌ Tốn $$$: $0.50-2.00/video (vision API expensive)
- ❌ Network latency 200-500ms/call
- ❌ Bandwidth: upload nhiều GB video frames
- ❌ Vendor lock-in

**Effort**: 3-4 tuần build (nhanh hơn)

---

### Giải pháp C — Hybrid (local CV, cloud LLM)

**Stack**:

- Vision/audio: Python local (như A)
- LLM director + thumbnail vision: Cloud Claude (multimodal)
- Edit: UXP local

**Ưu**:

- ✅ Best of both: privacy lớn + LLM tốt
- ✅ Chỉ upload thumbnail nhỏ (1-2 KB) cho LLM
- ✅ Cost LLM thấp hơn full cloud
- ✅ Local analysis nhanh sau khi cache

**Nhược**:

- ❌ Vẫn cần Python sidecar
- ❌ Cần Anthropic API key

**Effort**: 5-7 tuần build

---

### Giải pháp D — Minimal MVP (no AI, rule-based)

**Stack**:

- Cut: silence detection algorithm
- Effect: hardcoded recommendation rules
- Color: predefined LUT mapping
- No LLM, no ML

**Ưu**:

- ✅ Đơn giản nhất, 100% offline
- ✅ Predictable, debuggable
- ✅ No cost
- ✅ Demo được nhanh

**Nhược**:

- ❌ Không "thông minh" — chỉ làm theo rule cứng
- ❌ Không hiểu intent ngôn ngữ tự nhiên
- ❌ Cảm giác "máy móc" — không phải AI Director thật
- ❌ Không scale được

**Effort**: 2-3 tuần

---

### Giải pháp E — "Smart Assistant" mode (in between)

**Stack**:

- Local CV cho quality scoring (basic)
- LLM cho suggestion only (không tự execute)
- User vẫn click manual sau khi xem suggestion

**Ưu**:

- ✅ User control hoàn toàn
- ✅ AI làm advisor, không phải agent
- ✅ Ít rủi ro AI sai
- ✅ Trust building dần

**Nhược**:

- ❌ Không hoàn toàn automated như mục tiêu
- ❌ User vẫn phải làm nhiều thao tác manual

**Effort**: 4-5 tuần

---

## 7. So sánh tổng hợp

| Tiêu chí                        | A: Local+Cloud | B: All cloud | C: Hybrid | D: MVP rules | E: Assistant |
| ------------------------------- | :------------: | :----------: | :-------: | :----------: | :----------: |
| **Đáp ứng vision**              |      85%       |     80%      |    90%    |     40%      |     60%      |
| **Privacy**                     |      High      |     Low      |   High    |     High     |     High     |
| **Cost / session**              |     $0.10      |    $1.50     |   $0.20   |      $0      |    $0.10     |
| **Offline-able**                |      Yes       |      No      |  Partial  |     Yes      |   Partial    |
| **Build time**                  |    6-8 tuần    |   3-4 tuần   | 5-7 tuần  |   2-3 tuần   |   4-5 tuần   |
| **Yêu cầu hardware**            |   RTX 2060+    |     None     | RTX 2060+ |     None     |  RTX 2060+   |
| **Setup complexity (cho team)** |     Medium     |     Low      |  Medium   |     Low      |    Medium    |
| **Maintainability**             |     Medium     |  Low (deps)  |  Medium   |     High     |     High     |

**Khuyến nghị**: **Giải pháp C (Hybrid)** — cân bằng tốt nhất cho:

- Internal team use case (privacy quan trọng)
- Bạn có RTX 2060 sẵn (đầu tư hardware đã có)
- LLM phần tốn nhỏ (~$0.20/session)
- Đáp ứng 90% vision

---

## 8. Lộ trình build (cho Giải pháp C)

### Sprint A — Foundation (2 tuần)

- Setup Python sidecar production-ready
- Vision pipeline cơ bản (blur + exposure scoring)
- Audio pipeline (silence + beat)
- ChromaDB persistence cho results
- WS bridge: server ↔ Python sidecar

### Sprint B — Brain (2 tuần)

- Director prompt template
- Plan executor với progress + cancel
- Visual context (thumbnail to LLM)
- Multi-step planning

### Sprint C — Effects (2 tuần)

- Effect catalog (JSON, ~30 effects)
- Recommendation rules + LLM fallback
- Test apply trên Premiere thật
- LUT library (~20 LUTs)
- Color analyzer

### Sprint D — UI redesign (1 tuần)

- 4 tab mới (Director / Chat / Library / Scenes)
- Voice input (Whisper local)
- Plan preview visualization
- Progress UI cho long-running ops

### Sprint E — Polish + test (1 tuần)

- Real user test với 1 project thật của bạn
- Fix bugs phát hiện
- Performance tuning
- Documentation

**Tổng: 8 tuần** (~2 tháng)

---

## 9. Quyết định cho bạn

3 câu hỏi cần answer trước khi bắt đầu:

### Q1: Chọn giải pháp nào?

- A / B / C / D / E (xem table so sánh)
- Recommend: **C (Hybrid)**

### Q2: Voice input có quan trọng không?

- Có → +1 tuần build (Whisper local + UI)
- Không → bỏ qua, dùng text only

### Q3: Bạn sẵn sàng commit 8 tuần dev cho 1 vision đầy đủ?

- Có → Sprint A-E theo plan trên
- Muốn nhanh hơn → cắt giảm features (skip color grading, skip voice)
- Muốn POC trước → 2 tuần build Sprint A + 1 demo cho team

---

## 10. KHÔNG triển khai được (limits)

### 10.1 Real-time AI render trong viewer Premiere

Premiere không expose viewer render API → không thể "AI thấy live preview".

### 10.2 Generative video (text-to-video)

Tạo content video mới từ scratch — cần Runway/Sora API + cost cao + không phải mục tiêu chính.

### 10.3 Auto subtitle với perfect timing

Whisper accuracy 85-95% cho tiếng Việt. Cần human review cho production.

### 10.4 Auto music selection từ library

Cần subscribe Epidemic Sound API hoặc tự tạo music library (out of scope).

### 10.5 4K real-time analysis on every frame

Hardware limit. Sample-based analysis OK, full-frame thì không.

---

_Tài liệu này focus phân tích + plan. Sau khi bạn chọn giải pháp + 3 quyết định Q1-Q3, mình bắt đầu Sprint A._
