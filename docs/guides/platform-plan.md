# DirectorAI Platform Plan (P5)

Once `v1.0.0` ships, DirectorAI evolves from a tool into a platform.

## P5.01 — Plugin API freeze

Define the public SDK surface that 3rd-party developers will use to build extensions.

- `@directorai/sdk` package with stable interfaces
- Versioning: semver, with deprecation policy (2-version notice)
- Plugin manifest schema
- Sandboxing: plugins run in their own context with limited adapter access

## P5.02 — Style Pack Marketplace

A storefront where creators sell/share styles.

- Hosting: `marketplace.directorai.app`
- Browse + search + preview (rendered sample clips)
- Purchase via Stripe (70/30 revenue split with creators)
- Pack installation: 1-click from marketplace → user's style library
- Featured packs curated monthly

## P5.03 — DaVinci Resolve adapter

Reuse Layers 1-2-4-5. Only Layer 3 (adapter) changes.

- `@directorai/davinci-adapter` package
- DaVinci scripting API wrapper
- Same `IPremiereAdapter` interface (rename to `INLEAdapter`)
- Factory detects host NLE and picks correct adapter

## P5.04 — Multi-LLM router

Reduce vendor lock-in and improve resilience.

- `@directorai/llm-client` already exists (Layer 1)
- Add OpenAI + Gemini adapters
- Routing rules: primary Claude, fallback GPT, cheap-task → Haiku
- Per-user BYOK option (bring your own key)

## P5.05 — Cloud render service

Offload Whisper / vision to GPU cloud for users without strong hardware.

- Containerized context-engine on Modal/Fly.io/RunPod
- Per-minute billing pass-through
- Privacy: media never persists, hashed file IDs only

## P5.06 — Team features

Shared style libraries for production teams.

- Workspace concept (multiple users)
- Style sync via central server
- Permission model: viewer / editor / admin
- Conflict resolution: last-write-wins with history

## P5.07 — Review/approve workflow

Producer reviews AI cut before merge to master sequence.

- Side-by-side compare (current vs proposed)
- Inline comments at timeline points
- Notification system (email + Slack)

## P5.08 — Mobile companion

Tweak styles + queue cloud renders from phone.

- iOS + Android (React Native)
- Read-only view of project context
- Edit style.yaml, preview impact
- Sync via cloud account

## P5.09 — Creator analytics

Help creators understand which styles + edits perform.

- Per-style usage stats (anonymized aggregate)
- Per-edit "approved by user" rate
- Recommendations: "users who like X also like Y"

## P5.10 — v2.0.0 Platform release

- All P5 features publicly available
- Sustained MRR growth >$50k/mo
- Marketplace has >100 published style packs
- 2+ NLE hosts supported
