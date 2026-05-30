<#
.SYNOPSIS
    P4.25 — verify (or install) Python 3.11 for the DirectorAI context engine.

.DESCRIPTION
    DirectorAI's context-engine (Whisper, scene detection, beats) needs
    Python 3.11 + `uv`. This script runs as part of the MSI custom
    action and on first launch of the panel:

      1. If `python --version` reports 3.11.x → done.
      2. Otherwise download the official embeddable zip into
         %LOCALAPPDATA%\DirectorAI\python\ and bootstrap pip + uv.
      3. Append %LOCALAPPDATA%\DirectorAI\python\ to the user-scope PATH.

    Designed to be idempotent — re-running is cheap.
#>

param(
    [switch] $Force,
    [string] $Version = '3.11.9'
)

$ErrorActionPreference = 'Stop'

$installRoot = Join-Path $env:LOCALAPPDATA 'DirectorAI/python'
$pythonExe   = Join-Path $installRoot 'python.exe'

function Test-Existing {
    if (Test-Path $pythonExe) {
        $v = & $pythonExe --version 2>&1
        if ($v -match '3\.11\.') { return $true }
    }
    $sys = Get-Command python -ErrorAction SilentlyContinue
    if ($sys) {
        $v = & $sys.Source --version 2>&1
        if ($v -match '3\.11\.') { return $true }
    }
    return $false
}

if (-not $Force -and (Test-Existing)) {
    Write-Output "Python 3.11 already present — skipping install."
    exit 0
}

Write-Output "Installing Python $Version (embeddable) into $installRoot ..."
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null

$url  = "https://www.python.org/ftp/python/$Version/python-$Version-embed-amd64.zip"
$zip  = Join-Path $env:TEMP "python-$Version-embed.zip"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

Expand-Archive -Path $zip -DestinationPath $installRoot -Force
Remove-Item $zip -Force

# Enable site-packages so pip can install
$pthFile = Get-ChildItem -Path $installRoot -Filter '*._pth' | Select-Object -First 1
if ($pthFile) {
    (Get-Content $pthFile.FullName) `
        -replace '^#?import site', 'import site' `
        | Set-Content $pthFile.FullName
}

# Bootstrap pip
$getPip = Join-Path $installRoot 'get-pip.py'
Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPip -UseBasicParsing
& $pythonExe $getPip
Remove-Item $getPip -Force

# Install uv (fast package manager used by apps/context-engine)
& $pythonExe -m pip install --quiet --upgrade uv

# Add to user PATH if not already there
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$installRoot*") {
    [Environment]::SetEnvironmentVariable('Path', "$installRoot;$userPath", 'User')
    Write-Output "Added $installRoot to user PATH (effective in new shells)."
}

Write-Output "Python $Version + uv ready at $installRoot"
