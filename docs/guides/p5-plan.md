# P5 — Scale & Expand (35 fine-grained phases)

Status as of v1.0.0. P5 is intentionally **ongoing** — unlike P4 there
is no single "Ω" tag at the end. Each Section ships independently and
gets its own milestone tag in the `v1.x.0-*` series.

Roadmap context: see [`roadmap.md`](./roadmap.md). Architecture
context: see [`../architecture/overview.md`](../architecture/overview.md).
Coarse P5 plan (the 10 phases) is the source for this breakdown:
see [`platform-plan.md`](./platform-plan.md).

## Snapshot

| Macro                   | Sub-phases | Milestone tag        | External blocker           |
| ----------------------- | ---------- | -------------------- | -------------------------- |
| **J** Plugin SDK        | 5          | `v1.1.0-sdk`         | none (pure code)           |
| **K** Style Marketplace | 6          | `v1.2.0-marketplace` | Stripe Connect + legal     |
| **L** DaVinci adapter   | 4          | `v1.3.0-davinci`     | DaVinci Resolve install    |
| **M** Multi-LLM router  | 4          | `v1.4.0-multi-llm`   | OpenAI + Gemini API keys   |
| **N** Cloud render      | 4          | `v1.5.0-cloud`       | Modal/Fly.io GPU + bill    |
| **O** Team workspaces   | 4          | `v1.6.0-teams`       | Postgres + auth provider   |
| **P** Review workflow   | 3          | `v1.7.0-review`      | Slack workspace (opt)      |
| **Q** Mobile companion  | 3          | `v1.8.0-mobile`      | RN tooling + signing certs |
| **R** Creator analytics | 2          | `v1.9.0-analytics`   | none                       |
| **S** v2.0.0 GA         | 2          | **`v2.0.0`**         | all of P5 ready            |

Total **35 sub-phases** across 10 Sections. Order is suggested,
not strict — J, M, R have no external blockers and can start
immediately.

---

## Section J — Plugin SDK (P5.01) → `v1.1.0-sdk`

| ID     | Title                           | Deliverable                                                                                              | Test                      | Rollback              |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------- |
| P5.01a | Public surface freeze           | ADR-0012 picks which packages become public SDK; rest stay internal.                                     | ADR accepted              | revert ADR            |
| P5.01b | `@directorai/sdk` skeleton      | New package re-exports public types + helper factories; semver tracked separately.                       | typecheck + 5 smoke tests | drop package          |
| P5.01c | Plugin manifest schema          | `@directorai/sdk` exports `PluginManifestSchema` (Zod) — id, name, version, entry, permissions.          | manifest validation tests | revert schema         |
| P5.01d | Plugin sandbox / runtime        | `apps/server` loads `plugins/*` via `loadPlugin(manifest)`; permission-gated adapter access.             | sandbox isolation test    | disable plugin loader |
| P5.01e | Versioning + deprecation policy | `docs/guides/sdk-versioning.md` (semver + 2-version deprecation notice); CI guard checks public surface. | CI runs surface diff      | drop CI guard         |

## Section K — Style Pack Marketplace (P5.02) → `v1.2.0-marketplace`

| ID     | Title                                | Deliverable                                                              | Test                 | Rollback         |
| ------ | ------------------------------------ | ------------------------------------------------------------------------ | -------------------- | ---------------- |
| P5.02a | Marketplace data model               | `packages/marketplace`: Pack, Author, Review, Sale Zod schemas.          | schema tests         | drop package     |
| P5.02b | Marketplace backend API              | `apps/marketplace-api` Node HTTP: list/get/buy/install endpoints.        | 12+ E2E tests        | revert app       |
| P5.02c | Marketplace UI                       | New panel tab + `apps/marketplace-web` browse/search/preview.            | UI smoke tests       | drop tab         |
| P5.02d | Purchase flow (Stripe Connect 70/30) | Stripe Connect Express accounts for creators; 70/30 split at sale time.  | sandbox purchase E2E | disable purchase |
| P5.02e | 1-click pack installer               | Panel: install pack from marketplace → user style library on disk.       | install + verify     | manual download  |
| P5.02f | Featured curation                    | Monthly editorial flag in the data model; admin RPC + simple admin page. | curation test        | disable feature  |

## Section L — DaVinci Resolve adapter (P5.03) → `v1.3.0-davinci`

| ID     | Title                                     | Deliverable                                                                             | Test                     | Rollback          |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------ | ----------------- |
| P5.03a | Rename `IPremiereAdapter` → `INLEAdapter` | Keep alias for back-compat; touch ~12 files.                                            | full test suite green    | revert rename     |
| P5.03b | `@directorai/davinci-adapter` scaffold    | New package, mirrors structure of `@directorai/premiere-adapter`.                       | mock adapter tests       | drop package      |
| P5.03c | DaVinci API mapping                       | Map the 28+ RPC methods to DaVinci's Python scripting bridge via a Node IPC shim.       | mock + integration tests | disable adapter   |
| P5.03d | Factory detects host NLE                  | `createAdapter(host)` picks `uxp` / `davinci` / `mock`. Boot detection via env + probe. | factory selection tests  | hardcode Premiere |

## Section M — Multi-LLM router (P5.04) → `v1.4.0-multi-llm`

| ID     | Title                        | Deliverable                                                                                             | Test               | Rollback        |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------ | --------------- |
| P5.04a | Router architecture refactor | Extend `@directorai/llm-client` with `LLMProvider` interface; existing `anthropic.ts` becomes one impl. | interface test     | revert refactor |
| P5.04b | OpenAI adapter               | `OpenAIProvider` against the OpenAI Chat Completions API.                                               | mocked + live test | drop adapter    |
| P5.04c | Gemini adapter               | `GeminiProvider` against Google's Generative Language API.                                              | mocked + live test | drop adapter    |
| P5.04d | BYOK + routing rules         | Per-user API key config; routing rules (primary Claude, fallback GPT, cheap-task Haiku/Mini).           | routing tests      | disable BYOK    |

## Section N — Cloud render service (P5.05) → `v1.5.0-cloud`

| ID     | Title                           | Deliverable                                                                              | Test                    | Rollback          |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------- | ----------------- |
| P5.05a | Render worker container         | Dockerfile bundles `apps/context-engine` + GPU torch wheels.                             | container build + smoke | revert Dockerfile |
| P5.05b | Job queue + dispatcher          | `packages/render-queue`: enqueue, poll, cancel; pluggable backend (in-mem / Redis).      | queue tests             | drop package      |
| P5.05c | Privacy plumbing                | Media never persists on worker; sha256-content-addressed temp paths; auto-purge on done. | privacy assertion tests | flag `CLOUD_OFF`  |
| P5.05d | Per-minute billing pass-through | Worker reports CPU/GPU-minutes; Stripe usage records.                                    | billing recon test      | disable cloud     |

## Section O — Team workspaces (P5.06) → `v1.6.0-teams`

| ID     | Title                         | Deliverable                                                                                      | Test                     | Rollback            |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ | ------------------- |
| P5.06a | Workspace data model          | `packages/teams`: Workspace, Member, Role, Invite Zod schemas + Postgres migrations.             | schema + migration tests | drop package        |
| P5.06b | Style sync via central server | `apps/sync-server` Node: push/pull per workspace; conflict resolution last-write-wins + history. | sync E2E tests           | revert app          |
| P5.06c | Permission model              | `viewer` / `editor` / `admin` roles; enforced server-side; UI hides forbidden actions.           | permission matrix tests  | flag everyone admin |
| P5.06d | Workspace switcher in panel   | Panel UI lists workspaces; switch wipes local cache + re-syncs.                                  | UI test                  | hide switcher       |

## Section P — Review / approve workflow (P5.07) → `v1.7.0-review`

| ID     | Title                       | Deliverable                                                              | Test                       | Rollback       |
| ------ | --------------------------- | ------------------------------------------------------------------------ | -------------------------- | -------------- |
| P5.07a | Side-by-side compare        | Panel: current sequence vs proposed plan thumbnail diff.                 | diff render test           | hide compare   |
| P5.07b | Inline comments at timecode | `packages/teams` adds CommentSchema; panel pin overlays per timecode.    | comment CRUD tests         | drop comments  |
| P5.07c | Notification system         | Email (Postmark) + Slack webhook on review request / approval / changes. | notification dispatch test | disable notifs |

## Section Q — Mobile companion (P5.08) → `v1.8.0-mobile`

| ID     | Title                     | Deliverable                                                 | Test           | Rollback           |
| ------ | ------------------------- | ----------------------------------------------------------- | -------------- | ------------------ |
| P5.08a | RN shell (iOS + Android)  | `apps/mobile` Expo bare-workflow; login + workspace picker. | RN smoke tests | drop app           |
| P5.08b | Read-only project view    | Pull project + active sequence summary from server; render. | RN render test | hide tab           |
| P5.08c | Style YAML edit + preview | Mobile YAML editor; preview impact via `style.dryRun` RPC.  | mobile E2E     | read-only fallback |

## Section R — Creator analytics (P5.09) → `v1.9.0-analytics`

| ID     | Title                  | Deliverable                                                                               | Test                 | Rollback             |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------- | -------------------- | -------------------- |
| P5.09a | Per-style usage stats  | Anonymised aggregates from the telemetry sink: apply count, ok/error rate, mean duration. | aggregator tests     | hide stats           |
| P5.09b | Recommendations engine | "Users who like style X also like Y" via simple co-occurrence; surfaces in marketplace.   | recommendation tests | drop recommendations |

## Section S — v2.0.0 GA (P5.10) → **`v2.0.0`**

| ID     | Title                                         | Deliverable                                                                         | Test                  | Rollback      |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------- | ------------- |
| P5.10a | v2 beta — workspace + marketplace soft-launch | Closed beta of teams + marketplace; 5-10 studio testers.                            | beta sign-off         | extend beta   |
| P5.10b | **v2.0.0 release**                            | All Sections (J–R) GA. Marketing site + press kit refresh. Migration guide v1 → v2. | launch checklist done | post tomorrow |

---

## New packages / apps introduced in P5

```
packages/
├── sdk                    (P5.01b)
├── marketplace            (P5.02a)
├── davinci-adapter        (P5.03b)
├── render-queue           (P5.05b)
├── teams                  (P5.06a)

apps/
├── marketplace-api        (P5.02b)  Node HTTP
├── marketplace-web        (P5.02c)  marketplace UI
├── sync-server            (P5.06b)  Node + Postgres
├── render-worker          (P5.05a)  Docker GPU container
├── mobile                 (P5.08a)  RN/Expo
```

All sit at Layers consistent with the existing 6-layer rule:

- `sdk`, `marketplace`, `davinci-adapter`, `render-queue`, `teams` → Layers 1–3.
- `marketplace-api`, `sync-server` → Layer 5.
- `marketplace-web`, `mobile`, `render-worker` → Layer 6.

## Sprint suggestion (post-v1.0.0)

```
Sprint 7  (2 wk):  Section M — Multi-LLM router  (no blockers, immediate user value)
Sprint 8  (2 wk):  Section J — Plugin SDK         (unlocks 3rd-party innovation)
Sprint 9  (3 wk):  Section L — DaVinci adapter    (mostly local, opens new market)
Sprint 10 (4 wk):  Section K — Marketplace        (revenue + creator network effect)
Sprint 11 (3 wk):  Section O — Team workspaces    (enterprise tier unlock)
Sprint 12 (3 wk):  Section N — Cloud render       (low-spec creator unblocks)
Sprint 13 (2 wk):  Section R — Analytics          (drives marketplace discovery)
Sprint 14 (2 wk):  Section P — Review workflow    (producer + agency use cases)
Sprint 15 (4 wk):  Section Q — Mobile             (last because the desktop is the daily driver)
Sprint 16 (2 wk):  Section S — v2.0.0 GA          (close the loop)
```

Total ~27 weeks if serial; ~12 weeks with parallel work (J + M + R in parallel,
then K + L + O + N, etc.).

## External blockers (owner-completed, not code)

| #   | Section | Blocker                                          |
| --- | ------- | ------------------------------------------------ |
| 1   | K       | Stripe Connect Express account + legal terms     |
| 2   | K       | Marketplace ToS / DPA for creator-sold styles    |
| 3   | L       | DaVinci Resolve install on at least one Win box  |
| 4   | M       | OpenAI + Gemini API keys (test cohort)           |
| 5   | N       | Modal/Fly.io/RunPod account + budget cap         |
| 6   | O       | Managed Postgres (Neon/Supabase) + auth (Clerk?) |
| 7   | Q       | Apple Developer account + Play Console + certs   |
| 8   | S       | Press refresh + new pricing tiers (team plan)    |
