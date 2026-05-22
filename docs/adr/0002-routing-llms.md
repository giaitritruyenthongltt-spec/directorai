# ADR-0002: Multi-LLM Router with Anthropic primary

- **Status**: Accepted
- **Date**: 2026-05-22
- **Deciders**: DirectorAI Founding Team

## Context

DirectorAI uses Claude as the primary planning model. Outages, rate limits, or per-region availability can disrupt user workflows. We also want users to be able to bring their own keys.

## Decision

- `@directorai/llm-client` exposes `ILLMClient` interface
- `AnthropicClient` is the canonical implementation
- `LLMRouter` accepts a primary + fallback chain
- Future: `OpenAIClient`, `GeminiClient` implementations behind the same interface

## Consequences

**Positive**:

- Loose coupling — swap providers without touching domain layer
- Resilient — fallback chain handles transient failures
- BYOK-friendly — each user can wire their own keys

**Negative**:

- Provider-specific features (e.g. Claude Tool Use, OpenAI Function Calling) need a normalized abstraction layer
- Cost optimization across providers requires routing logic per-request type

## Status

Anthropic implementation only in P3. OpenAI + Gemini deferred to P5.04.
