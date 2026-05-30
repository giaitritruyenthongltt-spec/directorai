# Code signing (P4.23)

DirectorAI ships two signed artifacts on every release:

| Artifact                   | Format            | Cert                          | Tool                 |
| -------------------------- | ----------------- | ----------------------------- | -------------------- |
| `DirectorAI-<version>.ccx` | Adobe UXP package | Adobe UXP signing cert        | `tools/sign-ccx.ps1` |
| `DirectorAI-<version>.msi` | Windows installer | Authenticode (EV recommended) | `tools/sign-msi.ps1` |

Both scripts refuse to run without the relevant env vars set, so you
can't accidentally publish an unsigned build.

## Adobe UXP cert

The Adobe UXP cert is issued through the Adobe Partner program. Once
you have a `.p12` / `.pfx`:

```
$env:ADOBE_UXP_CERT      = "C:\secrets\uxp-cert.pfx"
$env:ADOBE_UXP_CERT_PASS = "…"
pnpm bundle:ccx
pwsh ./tools/sign-ccx.ps1 dist/installer/DirectorAI-<version>.ccx
```

Output: `DirectorAI-<version>.signed.ccx`. This is the file that goes
into UDT for distribution.

## Authenticode cert

For Windows installers an Authenticode cert is required to avoid the
SmartScreen "unknown publisher" prompt:

- **OV** (organisation validated, ~$200/yr) — works but users see the
  yellow SmartScreen banner until reputation builds up.
- **EV** (extended validation, ~$300–400/yr) — instant SmartScreen
  reputation. Stored on a hardware token, can't be exported, so CI
  jobs need a long-running self-hosted runner.

For the beta we accept OV (cheaper, no hardware token); we upgrade to
EV when revenue justifies it.

```
$env:AUTHENTICODE_CERT      = "C:\secrets\msi-cert.pfx"
$env:AUTHENTICODE_CERT_PASS = "…"
pwsh ./tools/sign-msi.ps1 dist/installer/DirectorAI-<version>.msi
```

## Hardware token (EV)

EV certs live on a Yubikey or SafeNet token. The cert provider mails
the token; `signtool` can use the SafeNet KSP via:

```
signtool sign /sm /n "DirectorAI Inc" /t http://timestamp.digicert.com `
              dist/installer/DirectorAI-<version>.msi
```

The CI runner needs to be self-hosted on the workstation with the
token attached. Documenting this for the upgrade path; not a
day-one concern.

## CI

Both signing scripts are guarded — the release CI workflow only runs
them on the `release-*` tag pipeline, on the self-hosted runner that
has the cert secrets. Public PRs build unsigned bundles for review.
