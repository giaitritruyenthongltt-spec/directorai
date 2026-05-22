# DirectorAI Architecture Overview

## 6-Layer Architecture

```
┌──────────────────────────────────────────────────────────┐
│ L6: Presentation                                         │
│   apps/panel (UXP+React)  apps/cli  web-dashboard        │
└──────────────────┬───────────────────────────────────────┘
                   │ WebSocket / JSON-RPC
┌──────────────────▼───────────────────────────────────────┐
│ L5: Orchestration                                        │
│   AI Agent loop · Planner · Tool router · Memory         │
└──────────────────┬───────────────────────────────────────┘
                   │ MCP protocol
┌──────────────────▼───────────────────────────────────────┐
│ L4: Tooling (MCP)                                        │
│   packages/mcp-tools (timeline · effects · export · ...) │
└──────────┬─────────────────────────┬─────────────────────┘
           │                         │
┌──────────▼─────────┐   ┌───────────▼─────────────────────┐
│ L3a: Adapters       │   │ L3b: Context Engine             │
│   premiere-adapter  │   │   apps/context-engine (Python)  │
│   ffmpeg-adapter    │   │   transcribe · vision · scene   │
└──────────┬──────────┘   └───────────┬─────────────────────┘
           │                         │
┌──────────▼─────────────────────────▼─────────────────────┐
│ L2: Domain                                               │
│   packages/core · style-engine · cut-planner             │
└──────────────────┬───────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────┐
│ L1: Infrastructure                                       │
│   packages/shared · packages/config · llm-client         │
└──────────────────────────────────────────────────────────┘
```

## Dependency rule

**Dependencies flow downward only.** A higher layer may import from a lower layer; a lower layer must never import from a higher layer.

## Module catalog

| Package                        | Layer | Responsibility                        |
| ------------------------------ | ----- | ------------------------------------- |
| `@directorai/shared`           | 1     | Logger, error classes, generic utils  |
| `@directorai/config`           | 1     | Env loading + Zod validation          |
| `@directorai/llm-client`       | 1     | Claude API wrapper                    |
| `@directorai/core`             | 2     | Domain types (Project, Clip, Effect…) |
| `@directorai/style-engine`     | 2     | Style DSL parser + matcher            |
| `@directorai/cut-planner`      | 2     | Plan generation algorithm             |
| `@directorai/effect-library`   | 2     | Effect presets                        |
| `@directorai/premiere-adapter` | 3     | UXP API wrapper                       |
| `apps/context-engine`          | 3     | Python ML service                     |
| `@directorai/mcp-tools`        | 4     | MCP tool definitions                  |
| `apps/server`                  | 4-5   | MCP server + agent orchestration      |
| `apps/panel`                   | 6     | UXP Panel UI                          |
| `apps/cli`                     | 6     | Developer CLI                         |
