<#
.SYNOPSIS
    P4.23 — sign a DirectorAI .ccx bundle with the Adobe UXP cert.

.DESCRIPTION
    Adobe's UDT exposes a CLI for signing: `uxp-developer-tool sign-plugin`.
    Until the actual signing cert is on disk we accept these env vars
    and refuse to overwrite the unsigned bundle:

      ADOBE_UXP_CERT       full path to the .p12 / .pfx
      ADOBE_UXP_CERT_PASS  cert password
      UDT_BIN              path to the UDT CLI (default: auto-detected)

    Outputs `<input>.signed.ccx`.

.EXAMPLE
    pwsh ./tools/sign-ccx.ps1 dist/installer/DirectorAI-0.2.0.ccx
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $InputPath
)

if (-not (Test-Path $InputPath)) {
    Write-Error "Input bundle not found: $InputPath"
    exit 1
}

$cert = $env:ADOBE_UXP_CERT
$pass = $env:ADOBE_UXP_CERT_PASS
if (-not $cert -or -not $pass) {
    Write-Error "ADOBE_UXP_CERT / ADOBE_UXP_CERT_PASS not set — see docs/guides/code-signing.md"
    exit 2
}

$udt = $env:UDT_BIN
if (-not $udt) {
    $udt = (Get-Command 'uxp-developer-tool' -ErrorAction SilentlyContinue).Source
}
if (-not $udt -or -not (Test-Path $udt)) {
    Write-Error "UDT CLI not found. Install Adobe UXP Developer Tool first, or set UDT_BIN."
    exit 3
}

$out = [IO.Path]::ChangeExtension($InputPath, $null) + '.signed.ccx'
& $udt sign-plugin --input $InputPath --output $out --cert $cert --pass $pass
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "Signed bundle written: $out"
