# Glossary

| Term               | Definition                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **UXP**            | Unified Extensibility Platform — Adobe's modern plugin runtime (replacing CEP).            |
| **CEP**            | Common Extensibility Platform — Adobe's legacy plugin runtime, being deprecated.           |
| **MCP**            | Model Context Protocol — Anthropic's standard for tool-using AI agents.                    |
| **MOGRT**          | Motion Graphics Template — Premiere's reusable animated graphics format.                   |
| **Adapter**        | Layer 3 module that wraps an external system (Premiere, ffmpeg) behind a stable interface. |
| **Context Engine** | The Python service that produces transcripts, scene boundaries, vision tags from media.    |
| **Style DSL**      | YAML-based language describing how a video should be cut.                                  |
| **Cut Planner**    | Algorithm that converts (context + style) into a sequence of MCP tool calls.               |
| **Rough Cut**      | First-pass edit produced by the AI; expected to be refined manually.                       |
| **Idempotent**     | A tool call that produces the same outcome when run twice.                                 |
