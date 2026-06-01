# ADR-0015: v2.0.0 — Platform GA

- **Status**: Accepted
- **Date**: 2026-06-01
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

ADR-0011 closed P4 with `v1.0.0` (Premiere-only single-app product).
P5 then shipped 7 platform Sections in parallel:

| Section | Tag                  | What                          |
| ------- | -------------------- | ----------------------------- |
| J       | `v1.1.0-sdk`         | Public plugin SDK + sandbox   |
| L       | `v1.3.0-davinci`     | DaVinci Resolve adapter       |
| M       | `v1.4.0-multi-llm`   | OpenAI + Gemini providers     |
| N       | `v1.5.0-cloud`       | Render queue + GPU container  |
| O       | `v1.6.0-teams`       | Workspaces + style sync       |
| P       | `v1.7.0-review`      | Review/approve workflow       |
| Q       | `v1.8.0-mobile`      | Mobile companion API          |
| R       | `v1.9.0-analytics`   | Style stats + recommendations |
| K       | `v1.2.0-marketplace` | Style pack marketplace        |

Plus **Track A** debt cleanup (MOGRT, transitions, form UI,
learner persistence).

This ADR records the v2.0.0 GA — what changes, what doesn't, and
the migration path for v1.x consumers.

## Decision

### Version bump

- Root `package.json` → `2.0.0`.
- `@directorai/sdk` stays at `1.0.0` — its surface didn't break.
  v2 is a _product_ version, not an SDK version.
- All host-only packages stay on `0.1.0` workspace versions
  (internal; never published individually).

### What's _not_ breaking

- Every public SDK symbol from `v1.1.0-sdk` still exports.
- The `IPremiereAdapter` deprecated alias still resolves; removal
  postponed to v3 (longer deprecation than the 2-version policy
  because the alias is heavily used).
- All `style.*`, `context.*`, `firstRun.*`, `telemetry.*`,
  `checkpoint.*`, `progress.*` RPC namespaces stay wire-compatible.
- Existing plugins (manifest v1) load unchanged.
- Existing styles (DSL v1) parse unchanged.
- v1 licenses (`DA1.…` Ed25519) verify unchanged.

### What's new in v2.0.0 (beyond the P5 tags above)

- **No new code in this milestone.** v2.0.0 GA is the formal
  release of everything P5 already shipped, plus:
- Updated marketing site changelog entry.
- Migration guide for plugin authors who want to use new
  surfaces (`INLEAdapter`, `EFFECT_PRESETS`, mobile companion).

### Migration guide

| If you were on…     | …upgrade by                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| `v1.0.0`            | drop in the v2 panel + auto-updater pulls v2 MSI. No code change needed. |
| Plugin author       | switch `IPremiereAdapter` → `INLEAdapter` (alias still works).           |
| Studio user         | nothing — workspace + marketplace are opt-in.                            |
| Marketplace creator | onboard at portal.directorai.app, paste Stripe Connect (acct\_).         |

### Owner-completed gates for actual public v2

Code is done. Real-world rollout still needs:

- Stripe live keys + Stripe Connect approval (Track C C.1, C.2).
- DaVinci Python bridge live-verified (one machine with Resolve).
- GPU cloud account + budget cap (C.12).
- Postgres + auth provider (C.10, C.11) for the real marketplace
  - teams deployment.
- Mobile App Store + Play Console submissions (C.13).
- Marketing refresh (new pricing tier for Teams) + press kit
  update.
- Legal: marketplace creator ToS + DPA pass.

## Consequences

**Positive**

- Single source of truth for "what does DirectorAI do now" — see
  the marketing site `/changelog`.
- Every P5 Section is independently rollback-able; v2 is a
  product release, not a coupled deployment.
- The `IPremiereAdapter` alias buys us another full v2 cycle
  before plugin authors need to migrate. Compatibility wins.

**Negative**

- v2 is a "marketing version" rather than a code-break. Some users
  may expect breaking changes from a major bump. We address this
  in the launch post.
- The platform features (marketplace, teams, cloud render, mobile)
  all ship as stubs ready for live deployment — they don't all
  flip to live on day one. Documented as "available to opt into"
  rather than "default-on".

**Neutral**

- The decision to bundle 7 Sections into one GA tag (instead of
  shipping each as its own v1.N) reflects how users perceive
  upgrades — "DirectorAI 2.0" is more legible than 9 separate
  point releases.

## v2.0.0 success criteria (re-check at T+30d)

- [ ] 100+ new paid licenses since v1 launch (compound)
- [ ] 10+ published style packs (any author)
- [ ] 5+ paying teams (workspace plan)
- [ ] At least one beta DaVinci adapter user
- [ ] Zero P0 incidents in v2 launch week
- [ ] Mobile app submitted (no requirement on approval yet)

## References

- ADR-0011 (v1.0.0 public launch)
- ADR-0012 (multi-LLM router)
- ADR-0013 (SDK surface)
- ADR-0014 (DaVinci adapter)
- `docs/guides/p5-plan.md` — the full 35-sub-phase breakdown
- `docs/guides/execution-plan.md` — master rollout plan
