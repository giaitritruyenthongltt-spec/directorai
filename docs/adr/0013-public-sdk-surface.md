# ADR-0013: Public SDK surface

- **Status**: Accepted
- **Date**: 2026-05-31
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

For P5 Section J (Plugin SDK, P5.01) we ship `@directorai/sdk` — the
single public package 3rd-party developers import. Today, every
workspace package is technically reachable via pnpm symlinks, but
that's an accident of monorepo layout, not a public commitment.

The decision is: **what becomes the SDK, and what stays internal?**
Two competing pressures:

- **More public surface** → plugins can do more.
- **More public surface** → we can break less, refactor less,
  iterate slower internally.

We pick "narrow on purpose" — when in doubt, keep it internal and
add to the SDK on a clear use case.

## Decision

### Tier 1 — public (re-exported by `@directorai/sdk`)

These become the _committed_ surface. Semver applies: removals
require 2-minor-version deprecation (P5.01e).

| Export                                          | Source package                 | Why public                                           |
| ----------------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| `Seconds`, `Time*`, basic core types            | `@directorai/core`             | Every plugin handles timeline positions.             |
| `Style`, `StyleSchema`, `parseStyle`            | `@directorai/style-engine`     | Plugins author styles.                               |
| `getBuiltinStyle`, `listBuiltinStyles`          | `@directorai/style-engine`     | Plugins extend / wrap builtins.                      |
| `Plan`, `PlanStep`                              | `@directorai/cut-planner`      | Read-only inspection by analytics plugins.           |
| `planCuts({ style, context })`                  | `@directorai/cut-planner`      | Plugins can re-plan with a tweaked style.            |
| `MediaContext`                                  | `@directorai/cut-planner`      | Required input to `planCuts`.                        |
| `EFFECT_PRESETS`, `EffectPreset`                | `@directorai/effect-library`   | Plugins extend the preset list.                      |
| `TelemetryEvent`, `validateEvent`               | `@directorai/telemetry`        | Plugins emit catalog-validated events.               |
| `IPremiereAdapter` (interface only)             | `@directorai/premiere-adapter` | Plugins call adapter methods through the gated host. |
| `LLMToolDef`, `LLMToolCall`, `ILLMClient` types | `@directorai/llm-client`       | Plugins can register tools for `nl.query`.           |
| `PluginManifestSchema`, `PluginContext` types   | `@directorai/sdk` (new)        | The plugin protocol itself.                          |

### Tier 2 — internal (NOT re-exported)

These stay reachable in the monorepo but **not** part of the SDK.
Plugins importing them directly are explicitly unsupported and may
break between releases.

- `executePlan` — only the host runs plans against the real adapter
  (plugins observe via lifecycle hooks, not direct execute).
- `dispatchRpc`, `ReadCache`, `withRetry`, `AbortError` — internal
  dispatcher concerns.
- `MockPremiereAdapter`, `UXPPremiereAdapter`, `RemotePremiereAdapter`
  — only the factory + host choose implementations.
- `AnthropicClient`, `OpenAIClient`, `GeminiClient`, `LLMRouter`,
  `registryFromKeys` — credentials don't belong to plugins.
- `LicenseIssuer`, `verifyStripeWebhook`, `signLicense` — private
  key never reaches plugins.
- `CheckpointStore`, `ProgressBus`, `ConsentStore` — host-only.
- Every `@directorai/server` internal (`ws-server`, routers).

### Tier 3 — provisional (likely public in v1.x)

We keep these reachable through `@directorai/sdk` only when the
first concrete plugin use case appears. Listed so contributors know
they're candidates, not surprises:

- `LearnerStore` (P3.18) — once persistence + history shipping
  feature is stable.
- `StyleVersionStore`, `diffStyles`, `compareStylesAB` — analytics
  - marketplace likely need these.
- `RenderQueue` (P5.05b) — cloud render integration.

## Why this split

**Reason 1: surface = liability.** Every public symbol is a
refactor we can't do without a deprecation cycle. Today's 11-symbol
SDK is small enough that we can actually maintain it.

**Reason 2: plugins shouldn't touch credentials.** LLM clients,
license issuers, Stripe — none of these belong in a 3rd-party
plugin's hands.

**Reason 3: read > write.** Plugins observing the system (plan,
context, style) are safer than plugins mutating it. The
`PluginContext` (P5.01d) gates _writes_ per-permission; reads are
free.

**Reason 4: predictable break points.** Tier 1 versions with the
SDK; Tier 2 changes freely with the host. A plugin that imports
the SDK alone gets stable behavior across host minor versions.

## Consequences

**Positive**

- Internal refactors (cache eviction strategy, dispatcher routing,
  new providers) don't trigger plugin breakage.
- Plugin authors have one package to read — the SDK README is the
  whole public API.
- Tier 3 doc is a roadmap, not a debt.

**Negative**

- Adding to the SDK takes a deliberate ADR (or at least a doc
  bump). Slows down the "give a contributor what they asked for"
  loop. We accept this — most asks belong in Tier 3 first, real
  plugin examples second, public surface third.
- Plugins that need credentials (e.g. a custom LLM adapter) cannot
  ship as-is — they need to be 1st-party packages or follow a
  formal review.

**Neutral**

- The CI surface-diff guard (P5.01e) is the enforcement mechanism.
  If someone accidentally re-exports an internal symbol, CI flags
  it before merge.

## Alternatives considered

1. **Export everything.** Rejected — turns every dispatcher tweak
   into a breaking change.
2. **Whitelist by feature flag at runtime.** Rejected — adds a
   parallel mechanism to the TypeScript export system. Use the
   compiler.
3. **Separate "core" and "advanced" SDK packages.** Rejected for
   v1 — one SDK is simpler to document. Re-evaluate when surface
   passes ~30 symbols.

## References

- ADR-0011 (public launch)
- ADR-0012 (multi-LLM router)
- `docs/guides/p5-plan.md` — Section J breakdown
- `packages/sdk/` — implementation
