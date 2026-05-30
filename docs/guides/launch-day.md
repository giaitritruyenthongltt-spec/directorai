# Launch day runbook (P4.42)

The single source of truth for launch day. Read it the night before,
work it top-to-bottom on the day. Every step is owner-completed; this
doc just removes the "what was the next thing again" panic.

## T-24h — the day before

- [ ] All four milestone tags built and pushed: `v0.5.0-reliable`,
      `v0.6.0-observable`, `v0.7.0-installable`, `v0.8.0-onboarded`,
      `v0.9.0-beta`.
- [ ] `pnpm -r test` green on a fresh clone.
- [ ] `pnpm bench:perf` printed and saved alongside the previous
      run. Compare bundle size + TTFT — no regression > 10%.
- [ ] `pnpm bench:memory` — RSS stable under 200 MB for the full
      60s soak.
- [ ] Stripe live keys configured (`docs/guides/stripe-live-checklist.md`).
- [ ] `checkStripeEnv()` boot check passes in staging with live
      keys (then revert to test for staging).
- [ ] Authenticode-signed MSI + Adobe-signed CCX produced from the
      v1.0.0 tag.
- [ ] Demo reel posted unlisted on YouTube. Embed link works on
      directorai.app.
- [ ] Discord workspace seeded with welcome message in `#announcements`.
- [ ] Sentry release `v1.0.0` created and source-maps uploaded
      (`docs/guides/release-sourcemaps.md`).
- [ ] Press kit assets uploaded to `press/` (see `press/README.md`).
- [ ] Final dry-run with a teammate buying a $9.99 license. Refund
      after. Confirm Postmark email landed.

## T-1h — pre-flight

- [ ] You and one other person are on Discord and Twitter.
- [ ] You have the HN posting account warmed (a few comments in
      the past week — minimises shadow-ban risk).
- [ ] Status page set to "All systems operational".
- [ ] Sentry dashboard open in one tab.
- [ ] `gh issue list --label triage` open in another.

## T-0 — go

Post in this order, 15 minutes apart:

1. **Twitter / X** — `social/twitter-launch.md` thread.
2. **Hacker News** — `social/hn-launch.md` Show HN.
3. **Reddit** — `r/editors` `social/reddit-editors.md`.
4. **Discord #announcements** — `social/discord-launch.md`.
5. **Email blast** — to the waitlist (Postmark template
   `welcome-launch.html`), one job per 1000 to avoid rate limits.

Avoid posting to Reddit r/premiere — gets shadow-banned for
self-promotion. r/editors is OK.

## T+1h to T+24h — monitor

Loop every 30 minutes:

| Check                  | Where                   | Threshold             |
| ---------------------- | ----------------------- | --------------------- |
| Live errors            | Sentry                  | < 10 new / hour       |
| Failed Stripe webhooks | Stripe dashboard        | 0                     |
| Server uptime          | uptime monitor          | 100%                  |
| HN ranking             | hnrss.org or pinned tab | Page 1 = stay engaged |
| Discord new users      | invite log              | flag spam waves       |
| Issue queue            | GitHub                  | P0 → drop everything  |

## P0 incident response

If something is on fire:

1. Post a single message in `#announcements` acknowledging within
   10 minutes. "We're aware of X, investigating, will update in 30."
2. Open a private `#incident-YYYY-MM-DD` channel. Pin a doc with
   start time, symptoms, owner, ETA.
3. If the panel can't activate licenses: roll back the license
   verifier deploy. Issue licenses manually via
   `tools/issue-license.ts` as needed.
4. If the website is down: serve a static 503 page from CloudFront
   pointing to Discord.
5. Status page updates every 30 minutes until resolved.
6. Post-mortem doc within 48h, public.

## T+48h — wrap

- [ ] Tally the first 48h: signups, purchases, support tickets,
      crash count.
- [ ] Post a brief "Day 2" update in `#announcements` thanking
      beta-graduates, surfacing top 3 issues, ETAs.
- [ ] Move HN thread to "ask me anything" mode if it's still on
      page 2-3.
- [ ] Trigger the first weekly survey (`pnpm survey:send`).
- [ ] Open `P5` planning issue with whatever the launch surfaced.

## Owner-completed (not in code)

- Stripe → live mode (`docs/guides/stripe-live-checklist.md`).
- Discord server creation + webhooks.
- DNS records for `directorai.app`, `docs.directorai.app`,
  `beta.directorai.app`, `api.directorai.app`,
  `samples.directorai.app`, `updates.directorai.app`.
- Email provider (Postmark/SES) account + DKIM/SPF.
- HN / Reddit / Twitter account warmup.
- Press list emailed under embargo 7 days before.
- Status page (Statuspage / Better Uptime).
