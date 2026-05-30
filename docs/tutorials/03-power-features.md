# 03 — Power features (5 minutes)

**Goal**: viewer learns the four flagship capabilities that separate
DirectorAI from generic auto-cut tools — beat sync, context search,
the style learner, and checkpoint/recovery.

## Cold open (0:00 – 0:20)

> "Three things make DirectorAI different. Beat-locked cuts. Search
> your footage like a database. And a learner that gets _your_ taste
> over time. Let's see them."

## Power feature 1 — Beat sync (0:20 – 1:30)

- Show a clip with music.
- Toggle `pacing.body.beatSync: true`.
- Apply and scrub: every cut lands on a beat. Show the `librosa`
  output in the Context tab — "we computed these beats from the
  audio itself."
- Compare against beat-sync off: same plan, ragged cuts.

## Power feature 2 — Context search (1:30 – 2:45)

- Switch to **Context** tab.
- Ingest a 5-minute interview clip.
- Wait for the badge: "31 segments indexed".
- Type a query: "the part where they talk about pricing".
- Hits come back with timecodes. Click one → playhead jumps to that
  point.
- Show how the natural-language command bar uses this too: "cut
  everything except the pricing part".

## Power feature 3 — Style learner (2:45 – 3:50)

- Apply the vlog style.
- Manually re-extend the hook by 50% in Premiere.
- Apply the vlog style again on a new clip.
- Open the Style tab → **Learner** subtab. Show the derived patch:
  "hook duration ×1.5 across 2 runs".
- > "The more you correct, the more the next plan matches your
  > taste."

## Power feature 4 — Checkpoint recovery (3:50 – 4:40)

- Show the chat log after an apply: "checkpointed before plan".
- Force-quit Premiere mid-plan (or just close the panel).
- Re-open the panel: the chat log says "Recovered from checkpoint
  vlog-1234 — 12s ago" (P4.07).
- Single Ctrl-Z still reverts the partial apply.

> "Reliability isn't a feature — it's why you'll trust it on real
> jobs."

## Close (4:40 – 5:00)

End card: "Troubleshooting →".
