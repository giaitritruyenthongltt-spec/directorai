# DirectorAI Launch Checklist (P4)

Each item below has a target phase ID and must be **owner-completed** before public launch (`v1.0.0`).

## P4.01 — UX audit + redesign panel

- [ ] Conduct 5-user usability test on current panel mockup
- [ ] Resolve top 10 friction points
- [ ] Final UI design in Figma signed off

## P4.02 — Progress UI + cancellable ops

- [ ] All long-running ops show progress bar
- [ ] Cancel button works mid-job (clean rollback)
- [ ] No orphan state if Premiere disconnects

## P4.03 — Crash recovery

- [ ] Auto-reconnect on WebSocket loss
- [ ] State restore from last checkpoint
- [ ] Survives `kill -9` on either side

## P4.04 — Telemetry (opt-in)

- [ ] Privacy policy reviewed by legal
- [ ] Events catalog finalized (≤ 20 events)
- [ ] No PII or media content leaves machine
- [ ] User can disable in settings + view what's sent
- [ ] GDPR-compliant deletion endpoint

## P4.05 — License system

- [ ] Stripe products configured (Basic $9.99, Pro $109, Subscription $19/mo)
- [ ] License key issuing on purchase
- [ ] Offline activation grace period (7 days)
- [ ] Refund flow tested
- [ ] License management portal live

## P4.06 — Installer

- [ ] UXP CCX bundle signed
- [ ] Windows MSI built via WiX
- [ ] macOS DMG (deferred — Windows-first)
- [ ] Fresh-PC install test (Win 11 fresh VM)
- [ ] Auto-installs Python 3.11 sidecar if missing

## P4.07 — Auto-update

- [ ] In-app update check on launch
- [ ] Background download + apply on next launch
- [ ] Rollback on bad update detected via telemetry

## P4.08 — Error reporting

- [ ] Sentry project created
- [ ] DSN configured per environment
- [ ] PII scrubbing rules in place
- [ ] Source maps uploaded on release

## P4.09 — Performance

- [ ] Panel cold start < 2s
- [ ] All tool calls < 500ms p95
- [ ] No jank scrolling tool log with 1000+ entries
- [ ] Memory < 200 MB after 1 hour

## P4.10 — Documentation site

- [ ] Docusaurus deployed to docs.directorai.app (DNS pending)
- [ ] All ADRs published
- [ ] API reference auto-generated
- [ ] Search works

## P4.11 — Tutorials

- [ ] Getting Started (3 min)
- [ ] Building a Style (5 min)
- [ ] Power features (5 min)
- [ ] Troubleshooting (3 min)
- [ ] Behind the scenes (3 min)

## P4.12 — Beta onboarding

- [ ] First-run wizard
- [ ] Connect to UDT verification
- [ ] Sample project download
- [ ] First successful edit < 5 min

## P4.13 — Beta cohort

- [ ] Recruit 20-50 creators
- [ ] Closed Slack / Discord channel
- [ ] Weekly feedback survey
- [ ] Bug triage process

## P4.14 — Critical bugs

- [ ] All P0 issues fixed
- [ ] All P1 issues either fixed or scheduled

## P4.15 — Public launch

- [ ] Marketing site live
- [ ] Stripe live mode
- [ ] Press kit ready
- [ ] HN / Twitter / Reddit announcement
- [ ] Support email staffed
