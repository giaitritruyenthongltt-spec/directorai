# DirectorAI — fact sheet

**What it is.** A panel that lives inside Adobe Premiere Pro 2024+
and produces rough cuts automatically. Unlike generic auto-edit
tools, DirectorAI learns your editing style and reproduces it on
new footage.

**Platform.** Windows · Premiere Pro 2024+ · UXP plugin (CCX) +
local Node/Python sidecars.

**Stage.** Public v1.0 launched 2026-06-XX. Closed beta ran since
v0.5 with 20+ creators.

**Pricing.** Basic $9.99 one-time · Pro $109 one-time · Subscription
$19/mo (marketplace included once it launches).

**Differentiator.** Style Engine. DirectorAI watches the diff between
its plan and your manual tweaks, extracts patterns, applies them next
run. Two-of-N matching corrections are required before any patch
sticks — no over-fitting.

**Stack.**

- **Frontend:** UXP panel (React + TypeScript).
- **Server:** Node MCP/WebSocket relay (TypeScript).
- **Context engine:** Python (Whisper + PySceneDetect + librosa +
  Claude Vision).
- **Cut planner:** Deterministic plan builder + optional LLM
  refiner. Same input → same output.
- **All local.** Media never leaves the machine; the only network
  hop is the optional Claude API call for the refiner pass.

**Numbers (as of v1.0).**

- 199 unit tests + 7 chaos tests passing.
- ~520 KB packed CCX bundle.
- Cold start to first useful tool: < 200 ms.
- Tool call p95: < 50 ms cached, < 500 ms uncached.
- 1-hour memory soak: < 200 MB RSS.

**Founding team.** DirectorAI Inc — small studio, Vietnam +
remote. Building DirectorAI since 2026 Q2.

**Press contact.** press@directorai.app
