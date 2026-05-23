# ADR-0005: Style Engine moat — planner, executor, learner

- **Status**: Accepted
- **Date**: 2026-05-23
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

The 115-phase plan calls out the **Style Engine** (P3.\*) as
DirectorAI's competitive moat against AutoEdit, AutoCut, and similar
tools. Those tools handle generic talking-head trims; we want the
system to learn a creator's editing style and reproduce it on new
footage.

By the end of P3, we needed:

1. A deterministic, testable **Cut Planner** that turns a `Style` +
   `MediaContext` into a `Plan` of tool calls.
2. An **Executor** that runs a `Plan` against any `IPremiereAdapter`
   (mock for tests, UXP for production) inside one undo group.
3. An **LLM refiner** that improves rule-based plans without
   replacing them — falls back gracefully when no API key is set.
4. A **Style Learner** that captures the diff between the AI's output
   and the user's manual revisions, extracts patterns, and emits a
   derived style for the next run.
5. **Versioning + portability**: every style is committable, can be
   rolled back, A/B compared, exported as a `.style` file.

## Decision

Split the Style Engine into 6 layered concerns, all in
`packages/{style-engine,cut-planner,effect-library}`:

- **`@directorai/style-engine`** (Layer 2, domain)
  - `schema.ts` (Zod) + `parser.ts` (YAML) + `builtins.ts` (5 presets)
  - `learner.ts`: `snapshotSequence`, `diffSnapshots`, heuristic
    `extractPatches`, `applyPatches`, `LearnerStore`
  - `versioning.ts`: `StyleVersionStore`, `exportStyleFile`,
    `importStyleFile`, `diffStyles`, `compareStylesAB`
- **`@directorai/effect-library`** (Layer 2, domain)
  - 60 presets across transition/zoom/color/text/audio/speed/distort/
    stylize categories.
- **`@directorai/cut-planner`** (Layer 5, orchestration)
  - `planner.ts`: deterministic rule-based plan builder
  - `executor.ts`: walks a `Plan`, dispatches each step via the
    adapter dispatcher inside one undo group, returns audit trail
  - `llm-refiner.ts`: optional Claude pass over the rule-based plan
- Server-side `style-router.ts` exposes 6 RPC methods (`style.list`,
  `style.get`, `style.parse`, `style.plan`, `style.dryRun`,
  `style.apply`) so the panel and Claude Desktop can drive the
  pipeline without depending on the workspace packages directly.
- Panel `StylePicker.tsx` becomes a working editor: preset/custom
  YAML toggle, JSON context input, Plan/Dry-Run/Apply buttons, plan
  preview + execution report.

The dispatcher's `autoUndoGroup` option is set to `false` while the
executor is running so we don't double-wrap (the executor opens its
own group around the whole plan, not each step).

## Consequences

**Positive**

- The Cut Planner is fully deterministic and testable — 9 E2E tests
  cover every built-in style + custom YAML through the executor
  against the mock adapter.
- The Style Learner is a clean, swappable component: today it uses
  hand-coded heuristics (hook extension, effect removal, duration
  trimming); tomorrow we can replace `extractPatches` with an LLM
  extractor without touching consumers.
- Versioning means a style is reproducible — a user can always go
  back to the version that "worked".
- A/B compare unblocks UX experiments without bifurcating storage.

**Negative**

- We now have three layers (rules → LLM refine → execute) which is
  more surface to test. Mitigated by sharp boundaries: each layer is
  a pure function (or pure async function) with no shared state.
- The Learner's heuristics are conservative — they need at least 2
  matching runs before they patch a style. That keeps it from
  over-fitting to one user session but means cold-start needs
  several iterations to feel useful.

**Neutral**

- The 60-preset effect library is intentionally over-shipped (style
  authors only use a fraction). We trade bundle size (~3 KB of
  metadata) for creative flexibility.

## Alternatives Considered

1. **Single big planner with LLM only.** Rejected: non-deterministic,
   hard to debug, expensive per run, hard to learn from.
2. **Style as Python.** Rejected: the planner needs to ship with the
   panel in JS and consumers are TS-first. YAML is creator-friendly.
3. **Persist learner state in ChromaDB alongside embeddings.**
   Deferred — the learner currently uses an in-memory `LearnerStore`
   plus consumer-provided persistence. A future ADR will tie this to
   the project context file.

## References

- ADR-0003 (server-panel proxy)
- ADR-0004 (context-engine bridge)
- `docs/guides/style-dsl-v1.md` — the DSL spec
