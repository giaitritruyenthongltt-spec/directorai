# ADR-0014: DaVinci Resolve adapter + cross-NLE design

- **Status**: Accepted
- **Date**: 2026-05-31
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

P5 Section L is "open a second host". DirectorAI was Premiere-only
through v1.x; DaVinci Resolve is the next obvious NLE — large
creator base, scriptable from Python, complementary to Premiere
(different aesthetic, different cohort). Adding it now (Sprint 10)
is cheaper than later: every host-specific decision we accumulate
makes the abstraction muddier.

The design constraint: **don't touch the cut planner, executor,
dispatcher, plugin SDK, or any consumer of the adapter** when adding
the new host.

## Decision

### Rename `IPremiereAdapter` → `INLEAdapter` (P5.03a)

The interface now describes _any_ non-linear editor. The Premiere-
specific name was a historical accident from when only Premiere
existed.

- New canonical: `INLEAdapter` with `kind: 'mock' | 'uxp' | 'davinci'`.
- Deprecated alias: `type IPremiereAdapter = INLEAdapter` —
  removable in v2.0 per `docs/guides/sdk-versioning.md`.

All 26 call sites (panel, server, cut planner, plugin loader, SDK)
keep compiling without changes. Tests stay green. SDK surface
gains `INLEAdapter` but it's a type-only export, so the runtime
snapshot doesn't change.

### `@directorai/davinci-adapter` (P5.03b)

New workspace package. Three exports:

| Symbol               | Purpose                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MockDaVinciAdapter` | Behavioural mock; same model as `MockPremiereAdapter` but reports `kind: 'davinci'`. Used by tests + dev mode. |
| `DaVinciAdapter`     | Real adapter. Routes every `INLEAdapter` method through an `IDaVinciBridge`.                                   |
| `MockDaVinciBridge`  | In-memory bridge used by unit tests; records calls + returns canned responses.                                 |

Composition over inheritance: `MockDaVinciAdapter` _wraps_ a
`MockPremiereAdapter` because the parent's `readonly kind = 'mock' as const`
literal can't be widened by a subclass. Composition gives us the
right `.kind` discriminator and reuses every line of state-machine
behaviour.

### Bridge protocol (P5.03c)

DaVinci's scripting API is a Python module. From Node we plan to
run a long-lived Python subprocess (`scripts/da-bridge.py`,
owner-completed when Resolve is available for live verification)
and exchange JSON over stdio:

```
┌─ Node ─────────────────┐  JSON/stdio  ┌─ Python (Resolve env) ─┐
│ DaVinciAdapter         │ ──────────► │ scripts/da-bridge.py    │
│   ↓ invoke(method)     │ ◄────────── │   ↓ resolve.GetCurrentProject() │
│ IDaVinciBridge.call    │             │ json.dumps(result)       │
└────────────────────────┘             └─────────────────────────┘
```

- `BridgeRequest = { id, method, params? }` mirrors our RPC names
  one-to-one (`project.get`, `timeline.cutClip`, etc.).
- `BridgeResponse` is a discriminated union with `ok: true | false`.
- Errors translate to thrown `Error` at the adapter boundary; the
  existing dispatcher retry + cancellation still applies.

The `IDaVinciBridge` interface is injectable so unit tests don't
spawn Python. The production bridge (`spawnDaVinciBridge()`) is the
P5.03c-extension — needs Resolve installed; owner-completed.

### Factory (P5.03d)

`detectHostNLE({ explicit?, env?, probe? })` is a pure function:

```
explicit  >  DIRECTORAI_NLE_HOST env  >  probe()  >  'mock'
```

`createMockAdapterForHost(host)` builds the right _mock_ — production
code wires UXP / DaVinci adapters separately because each needs
real host state (panel socket, Python subprocess). The factory's
job is to _select_, not to _own_.

## Consequences

**Positive**

- Adding a third host (Vegas, Final Cut?) is one more package
  following the same shape.
- The cut planner + style engine + plugin SDK all stay
  host-agnostic — they never grow a "if davinci then …" branch.
- The bridge abstraction means we can mock Python entirely in
  CI; the real Python only runs on machines with Resolve.

**Negative**

- We carry composition overhead in `MockDaVinciAdapter` — 28
  one-line delegations to the inner mock. Acceptable for the
  mock; the real `DaVinciAdapter` already has 28 methods of its
  own (each is a `bridge.call`), so there's no extra cost there.
- The real Python bridge is owner-completed (needs Resolve).
  Without it, only the mock path is exercisable in CI. We accept
  this — the architecture is the value; the Python integration
  is mechanical.
- `IPremiereAdapter` lingers as a deprecated alias through v1.x.
  Plugins written today should use `INLEAdapter` directly.

**Neutral**

- The bridge JSON-over-stdio protocol is "yet another wire
  format" but it's identical in shape to our existing dispatcher
  RPC, so reviewers don't need new mental models.

## Alternatives considered

1. **Translate every cut-planner output to DaVinci-Python directly
   at the executor level.** Rejected — bypasses the `INLEAdapter`
   abstraction and forces every consumer to know about the second
   host.
2. **Use a shared Python bridge for both PPro + DaVinci.**
   Rejected — Premiere already has UXP, which is faster than
   subprocess and tighter for undo grouping. Two bridges is fine.
3. **Embed a Resolve plugin instead of bridging.** Rejected —
   Resolve doesn't expose a UXP-equivalent in-app panel; the
   officially-supported integration point is Python scripting.

## References

- ADR-0013 (public SDK surface) — `INLEAdapter` is Tier-1
- `docs/guides/sdk-versioning.md` — `IPremiereAdapter` deprecation
  path
- `packages/davinci-adapter/src/{mock,bridge,davinci,factory}.ts`
