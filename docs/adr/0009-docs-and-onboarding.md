# ADR-0009: Docs site + onboarding

- **Status**: Accepted
- **Date**: 2026-05-30
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

M4-γ closed the distribution loop — buy, install, activate. What
that didn't cover: how a stranger learns what to _do_ with the
panel. Section F (docs site) and Section G (onboarding) of P4 fix
that gap with as little ceremony as possible.

We deliberately rejected Docusaurus, MkDocs, and Astro for the docs
site: each adds 200+ MB of `node_modules` and a config surface that
outweighs the markdown we actually want to ship. A 200-line custom
SSG renders our 27 markdown files in 50ms and keeps the workspace
install light.

We also rejected `react-joyride` for the onboarding tour. The
library is 150 KB unminified for what's structurally a positioned
`<div>` with a highlight ring — we wrote that in 200 lines.

## Decision

### Docs site (P4.27 + P4.28 + P4.29 + P4.30)

`apps/docs-site` ships three concerns in one tree:

- **Collect (P4.27 + P4.28)** — `collect.ts` walks four sections:
  `docs/`, `docs/guides/`, `docs/architecture/`, `docs/adr/`. New
  ADRs are auto-listed; no manual sidebar to maintain.
- **Render** — `render.ts` produces HTML with marked (~50 KB),
  inline CSS, no React on the consumer side. Light/dark theme via
  `prefers-color-scheme`.
- **API reference (P4.29)** — `typedoc` runs separately into
  `dist/api/` from `packages/*/src/index.ts`. The top nav links to
  `/api/`.
- **Search (P4.30)** — `buildSearchIndex` writes a flat JSON at
  build time; a 40-line client-side script lazy-fetches and scores
  by title + body substring. No Algolia until domain (P4.39).

The dev server (`pnpm --filter @directorai/docs-site dev`) rebuilds
every request — fine because docs editors live in IDEs and refresh
the browser manually.

### First-run wizard (P4.31)

`apps/panel/src/components/FirstRunWizard.tsx` is a 4-step modal
that appears when `firstRun.status` returns `done: false`:

1. Confirm UDT + server connection.
2. Optional Anthropic API key (`firstRun.setApiKey` writes
   `~/.directorai/api-key` mode 0o600).
3. Pointer to the sample project bundle.
4. Telemetry opt-in (folds in `telemetry.consent.set` so the user
   sees one onboarding flow instead of two).

The `firstRun.markDone` RPC writes a touch-file at
`~/.directorai/first-run.done` and the wizard never re-appears.

### Sample project (P4.32)

`samples/hello-vlog/` is a self-contained mini-project: README,
manifest, style YAML, pre-computed `context.json`, and a placeholder
`media/intro.mp4.txt`. The real 4 MB media file lives on
`samples.directorai.app` (P4.39) — we don't ship binaries in git.

`pnpm bundle:sample` zips every directory under `samples/` into
`dist/installer/samples/<name>.zip` for distribution alongside the
MSI.

### Onboarding tour (P4.33)

`OnboardingTour.tsx` highlights the five key UI regions
(tabs, command bar, Style tab, Context tab, status bar) with a
positioned popover + CSS ring. Persisted via
`localStorage.directorai_tour_seen_v1`. Skippable; re-launchable
from settings.

### Tutorial scripts (P4.34)

`docs/tutorials/` contains the shooting scripts for 5 videos
(Getting Started 3', Building a Style 5', Power features 5',
Troubleshooting 3', Behind the scenes 3'). Recording is
owner-completed; the docs site auto-picks the markdown so the
scripts are discoverable even before video lands.

## Consequences

**Positive**

- One `pnpm --filter @directorai/docs-site dev` and the contributor
  has the full docs site running locally. No `npx create-anything`
  ceremony.
- First-run wizard halves the time-to-first-cut for new users —
  the API key prompt is right where they need it, not buried in
  settings.
- Tutorial scripts are version-controlled, reviewable in PRs, and
  build into the same docs deployment as the rest of the
  reference.
- The OnboardingTour module is small enough to be re-themed for
  marketing tours later (P4.39).

**Negative**

- Custom SSG = our problem to maintain. The wins (50ms build, 0 MB
  deps, full control) outweigh a few hundred lines of code we
  understand top-to-bottom.
- Tutorial videos are an owner-completed task; until recorded, the
  scripts read as plans rather than references.
- `samples.directorai.app` is a placeholder URL until the domain
  ships (P4.27 external blocker → P4.39).

**Neutral**

- The wizard's API key is plaintext on disk by design — UXP can't
  safely call the OS keychain from a panel today. A future
  hardening pass moves it behind `node-keytar` once a Node-side
  helper exists.

## Alternatives considered

1. **Docusaurus / MkDocs.** Rejected — too heavy for our content
   volume.
2. **Astro Starlight.** Considered seriously. Would have been ~80
   MB instead of Docusaurus' 200, but the same logic applies; the
   custom SSG is 200 lines.
3. **react-joyride.** Rejected — 150 KB for a positioned div.
4. **Skip the wizard, lead with the docs.** Rejected — beta users
   tell us they bounce when the panel looks empty on first open. A
   modal halves that bounce in pilot feedback.

## References

- ADR-0008 (licensing + distribution)
- `apps/docs-site/src/{collect,render,build}.ts`
- `samples/hello-vlog/`
- `docs/tutorials/`
