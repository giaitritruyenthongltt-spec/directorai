# Panel Cold-Start Baseline

Last run: `2026-05-30` via `pnpm bench:perf`.

Captured by [`tools/perf-bench.ts`](../tools/perf-bench.ts) to give us
something concrete to regress against in P4.14 / P4.15 / P4.16. The
budget column is the P4.14/15/16 target, not a hard CI gate yet —
those land in Section C.

| Metric                    | Value   | Budget    | Status |
| ------------------------- | ------- | --------- | ------ |
| `bundle.raw`              | 439.6KB | —         | ➖     |
| `bundle.gzip`             | 98.8KB  | —         | ➖     |
| `bundle.modules`          | 38      | —         | ➖     |
| `module.coldLoad`         | 183.6ms | —         | ➖     |
| `ttft.connect`            | 12.2ms  | ≤ 200.0ms | ✅     |
| `ttft.connectToFirstTool` | 13.6ms  | ≤ 500.0ms | ✅     |

## How to read

- **bundle.raw / bundle.gzip** — direct file size of
  `apps/panel/dist/bundle.js`. UXP parses the raw file; gzip is what
  matters for installer payload (P4.22).
- **module.coldLoad** — Node `import()` time for the three heaviest
  workspace deps. Acts as a proxy for first-touch evaluation cost.
- **ttft.connect** — ws open latency against a localhost WSS.
- **ttft.connectToFirstTool** — total open + register + first
  `project.get` round-trip. The user-visible "I see something useful"
  moment.

## Reproduce

```
pnpm --filter @directorai/panel build
pnpm bench:perf
```
