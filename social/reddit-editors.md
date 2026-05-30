# r/editors

**Title:**

> Built a Premiere Pro plugin that learns your editing style and
> drafts rough cuts. Looking for honest feedback.

**Flair:** TUTORIAL / RESOURCE

**Body:**

Hey r/editors,

I've spent the last 8 months building DirectorAI — a UXP panel that
lives inside Premiere Pro 2024+ and produces rough cuts based on a
style file you write (or it learns from your manual corrections).

Quick demo (60s, no narration): [reel link]

**Why I built it.** Existing AI editors trim silences in
talking-heads. I edit a lot of vlog + tech reels and I wanted
something that handled the whole cut: silence trim, beat-snapped
cuts, B-roll on keywords, color grade, audio fade — in one apply,
inside one Premiere undo group.

**How it works.**

1. **Context engine** (Python sidecar) — Whisper transcribe,
   PySceneDetect scenes, librosa beats, Claude Vision shot tags.
   All local, your media never uploads.
2. **Cut planner** (deterministic) — turns a style + that context
   into a Plan of tool calls.
3. **Style Engine** — the moat. Watches your post-apply tweaks,
   extracts patterns, derives a StylePatch next run.

**Pricing.** Basic $9.99 / Pro $109 (both one-time, include 1-2 yr
updates) / Subscription $19/mo for the upcoming style marketplace.
30-day refund.

**What I want from you.** Tear it apart. What would break your
workflow? Which features are over-thought? Where do you wish I
hadn't asked you to pay?

**Caveats.** Windows-only at v1. Premiere Pro 2024+. macOS DMG is
on the post-launch list. Open source SDK is coming.

Site: directorai.app
Discord: discord.gg/directorai
