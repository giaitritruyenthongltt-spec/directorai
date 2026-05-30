# hello-vlog — DirectorAI sample project

A 30-second talking-head clip + a vlog-style configuration so you can
see DirectorAI cut, beat-snap, and apply a color grade without
shooting your own footage.

## Layout

```
hello-vlog/
├── README.md           ← this file
├── manifest.json       ← sample metadata (consumed by the panel wizard)
├── styles/vlog.yaml    ← style preset, hand-edited so you can tweak
├── context.json        ← pre-computed transcript + scene + beats
└── media/
    └── intro.mp4.txt   ← placeholder; download the real clip from samples.directorai.app
```

## Why a `.txt` placeholder?

We don't ship media in the repo (binary blobs bloat clones). Once
`samples.directorai.app` is live (P4.39), the panel wizard will
download the real `intro.mp4` (≈4 MB) into this folder on demand. For
the dry-run flow you can use any 30-second clip — the
`context.json` only references _durations_, not the actual file
content.

## Try it

1. Open the panel.
2. Switch to the **Style** tab.
3. Click **Custom YAML** and paste `styles/vlog.yaml`.
4. Paste the contents of `context.json` into the Context box.
5. Click **Dry-run** to see the plan, then **Apply** to execute against
   your active Premiere sequence.

The Plan should be ~14 steps: silence trim → 2× zoom punch on
keywords ("Premiere", "AI") → beat-snapped cuts → audio fade out.
