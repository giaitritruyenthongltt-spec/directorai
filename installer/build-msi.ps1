<#
.SYNOPSIS
    P4.24 — build a DirectorAI MSI.

.DESCRIPTION
    Pipeline:
      1. Verify all build outputs exist (apps/*/dist, ccx bundle).
      2. Harvest each directory into a ComponentGroup .wxs (using
         `wix heat dir`).
      3. Run `wix build` to produce DirectorAI-<version>.msi.
      4. Hand to tools/sign-msi.ps1 if AUTHENTICODE_CERT is set.

    Requires WiX 5+ (`dotnet tool install --global wix`).
#>
param(
    [string] $Version = "0.7.0",
    [switch] $Sign
)

$ErrorActionPreference = 'Stop'
$ROOT = (Resolve-Path "$PSScriptRoot/..").Path
$OUT  = Join-Path $ROOT 'dist/installer'
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

function Require-Path($path, $hint) {
    if (-not (Test-Path $path)) {
        throw "Missing $path. $hint"
    }
}

Require-Path "$ROOT/apps/server/dist"   "Run 'pnpm --filter @directorai/server build' first."
Require-Path "$ROOT/apps/portal/dist"   "Run 'pnpm --filter @directorai/portal build' first."
Require-Path "$ROOT/dist/installer"     "Run 'pnpm bundle:ccx' first to generate the CCX."

# WiX 5 CLI check
$wix = Get-Command 'wix' -ErrorAction SilentlyContinue
if (-not $wix) {
    throw "wix CLI not found. Install with 'dotnet tool install --global wix'."
}

# 1. Harvest component groups
function Harvest($id, $sourcePath, $outFile, $componentDir) {
    & wix heat dir $sourcePath `
        -out $outFile `
        -cg $id `
        -gg -srd -sreg -sfrag -scom `
        -dr $componentDir
    if ($LASTEXITCODE -ne 0) { throw "heat failed for $id" }
}

$HARVEST_DIR = Join-Path $OUT 'harvest'
New-Item -ItemType Directory -Force -Path $HARVEST_DIR | Out-Null

Harvest -id 'ServerComponents'  -sourcePath "$ROOT/apps/server/dist"    -outFile "$HARVEST_DIR/server.wxs"  -componentDir 'ServerDir'
Harvest -id 'PortalComponents'  -sourcePath "$ROOT/apps/portal/dist"    -outFile "$HARVEST_DIR/portal.wxs"  -componentDir 'PortalDir'
Harvest -id 'CcxComponents'     -sourcePath "$ROOT/dist/installer"      -outFile "$HARVEST_DIR/ccx.wxs"     -componentDir 'CcxDir'
Harvest -id 'ContextComponents' -sourcePath "$ROOT/apps/context-engine" -outFile "$HARVEST_DIR/context.wxs" -componentDir 'ContextDir'
Harvest -id 'ToolsComponents'   -sourcePath "$ROOT/tools"               -outFile "$HARVEST_DIR/tools.wxs"   -componentDir 'ToolsDir'

# 2. Compose & build
$msiOut = Join-Path $OUT "DirectorAI-$Version.msi"
& wix build `
    "$PSScriptRoot/wix/Product.wxs" `
    "$HARVEST_DIR/server.wxs" `
    "$HARVEST_DIR/portal.wxs" `
    "$HARVEST_DIR/ccx.wxs" `
    "$HARVEST_DIR/context.wxs" `
    "$HARVEST_DIR/tools.wxs" `
    -out $msiOut
if ($LASTEXITCODE -ne 0) { throw "wix build failed" }

Write-Output "MSI built → $msiOut"

if ($Sign) {
    pwsh "$PSScriptRoot/../tools/sign-msi.ps1" $msiOut
}
