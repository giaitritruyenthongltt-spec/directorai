# 02 — Building a Style (5 minutes)

**Goal**: viewer authors a `vlog.yaml` from scratch, runs it on
their own footage, and learns which knobs to turn for different
output.

## Cold open (0:00 – 0:15)

> "Built-in styles are nice. Your style — punchier hook, slower body,
> snappy outro — is why DirectorAI exists. Let's write one."

Split screen: a creator-style cut on the left, raw footage on the
right.

## Step 1 — The Style DSL (0:15 – 1:15)

- Open `docs/guides/style-dsl-v1.md` in the docs site (P4.27).
- Walk through the five sections: `pacing`, `effects`, `color`,
  `audio`, `text`.
- Highlight: every field has a default; you only override what you
  care about.

## Step 2 — Author the YAML (1:15 – 2:45)

- In the Style tab, switch to **Custom YAML**.
- Type out (or paste):

  ```yaml
  name: punchy-hook
  pacing:
    hook: { durationSec: 4, cutsPerSec: 2.5 }
    body: { cutsPerSec: 0.6, beatSync: true }
    outro: { durationSec: 2, cutsPerSec: 1.0 }
  effects:
    - on: keyword
      keywords: [important, listen]
      action: zoom_punch
  removeFillers: true
  removeSilence: true
  ```

- Show the validation error when you typo a field — `parseStyle` rejects
  unknown keys to catch typos.

## Step 3 — Dry-run + iterate (2:45 – 4:00)

- Click **Dry-run**.
- Read the plan: count the cuts in the hook (~10 in 4 seconds).
- Change `cutsPerSec` to 1.5; dry-run again; show fewer cuts.

> "This loop — edit, dry-run, edit — is the workflow. Apply only when
> you're happy."

## Step 4 — Save + share (4:00 – 4:45)

- Click **Export .style**.
- Show the resulting YAML file.
- Mention: share with a teammate, commit to git, sell on the
  marketplace (P5.02).

## Close (4:45 – 5:00)

> "Once you've got a style you love, the next video covers the power
> features — beat snap, B-roll, color presets."

End card: "Power features →".
