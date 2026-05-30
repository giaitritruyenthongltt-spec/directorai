# Hacker News — Show HN

**Title (max 80 chars):**

> Show HN: DirectorAI – AI editing copilot for Premiere Pro that
> learns your style

**URL:** https://directorai.app

**First comment (paste immediately after submitting):**

Hi HN, founder here.

DirectorAI is a UXP panel that runs inside Adobe Premiere Pro 2024+
on Windows. It looks at your active sequence, runs Whisper +
PySceneDetect + librosa + Claude Vision locally to build a
MediaContext, then emits a deterministic Plan of tool calls that
executes inside one Premiere undo group.

What makes it different from AutoEdit / AutoCut:

1. **It plans whole cuts, not just silence trims** — beat-snapped
   cuts, B-roll insertion, color grade, audio mix.
2. **It learns your style.** The Learner diffs its plan against
   your manual tweaks; after 2 matching corrections it proposes a
   StylePatch.
3. **Determinism over hype.** The cut planner is a pure function
   of (Style, MediaContext) → Plan. The LLM is an optional refiner
   pass; it never decides cuts.
4. **All local.** Your media never leaves the machine. Only an
   optional JSON plan summary goes to Claude when you've set the
   API key.

Stack: TypeScript everywhere (panel + server + workspaces), Python
sidecar for the heavy ML, MCP/WebSocket between them. Tests:
~200 unit + 7 chaos covering panel-drop, server-restart,
context-down. Bundle ~520 KB packed.

Pricing is one-time ($9.99 Basic / $109 Pro) plus a $19/mo
subscription for the upcoming style pack marketplace. 30-day
refund, no questions.

Open to feedback on anything — architecture, pricing, the cut
planner's heuristics, the Style DSL. Happy to dig into specific
files / ADRs if useful.
