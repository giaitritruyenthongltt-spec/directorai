# SDK versioning + deprecation policy

`@directorai/sdk` follows **semver strictly**:

| Version bump | Triggers                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **major**    | removing or renaming an exported symbol, breaking a type signature, dropping a `PluginPermission` |
| **minor**    | adding a new exported symbol, new `PluginPermission`, new optional field on `PluginManifest`      |
| **patch**    | bug fixes that don't change the surface                                                           |

The SDK is versioned **separately** from the host. Plugins declare
their compatibility range via the manifest's `hostSdk` field:

```json
{ "hostSdk": "^1.0.0" }
```

Host versions are tracked in this file's **Compatibility matrix**.

## Compatibility matrix

| Host range     | SDK version | Status      | Notes                                 |
| -------------- | ----------- | ----------- | ------------------------------------- |
| `v1.1.0-sdk` → | `1.0.0`     | current     | Initial public SDK surface.           |
| `v0.x` host    | n/a         | unsupported | SDK didn't exist; use Tier-2 imports. |

## Deprecation policy

We commit to **2-minor-version notice** before removing any public
symbol. Practical rules:

1. **Mark deprecated.** Add `/** @deprecated since 1.x — use Y instead */`
   to the JSDoc. Bump SDK minor.
2. **Maintain.** Keep the deprecated symbol _working_ for at least
   2 minor versions (e.g. deprecated in 1.3 → removable in 1.5).
3. **Remove.** Bump SDK major; release notes call it out.

If a symbol is wrong on day 1 (security flaw, leaks a secret), the
deprecation cycle does NOT apply — we bump major immediately and
ship the migration guide.

## CI surface diff

`tools/sdk-surface-diff.ts` compares the snapshot at
`docs/sdk-surface.txt` against the current TypeScript surface of
`@directorai/sdk`. CI runs the comparison on every PR; mismatches
fail the build until either:

- the maintainer updates the snapshot (intentional surface change), or
- the offending re-export is reverted.

Regenerate the snapshot when a surface change is intentional:

```
pnpm sdk:surface --write
```

Inspect without writing:

```
pnpm sdk:surface
```

This is the same guard ADR-0013 mentions for "no accidental Tier-2
leak into Tier-1".

## Versioning workflow

When you change `@directorai/sdk`:

1. Decide the bump level (major / minor / patch — see table above).
2. Update `packages/sdk/package.json` `version`.
3. Update `SDK_VERSION` constant in `packages/sdk/src/index.ts`.
4. Update this file's compatibility matrix.
5. If removing a deprecated symbol: link to the original deprecation
   in the release notes.
6. `pnpm sdk:surface --write` to refresh the snapshot.
7. Commit + tag `v1.x.0-sdk` (or whatever the milestone is).

## Why this matters

Every public symbol is a refactor we can't do casually. A 2-version
notice is short enough to keep the codebase moving and long enough
to give plugin authors a real chance to migrate (typical Adobe
release cadence is one minor every ~6 weeks → ~3 months notice).
