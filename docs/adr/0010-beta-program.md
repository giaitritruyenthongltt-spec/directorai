# ADR-0010: Beta program infrastructure

- **Status**: Accepted
- **Date**: 2026-05-30
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

M4-δ closed the "learn" loop — strangers can install + onboard from
the docs alone. Sprint 5 closes the "join" loop: a landing page to
collect interest, a Discord workspace to host the community, a
weekly feedback survey, and a triage workflow so bugs from the
20–50 person beta cohort don't drown the core team.

The constraint is the same as every previous Sprint: bias to
modular, dep-light infrastructure. No CRM, no Mailchimp, no
discord.js — just enough plumbing to ship the cohort.

## Decision

### Landing page (P4.35)

`apps/landing` is a vanilla Node HTTP server (~200 lines) that
serves:

- `/` — single-page HTML with a hero, four feature blocks, three
  pricing tiers, and a waitlist form.
- `/privacy` + `/terms` — placeholder legal pages (real text
  ships before public launch, P4.04 + P4.05 follow-up).
- `POST /api/waitlist` — Zod-validated email; appends to a JSONL
  file at `~/.directorai/waitlist.jsonl` (or `WAITLIST_PATH`).
- `GET /api/waitlist/count` — public count, dedup by lowercased
  email. Drives the "joined N creators" badge once it makes sense.
- Optional `DISCORD_WAITLIST_WEBHOOK` pings the team channel on
  each new signup.

JSONL chosen over SQLite because:

- Append-only fits the use case exactly.
- Grep + jq work on it instantly.
- Migrating to Postgres at P5 is a one-script port.

### Discord (P4.36)

`@directorai/community` ships **`DiscordPoster`** — a tiny wrapper
around Discord's HTTP webhook endpoint. We deliberately reject
`discord.js`:

| Concern               | discord.js             | webhook poster      |
| --------------------- | ---------------------- | ------------------- |
| Install size          | ~10 MB transitive      | 0 KB (uses `fetch`) |
| Auth                  | bot token, OAuth dance | webhook URL         |
| Persistent connection | yes (gateway)          | no                  |
| Fit for our cadence   | overkill               | exactly right       |

We post a few messages per day (signup pings, release notes, weekly
survey, oncall escalations). The webhook surface covers all of
that. If we ever need slash commands or per-user DMs we can revisit.

`CHANNEL_LAYOUT` and `WELCOME_TEMPLATE` are constants — version
controlled, reviewable, swapped in PRs instead of a Discord admin
panel.

### Weekly survey loop (P4.37)

Two pure modules:

- **`nextSurveyAt(date, rule)`** — deterministic scheduler. Tests
  cover all the calendar edge cases (mid-week, post-fire-Friday,
  custom weekday).
- **`sendWeeklySurvey(poster, config, now)`** — builds the Discord
  embed with a Tally URL + week label.

`tools/survey-schedule.ts` wraps both behind `pnpm survey:send` and
`pnpm survey:next`. Production runs `survey:send` from a Windows
Task Scheduler job every Friday at 17:00 local — owner-completed
once the actual Discord + Tally URLs land.

### Bug triage (P4.38)

Three artifacts plus a doc:

- `.github/ISSUE_TEMPLATE/bug.yml` — version, severity (P0–P3),
  area (10 options), repro, expected, actual, logs, OS.
- `.github/ISSUE_TEMPLATE/feature.yml` — problem + proposal + area.
- `.github/ISSUE_TEMPLATE/config.yml` — disables blank issues,
  points to Discord + docs.
- `.github/workflows/triage.yml` — `actions/github-script` parses
  the dropdowns out of the issue body, applies
  `severity/p0..p3` + `area/*` labels, and posts an oncall ping
  on P0.
- `docs/guides/bug-triage.md` — lifecycle, SLA, daily call
  process. Owner-completed: GitHub Projects board + label set.

## Consequences

**Positive**

- Landing + waitlist live in one Node binary; deploy is `node
dist/index.js` behind any reverse proxy. No Next.js, no CDN
  pipeline.
- Discord integration ships with zero new transitive deps. Easy to
  swap to a real bot in P5 if we need DMs.
- Survey scheduler is pure, fully unit-tested across the calendar
  edge cases. The actual run is a 30-second cron job.
- Triage workflow is declarative — anyone with repo access can
  refine the labels by editing YAML.

**Negative**

- Real email delivery (welcome, launch announcement) isn't wired —
  same Mailer abstraction as the license issuer; the production
  sink lands alongside the marketing site (P4.39).
- Discord webhook posts are fire-and-forget; we don't retry. For
  our cadence it's fine.
- The triage workflow uses `actions/github-script` which requires
  the repo to have GitHub Actions enabled at the org level. No
  fallback today.

**Neutral**

- Landing inline CSS = no design system. We accept this for the
  beta page; the marketing site (P4.39) is the place to invest in
  a real design.

## Alternatives considered

1. **Notion form + Zapier.** Rejected — opaque per-row pricing,
   slow to debug, breaks during outages. Self-hosted JSONL is
   faster end-to-end.
2. **Slack instead of Discord.** Rejected — creator audience
   skews Discord. We can mirror to Slack later via a bridge bot.
3. **Linear instead of GitHub Projects.** Rejected for now — keeps
   issues + PRs in one tool, lower friction for OSS contributors.
   Re-evaluate when the team grows past 5.

## References

- ADR-0009 (docs + onboarding)
- `apps/landing/`
- `packages/community/`
- `.github/ISSUE_TEMPLATE/` + `.github/workflows/triage.yml`
- `docs/guides/bug-triage.md`
