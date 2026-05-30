# 05 — Behind the scenes (3 minutes)

**Goal**: viewer walks away understanding the layered architecture —
why "the AI cut" is actually a small LLM call plus a lot of
deterministic plumbing.

## Cold open (0:00 – 0:15)

> "DirectorAI doesn't 'use AI' for the cuts. Most of the magic is a
> rule planner. Here's what the pipeline actually does."

## Layer 1 — Context engine (0:15 – 0:55)

- Open the architecture diagram (in `docs/architecture/overview.md`).
- Highlight Python sidecar: Whisper for transcribe, PySceneDetect
  for scenes, librosa for beats, Claude Vision for shot analysis.
- > "All of that is local. We never upload your media."

## Layer 2 — Cut planner (0:55 – 1:35)

- Show `packages/cut-planner/src/planner.ts` briefly.
- > "Given a style and a context, the planner emits a deterministic
  > list of tool calls. Same input → same output, every time."
- Contrast: pure-LLM editors are non-deterministic and expensive.

## Layer 3 — LLM refiner (1:35 – 2:10)

- The optional Claude pass that _re-orders and tunes_ the rule-based
  plan. Falls back to rules-only when no API key.
- > "We use AI where it adds judgement, not where determinism is
  > cheaper."

## Layer 4 — Executor + checkpoint (2:10 – 2:40)

- Each plan runs inside one undo group → single Ctrl-Z reverts the
  whole apply.
- A checkpoint is snapped before every apply (P4.06) — the panel
  recovers from crashes automatically.

## Close (2:40 – 3:00)

> "Modular, deterministic, learnable. That's why DirectorAI scales
> from a 30-second sample to a 90-minute documentary. Thanks for
> watching — see you in Discord."

End card: `directorai.app/discord`.
