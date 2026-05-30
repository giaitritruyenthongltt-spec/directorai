# ADR-0012: Multi-LLM router + BYOK

- **Status**: Accepted
- **Date**: 2026-05-30
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

v1.0 ships with `@directorai/llm-client` pinned to Anthropic. That's
fine for the closed beta — we control the cost model and the
prompt quality. Public launch breaks both assumptions:

1. **Single-vendor risk.** A single Anthropic outage takes
   `nl.query` + the LLM refiner offline for every user. Beta
   tolerated it; paying customers won't.
2. **Per-user cost variance.** Some users have OpenAI credits, some
   are on Google's free Gemini tier, some don't want any LLM costs
   beyond what they explicitly paid us for. Forcing one provider
   pushes them away.

Section M (P5.04 a–d) closes both gaps without a heavy rewrite.

## Decision

### Provider interface (P5.04a)

`ILLMClient` already existed (a holdover from when we sketched
multi-provider). We keep it, with two methods:

- `complete(req)` — single-shot text generation. Required.
- `runAgent(req)` — agent loop with tool use. Optional. Providers
  that don't support tools (yet) can omit it; the router skips
  them in the chain.

Anthropic, OpenAI, and Gemini all implement the full interface.
Adding a fourth (Mistral, Cohere, local Ollama) is a single new
file — same shape, same wire translation pattern.

### No SDKs at the boundary (P5.04b + P5.04c)

`OpenAIClient` and `GeminiClient` both `fetch` directly against the
provider's REST API. We deliberately reject the official SDKs for
the same reasons we rejected Stripe's SDK and `discord.js`:

- Bundle size: `openai` adds ~4 MB transitive; `@google/generative-ai`
  is similar.
- Coupling: SDKs encode auth + retry + telemetry decisions we want
  to make ourselves.
- Surface: we only call two endpoints per provider. The SDK is
  overkill.

Tradeoff: every wire-shape change at the provider needs us to ship a
patch. We accept this — the API surface is stable enough that this
hasn't bitten Anthropic, OpenAI, or Gemini consumers since 2024.

### Router (P5.04a + P5.04d)

`LLMRouter` has two layers:

1. **Chain fallback** — primary + N fallbacks; `complete` and
   `runAgent` walk until one succeeds. Last error surfaces.
2. **Task-driven selection** — `routeForTask(reg, task)` picks the
   appropriate "strong" or "cheap" tier per provider based on a
   small task enum:

   | Task             | Tier   | Use case                             |
   | ---------------- | ------ | ------------------------------------ |
   | `agent`          | strong | nl.query agent loop                  |
   | `refine`         | strong | LLM pass over rule-based plan        |
   | `cheap-classify` | cheap  | sentence-level filler detection, NPS |
   | `default`        | strong | catch-all                            |

Order within a tier: Anthropic → OpenAI → Gemini. Driven by:

- Quality benchmark at our specific tasks (Anthropic wins our
  internal evals as of 2026 Q2).
- Backwards compatibility with v0.x — existing Anthropic deploys
  keep their primary.

### BYOK (P5.04d)

`registryFromKeys({ anthropic?, openai?, gemini?, …Model? })`
builds a `ProviderRegistry` from whichever env vars are set. Optional
`*Model` overrides let users pin specific models (newer Opus, older
Sonnet) without code changes.

The boot script reads `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GEMINI_API_KEY` (in addition to the legacy single key), calls
`registryFromKeys`, then `routeForTask`. Missing keys silently
drop their provider from the chain — single-provider deploys
still work.

## Consequences

**Positive**

- A single vendor outage no longer takes the product down.
- Users with non-Anthropic credits keep their existing keys
  working — no forced migration.
- Cheap-task routing meaningfully cuts cost for high-volume calls
  (e.g. filler detection at scale).
- Adding a new provider is one file (~200 lines) — Mistral,
  Cohere, local Ollama all fit the same shape.

**Negative**

- We now maintain three wire-shape translators. Provider API
  changes (rare but real) become our problem.
- Tool-use semantics differ enough across providers that the
  `runAgent` translator is the trickiest part of each file. We've
  unit-tested both the happy path and tool-error paths for both
  new providers.
- No streaming yet — `complete` is one-shot. Streaming lands when
  we wire it into the panel for live response display.

**Neutral**

- The Anthropic SDK is still in `package.json` for the existing
  `anthropic.ts`. We chose not to rewrite the working code; a
  future refactor can replace it with raw fetch for consistency.

## Alternatives considered

1. **Use the OpenRouter API and let it route for us.** Rejected —
   adds a vendor we don't need and obscures error semantics. We
   want direct provider errors surfaced to users.
2. **Provider plugins via `@directorai/sdk` (P5.01).** Considered —
   we will eventually expose `ILLMClient` from the SDK so 3rd
   parties can add providers. P5.04 stays in `@directorai/llm-client`
   because the cost of the indirection is real for the three core
   providers we ship.
3. **Single "best model right now" abstraction (e.g. always pick
   the cheapest acceptable model).** Rejected — quality vs cost is
   user-dependent. The task enum is the smallest sensible
   abstraction.

## References

- ADR-0011 (public launch)
- `packages/llm-client/src/{openai,gemini,router}.ts`
- `docs/guides/p5-plan.md` — full P5 fine-grained plan
