# Side-load DirectorAI panel into Premiere Pro WITHOUT UXP Developer Tool.
#
#   pwsh tools/sideload-uxp.ps1
#
# Works by extracting the .ccx (just a zip) and copying contents into
# Premiere's UXP "External" plugin folder. After running, you still need
# to manually enable Developer Mode in Premiere preferences and restart.
#
# This is the fallback when Adobe UDT or Creative Cloud Desktop are
# unavailable (or broken). It mirrors what UPIA would do.

$ErrorActionPreference = 'Stop'

$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$CCX  = Join-Path $ROOT 'dist\installer\DirectorAI-0.2.0.ccx'
$MANIFEST = Join-Path $ROOT 'apps\panel\manifest.json'

if (-not (Test-Path $CCX)) {
  Write-Host "[FAIL] CCX not found at $CCX" -ForegroundColor Red
  Write-Host "       Run: pnpm bundle:ccx" -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path $MANIFEST)) {
  Write-Host "[FAIL] manifest.json not found at $MANIFEST" -ForegroundColor Red
  exit 1
}

$manifest = Get-Content $MANIFEST -Raw | ConvertFrom-Json
$pluginId = $manifest.id
$version  = $manifest.version
Write-Host "[INFO] Plugin id: $pluginId  version: $version"

$pluginsRootCandidates = @(
  "$env:APPDATA\Adobe\UXP\PluginsStorage",
  "$env:LOCALAPPDATA\Adobe\UXP\PluginsStorage"
)
$pluginsRoot = $null
foreach ($p in $pluginsRootCandidates) {
  if (Test-Path $p) { $pluginsRoot = $p; break }
}
if (-not $pluginsRoot) {
  $pluginsRoot = "$env:APPDATA\Adobe\UXP\PluginsStorage"
  New-Item -ItemType Directory -Force -Path $pluginsRoot | Out-Null
  Write-Host "[INFO] Created PluginsStorage root (first UXP plugin on this machine)"
}
Write-Host "[INFO] PluginsStorage root: $pluginsRoot"

# Premiere host bucket - "1" is the active UXP API generation Adobe uses
# for PPRO. If a different bucket already exists we prefer that.
$pproRoot = Join-Path $pluginsRoot 'PPRO'
$existingBuckets = if (Test-Path $pproRoot) {
  Get-ChildItem $pproRoot -Directory | Select-Object -ExpandProperty Name
} else { @() }

$bucket = if ($existingBuckets.Count -gt 0) { $existingBuckets[0] } else { '1' }
$externalDir = Join-Path $pproRoot "$bucket\External"
New-Item -ItemType Directory -Force -Path $externalDir | Out-Null
Write-Host "[INFO] External dir: $externalDir"

$dest = Join-Path $externalDir "${pluginId}_$version"
if (Test-Path $dest) {
  Write-Host "[WARN] Existing install at $dest - removing" -ForegroundColor Yellow
  Remove-Item $dest -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$temp = New-Item -ItemType Directory -Force -Path (Join-Path $env:TEMP "directorai-ccx-$(Get-Random)")
try {
  Write-Host "[INFO] Extracting $CCX ..."
  # Expand-Archive in Windows PowerShell 5.1 rejects non-.zip extensions.
  # Use the underlying ZipFile API directly so .ccx works.
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($CCX, $temp.FullName)

  $entries = Get-ChildItem $temp.FullName
  $payload = if ($entries.Count -eq 1 -and $entries[0].PSIsContainer) {
    $entries[0].FullName
  } else {
    $temp.FullName
  }

  Copy-Item -Path (Join-Path $payload '*') -Destination $dest -Recurse -Force
  Write-Host "[INFO] Copied panel files to $dest"

  $copied = Get-ChildItem $dest -Recurse -File | Measure-Object
  Write-Host "[INFO] $($copied.Count) files installed"
} finally {
  Remove-Item $temp.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "[PASS] Side-load complete." -ForegroundColor Green
Write-Host ""
Write-Host "-- Next steps (manual, in Premiere) ----------------------"
Write-Host "1. Open Adobe Premiere Pro (must be v25.6+ for UXP)."
Write-Host "2. Edit -> Preferences -> Plug-ins."
Write-Host "3. Check the box: Enable Developer Mode."
Write-Host "4. Restart Premiere (quit and reopen)."
Write-Host "5. Window -> Extensions -> DirectorAI."
Write-Host ""
Write-Host "-- If DirectorAI does NOT appear in Extensions -----------"
Write-Host "Premiere has not registered this side-load path. Fallback:"
Write-Host "  -> Fix Creative Cloud Desktop (see docs/guides/v2-recovery.md)."
Write-Host ""
Write-Host "-- Then verify --------------------------------------------"
Write-Host "In another terminal:  pnpm --filter '@directorai/server' dev"
Write-Host "Smoke test:           pnpm smoke:uxp"
