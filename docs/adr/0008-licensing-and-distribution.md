# ADR-0008: Licensing + Windows distribution

- **Status**: Accepted
- **Date**: 2026-05-30
- **Deciders**: DirectorAI core team
- **Supersedes**: —

## Context

P4 sections A–C made the product reliable, observable, and fast.
Sections D + E give it something to sell: a license users can buy and
an installer they can run. We deliberately scope to Windows + a
Stripe-driven license-by-email flow for v1.0 — both shortest paths to
revenue. macOS DMG + license activation portal lands post-launch.

## Decision

### License protocol — Ed25519 (P4.17 + P4.20)

`@directorai/license` ships the wire format:

```
DA1.<base64-payload>.<base64-signature>
```

- The signed payload is a Zod-validated JSON with `id`, `email`, `sku`,
  `issuedAt`, `expiresAt`, optional `installId`.
- The verifier ships with the panel + server and only needs the public
  key. The private key lives wherever issuing runs (the Stripe
  webhook handler).
- `LicenseVerifier` keeps `lastOnlineCheckAt` and refuses if more than
  `offlineGraceMs` (default 7 days) has passed without a successful
  online activation — the P4.20 acceptance criterion.

Ed25519 over RSA: same security level at a fraction of the key
size (32 bytes vs 256+), no parameter choices to get wrong, native
in Node `crypto` since v12.

### Stripe webhook → license email (P4.18 + P4.19)

`verifyStripeWebhook` implements the official HMAC-SHA256 scheme
without taking the `stripe` SDK as a runtime dep (the SDK is heavy
and we only need the verifier path). After signature passes:

- The pipeline picks the SKU from `event.data.object.metadata.sku`
  (set in the Stripe Payment Link metadata).
- `LicenseIssuer.issue()` mints the payload, signs it with the
  private key, and hands off to a `Mailer` interface.
- `MemoryMailer` for dev/tests; production wires Postmark/SES at the
  boundary.
- `license-router.handleStripeWebhook` is the HTTP entry point —
  returns `{status, body}` so the boot script plugs into whatever
  HTTP layer ships (today: none — the marketing site infra in P4.39
  will own routing).

### License portal stub (P4.21)

`apps/portal/src/server.ts` is a 60-line vanilla Node HTTP server
that serves a "paste your key" page + `/api/license/verify`.
Tests exercise it on a free port. The portal upgrades to a real
authenticated dashboard in P4.40 alongside the marketing site;
shipping the stub now means beta testers have somewhere to inspect
their key.

### CCX bundling (P4.22)

`tools/bundle-ccx.ts` zips `apps/panel/dist/` + the source manifest
into a `.ccx` under `dist/installer/DirectorAI-<version>.ccx`. Uses
`yazl` (zero-dep zipping) to keep the tools dir light. The signing
script (`tools/sign-ccx.ps1`) is separate so unsigned builds for
review don't gate on the cert.

### Code signing (P4.23)

Two scripts — `sign-ccx.ps1` (Adobe UXP cert) and `sign-msi.ps1`
(Authenticode) — refuse to run without the relevant env vars and the
right OS tooling. Documented in `docs/guides/code-signing.md`.

### Windows MSI (P4.24 + P4.25)

`installer/wix/Product.wxs` is the WiX 5 source. `build-msi.ps1`
harvests each `dist/` directory into a ComponentGroup via `wix heat`
and then runs `wix build`. Per-user install scope (no admin needed)
keeps the installer fast and consent-friendly.

`tools/check-python.ps1` runs as a deferred custom action after file
copy:

1. If `python --version` reports 3.11 → exit 0.
2. Otherwise download the embeddable zip into
   `%LOCALAPPDATA%\DirectorAI\python\`, bootstrap pip + uv, and
   prepend to the user PATH.

The script is idempotent so it's safe to run from both the MSI and
the panel's first-run wizard.

### Auto-updater (P4.26)

`@directorai/updater` is composed from three injected primitives
(`fetcher`, `hasher`, `writer`) so the same `AutoUpdater` class
runs in production (undici + node:crypto + fs) and in unit tests
(deterministic stubs). The feed format is:

```json
{
  "version": "0.7.1",
  "url": "https://updates.directorai.app/win/DirectorAI-0.7.1.msi",
  "sha256": "…",
  "minSupportedVersion": "0.5.0",
  "notes": "…"
}
```

Every `.check()` validates Zod schema, runs `compareVersions`, and
verifies SHA-256 against the manifest before staging. Failure modes
(network down, hash mismatch, unsupported current version) surface
as `CheckResult.kind` rather than thrown exceptions; the caller
decides UX.

## Consequences

**Positive**

- We can take money: Stripe → email → activation works end-to-end
  in tests today.
- Offline grace is verifiable and bounded — no "phoned home daily"
  surveillance pattern.
- The MSI installs per-user (no admin) and brings its own Python
  sidecar; new users skip the hardest install step in
  `docs/guides/uxp-setup.md`.
- The updater can roll forward beta cohorts without forcing
  re-downloads of the whole app.

**Negative**

- Authenticode + Adobe UXP signing requires owner-completed env
  setup we can't automate. M4-γ ships unsigned builds; sign-on-CI
  is a P4.13 / P4.39 followup once the cert is in hand.
- Stripe webhook handler exists but isn't yet bound to an HTTPS
  endpoint — domain registration (P4.27) is a blocker for the live
  flow.
- The portal stub is intentionally minimal (no auth). Beta testers
  use it as a verifier, not an account hub. Real portal in P4.40.

**Neutral**

- The license format pins to `DA1.` so we can evolve without
  breaking historical keys; `verifyLicense` rejects unknown versions
  rather than guessing.

## Alternatives considered

1. **Use the `stripe` SDK.** Rejected — ~3 MB of dependency for the
   one HMAC verify we actually need. Spec is public.
2. **Online-only license check.** Rejected — DirectorAI is a creative
   tool; an offline 8-hour flight should still work. 7-day grace is
   the conventional vendor compromise.
3. **Electron auto-updater (electron-updater).** Rejected — we're not
   Electron, we're UXP + Node sidecar. The native pattern doesn't
   apply.
4. **MSIX over MSI.** Rejected for v1 — MSIX requires the per-machine
   model and Microsoft Store distribution, neither of which fits the
   self-hosted Stripe flow. Revisit when we apply for the Store.

## References

- ADR-0007 (observability + perf)
- `docs/guides/code-signing.md` — cert setup
- `docs/guides/release-sourcemaps.md` — Sentry source-map upload
- `installer/wix/Product.wxs` — MSI source
- `tools/check-python.ps1` — Python 3.11 bootstrap
