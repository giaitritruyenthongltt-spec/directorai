# Master execution plan — post-v1.0.0

Snapshot as of `v1.4.0-multi-llm` (2026-05-30).

Everything below is **already buildable**. This doc orders the work,
flags what each item needs from a human (you), and identifies parallel
tracks so 1–2 people can ship the whole thing.

```
STATUS NOW
  ✅  P0–P3        90/90 phases    (foundation → style engine)
  ✅  P4           42/42 phases    v1.0.0 PUBLIC LIVE
  🟢  P5 Sec M      4/35 phases    v1.4.0-multi-llm
  ──────────────────────────────────────────────
  🔵  Track A     deferred debt    4 items  (~6 days)
  🔵  Track B     P5 sub-phases   31 items  (~27 wk serial / ~12 wk parallel)
  🔵  Track C     owner-completed 13 items  (you do these; ~3-4 wk wall clock)
  🔵  Track D     verification     6 items  (gates real-world launch)
```

## Reading guide

- **Track A** is technical debt — small, code-only, no blockers.
- **Track B** is the P5 platform — fine-grained in `docs/guides/p5-plan.md`.
- **Track C** is everything that requires _you_ outside the code:
  accounts, certs, domains, designer assets.
- **Track D** is the proof-it-works pass: install on a fresh machine,
  buy a real license, etc.

Tracks A, B, C run **in parallel**. Track D gates the actual public
push but does _not_ block earlier work.

---

## Track A — Deferred debt (4 items, ~6 days)

These are the items that were intentionally deferred during P1 and
P3. None has an external blocker. All four are pure code.

| #   | Item                                                                          | Source                                      | Effort   | Notes                                                                                                |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| A.1 | **P1.17-fix** Bundle `default-caption.mogrt` + wire `project.createMogrtClip` | `packages/premiere-adapter/src/uxp.ts:489`  | 1–2 days | Needs a real MOGRT template; can author one in Premiere Essential Graphics + bundle as binary asset. |
| A.2 | **P1.18-fix** Probe `ppro.TransitionFactory` + fallback chain                 | `packages/premiere-adapter/src/uxp.ts:507`  | 2–3 days | Needs live PPro 2024 + 2025 to test the probe. Real risk: API still moving.                          |
| A.3 | **P3.17-fix** Style form UI (per-field controls instead of YAML textarea)     | `apps/panel/src/components/StylePicker.tsx` | 3–5 days | Pure React work; each DSL section becomes a sub-form.                                                |
| A.4 | **Learner persistence** wire `LearnerStore` to ChromaDB or file JSON          | `packages/style-engine/src/learner.ts`      | 1–2 days | Today it's in-memory; persist alongside ProjectContext.                                              |

**Suggested ordering**: A.4 first (smallest, unblocks the moat
narrative), then A.3 (UI polish), then A.1 + A.2 in parallel since
they need live Premiere anyway.

---

## Track B — P5 sub-phases (31 items, 9 Sections)

Full breakdown in `docs/guides/p5-plan.md`. Quick reference:

| Sprint | Section                 | Sub-phases | Tag                  | Owner blocker          | Est. |
| ------ | ----------------------- | ---------- | -------------------- | ---------------------- | ---- |
| **8**  | **J** Plugin SDK        | 5          | `v1.1.0-sdk`         | none                   | 2 wk |
| **9**  | **R** Creator analytics | 2          | `v1.9.0-analytics`   | none                   | 1 wk |
| **10** | **L** DaVinci adapter   | 4          | `v1.3.0-davinci`     | DaVinci install (test) | 3 wk |
| **11** | **K** Style marketplace | 6          | `v1.2.0-marketplace` | Stripe Connect + ToS   | 4 wk |
| **12** | **O** Team workspaces   | 4          | `v1.6.0-teams`       | Postgres + auth        | 3 wk |
| **13** | **N** Cloud render      | 4          | `v1.5.0-cloud`       | GPU cloud + budget     | 3 wk |
| **14** | **P** Review workflow   | 3          | `v1.7.0-review`      | Slack (opt)            | 2 wk |
| **15** | **Q** Mobile companion  | 3          | `v1.8.0-mobile`      | RN + signing certs     | 4 wk |
| **16** | **S** v2.0.0 GA         | 2          | **`v2.0.0`**         | all above ready        | 2 wk |

**Serial: ~26 weeks. Parallelized: ~12 weeks.** See "Critical path"
below for the parallel schedule.

### Sprint ordering rationale

1. **Sprint 8 (J) first.** Plugin SDK has no blocker and unlocks
   3rd-party developers. Lets us drop "marketplace SDK" support
   when K kicks off.
2. **Sprint 9 (R) second.** Tiny scope, no blocker, drives
   marketplace discovery — useful before K ships.
3. **Sprint 10 (L) third.** DaVinci is a new market we can unlock
   while waiting on Stripe Connect approval. Code-only progress
   on a Windows box; you only need a DaVinci install to verify.
4. **Sprint 11 (K).** Marketplace is the big revenue play. Wait
   for Stripe Connect approval (1–2 weeks) before starting.
5. **Sprint 12 (O).** Team workspaces is the enterprise tier.
   Needs hosted Postgres + an auth provider — kick those off
   during 11.
6. **Sprint 13 (N).** Cloud render unlocks creators on weaker
   hardware. GPU cloud bill is the gate.
7. **Sprint 14 (P).** Review workflow piggybacks on the workspace
   model from 12.
8. **Sprint 15 (Q).** Mobile is last because the desktop is the
   daily driver and RN tooling drains attention.
9. **Sprint 16 (S).** v2.0.0 GA closes the loop.

---

## Track C — Owner-completed setup (13 items)

These are not code. They unblock specific sprints.

| #    | Item                                                          | Cost                          | Effort      | Unblocks                   |
| ---- | ------------------------------------------------------------- | ----------------------------- | ----------- | -------------------------- |
| C.1  | **Stripe** account verified (bank, tax, ID)                   | $0                            | 1 wk wait   | P4.41, K                   |
| C.2  | **Stripe Connect Express** application                        | $0                            | 1–2 wk wait | K (marketplace)            |
| C.3  | **Adobe UXP signing cert** (Partner program)                  | $0                            | 1–2 wk wait | P4.23, every release       |
| C.4  | **Authenticode cert** (OV or EV)                              | $200/yr (OV) or $300+/yr (EV) | 1–2 wk wait | P4.23, every MSI           |
| C.5  | **Domain `directorai.app`** + 5 subdomains                    | ~$15/yr                       | 1 hour      | P4.27, P4.39, all of K/O/N |
| C.6  | **DNS + reverse proxy** (Caddy/Cloudflare) for the 5 servers  | $0 (Cloudflare)               | 1 day       | deploys                    |
| C.7  | **Email provider** (Postmark / SES) + DKIM + SPF              | ~$15/mo                       | 1 day       | P4.19, K, P                |
| C.8  | **Discord server** + 5 webhook URLs                           | $0                            | 1 hour      | P4.36, P4.37               |
| C.9  | **Tally form** + Notion workspace (weekly survey)             | $0 free tiers                 | 30 min      | P4.37                      |
| C.10 | **Managed Postgres** (Neon / Supabase)                        | $0–$25/mo                     | 1 hour      | O, K (marketplace data)    |
| C.11 | **Auth provider** (Clerk / Auth0 / WorkOS)                    | $0–$25/mo                     | 1 day       | O, K, marketplace UI       |
| C.12 | **GPU cloud account** (Modal / Fly.io / RunPod) + budget cap  | usage                         | 1 day       | N (cloud render)           |
| C.13 | **Apple Developer + Play Console** (mobile signing)           | $99/yr + $25 one-time         | 1 wk wait   | Q (mobile)                 |
| C.14 | **Logo SVG + 8 screenshots + 60s demo reel**                  | designer time                 | 1–2 wk      | P4.40 launch               |
| C.15 | **HN / Reddit / Twitter accounts warmed** (~1 wk of activity) | $0                            | 1 wk        | P4.42 launch               |
| C.16 | **Privacy policy + ToS legal review**                         | $500–$2k                      | 1 wk        | P4.13, P4.42               |

**Total**: ~13 items, **~$400 one-time + ~$60/mo recurring**, ~3–4 weeks wall-clock if you start them in parallel **today**.

---

## Track D — Verification (6 items)

These are the proof-it-works gates. None depends on Track B finishing
fully; they should happen as soon as the relevant Track C unblocks
land.

| #   | Item                                                                            | Gates                      | Effort  |
| --- | ------------------------------------------------------------------------------- | -------------------------- | ------- |
| D.1 | **Install UDT** + load panel in real Premiere                                   | first hands-on test        | 1 day   |
| D.2 | **`pnpm bundle:ccx` + sign + load via UDT** on real Premiere                    | A.1, A.2 work + P4.23 cert | 1 day   |
| D.3 | **`pwsh installer/build-msi.ps1` + sign**; install on fresh Win11 VM            | C.3 + C.4 certs            | 2 days  |
| D.4 | **Real Stripe purchase $9.99**, key arrives, panel activates                    | C.1 Stripe live            | 2 hours |
| D.5 | **1-hour memory soak** on production hardware (your RTX 2060)                   | C.7 email + C.1 Stripe     | 1 day   |
| D.6 | **Multi-cohort dry-run** — 5 cohort testers from waitlist → onboard → buy → cut | all above                  | 1 wk    |

---

## Critical path (parallelized)

```
Week  1: A.4 (learner)   ║ C.1 Stripe       ║ C.5 Domain        ║ C.14 design
Week  2: A.3 (form UI)   ║ C.2 Connect      ║ C.6 DNS+proxy     ║ C.14
Week  3: A.1 (MOGRT)     ║ C.3 UXP cert     ║ C.7 Postmark      ║ C.14
Week  4: A.2 (trans)     ║ C.4 Authenticode ║ C.8 Discord+C.9   ║ D.1 verify
Week  5: B Sprint 8 (J)  ║ C.10 Postgres    ║ C.11 auth         ║ D.2 + D.3
Week  6: B Sprint 8 (J)  ║ C.12 GPU cloud   ║ C.13 mobile cert  ║ D.4 Stripe
Week  7: B Sprint 9 (R)  ║ C.15 social warm ║                   ║
Week  8: B Sprint 10 (L) ║ (verification on real PPro)           ║
Week  9: B Sprint 10 (L) ║ B Sprint 11 (K) parallel begins       ║ D.5 soak
Week 10: B Sprint 10 (L) ║ B Sprint 11 (K)                       ║
Week 11: B Sprint 11 (K) ║ B Sprint 12 (O) parallel begins       ║
Week 12: B Sprint 11 (K) ║ B Sprint 12 (O)                       ║
Week 13: B Sprint 12 (O) ║ B Sprint 13 (N)                       ║
Week 14: B Sprint 13 (N) ║ B Sprint 14 (P)                       ║
Week 15: B Sprint 14 (P) ║ B Sprint 15 (Q)                       ║
Week 16: B Sprint 15 (Q)                                          ║ D.6 cohort
Week 17: B Sprint 15 (Q)                                          ║
Week 18: B Sprint 16 (S) v2.0.0 GA                                ║
```

**Parallel paths**:

- **Code track** (1 person): Tracks A → B in order.
- **Operations track** (1 person, ~10 hr/wk): Track C end to end.
- **Verification track**: Track D runs when prerequisites land.

Solo (1 person, full-time): ~18 weeks to v2.0.0.
Two-person team: ~12 weeks.

---

## Decision points (where you must intervene)

| When    | Decision                                        | Why                                                                     |
| ------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Week 1  | Stripe individual vs business account           | tax + bank requirements differ                                          |
| Week 2  | OV vs EV Authenticode cert                      | $200/yr cheap, SmartScreen warn / $300+ + hardware token, instant trust |
| Week 4  | Discord server name + invite policy             | sets cohort tone                                                        |
| Week 5  | Postgres provider — Neon vs Supabase            | Neon = pure DB, Supabase = DB + auth + storage in one                   |
| Week 5  | Auth provider — Clerk vs WorkOS vs roll-our-own | enterprise plans need WorkOS; consumer plans Clerk is faster            |
| Week 6  | GPU cloud — Modal vs Fly.io vs RunPod           | Modal best Python ergonomics, Fly cheaper, RunPod widest GPU selection  |
| Week 9  | Marketplace pricing split                       | 70/30 is default; 80/20 is common to launch creator-friendly            |
| Week 13 | Cloud render pricing                            | per-minute markup; suggest 1.5× provider cost                           |
| Week 16 | v2.0.0 pricing tier (Team plan?)                | $49/seat/mo is the obvious slot; gate by feedback                       |

---

## Risk register

| Risk                                            | Likelihood | Impact | Mitigation                                                                         |
| ----------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------- |
| Adobe UXP API breaks A.1/A.2 again in PPro 2026 | M          | high   | Probe-and-fallback already designed for this; tests run against mock + real        |
| Stripe Connect approval delayed > 3 wk          | M          | medium | Block Sprint 11 only; J/R/L can proceed in parallel                                |
| GPU cloud bill spirals during N                 | L          | high   | Per-account budget cap from day 1; per-render cost ceiling                         |
| Marketplace creator content liability           | L          | high   | DPA + content takedown policy in C.16 legal pass                                   |
| Mobile App Store rejection on first submit      | M          | medium | Plan 2 review cycles into Sprint 15; demo video helps                              |
| Single-vendor LLM outage during launch          | M          | medium | **Already mitigated** by v1.4.0-multi-llm; verify fallback chain in production env |
| Beta cohort < 20 active                         | L          | medium | Waitlist landing live; need outreach push 2 wk pre-launch                          |

---

## Suggested cadence

- **Daily**: triage queue (15 min), Sentry check (5 min).
- **Weekly**: Friday survey send (auto), Monday cohort feedback review.
- **Per sprint**: ADR for any non-trivial architecture decision; tag at sprint end.
- **Per quarter**: re-evaluate this plan against actuals.

---

## What I can do autonomously vs what needs you

| You do                                 | I do                                            |
| -------------------------------------- | ----------------------------------------------- |
| Buy/configure Stripe / certs / domains | Build code for every Section                    |
| Record the demo reel + design logo     | Wire env vars, write tests, ship tags           |
| Create the Discord server              | Write the bot/webhook integration               |
| Sign the actual MSI + CCX              | Build them, test them on the mock adapter       |
| Verify on real Premiere (D.1 + D.2)    | Write the integration harness                   |
| Approve ADR architecture decisions     | Draft the ADRs and validate the design          |
| Send the HN / Twitter posts            | Write the templates (already done in `social/`) |
| Talk to legal for C.16                 | Stub privacy/ToS as placeholders                |

Everything in the "I do" column is autonomous per the
`directorai-autonomous-mode` policy. You only intervene at decision
points + Track C + Track D verification gates.

---

## Definition of done — when is "everything" done?

```
✅  Tracks A, B, C, D all complete
✅  v2.0.0 tag pushed; marketplace publicly live
✅  > 100 paid licenses
✅  > 5 published style packs from non-team creators
✅  At least one press write-up
✅  Zero P0 incidents in launch + 7 day window
✅  Mobile companion has at least one positive App Store review
```

Anything past that — multi-host (P5.03 → Vegas, Resolve full), team
tier, multi-LLM cost optimisation — is v2.x territory.
