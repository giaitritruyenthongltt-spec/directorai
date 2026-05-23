# Style DSL v1

A **Style** captures the editing intent for a piece of footage: how
fast to cut, which transitions to use, what color to grade, which
captions to overlay, when to ride the music. It's the input to the
**Cut Planner**, which turns a Style + MediaContext into a `Plan`
(sequence of tool calls).

This document is the canonical schema reference. The runtime schema
is `StyleSchema` in [`packages/style-engine/src/schema.ts`](../../packages/style-engine/src/schema.ts);
this doc explains the **why** and gives recipes.

## Goals

1. **Human-readable**: a creator can tweak a `style.yaml` without
   reading TS source.
2. **Composable**: built-in styles act as defaults; users override
   only the fields they care about.
3. **Stable across versions**: v1 fields are append-only; renames/
   removes wait for v2.
4. **Learnable**: every field can be auto-tuned by the Style Learner
   (P3.18) without rewriting the file format.

## Top-level shape

```yaml
name: My Vlog Style # required, free text
description: '' # optional, free text
version: '1.0' # DSL version pin

pacing: { ... } # P3.04 — cut cadence
effects: [...] # P3.05 — keyword/beat/silence triggers
color: { ... } # P3.09 — Lumetri + LUT
audio: { ... } # P3.10 — music gain, ducking, fades
bRoll: { ... } # P3.07 — auto B-roll insertion
text: { ... } # P3.08 — caption / MOGRT defaults

removeFillers: true # silence/filler trimming
removeSilence: true
silenceThresholdDb: -40
minSilenceSec: 0.5
```

Anything not specified inherits the corresponding field from
`VLOG_STYLE` (the conservative default).

## Sections

### `pacing` — cut cadence (P3.04)

Splits a video into 3 phases (hook / body / outro) so we can be punchy
at the open and slower in the middle:

```yaml
pacing:
  hook:
    durationSec: 3 # the first 3s of the output
    cutsPerSec: 2 # ~6 cuts in the hook
  body:
    cutsPerSec: 0.8 # 0.8 cuts per sec for the body
    beatSync: false # if true and beats are present, snap cuts to them
  outro:
    durationSec: 3
    cutsPerSec: 1.5
```

The planner uses `cutsPerSec` as a target density, not a hard rule.
Actual cut points snap to: silence boundaries → filler ends → scene
boundaries → beat positions (in order of priority).

### `effects` — triggered effects (P3.05)

Each item fires a tool call when its trigger fires:

```yaml
effects:
  - on: keyword # 'keyword' | 'noun_phrase' | 'silence' | 'scene_change' | 'beat'
    keywords: ['AI', 'plugin'] # only for keyword trigger
    action: zoom_punch # effect key in @directorai/effect-library
    durationSec: 0.4 # optional override
  - on: beat
    action: flash_cut
  - on: scene_change
    action: cross_dissolve
```

`action` resolves against the effect library — see [P3.12 preset list](#p312-effect-library-50-presets).
Unknown actions are logged + skipped, not errors.

### `color` — color grading (P3.09)

Two modes, mutually exclusive in practice:

```yaml
color:
  preset: WarmVlog # name of a Lumetri preset OR LUT
  # OR per-parameter overrides:
  exposure: 0.2
  contrast: 1.05
  highlights: -0.1
  shadows: 0.05
  saturation: 1.1
  temperature: 5500
```

### `audio` — music + dialog mix (P3.10)

```yaml
audio:
  musicBin: 'B-roll/Music' # bin name for music sources
  musicGainDb: -14 # final music level
  duckingDb: -8 # lower music by this when dialog present
  fadeInSec: 1.0
  fadeOutSec: 1.5
```

### `bRoll` — B-roll auto-insert (P3.07)

```yaml
bRoll:
  trigger: noun_phrase # 'keyword' | 'noun_phrase' | 'always'
  durationSec: 1.5
  sourceBin: 'B-roll' # where to pull B-roll from
```

If no B-roll bin exists, this is a no-op (logged warning, no failure).

### `text` — captions / MOGRT (P3.08)

```yaml
text:
  mogrt: BigBoldYellow # MOGRT template name
  fontSize: 64
  durationSec: 1.5
```

When `style.text` is set, the planner emits `text.addOverlay` steps
for every meaningful sentence. Pending the P1.17 follow-up to provide
a default MOGRT bundle.

### Silence / filler trimming

```yaml
removeFillers: true # remove 'um', 'uh', 'like', 'you know', ...
removeSilence: true
silenceThresholdDb: -40 # below this is silence
minSilenceSec: 0.5 # don't trim silences shorter than this
```

These are applied first, before any other planner step, so the
ContextEngine's segments drive the cut points.

## Defaults

The 5 built-in styles ship in [`builtins.ts`](../../packages/style-engine/src/builtins.ts):

| Built-in    | Use case                             | Hook density | Body density |
| ----------- | ------------------------------------ | ------------ | ------------ |
| `vlog`      | Talking-head vlog                    | 2.0 cuts/s   | 0.8 cuts/s   |
| `cinematic` | Cinematic narrative                  | 0.3 cuts/s   | 0.25 cuts/s  |
| `techReel`  | Short-form social, punchy zooms      | 3.0 cuts/s   | 1.5 cuts/s   |
| `podcast`   | Multi-cam podcast, silence trim only | 0.5 cuts/s   | 0.2 cuts/s   |
| `tutorial`  | Screen recording w/ callouts         | 0.5 cuts/s   | 0.4 cuts/s   |

## Learner hooks (P3.18-P3.20)

Every field is a tuneable parameter for the Style Learner. The
learner observes user edits after an AI plan runs, captures the diff,
clusters edit patterns ("user always extends hook by 50%", "user
swaps cross_dissolve for cross_zoom"), and emits a **derived style**
saved alongside the original.

Derived styles are first-class: you can pin one, A/B compare two,
or merge a derived style back into the base. See [ADR-0005] when
written.

## Validation

`parseStyle(yamlText)` returns a typed `Style` and validates:

- Required: `name`
- `removeSilence` and `removeFillers` are independent (you can keep
  silences but cut fillers)
- `pacing.hook.cutsPerSec > 0`
- `silenceThresholdDb` between -90 and 0
- Unknown top-level keys are rejected (typo guard)

## Versioning

v1.x of this DSL is **append-only**. New fields can be added; existing
fields cannot be renamed or removed until v2. A `version: '1.0'`
header is recommended but not required (parser assumes v1 when absent).

When v2 ships, a migration tool will rewrite v1 YAML files in place
preserving original intent.
