# Journalist FAQ

The questions we get asked most. Quote freely.

## Is DirectorAI an AI editor or a plugin?

Both. It's a UXP plugin that lives inside Premiere Pro 2024+. The
heavy lifting — transcribe, scene detect, beats, vision, planning —
happens in local Node + Python sidecars. The LLM is optional and
only refines a deterministic plan.

## How is this different from AutoEdit / AutoCut?

Three ways. (1) Those tools handle generic talking-head trims; we
plan whole cuts including beat sync, B-roll, color, audio mix.
(2) Our Style Engine learns from your manual corrections after each
apply. (3) Everything runs locally — media never uploads.

## Does it require an Anthropic API key?

No. Built-in styles + rule-based cut planner work without a key. The
key only enables the LLM refiner pass and the natural-language
command bar. Power users pay their own API costs.

## Mac support?

Not in v1.0. Windows-first while we get the installer (Authenticode
signing, Python sidecar bootstrap) right. macOS DMG is on the P5
roadmap — likely Q1 2027.

## What about copyright / training data?

DirectorAI never trains on your footage. The LLM refiner sees a
JSON summary of the plan, not the media. Whisper, PySceneDetect,
librosa, and Claude Vision all run as inference-only on your
machine.

## Privacy + telemetry?

Telemetry is opt-in (off by default). The catalog is capped at 20
events — counters, durations, error classes, never PII or media.
GDPR delete is one RPC call from the panel. Full event list lives
in `@directorai/telemetry`'s `events.ts`.

## How do you make money?

One-time Basic $9.99 / Pro $109, and a $19/mo Subscription that
includes the upcoming Style Pack marketplace. No ads, no upsells,
no data resale.

## What's next after v1.0?

P5 plan (post-launch, ongoing):

- Style Pack marketplace (70/30 split with creators)
- DaVinci Resolve adapter
- Multi-LLM router (OpenAI, Gemini, BYOK)
- Cloud render service for users without strong GPUs
- macOS DMG

## Team size + funding?

Founding team is small (Vietnam + remote). No outside funding to
date; ship first, raise later if we need to.

## Embargoed builds + briefings?

Email press@directorai.app. Standard 48-hour embargo, signed
beta build + technical Q&A available.
