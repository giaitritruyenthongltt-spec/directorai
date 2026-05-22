# ADR-0001: Core technology stack

- **Status**: Accepted
- **Date**: 2026-05-22
- **Deciders**: DirectorAI Founding Team

## Context

DirectorAI must integrate deeply with Adobe Premiere Pro, orchestrate AI models (Claude), and process media at scale (transcription, vision, scene detection). We need a stack that:

1. Supports modern Adobe extensibility (UXP is the path forward; CEP is deprecated).
2. Has strong types for safety in a large, long-lived codebase.
3. Has best-in-class ML/audio/video tooling (Python ecosystem).
4. Can be packaged as a desktop product for non-technical users.

## Decision

- **UXP Plugin** (panel inside Premiere): **TypeScript + React**.
- **MCP Server** (Claude ↔ Premiere bridge): **TypeScript (Node.js)**.
- **Context Engine** (ML/media processing): **Python 3.11 + FastAPI**.
- **Communication**: WebSocket + JSON-RPC (panel ↔ server), MCP protocol (server ↔ Claude), HTTP (server ↔ context engine).
- **Build**: pnpm + turborepo monorepo. uv for Python.
- **Test**: Vitest (TS), pytest (Python).
- **Lint/Format**: ESLint + Prettier (TS), Ruff (Python).

## Consequences

**Positive**:

- One primary language (TS) with shared types between panel and server eliminates a class of drift bugs.
- Python sidecar lets us use faster-whisper, librosa, PySceneDetect without Node port pain.
- pnpm + turborepo handle large monorepo with good ergonomics.

**Negative**:

- Two runtimes (Node + Python) means two install dependencies for end users — we'll package both.
- UXP is newer with smaller community than CEP; will hit rough edges. Mitigation: keep adapter layer thin.

**Neutral**:

- ExtendScript fallback may be needed for specific Premiere APIs UXP doesn't yet expose; if so, wrap behind adapter interface.

## Alternatives Considered

- **Pure CEP (no UXP)**: Faster to start, but Adobe is sunsetting CEP. Rejected for long-term sustainability.
- **Python-only**: Would require py2node IPC and lose the TS+React UX. Rejected.
- **Rust core + TS UI**: Performance gain not worth team velocity loss at this stage.

## References

- Adobe UXP for Premiere: https://developer.adobe.com/premiere-pro/uxp/
- pnpm workspaces: https://pnpm.io/workspaces
- Turborepo: https://turbo.build/repo/docs
