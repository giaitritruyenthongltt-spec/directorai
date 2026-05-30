# DirectorAI Roadmap (115 Phases)

| Macro                   | Phases | Status        | Duration | Tag                                                                                                                |
| ----------------------- | ------ | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| **P0 — Foundation**     | 20     | ✅ Done       | 2 wk     | `v0.1.0-foundation`                                                                                                |
| **P1 — Control MVP**    | 25     | 🟢 LIVE-READY | 4 wk     | `v0.2.1-control-live` \*                                                                                           |
| **P2 — Context Engine** | 20     | 🟢 LIVE-READY | 6 wk     | `v0.3.1-context-live` \*\*                                                                                         |
| **P3 — Style Engine**   | 25     | 🟢 LIVE-READY | 8 wk     | `v0.4.1-style-live` \*\*\*                                                                                         |
| **P4 — Polish & Beta**  | 42     | ✅ Done       | 8 wk     | `v0.5.0-reliable` + `v0.6.0-observable` + `v0.7.0-installable` + `v0.8.0-onboarded` + `v0.9.0-beta` + **`v1.0.0`** |
| **P5 — Scale & Expand** | 10     | 🔴 Plan only  | ongoing  | —                                                                                                                  |

\* P1 retag covers the move from mock-only to server↔panel proxy + real UXP adapter.
Text overlay (P1.17) and transitions (P1.18) are intentionally deferred — see
`KNOWN-LIMITATION` notes in `packages/premiere-adapter/src/uxp.ts`.

\*\*\* P3 retag adds Plan Executor, LLM-assisted refiner, Style Learner (diff
capture + pattern extraction + feedback), versioning + .style import/export,
60-preset effect library, panel Style editor with Plan/Dry-Run/Apply flow, and a
9-test E2E suite. Visual YAML form-builder (P3.17 ideal version) is shipped as a
working text editor with JSON context — full form controls deferred to P4 polish.

\*\* P2 retag adds embeddings + ChromaDB, the `context.*` RPC namespace, the panel
Context tab, and 16-test pytest suite covering the ingest pipeline. Job queue
(P2.14) deliberately deferred — current ingest is sync but cached; revisit when
batch indexing latency becomes a UX problem.

## What changed at `v0.2.1-control-live`

- `UXPPremiereAdapter` calls the real `premierepro` UXP module (apiVersion 2)
  using `project.lockedAccess()` for automatic undo grouping per mutation.
- `RemotePremiereAdapter` forwards every IPremiereAdapter method to a
  pluggable send fn, used by the Node server to proxy MCP/Claude Desktop
  calls into the connected UXP panel.
- WS server tracks the active panel socket, exposes `panelCall()` and
  `isPanelConnected()`; falls back to the local mock when no panel is
  registered so dev/CI keeps working without Premiere open.
- Panel ws-client sends `_panel.register` handshake on connect, handles
  inbound RPC via the shared dispatcher, adds exponential-backoff
  reconnect and 25-second heartbeat.
- Dispatcher auto-brackets every mutating call in a `beginUndoGroup`/
  `endUndoGroup` pair and runs each call through an exponential retry
  on transient errors (timeouts, scene busy, ECONNRESET, …).
- `nl.query` RPC method runs an Anthropic tool-use agent loop over all
  29 Premiere tools — the panel's free-text command bar uses it when
  the input doesn't match a built-in shortcut.
- 14-test integration suite exercises every tool group through the
  full dispatcher.

Each macro-phase ends with a **MILESTONE** — full regression test +
tag + ADR. See [`docs/adr/`](../adr/) for accepted architectural
decisions.
