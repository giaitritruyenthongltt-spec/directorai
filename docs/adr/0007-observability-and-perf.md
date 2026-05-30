# ADR-0007: Observability + performance budget

- **Status**: Accepted
- **Date**: 2026-05-30
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

P4 Section A (ADR-0006) closed the reliability gap — users now see
progress, can cancel, recover after a crash. The next gap is what we
_don't_ see ourselves: when a user hits a bug or a perf cliff in the
wild, we have no signal. And without a perf budget, the bundle grows
unchecked until cold start drags into seconds.

Section B + C of P4 close both: SDKs for crash reporting and
opt-in telemetry, plus a measured cold-start + per-call + memory
budget enforced at the package boundary.

## Decision

### Sentry (P4.09 + P4.10 + P4.11)

`apps/server/src/sentry.ts` and
`apps/panel/src/bridge/sentry-init.ts` are thin wrappers around the
official Sentry SDKs. Both no-op when `SENTRY_DSN` is empty. The server
captures `uncaughtException` + `unhandledRejection`; the panel captures
`window.onerror` + `onunhandledrejection`.

Source maps land in production builds via the optional
`@sentry/webpack-plugin` — we deliberately keep it out of
`devDependencies` because the underlying `@sentry/cli` postinstall
downloads a native binary. Release CI installs the plugin
just-in-time. See `docs/guides/release-sourcemaps.md`.

### Telemetry (P4.12 + P4.13)

A new `@directorai/telemetry` package owns:

- **events.ts** — a Zod-validated catalog of **exactly 20 events**, all
  PII-free (no media, no transcripts, only counters + enumerated
  labels). Adding event 21 is a deliberate review point.
- **sink.ts** — `NoopSink` (consent off) + `InMemorySink` (consent on
  with bounded ring buffer).
- **client.ts** — `TelemetryClient` gates every emission on the
  `isEnabled()` getter + the schema; schema misses are dropped, never
  thrown.
- **consent-store.ts** — persists `~/.directorai/telemetry-consent.json`
  with `{installId, consented, consentedAt, deletedAt}`. The GDPR
  delete path resets consent to false AND records `deletedAt`.

Panel-side: `ConsentDialog` modal shows on first connect when
`consented === null`. Once answered the dialog never returns; the user
toggles via Settings. Server-side: `telemetry-router.ts` exposes 4
RPCs (`consent.get`, `consent.set`, `delete`, `status`).

### Performance budget (P4.14 + P4.15 + P4.16)

- **Cold start (P4.14)**: `App.tsx` uses `React.lazy` + `Suspense` for
  the Style + Context tabs. The chat panel paints first; heavier tabs
  load only when clicked. `pnpm bench:perf` reports `module.coldLoad`
  121.6ms — well under the 2s target.

- **Tool call (P4.15)**: `@directorai/premiere-adapter` ships
  `ReadCache` — a TTL + LRU cache the dispatcher consults for the 8
  whitelisted read methods (`CACHEABLE_METHODS`). Mutating methods
  invalidate matching read entries via the `INVALIDATIONS` table.
  Benchmark: 1000 sequential cached `project.get` finish in < 500ms
  (the budget is per-call p95 < 500ms; cached calls are sub-ms).

- **Memory (P4.16)**: every long-lived collection in the codebase has
  a documented bound — ChatLog (500), opOrigin (drop on end),
  ProgressBus.ops (drop on end), CheckpointStore (50), InMemorySink
  (500), ReadCache (256, LRU). `tools/memory-soak.ts` exercises the
  hot path for 60s and asserts `rss < 200MB`.

## Consequences

**Positive**

- Production crashes show up in Sentry with symbolicated stacks.
- Telemetry is opt-in by default; GDPR delete is a single RPC.
- Cold-start budget enforced via `pnpm bench:perf`; regressions show
  up in CI on the first benchmark run.
- Repeated read-heavy tool sequences (the LLM agent loop does a lot of
  `project.get` between mutations) get O(1) hit latency.

**Negative**

- The 20-event cap is intentionally low — adding event 21 forces a
  schema review. Could slow feature work if not signposted.
- ReadCache LRU eviction relies on Map insertion order; if a future
  Node release breaks that assumption the cache will misbehave.
- Sentry adds ~80 KB gzipped to the panel bundle. We accept the cost
  because the crash visibility is non-negotiable for beta.

**Neutral**

- The consent dialog blocks the panel UI until answered. We picked
  "modal" over "non-blocking toast" because telemetry consent is a
  legal artifact, not a feature toggle.

## Alternatives considered

1. **OpenTelemetry instead of Sentry.** Rejected — Sentry's free tier
   covers the beta cohort and the SDK is simpler to wire. We can swap
   later because both consumers go through the same wrapper.
2. **Skip catalog cap.** Rejected — bounded surfaces are how we keep
   the privacy review tractable. Every new event lives or dies on its
   business value being argued out loud.
3. **Cache TTL at 30s.** Rejected — too long for an editor where the
   user might cut/paste in another tool and switch back. 1.5s default
   maps well to "two consecutive agent turns".

## References

- ADR-0006 (reliability layer)
- `docs/guides/release-sourcemaps.md` — CI source-map upload
- `docs/perf-baseline.md` — cold-start baseline (auto-regenerated)
- `tools/memory-soak.ts` — manual soak probe
