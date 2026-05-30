# ADR-0011: Public launch v1.0.0

- **Status**: Accepted
- **Date**: 2026-05-30
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

ADR-0006 through ADR-0010 covered the engineering work to get
DirectorAI from a working-but-rough product to one that can be
sold. ADR-0011 closes the loop: what's between "we can ship" and
"we have shipped to the public".

Sprint 6 (Sections I — public launch, P4.39–P4.42) ships:

- A polished marketing site (separate from the beta landing page).
- A version-controlled press kit so journalists self-serve.
- Stripe live-mode safety nets so we don't accidentally launch
  pointing at test keys.
- A launch-day runbook + per-channel social copy templates.

Together these turn launch from a single high-stakes moment into a
recoverable, rehearsable sequence.

## Decision

### Marketing site (P4.39)

`apps/marketing` is a vanilla Node HTTP server (same pattern as
`apps/landing`, `apps/portal`, `apps/docs-site`) with six routes:

| Route        | Purpose                                                |
| ------------ | ------------------------------------------------------ |
| `/`          | Hero + comparison table + four pillars + CTA.          |
| `/how`       | Architecture deep-dive in user-friendly prose.         |
| `/pricing`   | Three plans + what's included.                         |
| `/faq`       | Eight pre-empted questions.                            |
| `/changelog` | Reverse-chrono release notes; RSS at `/changelog/rss`. |
| `/press`     | Press kit landing → GitHub `/press` folder.            |

Plus `/sitemap.xml`, `/robots.txt`, `/healthz`. No framework, no
build step beyond `tsc`, no client-side JS. Deployment is one
`node dist/index.js` behind a reverse proxy. 9 tests cover every
route + content-type.

We deliberately kept `apps/landing` separate (beta.directorai.app
collects waitlist emails) from `apps/marketing`
(directorai.app sells). Two narrow concerns, two small servers,
swap-replace-able.

### Press kit (P4.40)

`press/` is markdown-first so journalists can copy directly:

- `README.md` — orientation + contact + asset checklist.
- `fact-sheet.md` — one-pager.
- `copy-blocks.md` — 50/100/250-word descriptions.
- `founder-quotes.md` — six ready-to-attribute quotes.
- `journalist-faq.md` — the questions reporters always ask.
- `demo-reel.md` — shot list + script for the 60s reel.
- `screenshots.md` — file list + capture process.
- `brand.md` — colors, type, voice, "don'ts".
- `logo/README.md` — file checklist (owner-completed assets).

The marketing site's `/press` route deep-links into this folder on
GitHub, so updates flow through pull requests.

### Stripe live-mode safety net (P4.41)

`packages/license/src/stripe-env.ts` adds two functions:

- `detectStripeMode(secretKey)` returns `'test' | 'live' | 'unknown'`
  based on key prefix.
- `checkStripeEnv({ appEnv, secretKey, webhookSecret, priceIds })`
  validates the env block; returns `errors[]` and `warnings[]`.

Production boot must call `checkStripeEnv` and exit non-zero on
errors. It catches:

1. Production deployment pointing at `sk_test_*` keys.
2. Non-production deployment pointing at `sk_live_*` keys.
3. Missing or malformed `whsec_` webhook secret.
4. Missing or malformed `price_*` ids.

`docs/guides/stripe-live-checklist.md` walks the cutover step by
step.

### Launch day runbook (P4.42)

`docs/guides/launch-day.md` is the day-of script:

- T-24h pre-flight (tests, signed builds, Stripe live, demo reel).
- T-1h logistics (Discord, Twitter warm, status page).
- T-0 posting order with 15-minute gaps:
  Twitter → HN → Reddit r/editors → Discord → email blast.
- T+1h to T+24h monitoring loop (Sentry, Stripe, GitHub issues).
- P0 incident response checklist (10-min ack, status page,
  rollback playbook).
- T+48h wrap-up (numbers, first survey, P5 planning issue).

`social/` ships per-channel copy templates so launch day is paste-
and-monitor, not write-then-post.

## Consequences

**Positive**

- Every launch artifact (marketing copy, press kit, social
  templates, Stripe checks, runbook) is in git. Reviewable in
  pull requests, not a Notion doc that drifts.
- The Stripe env check catches the single most expensive launch
  mistake (test keys in prod) at boot time, not when a real card
  is charged for $0.
- Marketing + landing + portal + docs-site + community are five
  small, independent servers — any one can fail without taking the
  others down. Same operational shape as the rest of the workspace.
- Press kit pull-requests are how the brand evolves; nobody has to
  guess "what's the latest copy".

**Negative**

- Real screenshots, demo reel, and logo SVGs are owner-completed
  and not in git. CI doesn't warn yet (we accept the asymmetry —
  the assets need a designer, not code).
- The marketing site has no analytics out of the box. We rely on
  server logs + Sentry until we wire opt-out-by-default privacy-
  friendly analytics (P5 candidate, not blocking launch).
- No A/B testing on the marketing pages. v1.0 is "ship what we
  wrote"; experiments come post-launch.

**Neutral**

- The launch-day runbook is opinionated about posting order and
  timing. Re-read before each future major release; cadence may
  shift as we learn what works for our audience.

## Alternatives considered

1. **Single Next.js site for marketing + landing + portal.**
   Rejected — couples three concerns with different lifecycles,
   pulls in the Next.js dep tree. Three small Node servers cost us
   less.
2. **WebFlow / Framer for marketing.** Rejected — moves copy out
   of git, harder to PR. Cost is hosting + monthly fees we don't
   need.
3. **No live-mode check; trust the deployer.** Rejected — this is
   exactly the kind of bug that's invisible until it's catastrophic
   ("we processed 200 test purchases for $0 on launch day"). Cheap
   safety net.
4. **Big-bang launch (Twitter + HN + Reddit + Email all at once).**
   Rejected — overwhelms our ability to reply. 15-minute spread is
   the smallest interval that lets us still engage every channel.

## v1.0.0 success criteria (re-check at T+30d)

- [ ] 100+ paid licenses sold.
- [ ] HN front page for ≥ 6 hours (Show HN slot).
- [ ] Zero P0 incidents in the first 24 hours.
- [ ] First weekly survey response rate ≥ 20% of the beta cohort.
- [ ] At least one press write-up.

## References

- ADR-0006 (reliability layer)
- ADR-0007 (observability + perf)
- ADR-0008 (licensing + distribution)
- ADR-0009 (docs + onboarding)
- ADR-0010 (beta program)
- `docs/guides/launch-day.md` — the day-of runbook
- `docs/guides/stripe-live-checklist.md` — cutover
- `apps/marketing/`, `press/`, `social/`
