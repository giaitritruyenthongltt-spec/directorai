# DirectorAI — Phân tích trạng thái thực tế

> Viết sau khi V2 pass trên Premiere 2026 v26.0.0 — lần đầu chạy thật,
> không phải mock. Tài liệu này là **baseline** cho mọi quyết định
> nâng cấp tiếp theo.

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────────┐
│ Adobe Premiere Pro 2026                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ UXP Plugin (apps/panel)                                      │ │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │ │
│ │  │ chat tab │  │style tab │  │context   │   React + TS      │ │
│ │  └──────────┘  └──────────┘  └──────────┘                   │ │
│ │  ┌────────────────────────────────────────┐                  │ │
│ │  │ Bridge: ws-client + UXPPremiereAdapter │   ← UPDATED V2  │ │
│ │  └────────────────────────────────────────┘                  │ │
│ └──────────────────────────│──────────────────────────────────┘ │
└────────────────────────────│────────────────────────────────────┘
                             │ WebSocket ws://127.0.0.1:7778
                             │ JSON-RPC 2.0
┌────────────────────────────▼────────────────────────────────────┐
│ DirectorAI Server (apps/server)                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ MCP server + dispatcher                                   │   │
│  │  - 36 tools registered                                    │   │
│  │  - Tool calls proxied to panel's UXP adapter             │   │
│  │  - License verification, telemetry, plugins              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Routers (in-process) ──────────────────────────────────┐    │
│  │ context | telemetry | first-run | style | checkpoint    │    │
│  │ (these have own state machines, not just RPC)            │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
       │              │                │                │
       ▼              ▼                ▼                ▼
   LLM API     Context Engine      Stripe          Sentry
   (Anthropic/   (Python +         (stubbed)      (disabled)
   OpenAI/        Whisper +
   Gemini)        ChromaDB)
```

### 6 layer kiến trúc nguồn

| Layer                 | Packages                                                                | Phục vụ                                       |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| **1. Infrastructure** | `shared`, `config`, `core`                                              | Types, schema validation, error classes       |
| **2. Domain**         | `cut-planner`, `style-engine`, `effect-library`                         | Edit logic — KHÔNG biết NLE nào, NLE-agnostic |
| **3. Adapters**       | `premiere-adapter`, `davinci-adapter`                                   | Cầu nối Domain ↔ NLE thật                     |
| **4. Tooling**        | `mcp-tools`, `llm-client`, `license`, `telemetry`, `updater`            | Cross-cutting services                        |
| **5. Orchestration**  | `analytics`, `community`, `marketplace`, `teams`, `render-queue`, `sdk` | Business logic cao cấp                        |
| **6. Presentation**   | `apps/panel`, `apps/marketing`, `apps/docs-site`, `apps/mobile`         | UI cho từng user                              |

19 packages + 11 apps. **Tổng 30 modules.**

---

## 2. Cơ chế vận hành (data flow)

### A. User mở panel trong Premiere

```
1. Premiere bootstrap UXP runtime (riêng cho mỗi plugin)
2. UDT register "com.directorai.panel" với UXP service
3. User: Window → UXP Plugins → DirectorAI
4. UXP runtime mount panel/dist/index.html (iframe-like webview)
5. webpack bundle.js execute:
   - React.createRoot mount App.tsx
   - bridge/uxp-api.ts: require('premierepro') → real ppro module ✅
   - bridge/ws-client.ts: new WebSocket('ws://127.0.0.1:7778')
6. Server accept WS, send "UXP panel registered" ack
7. Footer hiện: ⚡ UXP | <project> | <sequence>
```

### B. User gõ lệnh "list clips" trong tab Chat

```
1. Panel UI: ChatInput.onSubmit("list clips")
2. Panel: nl.query → wsClient.call('nl.query', { text })
3. Server: NLQueryRouter
   - Nếu ANTHROPIC_API_KEY set → call Claude với 36 MCP tools
   - Claude decide: call tool "timeline.listClips" với params { sequenceId }
4. Server: dispatchToolCall('timeline.listClips')
   - Server KHÔNG có sequence object thật — chỉ có panel
   - Server forward request qua WS về panel:
     wsClient.send({ method: 'timeline.listClips', params })
5. Panel (bridge/ws-client onmessage):
   - dispatchRpc('timeline.listClips', params, UXPPremiereAdapter)
6. Panel: UXPPremiereAdapter.listClips()
   - getActiveProject().getActiveSequence()
   - getVideoTrack(i).getTrackItems()
   - translateTrackItem() cho mỗi item → Clip object
7. Panel send result về server: { jsonrpc, id, result: [...clips] }
8. Server forward result về Claude:
   - Claude format response cho user: "Sequence có 5 clips: ..."
9. Server send tool_result về panel UI
10. Panel render trong activity log
```

**Đây là 9 hops. Mỗi hop là 1 chỗ có thể fail.**

### C. Style learning (chưa test thật)

```
1. User đang dựng → mỗi edit action lưu vào checkpoint store
2. checkpoint.create → server lưu snapshot JSON
3. Sau khi dựng xong, user click "Learn this style"
4. server: style-engine.learn(checkpoints) → analyze patterns
   - Average clip duration
   - Transition usage histogram
   - Color grade params
5. Lưu style profile vào local store
6. Sau này user click "Apply Cinematic style" → cut-planner sinh plan
```

**Trạng thái**: code có, chưa run với data thật.

---

## 3. Trạng thái VERIFIED vs STUBBED

### ✅ Đã verify hôm nay (V2)

| Component                                      | Status | Bằng chứng                            |
| ---------------------------------------------- | ------ | ------------------------------------- |
| Panel render trong Premiere 26                 | ✅     | Screenshot footer ⚡ UXP              |
| WebSocket panel ↔ server                       | ✅     | Server log "UXP panel registered"     |
| `project.get` qua real ppro                    | ✅     | smoke trả "PHONG DEP TRUY_6_1.prproj" |
| `getActiveSequence` qua real ppro              | ✅     | smoke trả "tap 11"                    |
| UXP runtime injection `require('premierepro')` | ✅     | externals: 'commonjs2' fix            |
| Plugin manifest schema                         | ✅     | UDT accept, không lỗi                 |
| Code-split chunks                              | ✅     | `[id].chunk.js` fix                   |
| Network permissions                            | ✅     | `domains: "all"` cho phép WS          |
| License keypair generation (Ed25519)           | ✅     | .secrets/ có private+public PEM       |

### 🟡 Code hoàn chỉnh nhưng CHƯA test với data thật

| Component                  | Status      | Cần làm gì                                     |
| -------------------------- | ----------- | ---------------------------------------------- |
| `timeline.listClips`       | ⚠️ Fail     | Server dispatcher map sequenceId → adapter sai |
| Track translation          | ❓ Untested | Cần test trên sequence có clip thật            |
| Marker translation         | ❓ Untested | Premiere 26 marker API có thể khác             |
| Effect translation         | ❓ Untested | matchName logic chưa kiểm thật                 |
| Style learner              | ❓ Untested | Cần checkpoints thật từ user dựng              |
| Cut planner                | ❓ Untested | Logic OK với mock, chưa với real timeline      |
| Context engine (Python)    | ❓ Untested | Whisper + Vision chạy local, cần test pipeline |
| LLM router (Anthropic)     | ❓ Untested | Cần API key + test query thật                  |
| LLM router (OpenAI/Gemini) | ❓ Untested | Chưa có key                                    |
| Checkpoint store           | ❓ Untested | Đã unit test mock, chưa real workflow          |
| MCP tool calls (36 tools)  | ❓ Partial  | Chỉ project.get + getActiveSequence pass       |

### 🔴 Stubbed / Mock (code có, chưa wire thật)

| Component               | Trạng thái                   | Hậu quả                                                   |
| ----------------------- | ---------------------------- | --------------------------------------------------------- |
| Stripe payment          | 🔴 In-memory MemoryMailer    | Không nhận được tiền thật                                 |
| Stripe webhook          | 🔴 Stubbed signature check   | Test mode OK, live chưa                                   |
| Code signing            | 🔴 Stub (P4.23)              | Plugin không sign → end-user không double-click .ccx được |
| Sentry crash report     | 🔴 DSN rỗng                  | Production crashes mất luôn                               |
| Telemetry backend       | 🔴 Local file only           | Không aggregate được                                      |
| Auto-updater feed       | 🔴 No endpoint               | Update có code nhưng không có server feed                 |
| Adobe Exchange listing  | 🔴 Chưa submit               | User phải tự cài via UDT                                  |
| Marketplace (plugins)   | 🔴 In-memory only            | Sprint 11 — registry không persist                        |
| Teams collaboration     | 🔴 In-memory only            | Sprint 12 — session không persist                         |
| Cloud render            | 🔴 Local queue stub          | Sprint 13 — không có worker thật                          |
| Review workflow         | 🔴 In-memory only            | Sprint 14 — comments không sync                           |
| Mobile companion app    | 🔴 Expo code, no backend     | Sprint 15 — chưa wire vào server                          |
| DaVinci Resolve adapter | 🔴 Pure stub                 | Sprint M5-M — chỉ có class skeleton                       |
| MSI installer (Windows) | 🔴 WiX config có, chưa build | P4.24 — chưa generate .msi thật                           |
| Python sidecar bundler  | 🔴 Có script, chưa test      | P4.25                                                     |

---

## 4. Reality check

### v2.0.0 GA tag có nghĩa gì?

Tag `v2.0.0` được dán khi **115/115 phase done, 329 tests pass**. Nghĩa là:

- ✅ Code đã viết
- ✅ Unit tests pass against MOCK adapters
- ✅ Type-check + lint sạch
- ❌ KHÔNG có nghĩa "production-ready"
- ❌ KHÔNG có nghĩa "verified với Premiere thật"

V2 hôm nay là **lần đầu** plugin chạy trên Premiere thật. Đã hit 8 bugs ngay
trong 2-3 giờ debug. Theo Sprint Verification predict: "Expected: 3-5 bugs
on first load" — chúng ta thực tế gặp 8, ở tầm trên trung bình.

### Plugin LÀM ĐƯỢC gì NGAY BÂY GIỜ (verified):

1. ✅ Load vào Premiere 2026 v26.0.0+ qua UDT
2. ✅ Render UI 3 tabs (chat/style/context)
3. ✅ Connect WebSocket đến server
4. ✅ Hiển thị tên project + sequence active
5. ✅ Onboarding tour 5 bước

### Plugin LÀM ĐƯỢC gì khi fix M5/M6 polish (ước tính ~2-3 ngày work):

6. ⏳ List clips trong sequence
7. ⏳ Get clip metadata (name, duration, source)
8. ⏳ Run command via Chat tab → execute trên Premiere
9. ⏳ Add transitions / cuts
10. ⏳ Reorder clips
11. ⏳ Apply effects

### Plugin CẦN integration để hoạt động (nhưng bạn skip):

12. ❌ Bán license — cần Stripe (skip)
13. ❌ Public landing page — cần Domain (skip)
14. ❌ Crash report tự động — cần Sentry (optional)
15. ❌ Auto-update silent — cần Releases hosting (V1 đã có, cần wire updater)

### Plugin CẦN dev work nhiều (theo Sprint nhưng chưa wire thật):

16. ❌ DaVinci support (Sprint M5-M chỉ là stub)
17. ❌ Marketplace cho 3rd party plugins (Sprint 11 in-memory)
18. ❌ Teams real-time collab (Sprint 12 in-memory)
19. ❌ Cloud render thật (Sprint 13 cần worker farm)
20. ❌ Mobile companion (Sprint 15 cần backend wire)

---

## 5. Kế hoạch nâng cấp (redefined cho Internal Team)

### Phase 1 — Make it actually usable (1 tuần)

**Mục tiêu**: Team member có thể mở panel + gõ lệnh + thấy plugin thao tác Premiere THẬT.

#### 1.1 Fix UXP API surface (M5/M6 polish) — 2-3 ngày

- [ ] `timeline.listClips` server dispatcher fix
- [ ] safeAsync wrapper cho 100% method calls trong UXP adapter
- [ ] Test translation trên sequence có clip thật
- [ ] Marker, effect, transition translation
- [ ] Error logging trong panel UI (hiện error rõ ràng)
- [ ] Smoke-uxp pass 100% các method

#### 1.2 LLM integration thật — 1 ngày

- [ ] Anthropic API key wire (bạn cung cấp)
- [ ] Test "list clips" Chat command end-to-end
- [ ] Test "cut at silence" với clip thật
- [ ] Token usage tracking

#### 1.3 Context engine test — 1 ngày

- [ ] Python sidecar (Whisper + ChromaDB) chạy local
- [ ] Index 1 project có 10 clip → verify embeddings
- [ ] Test semantic search "find shots with people"

#### 1.4 Style learning thật — 1 ngày

- [ ] Capture checkpoints từ user dựng 1 video 5 phút
- [ ] Style analyzer chạy → extract patterns
- [ ] Apply learned style lên project mới

**Exit criteria Phase 1**: tự bạn dựng được 1 video bằng tay + DirectorAI hỗ trợ (chat command, context search, style suggestions) end-to-end.

---

### Phase 2 — Internal team deploy (3-5 ngày)

**Mục tiêu**: 3-5 team member cài + dùng trên máy họ.

#### 2.1 Build distribution kit

- [ ] Build final `.ccx` với manifest, icons, bundle final
- [ ] Test cài bằng double-click .ccx (no UDT needed)
- [ ] Viết `docs/guides/internal-install.md` step-by-step (5 phút/máy)

#### 2.2 Internal server hosting

- [ ] Decide host: máy bạn / Tailscale / LAN / cloud VM
- [ ] Server config production mode
- [ ] Setup auto-start (Windows service / systemd)
- [ ] Backup config + telemetry

#### 2.3 License issuance cho team

- [ ] Script `pnpm license:issue --team` batch issue
- [ ] Distribute license file cho từng member
- [ ] License verification offline (no internet needed)

#### 2.4 Team onboarding

- [ ] Internal docs portal (markdown trên GitHub đủ)
- [ ] Video demo 5 phút (record + share)
- [ ] Slack/Discord channel cho team báo bug

**Exit criteria Phase 2**: 3-5 team member cài thành công + dùng plugin
ít nhất 1 lần/tuần trong 2 tuần.

---

### Phase 3 — Stabilize from team feedback (2-4 tuần)

**Mục tiêu**: Plugin ổn định với usage thật, ít regression.

- [ ] Setup Sentry (V3) để collect crashes từ team
- [ ] Weekly bug triage từ Sentry + team report
- [ ] Iterate fix → release .ccx mới (manual via Slack)
- [ ] Performance profiling với usage thật (cold-start, memory)

**Exit criteria Phase 3**: 90%+ commands chạy không lỗi trên team data thật.

---

### Phase 4 — Optional public release (sau Phase 3)

Nếu sau Phase 3 plugin ổn định + team thấy useful, có thể public:

- [ ] V5 Stripe (chỉ nếu muốn bán)
- [ ] V6 Domain (cho marketing site + API host)
- [ ] Code signing cert ($200/yr)
- [ ] Adobe Exchange submit (2-4 tuần review)
- [ ] Marketing site launch
- [ ] Beta program 50 user

**Exit criteria Phase 4**: 1 paying customer hoặc 50 free beta user active.

---

## 6. Khuyến nghị action ngay

1. **Tôi:** Phase 1.1 (UXP API surface fix) — autonomous, ~2-3 ngày
2. **Bạn:** Cung cấp Anthropic API key để tôi wire Phase 1.2
3. **Bạn:** List team member dự kiến (số lượng + role) — để tôi plan Phase 2 đúng size

Skip toàn bộ V5/V6 logistics đến Phase 4 (nếu có).

---

_Last updated: 2026-06-01 sau khi V2 pass + V1 push GitHub._
_Diagram dùng `docs/architecture/_.md` cho chi tiết từng layer.\*
