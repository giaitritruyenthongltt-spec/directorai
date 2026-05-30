# P4 — Polish & Beta (42 fine-grained phases)

Status as of 2026-05-30. Source-of-truth ticket list for the run-up to
`v1.0.0`. Every phase is independent and has a deliverable, an
acceptance test, and a rollback. Sections finish at a MILESTONE tag +
ADR.

Roadmap context: see [`roadmap.md`](./roadmap.md). Launch context: see
[`launch-checklist.md`](./launch-checklist.md). Platform context (P5):
see [`platform-plan.md`](./platform-plan.md).

## Snapshot

| Macro  | Phases | Status         | Tag                                  |
| ------ | ------ | -------------- | ------------------------------------ |
| P0     | 20     | ✅ Done        | `v0.1.0-foundation`                  |
| P1     | 25     | 🟢 Live        | `v0.2.1-control-live`                |
| P2     | 20     | 🟢 Live        | `v0.3.1-context-live`                |
| P3     | 25     | 🟢 Live        | `v0.4.1-style-live`                  |
| **P4** | **42** | 🟠 In progress | M4-α / M4-β / M4-γ / M4-δ / **M4-Ω** |
| P5     | 10     | 🔴 Plan only   | —                                    |

## A. Reliability & UX hardening — `v0.5.0-reliable` (M4-α)

| ID    | Title                      | Deliverable                                                                            | Test                                       | Rollback              |
| ----- | -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------- |
| P4.01 | Panel cold-start profiling | `tools/perf-bench.ts` measures time-to-first-tool; baseline in `docs/perf-baseline.md` | Baseline numbers committed                 | revert                |
| P4.02 | Progress bus (server)      | `EventEmitter` emits `progress.update` / `progress.cancel` over WS                     | Unit test: emit → subscribe                | env `PROGRESS_BUS=0`  |
| P4.03 | Cancellable ops API        | `dispatchRpc(opts:{signal})` threads `AbortSignal` into executor                       | Integration: cancel mid-plan → rollback OK | env `CANCELLABLE=0`   |
| P4.04 | Progress UI components     | `<ProgressBar/>` + `<CancelButton/>` in panel; subscribe to bus                        | UI shows %, cancel button works            | revert components     |
| P4.05 | WS reconnect state machine | Backoff 1s→30s + heartbeat 25s                                                         | Mock drop → reconnect ≤ 30s                | keep old logic        |
| P4.06 | Checkpoint store           | Snapshot sequence → `~/.directorai/checkpoints/`; restore API                          | Save & restore round-trip                  | delete folder         |
| P4.07 | Panel crash recovery       | Detect lost socket → restore last checkpoint into UI                                   | Kill panel mid-plan → state correct        | flag `CHECKPOINT_OFF` |
| P4.08 | Chaos test suite           | `tests/chaos/*` — kill server, panel, context                                          | 3 scenarios pass, no orphan state          | skip suite            |

## B. Observability — `v0.6.0-observable` (M4-β)

| ID    | Title                    | Deliverable                                                 | Test                          | Rollback      |
| ----- | ------------------------ | ----------------------------------------------------------- | ----------------------------- | ------------- |
| P4.09 | Sentry server            | `@sentry/node` init with DSN per env                        | Test error visible in Sentry  | empty DSN     |
| P4.10 | Sentry panel             | `@sentry/browser` init in UXP shell                         | UI error visible in Sentry    | empty DSN     |
| P4.11 | Source-map upload        | Webpack plugin uploads maps on `pnpm release`               | Stack trace symbolicated      | drop plugin   |
| P4.12 | Telemetry events catalog | `packages/telemetry/src/events.ts` — Zod schema ≤ 20 events | Typecheck + schema test green | drop package  |
| P4.13 | Opt-in + GDPR delete     | First-run consent + `/telemetry/delete?userId=`             | E2E: opt-out → 0 events sent  | force opt-out |

## C. Performance budget

| ID    | Title                 | Deliverable                                | Test                          | Rollback      |
| ----- | --------------------- | ------------------------------------------ | ----------------------------- | ------------- |
| P4.14 | Cold-start < 2s       | Code-split bundle, lazy Style tab          | Lighthouse perf ≥ 90          | revert split  |
| P4.15 | Tool call p95 < 500ms | Cache `project_get`, batch `listClips`     | bench 1000 calls: p95 < 500ms | disable cache |
| P4.16 | Memory < 200MB / 1h   | Heap audit, fix ChatLog / checkpoint leaks | 1h soak < 200MB               | n/a           |

## D. Licensing & monetization

| ID    | Title                     | Deliverable                                    | Test                         | Rollback        |
| ----- | ------------------------- | ---------------------------------------------- | ---------------------------- | --------------- |
| P4.17 | License data model        | `packages/license/src/{key,verify}.ts` Ed25519 | Sign + verify unit           | drop package    |
| P4.18 | Stripe products + webhook | 3 SKUs + `/webhook/stripe`                     | Test mode purchase → key     | disable webhook |
| P4.19 | Key issuing pipeline      | Email key after successful webhook             | Sandbox purchase → email     | manual issue    |
| P4.20 | Offline grace 7 days      | Cache last verify; allow if < 7d offline       | Mock clock +6d ok, +8d block | grace = ∞       |
| P4.21 | License portal            | Mini Next.js `portal.directorai.app`           | Login + revoke E2E           | disable portal  |

## E. Installer & update — `v0.7.0-installable` (M4-γ)

| ID    | Title                  | Deliverable                                    | Test                         | Rollback        |
| ----- | ---------------------- | ---------------------------------------------- | ---------------------------- | --------------- |
| P4.22 | UXP CCX bundle         | `pnpm bundle:ccx` → `.ccx` file                | UDT loads CCX OK             | manifest.json   |
| P4.23 | Code signing           | Adobe + Authenticode on CCX + MSI              | No SmartScreen warning       | unsigned dev    |
| P4.24 | Windows MSI (WiX)      | `installer/wix/DirectorAI.wxs`                 | Fresh Win11 VM install + run | manual zip      |
| P4.25 | Python sidecar bundler | MSI detects/installs Python 3.11               | VM no-Python → installed     | manual prompt   |
| P4.26 | Auto-update            | `@directorai/updater` background DL + rollback | Mock new version → updated   | disable updater |

## F. Documentation site

| ID    | Title                     | Deliverable                              | Test               | Rollback     |
| ----- | ------------------------- | ---------------------------------------- | ------------------ | ------------ |
| P4.27 | Docusaurus bootstrap      | `apps/docs-site` → `docs.directorai.app` | Build pass         | README       |
| P4.28 | ADR publishing automation | `pnpm docs:adr` copies `docs/adr/*`      | New ADR appears    | manual copy  |
| P4.29 | TypeDoc API reference     | Auto-gen from `packages/*/src/index.ts`  | API page populated | drop TypeDoc |
| P4.30 | Algolia DocSearch         | Crawler + search box                     | Query → results    | disable      |

## G. Onboarding & tutorials

| ID    | Title                  | Deliverable                                       | Test                         | Rollback      |
| ----- | ---------------------- | ------------------------------------------------- | ---------------------------- | ------------- |
| P4.31 | First-run wizard       | Detect UDT, prompt key, link sample               | Fresh install → wizard shows | skip flag     |
| P4.32 | Sample project bundle  | `samples/hello-vlog.zip` (video + B-roll + style) | Download + ingest pass       | remove sample |
| P4.33 | In-app onboarding tour | `react-joyride` 5-step                            | Skip & complete flows        | disable tour  |
| P4.34 | 5 tutorial videos      | Scripts + recordings                              | Uploaded YouTube unlisted    | link later    |

## H. Beta program — `v0.9.0-beta` (M4-δ)

| ID    | Title               | Deliverable                            | Test                   | Rollback     |
| ----- | ------------------- | -------------------------------------- | ---------------------- | ------------ |
| P4.35 | Beta landing page   | `beta.directorai.app` form             | Test submit → email    | Google Form  |
| P4.36 | Discord workspace   | Server + welcome bot + channels        | Invite link works      | skip Discord |
| P4.37 | Weekly survey loop  | Cron survey Friday → Notion            | 1 full cycle           | manual send  |
| P4.38 | Bug triage workflow | GitHub Projects board + P0/P1/P2 + SLA | 10 sample bugs triaged | freeform     |

## I. Public launch — `v1.0.0` (M4-Ω)

| ID    | Title                   | Deliverable                                  | Test                   | Rollback       |
| ----- | ----------------------- | -------------------------------------------- | ---------------------- | -------------- |
| P4.39 | Marketing site          | `directorai.app` Next.js (Hero/Pricing/Demo) | Lighthouse perf ≥ 90   | redirect GH    |
| P4.40 | Press kit + demo reel   | `press/` + Notion press page                 | Journalist test access | drop press kit |
| P4.41 | Stripe live-mode switch | Test → live + final QA $0.50 purchase        | 1 real purchase OK     | revert keys    |
| P4.42 | **Launch day**          | HN + Twitter + Reddit + support inbox        | Post live, monitoring  | post tomorrow  |

## New packages introduced in P4

```
packages/telemetry          (P4.12)
packages/license            (P4.17)
packages/updater            (P4.26)
apps/portal                 (P4.21)  Next.js
apps/docs-site              (P4.27)  Docusaurus
apps/marketing              (P4.39)  Next.js
installer/wix               (P4.24)  WiX MSI source
samples/hello-vlog          (P4.32)
press/                      (P4.40)
```

`telemetry` / `license` / `updater` sit in Layer 1 (Infrastructure).
`portal` / `docs-site` / `marketing` sit in Layer 6 (Presentation) —
they import from packages, packages never import from them. The
6-layer dependency rule from [`directorai-architecture`](../../) holds.

## Sprint ordering

```
Sprint 1: A (P4.01-08)
Sprint 2: B + C (P4.09-16)
Sprint 3: D + E (P4.17-26)   parallel
Sprint 4: F + G (P4.27-34)   parallel
Sprint 5-6: H + I (P4.35-42) beta 2 wk, launch wk 8
```

## External blockers (owner-completed, not code)

| #   | Phase         | Action                             | Needed before |
| --- | ------------- | ---------------------------------- | ------------- |
| 1   | P4.18         | Create Stripe account + verify     | Sprint 3      |
| 2   | P4.23         | Buy Authenticode cert (~$200/yr)   | Sprint 3      |
| 3   | P4.27         | Register domain `directorai.app`   | Sprint 4      |
| 4   | P4.34         | Record 5 tutorial videos (or hire) | Sprint 4      |
| 5   | P4.36         | Create Discord server + bot token  | Sprint 5      |
| 6   | P4.04 + P4.13 | Privacy policy review (legal)      | Sprint 6      |
