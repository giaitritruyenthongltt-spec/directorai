# @directorai/server

The brain of DirectorAI:

- **MCP server** — exposes 17+ tools to Claude via the Model Context Protocol
- **WebSocket server** — bidirectional JSON-RPC with the UXP panel
- **RPC dispatcher** — maps method names → premiere-adapter calls (typed via Zod)

## Run

```bash
pnpm --filter @directorai/server dev
# WebSocket on :7778, MCP via stdio
```

## Layer

Layers 4–5 (Tooling + Orchestration).
