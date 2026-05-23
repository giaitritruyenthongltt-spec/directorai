# ADR-0003: Server proxies MCP tool calls to the UXP panel

- **Status**: Accepted
- **Date**: 2026-05-23
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

The DirectorAI server is a Node process. Claude Desktop talks to it via
the MCP protocol; UXP panel talks to it via WebSocket JSON-RPC. The
`premierepro` module — the only way to drive real Premiere Pro — is
only available inside the UXP plugin runtime (`require('premierepro')`
in a panel JS context). It cannot be loaded from Node.

Until v0.2.0, the server held a `MockPremiereAdapter` and every MCP
call resolved against mock state. Claude Desktop tool calls round-tripped
correctly but never touched a real timeline. We need real edits without
losing the ability to run dev/CI without Premiere installed.

## Decision

The server hosts **no real Premiere adapter**. Instead:

1. The UXP panel constructs a `UXPPremiereAdapter` locally and registers
   itself with the server via the JSON-RPC method `_panel.register`.
2. The server stores the active panel socket and exposes a
   `panelCall(method, params)` helper that sends a JSON-RPC request to
   the panel and awaits the response.
3. The MCP server is handed a `RemotePremiereAdapter` whose `send`
   callback dispatches to `panelCall` when a panel is connected, and to
   a local `MockPremiereAdapter` when one is not.
4. The panel side handles every inbound RPC by running it through a
   shared dispatcher (`@directorai/premiere-adapter#dispatchRpc`) which
   validates with Zod, brackets mutating calls in a `beginUndoGroup`/
   `endUndoGroup` pair, and retries transient errors with exponential
   backoff.

## Consequences

**Positive**

- Server keeps zero hard dependency on Premiere; dev / CI / Claude
  Desktop integration tests run anywhere.
- Mock fallback means a panel-less Claude Desktop session still gets
  predictable tool results.
- Single dispatcher implementation is shared between server (mock path)
  and panel (live path), so behaviour is identical modulo the adapter.
- The undo wrapper at the dispatcher level guarantees every mutation
  shows up as one undo step in Premiere regardless of which call site
  initiated it.

**Negative**

- Tool calls now do an extra network hop (Claude → server → panel) so
  p95 latency is bounded by WebSocket round-trip rather than direct
  process call. Acceptable on localhost; will need a perf budget once
  we ship cloud render (P5.05).
- If the panel disconnects mid-call, in-flight requests are rejected
  with a clear error; the server doesn't retry-then-fallback because
  that would risk applying the operation to mock state instead of the
  real timeline.

**Neutral**

- The `IPremiereAdapter` interface is now implemented by three classes:
  `MockPremiereAdapter`, `UXPPremiereAdapter`, `RemotePremiereAdapter`.
  Future NLE adapters (DaVinci, P5.03) will plug into the same shape.

## Alternatives Considered

1. **Bundle a Node addon that bridges to Premiere via CEP/ExtendScript.**
   Rejected: Adobe is deprecating CEP. ExtendScript is single-threaded
   and has no streaming/async semantics that fit our pipeline.
2. **Run the LLM agent loop inside the panel.** Rejected: panel JS
   context has strict CSP and limited Node API surface; running a
   long-lived Anthropic SDK loop there inflates the bundle and blocks
   the UI thread.
3. **Make the server connect to Premiere via DOM scripting protocol.**
   Rejected: that protocol is internal/undocumented for PPro and breaks
   between versions.

## References

- Adobe UXP for Premiere Pro overview:
  https://developer.adobe.com/premiere-pro/uxp/
- JSON-RPC 2.0: https://www.jsonrpc.org/specification
