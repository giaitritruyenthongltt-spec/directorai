# ADR-0006: Reliability layer — progress bus, cancellation, checkpoint store

- **Status**: Accepted
- **Date**: 2026-05-30
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

P3 shipped the Style Engine moat with deterministic plan execution. End
users running it on real footage hit three rough edges that aren't
about features at all, they're about **trust**:

1. A plan can take 5–30 seconds. With no visible progress, the panel
   looks frozen — users assume it has crashed and force-quit Premiere.
2. Once a plan starts, there is no way to stop it. Even the user
   noticing "wait, wrong style" can't claw back without letting the
   whole plan finish and pressing Ctrl-Z 30 times.
3. If the WebSocket drops mid-plan (UDT reload, app sleep, transient
   loss), the panel reconnects but the chat log is empty and there's
   no signal that we were in the middle of something.

Section A of P4 closes all three. This ADR records the design.

## Decision

Three small, layered subsystems land in the existing 6-layer
architecture without breaking the dependency rule:

### 1. Progress bus (P4.02)

`packages/shared/src/progress.ts` exports the `ProgressEvent` protocol
(start / update / end with `opId`, JSON-RPC notification method
`progress.event`, cancel method `progress.cancel`).
`apps/server/src/progress-bus.ts` implements a Node `EventEmitter`-backed
`ProgressBus` that owns an `AbortController` per op. The ws-server
forwards events as JSON-RPC notifications only to the **originating
socket** (tracked via `opOrigin: Map<opId, ws>`), so two panels don't
see each other's progress.

### 2. Cancellation (P4.03)

`AbortSignal` is plumbed through three layers as an optional argument:
`withRetry({ signal })`, `dispatchRpc({ signal })`,
`executePlan({ signal })`. A new `AbortError` class lives in
`@directorai/premiere-adapter` (it's the lowest layer involved). The
executor adds a `'cancelled'` status to `ExecutionStepResult` and a
`cancelled: boolean` flag to `ExecutionResult`. Pre-aborted signals
short-circuit before any adapter work runs; mid-flight aborts skip the
remaining steps but **always** close the undo group, so the user can
single-Ctrl-Z to revert.

### 3. Checkpoint store (P4.06 + P4.07)

`apps/server/src/checkpoint-store.ts` writes snapshots of the active
sequence and project metadata to `~/.directorai/checkpoints/` as plain
JSON (`{epoch}_{label}.json`). The store auto-prunes to 50 entries.
`style.apply` snapshots before each non-dry-run execution and returns
the `checkpointId` alongside the audit trail. On reconnect, the panel
calls `checkpoint.latest` and surfaces a "recovered from … (N s ago)"
banner in the chat log if the snapshot is fresh (< 5 min).

### 4. Reconnect state machine (P4.05)

`apps/panel/src/bridge/reconnect-machine.ts` is a pure module the
ws-client drives. Exponential backoff 1s→30s with ±20 % jitter, plus
a pong watchdog: if `pingIntervalMs + pongTimeoutMs` passes without
any inbound traffic, the watchdog force-closes the socket and the
machine schedules a reconnect.

### 5. UI surface (P4.04)

`apps/panel/src/components/ProgressBar.tsx` subscribes to
`wsClient.onProgress()` and renders only when an op is active. A
Cancel button calls `wsClient.cancelOp(opId)` which becomes a
`progress.cancel` request server-side.

## Consequences

**Positive**

- Long-running ops show progress and can be cancelled. Trust gap closed.
- Reconnect is deterministic and testable — `ReconnectMachine` has 8
  unit tests covering backoff growth, jitter bounds, pong watchdog,
  explicit shutdown.
- The checkpoint store gives us a known-good recovery point per plan
  and a foundation for "compare against baseline" UX (P4.13+).
- Chaos tests under `tests/chaos/*` catch reliability regressions
  before they hit users.

**Negative**

- The opOrigin map adds a per-op data structure that must stay in sync
  with the bus. We mitigate this by routing all events through one
  central listener that prunes on `kind === 'end'`.
- Checkpoint files accumulate on disk. We prune to 50 entries (a few
  MB at most) but a future Section C performance review may revisit.

**Neutral**

- The progress protocol does not include heartbeats per op — long ops
  with no granular checkpoints will look indeterminate. That's
  intentional: tools that _can_ report `done/total` already do; the
  rest get the marching indeterminate bar.

## Alternatives considered

1. **Pino transport layer for progress events.** Rejected — couples
   observability to a log shipper and complicates per-socket routing.
2. **Persist progress events in the checkpoint store.** Rejected for
   now — events are transient by design; the checkpoint is the
   durable artifact.
3. **Replace ws-client's heartbeat with WebSocket protocol pings
   (`ws.ping()` / `ws.pong()`).** Rejected — some UXP runtimes mask
   the protocol-level frames, and the JSON-RPC notification path is
   already exercised by `_panel.ping`. Watchdog at the JSON layer is
   adequate.

## References

- ADR-0003 (server-panel proxy)
- ADR-0005 (style engine moat)
- `docs/guides/p4-plan.md` — full P4 fine-grained plan
- `docs/perf-baseline.md` — cold-start baseline produced by `pnpm bench:perf`
