# DirectorAI v3 — Capabilities sau 10 tuần

> Mô tả CHÍNH XÁC plugin sẽ làm được gì sau khi hoàn thành Sprint A-H,
> với 6 workflow ví dụ end-to-end. Tài liệu này để bạn validate plan
> match nhu cầu thật trước khi commit 10 tuần dev.

---

## 1. 6 user workflow ví dụ (end-to-end)

### Workflow 1 — Auto rough cut từ raw footage 🎬

**Scenario**: Bạn vừa quay xong 3 tiếng raw footage chuyến đi Đà Lạt
(413 clips, ~30GB), muốn ra video du lịch 3 phút cinematic.

**User actions** (tổng 5 phút thao tác):

```
1. Mở Premiere → import 413 clips vào project
2. Mở DirectorAI panel → tab Director
3. Chọn goal preset: "Travel vlog — Cinematic — 3 phút"
   (hoặc gõ free text: "dựng video du lịch Đà Lạt 3 phút cảm xúc")
4. Pick persona: "Editor cinematic"
5. Click "Generate Rough Cut"
```

**Plugin actions** (tự động, ~30-45 phút background):

```
Phase 1: Scan & analyze (~25 phút trên RTX 2060)
├─ Extract 10 frames/clip × 413 clips = 4130 frames
├─ Quality score mỗi frame (blur, exposure, framing)
├─ Scene classify (landscape / closeup / action / dialog)
├─ Object detect (face, person, vehicle, scenery)
├─ Aesthetic score (NIMA)
├─ Audio analyze (silence, beat, voice activity)
└─ Save analysis → SQLite

Phase 2: LLM Director plan (~30 giây)
├─ Pass clip metadata + 20 thumbnails đại diện cho Claude
├─ Claude generate plan JSON:
│   ├─ Narrative arc: opening (calm) → discovery → climax → resolution
│   ├─ Pick best 45 clips từ 413 (top quality score per scene)
│   ├─ Order theo arc + visual continuity
│   ├─ Cut points (on-beat nếu có music track)
│   ├─ Transition types (cross-dissolve cho calm, whip-pan cho energy)
│   └─ LUT per scene (warm cho golden hour, cool cho mưa, ...)
└─ Display plan preview cho user approve

Phase 3: Execute plan (~5-10 phút)
├─ Create new sequence "DirectorAI - Đà Lạt Rough Cut"
├─ Add 45 clips theo order
├─ Apply transitions giữa clips
├─ Apply LUT per scene
├─ Set speed (slow-mo cho landscape, normal cho action)
└─ Add markers cho user review từng segment
```

**Output**:

- Sequence mới trong Premiere có 45 clip đã ráp + effects
- Side panel summary: "47 clips picked from 413. Total 3:02. Suggested
  background music: 100-110 BPM warm acoustic."
- User chỉ cần fine-tune (trim cuối, swap 1-2 clip)

**Thời gian total**: 35-50 phút (vs 4-6 giờ manual)

---

### Workflow 2 — Voice command nhanh ✋ (KHÔNG có voice — text only)

**Scenario**: Đang dựng tay, muốn AI hỗ trợ ad-hoc.

**User actions**: gõ trong tab Chat:

```
> "Cut bỏ tất cả đoạn silence trên track audio 1"
```

**Plugin actions**:

- Phân tích audio track 1 → tìm silence segments
- Xóa segments → ripple delete (close gap)
- Report: "Đã xóa 47 đoạn silence, tổng 2:14 thời gian thừa"

**Các lệnh khác example**:

```
> "Reorder clips theo timestamp gốc trong filename"
> "Tăng speed 200% cho clip 5 đến 10"
> "Áp Cinematic LUT cho tất cả clip có chứa cảnh ngoài trời"
> "Insert title 'Welcome to Đà Lạt' ở giây 0"
> "Tìm clip có người cười + thêm vào sequence Best Moments"
```

---

### Workflow 3 — Semantic search trong footage 🔍

**Scenario**: 413 clips, không nhớ clip nào có cảnh gì.

**User actions**: tab Library → search bar

```
> "tìm cảnh hoàng hôn có biển"
```

**Plugin actions** (instant từ cache):

- Query embeddings DB (ChromaDB)
- Visual similarity + transcript matching
- Return top 10 clips với thumbnail + score

**Other queries**:

```
> "clip nào quay người chạy"
> "tìm dialogue có từ 'xin chào'"
> "lọc clip chất lượng cao + có mặt người"
```

---

### Workflow 4 — Auto color matching trong scene 🎨

**Scenario**: 8 góc quay cùng scene phòng khách, màu sắc không đồng nhất.

**User actions**:

```
1. Select 8 clip cùng scene
2. Tab Director → "Match color across selected"
3. Pick reference clip (hoặc auto)
4. Click "Apply"
```

**Plugin actions**:

- Analyze color profile mỗi clip (LAB histogram)
- Compute average + suggest adjustment per clip
- Apply Lumetri Color params (temperature, tint, exposure, contrast)
- Preview before/after

**Output**: 8 clips có màu đồng nhất, look giống nhau.

---

### Workflow 5 — Style learning + reuse 📚

**Scenario**: Bạn dựng 1 video vlog ưng ý, muốn AI học style để áp cho video sau.

**User actions**:

```
1. Mở project vlog đã dựng
2. Tab Director → "Learn this style"
3. Đặt tên: "My Vlog Style"
4. Click "Save"

Lần sau:
1. Project mới với raw footage
2. Tab Director → preset "My Vlog Style"
3. Click "Apply"
```

**Plugin actions khi học**:

- Extract patterns từ project hiện tại:
  - Average clip duration: 2.3s
  - Transition usage: 70% cuts, 20% dissolve, 10% wipe
  - LUT used: "Warm Vlog"
  - Color params: temperature +200, contrast +15
  - Music genre indicator (BPM range, key)
- Save profile JSON

**Plugin actions khi apply**:

- Director sử dụng profile như constraint
- Cut tương tự, transition tương tự, color tương tự

---

### Workflow 6 — Multi-step với checkpoint 🛑

**Scenario**: Long edit có nhiều giai đoạn, user muốn review giữa chừng.

**User actions**:

```
1. Tab Director → goal: "Edit cinema 5 phút từ raw"
2. Plugin tạo plan 12 steps
3. User uncheck step 8-12 (chỉ làm 1-7)
4. Click "Generate"
```

**Plugin actions**:

- Execute step 1-7
- Pause sau step 7 → notify user
- User xem kết quả → click "Continue" để chạy 8-12, hoặc "Adjust" để sửa plan

---

## 2. Capability matrix đầy đủ

### 2.1 Đọc / phân tích (input)

| Capability                                                | Status sau v3 | Note                   |
| --------------------------------------------------------- | :-----------: | ---------------------- |
| Đọc danh sách project, sequence, track, clip              |      ✅       | Đã xong V2             |
| Đọc metadata clip (name, duration, codec, FPS)            |      ✅       | Đã xong V2             |
| Phân tích frame quality (blur/exposure/focus/framing)     |      ✅       | Sprint B               |
| Phát hiện object trong frame (face, person, vehicle, ...) |      ✅       | Sprint B (YOLOv8 nano) |
| Phân loại scene (action / dialog / landscape / closeup)   |      ✅       | Sprint B               |
| Aesthetic score (đẹp/xấu)                                 |      ✅       | Sprint B (NIMA)        |
| Detect best take từ multiple takes                        |      ✅       | Sprint B               |
| Detect silence trong audio                                |      ✅       | Sprint C               |
| Detect beat BPM của music                                 |      ✅       | Sprint C               |
| Voice Activity Detection (dialogue vs ambient)            |      ✅       | Sprint C               |
| Transcribe dialogue (Whisper VN + EN)                     |      ✅       | Sprint C               |
| Audio quality (LUFS, clipping, noise)                     |      ✅       | Sprint C               |
| Color analysis (dominant, mood, brightness)               |      ✅       | Sprint F               |
| Embed clip vào vector DB cho semantic search              |      ✅       | Sprint A               |

### 2.2 Quyết định / suggest (AI brain)

| Capability                               | Status sau v3 | Note                                  |
| ---------------------------------------- | :-----------: | ------------------------------------- |
| Hiểu intent ngôn ngữ tự nhiên (text)     |      ✅       | Sprint E (Claude Opus)                |
| Plan multi-step edit                     |      ✅       | Sprint E                              |
| Recommend effect cho scene               |      ✅       | Sprint D                              |
| Recommend transition cho 2 clip kế nhau  |      ✅       | Sprint D                              |
| Recommend LUT cho scene                  |      ✅       | Sprint F                              |
| Pick best take từ similar takes          |      ✅       | Sprint B + E                          |
| Order clips theo narrative arc           |      ✅       | Sprint E                              |
| Match cut on beat                        |      ✅       | Sprint C + E                          |
| Suggest speed change (slow-mo / fast-mo) |      ✅       | Sprint E                              |
| Detect cảnh cần stabilize                |      🟡       | Có thể, nhưng Premiere stabilize chậm |
| Suggest background music (BPM range)     |      🟡       | Output gợi ý, không tự chọn music     |

### 2.3 Thao tác Premiere (output)

| Capability                                              | Status sau v3 | Note                  |
| ------------------------------------------------------- | :-----------: | --------------------- |
| Tạo sequence mới                                        |      ✅       | Sprint A.adapter test |
| Add clip vào track                                      |      ✅       | UXP adapter           |
| Cut clip tại timecode                                   |      ✅       | UXP adapter           |
| Trim in/out point                                       |      ✅       | UXP adapter           |
| Reorder clips                                           |      ✅       | UXP adapter           |
| Apply transition (cross-dissolve, fade, wipe, whip-pan) |      ✅       | Sprint D              |
| Apply video effect (Lumetri, blur, sharpen, ...)        |      ✅       | Sprint D + F          |
| Apply audio effect (denoise, EQ)                        |      ✅       | Sprint D              |
| Apply LUT (Lumetri)                                     |      ✅       | Sprint F              |
| Set clip speed (slow-mo, fast-mo)                       |      ✅       | UXP adapter           |
| Add marker                                              |      ✅       | UXP adapter           |
| Add title overlay (text)                                |      ✅       | UXP adapter + MOGRT   |
| Color grade per scene                                   |      ✅       | Sprint F              |
| Match color across shots                                |      ✅       | Sprint F              |
| Delete/ripple delete                                    |      ✅       | UXP adapter           |
| Insert silence                                          |      ✅       | UXP adapter           |
| Export markers as XML                                   |      🟡       | Có thể, chưa wire     |
| Render preview (export MP4)                             |      🟡       | Premiere queue API có |

### 2.4 UI capabilities

| Capability                                      | Status sau v3 | Note     |
| ----------------------------------------------- | :-----------: | -------- |
| 4 tab navigation (Director/Chat/Library/Scenes) |      ✅       | Sprint G |
| Goal selector + persona picker                  |      ✅       | Sprint G |
| Plan preview với editable steps                 |      ✅       | Sprint G |
| Progress bar + cancel button                    |      ✅       | Sprint G |
| Clip library với thumbnail grid                 |      ✅       | Sprint G |
| Semantic search bar                             |      ✅       | Sprint G |
| Scene timeline visualization                    |      ✅       | Sprint G |
| Settings panel                                  |      ✅       | Sprint G |
| Activity log với thumbnails inline              |      ✅       | Sprint G |
| Dark mode (Adobe Spectrum)                      |      ✅       | Sprint G |
| Responsive 320-800px                            |      ✅       | Sprint G |

### 2.5 Storage / state

| Capability                                     | Status sau v3 | Note                |
| ---------------------------------------------- | :-----------: | ------------------- |
| Cache clip analysis (không re-scan khi reopen) |      ✅       | Sprint A (SQLite)   |
| Vector search trên footage history             |      ✅       | Sprint A (ChromaDB) |
| Save / load style profile                      |      ✅       | Sprint E            |
| Save / load plan template                      |      ✅       | Sprint E            |
| Checkpoint plan execution (pause + resume)     |      ✅       | Sprint E            |
| Undo via Premiere native history               |      ✅       | Built-in            |
| Audit log mọi tool call                        |      ✅       | Sprint A            |

---

## 3. Cụ thể "plugin có thể tự dựng được loại video nào"

### ✅ Sẽ làm tốt (target use case)

| Loại video            | Độ tự động | Note                                          |
| --------------------- | :--------: | --------------------------------------------- |
| **Vlog du lịch**      |    90%     | Sweet spot — đa dạng clip, narrative arc rõ   |
| **Action montage**    |    85%     | Beat-cut + dynamic transitions                |
| **Wedding highlight** |    80%     | Cần curate cảm xúc cẩn thận                   |
| **Sport highlight**   |    85%     | Best moment detection từ motion + audio peaks |
| **Family memory**     |    80%     | Auto pick smiles + key moments                |
| **Product showcase**  |    75%     | Need brand guidelines manual                  |
| **Real estate tour**  |    80%     | Sequence theo room natural                    |
| **YouTube tutorial**  |    70%     | Cần script + take selection logic mạnh hơn    |

### 🟡 Sẽ làm trung bình (cần manual nhiều)

| Loại video                 | Độ tự động | Limitation                           |
| -------------------------- | :--------: | ------------------------------------ |
| **Podcast/dialogue heavy** |    50%     | Need precise jump cuts trên speech   |
| **Music video**            |    60%     | Lip-sync và choreography khó tự động |
| **Tutorial education**     |    60%     | Cần slides + screen capture handling |
| **Documentary**            |    50%     | Quá nhiều narrative judgment calls   |

### ❌ Không làm được (out of scope)

| Loại video                             | Lý do                                               |
| -------------------------------------- | --------------------------------------------------- |
| **Animation**                          | Không phải video editing — cần motion graphics tool |
| **VFX-heavy (Marvel-style)**           | Cần After Effects compositing                       |
| **Multi-cam 8+ camera live switching** | UXP API hạn chế multi-cam                           |
| **Color-graded cinema feature film**   | Cần colorist chuyên nghiệp + DaVinci                |
| **Subtitle với perfect timing**        | Whisper 85-95% accuracy chỉ                         |
| **Auto pick BG music phù hợp**         | Cần music library license                           |

---

## 4. So sánh: trước plan vs sau plan

| Khả năng                      | Trước (V2 hôm nay)     | Sau v3 (10 tuần) |
| ----------------------------- | ---------------------- | ---------------- |
| Render UI 3 tab               | ✅                     | ✅ (4 tab)       |
| Đọc clip metadata             | ✅                     | ✅               |
| WebSocket connect             | ✅                     | ✅               |
| Phân tích quality clip        | ❌                     | ✅               |
| Phát hiện scene type          | ❌                     | ✅               |
| Detect beat / silence         | ❌                     | ✅               |
| Hiểu lệnh tiếng Việt tự nhiên | ❌                     | ✅               |
| Tự ráp video từ raw           | ❌                     | ✅               |
| Recommend effect              | ❌                     | ✅               |
| Auto color grading            | ❌                     | ✅               |
| Style learning                | 🟡 (code có, untested) | ✅               |
| Semantic search clips         | ❌                     | ✅               |
| Multi-step plan execution     | ❌                     | ✅               |
| **Total real capability**     | **~10%**               | **~85-90%**      |

---

## 5. Limits không thể vượt qua (xác nhận lại)

| Limit                                 | Cause                            | Workaround                      |
| ------------------------------------- | -------------------------------- | ------------------------------- |
| Real-time effect preview trong viewer | Premiere UXP không expose render | Use thumbnail preview offline   |
| Generative video (text → video)       | Out of scope, cần Runway/Sora    | Tích hợp API sau (Phase 4+)     |
| Auto-select background music          | License + library issue          | User import + plugin sync beats |
| Perfect Vietnamese subtitle timing    | Whisper 85-95% only              | Human review required           |
| 4K real-time per-frame analysis       | RTX 2060 limit                   | Sample 1 fps thay vì 24 fps     |
| Multi-cam 8+ angle live switching     | UXP API hạn chế                  | Manual workflow                 |
| After Effects-level VFX               | Out of scope                     | User dùng AE riêng              |

---

## 6. Numeric estimates (sau khi plan xong)

| Metric                                   | Target               |
| ---------------------------------------- | -------------------- |
| **Cold start panel**                     | <3 giây              |
| **Analyze 100 clips trên RTX 2060**      | ~30 phút             |
| **Analyze 1 clip 30s on demand**         | <30 giây             |
| **LLM director plan generation**         | <30 giây             |
| **Execute plan (45 clip ráp + effects)** | ~5-10 phút           |
| **Semantic search across 1000 clips**    | <2 giây              |
| **Cost LLM per session**                 | $0.10 - $0.50        |
| **VRAM usage peak**                      | ~3-4GB               |
| **RAM usage peak**                       | ~6-8GB               |
| **Plugin size .ccx**                     | <100MB               |
| **Python sidecar size**                  | ~2-3GB (model files) |

---

## 7. Workflow comparison — bạn dựng 1 video du lịch 3 phút

### Manual (hiện tại)

```
Step 1: Import 413 clips                          5 phút
Step 2: Review từng clip để pick                  60 phút
Step 3: Drag vào timeline + cắt thô              120 phút
Step 4: Apply transitions                         30 phút
Step 5: Color grade từng clip                     90 phút
Step 6: Add titles                                20 phút
Step 7: Audio sync, level                         30 phút
Step 8: Review + tinh chỉnh                       45 phút
────────────────────────────────────────────────
Total:                                            ~6 giờ 40 phút
```

### Với DirectorAI v3

```
Step 1: Import 413 clips                          5 phút
Step 2: Tab Director → goal + persona             1 phút
Step 3: Click Generate (wait analyze)             30 phút (background)
Step 4: Review LLM plan + approve                 5 phút
Step 5: Click Execute (wait apply)                10 phút (background)
Step 6: Manual fine-tune (5-10% clips)            30 phút
Step 7: Final review                              10 phút
────────────────────────────────────────────────
Total user effort:                                ~50 phút
Total wall-clock:                                 ~1 giờ 30 phút (incl. background)
```

**Tiết kiệm 80% user effort, 75% wall-clock.**

---

## 8. Đánh giá honesty của plan

### Realistic ✅

- Tech stack đã có precedent (Python ML + LLM agent đã work ở nhiều startup)
- Hardware đủ (RTX 2060 6GB cho nano models)
- LLM Claude Opus 4.7 đủ smart cho planning
- UXP API đủ feature để execute

### Risky 🟡

- LLM cost có thể blow up nếu user gửi prompt dài → cần budget
- Vietnamese Whisper accuracy chỉ 85-95% → một số dialogue sai
- Premiere UXP API có thể break giữa versions → maintenance burden
- 10 tuần là estimate, có thể trượt 1-2 tuần

### Không realistic ❌

- "100% tự động không cần user" — không achievable, cần user judgment
- "AI cinema-grade output" — quality vẫn dưới human pro colorist
- "Works offline 100%" — LLM cần internet

---

## 9. So với target ban đầu của bạn

| 4 Mục tiêu                               |          Sau v3          |
| ---------------------------------------- | :----------------------: |
| 1. Dựng video từ tệp thô + auto effects  |        **✅ 85%**        |
| 2. Phân tích chất lượng + auto cắt + ráp |        **✅ 90%**        |
| 3. Hiểu intent ngôn ngữ tự nhiên         | **✅ 80%** (không voice) |
| 4. Auto color grading per scene          |        **✅ 80%**        |

**Coverage tổng: ~84%** (vs 26% hiện tại).

---

## 10. Câu hỏi để bạn validate plan

Đọc kỹ workflow 1-6 và capability matrix. Trả lời:

1. **Workflow nào CRITICAL cho bạn?** (1-6 hoặc khác)
2. **Capability nào bạn nghĩ BẮT BUỘC phải có mà plan chưa cover?**
3. **Capability nào trong plan bạn nghĩ KHÔNG cần (cắt được)?**
4. **Mức độ tự động bạn muốn**:
   - Full auto (plugin làm hết, user review)
   - Semi-auto (plugin suggest, user execute)
   - Manual + AI hỗ trợ (user dựng tay, AI gợi ý)

Sau khi bạn answer 4 câu trên, tôi sẽ:

- Confirm plan giữ nguyên, hoặc
- Adjust scope (cắt/thêm features)
- Cập nhật v3-master-plan.md

---

_Tài liệu này thay thế cho marketing hype. Mọi feature liệt kê đều có
acceptance criteria + sprint assignment cụ thể trong master plan._
