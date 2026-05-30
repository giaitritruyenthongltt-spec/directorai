<#
.SYNOPSIS
    P4.23 — Authenticode-sign a DirectorAI MSI installer.

.DESCRIPTION
    Wraps `signtool.exe` (Windows SDK). Refuses to run without:

      AUTHENTICODE_CERT          path to .pfx
      AUTHENTICODE_CERT_PASS     cert password
      AUTHENTICODE_TIMESTAMP_URL optional, defaults to DigiCert RFC3161

    The cert renews yearly (~$200/yr) — see docs/guides/code-signing.md.

.EXAMPLE
    pwsh ./tools/sign-msi.ps1 dist/installer/DirectorAI-0.2.0.msi
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $InputPath
)

if (-not (Test-Path $InputPath)) {
    Write-Error "Input MSI not found: $InputPath"
    exit 1
}

$cert = $env:AUTHENTICODE_CERT
$pass = $env:AUTHENTICODE_CERT_PASS
$tsUrl = $env:AUTHENTICODE_TIMESTAMP_URL
if (-not $tsUrl) { $tsUrl = 'http://timestamp.digicert.com' }

if (-not $cert -or -not $pass) {
    Write-Error "AUTHENTICODE_CERT / _PASS not set — see docs/guides/code-signing.md"
    exit 2
}

$signTool = (Get-Command 'signtool.exe' -ErrorAction SilentlyContinue).Source
if (-not $signTool) {
    Write-Error "signtool.exe not in PATH — install the Windows SDK."
    exit 3
}

& $signTool sign /f $cert /p $pass /tr $tsUrl /td sha256 /fd sha256 $InputPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "Authenticode signature applied: $InputPath"
