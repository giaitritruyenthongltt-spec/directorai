<#
.SYNOPSIS
    V2 launcher — start everything needed to load the panel into Premiere.

.DESCRIPTION
    Auto-runs every part of V2 that doesn't require a GUI click:

      1. Build the panel (webpack)
      2. Bundle the CCX
      3. Start the server in a new PowerShell window (so logs are visible)
      4. Optionally launch Premiere Pro 2024

    The ONLY thing you still do by hand:
      - Open Adobe UXP Developer Tool (UDT)
      - Click "Add Plugin..."
      - Browse to dist/installer/DirectorAI-*.ccx (or apps/panel/dist/manifest.json)
      - Click the green ▶ to load into Premiere

    After UDT loads the plugin: Window → Extensions → DirectorAI in Premiere.

.PARAMETER OpenPremiere
    Also launch Adobe Premiere Pro 2024. Default: $false.

.PARAMETER NoBuild
    Skip the panel webpack build (use the existing dist/).

.EXAMPLE
    pwsh tools/start-v2.ps1
    pwsh tools/start-v2.ps1 -OpenPremiere
#>
param(
    [switch] $OpenPremiere,
    [switch] $NoBuild
)

$ErrorActionPreference = 'Stop'
$ROOT = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $ROOT

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DirectorAI V2 Launcher" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Step 0 — diagnose
Write-Host "[0/4] Running V2 diagnostic..." -ForegroundColor Yellow
pnpm diagnose:v2
Write-Host ""

# Step 1 — panel build
if (-not $NoBuild) {
    Write-Host "[1/4] Building panel..." -ForegroundColor Yellow
    pnpm --filter '@directorai/panel' build
    if ($LASTEXITCODE -ne 0) { throw "panel build failed" }
    Write-Host "  ✓ panel built" -ForegroundColor Green
} else {
    Write-Host "[1/4] Skipping panel build (--NoBuild)" -ForegroundColor DarkGray
}
Write-Host ""

# Step 2 — bundle CCX
Write-Host "[2/4] Bundling CCX..." -ForegroundColor Yellow
pnpm bundle:ccx
if ($LASTEXITCODE -ne 0) { throw "CCX bundle failed" }
Write-Host "  ✓ CCX bundled at dist/installer/" -ForegroundColor Green
Write-Host ""

# Step 3 — start server in a new window
Write-Host "[3/4] Starting server in a new window..." -ForegroundColor Yellow
$serverArgs = "-NoExit -Command `"Set-Location '$ROOT'; pnpm --filter '@directorai/server' dev`""
Start-Process pwsh -ArgumentList $serverArgs -WindowStyle Normal
Start-Sleep -Seconds 2
Write-Host "  ✓ server starting (separate window — keep it open)" -ForegroundColor Green
Write-Host ""

# Step 4 — optionally open Premiere
if ($OpenPremiere) {
    Write-Host "[4/4] Launching Premiere Pro 2024..." -ForegroundColor Yellow
    $ppro = 'C:\Program Files\Adobe\Adobe Premiere Pro 2024\Adobe Premiere Pro.exe'
    if (Test-Path $ppro) {
        Start-Process $ppro
        Write-Host "  ✓ Premiere launching" -ForegroundColor Green
    } else {
        Write-Warning "  Premiere 2024 not at expected path. Open it manually."
    }
} else {
    Write-Host "[4/4] Skipping Premiere launch (use -OpenPremiere to enable)" -ForegroundColor DarkGray
}
Write-Host ""

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Next: manual UDT load (~3 minutes)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Open Adobe UXP Developer Tool (UDT)" -ForegroundColor White
Write-Host "  2. Click 'Add Plugin...' → browse to:" -ForegroundColor White
Write-Host "       $ROOT\apps\panel\dist\manifest.json" -ForegroundColor Yellow
Write-Host "  3. Click the green ▶ next to the loaded plugin" -ForegroundColor White
Write-Host "  4. In Premiere: Window → Extensions → DirectorAI" -ForegroundColor White
Write-Host ""
Write-Host "  Then verify with: pnpm smoke:uxp" -ForegroundColor Cyan
Write-Host ""
