# ADR-0004: Context-engine bridge via context.\* RPC namespace

- **Status**: Accepted
- **Date**: 2026-05-23
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

The Python context-engine (`apps/context-engine`, FastAPI on :8000)
owns the ML-heavy work: Whisper transcription, PySceneDetect, librosa
beats, Claude Vision, sentence-transformers + ChromaDB embeddings.

Claude (via MCP and via the panel's `nl.query` agent) needs to drive
these features. We already had a way to dispatch Premiere tool calls
through the panel proxy — but context-engine is a separate process, and
calls to it must NOT be forwarded to the UXP panel (which doesn't have
Python or the model weights).

## Decision

Introduce a `context.*` RPC namespace handled **directly by the Node
server**, not by the dispatcher and not by the panel:

- New `context-client.ts` is an HTTP client for the Python service.
- New `context-router.ts` wires 7 methods (transcribe, findScenes,
  findBeats, analyzeVisual, searchClips, ingest, health) to the client
  with Zod validation.
- WS server adds a branch in `handleInboundRequest`: when the method
  starts with `context.`, it goes through `opts.onContext` instead of
  `dispatchRpc` or the panel proxy.
- MCP server uses `buildMcpToolsWithContext()` so Claude Desktop sees
  both Premiere tools (29) and context tools (7) as a single catalog.
- The NL router's tool catalog now optionally includes context tools so
  the panel's free-text command can semantically search clips.

Embedding indexing is automatic: `/ingest` calls `embed_ingest_result`
as a best-effort post-step so the corpus stays in sync with cached
ingest results. Embeddings live at `<cache_dir>/chroma` using
ChromaDB's PersistentClient.

## Consequences

**Positive**

- Strict separation: Premiere domain → panel; ML domain → Python.
- One MCP tool catalog covers both layers, so Claude can chain context
  queries into Premiere edits inside a single agent turn (e.g. "find
  the part about plugins and cut everything else").
- Server is the single trust boundary that talks to both processes.

**Negative**

- The HTTP hop to Python adds latency on top of WS to the panel.
  Acceptable for ML-heavy ops which are already > 1s. Will revisit if
  search latency becomes interactive.
- We now have two distinct schema definitions for "context data": the
  Pydantic models on the Python side (source of truth) and the
  TypeScript types in `@directorai/core/types/context.ts` (consumer).
  Drift risk; mitigated by keeping both narrow.

**Neutral**

- Embeddings auto-indexing is best-effort: a failure (missing model
  weights, disk full) doesn't block ingest from returning the result.
  Users can re-trigger indexing later by calling `/embeddings/index`
  explicitly.

## Alternatives Considered

1. **Embed context-engine in the Node server via WebAssembly or child
   processes.** Rejected: torch/transformers don't run well outside
   CPython; spawning Python per request adds 2s of startup overhead.
2. **Run embeddings inside the Anthropic API.** Rejected: vector search
   needs to be local (privacy + cost on every project ingest).
3. **Skip embeddings entirely and rely on plain-text keyword search.**
   Rejected: defeats the "Cắt đoạn tôi nói về plugin" MILESTONE 2 demo.

## References

- ChromaDB persistent client: https://docs.trychroma.com/
- sentence-transformers: https://www.sbert.net/
- ADR-0003 (server-panel proxy) — the analogue for Premiere RPC.
