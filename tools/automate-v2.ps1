# V2 GUI automation — drive Premiere + UDT without human clicks.
#
# Usage:
#   pwsh tools/automate-v2.ps1 -Step screenshot     # one-shot screenshot
#   pwsh tools/automate-v2.ps1 -Step open-premiere  # launch Premiere
#   pwsh tools/automate-v2.ps1 -Step open-udt       # launch UDT
#   pwsh tools/automate-v2.ps1 -Step prefs          # open Premiere prefs
#   pwsh tools/automate-v2.ps1 -Step enable-devmode # tick Developer Mode
#   pwsh tools/automate-v2.ps1 -Step load-plugin    # click Load in UDT
#   pwsh tools/automate-v2.ps1 -Step full           # run the full flow

[CmdletBinding()]
param(
  [string] $Step = 'screenshot',
  [string] $ShotName = 'screen',
  [int]    $WaitMs = 800
)

$ErrorActionPreference = 'Stop'
$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$SHOTS = Join-Path $ROOT 'docs\v2-screenshots'
New-Item -ItemType Directory -Force -Path $SHOTS | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic

function Take-Screenshot {
  param([string] $Name = 'screen')
  $stamp = (Get-Date -Format 'yyyyMMdd-HHmmss')
  $file  = Join-Path $SHOTS "$Name-$stamp.png"
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($screen.X, $screen.Y, 0, 0, $bmp.Size)
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "[SHOT] $file" -ForegroundColor Green
  return $file
}

function Activate-Window {
  param([string] $TitlePattern)
  # Wait up to 5 s for the window to exist
  for ($i = 0; $i -lt 10; $i++) {
    $procs = Get-Process | Where-Object { $_.MainWindowTitle -match $TitlePattern -and $_.MainWindowTitle -ne '' }
    if ($procs) {
      $p = $procs | Select-Object -First 1
      try {
        [Microsoft.VisualBasic.Interaction]::AppActivate($p.Id) | Out-Null
        Start-Sleep -Milliseconds 400
        Write-Host "[ACTIVATE] '$($p.MainWindowTitle)' pid=$($p.Id)" -ForegroundColor Cyan
        return $true
      } catch {
        Write-Host "[ACTIVATE] AppActivate failed: $_" -ForegroundColor Yellow
      }
    }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "[ACTIVATE] No window matching '$TitlePattern'" -ForegroundColor Red
  return $false
}

function Send-Keys {
  param([string] $Keys, [int] $DelayMs = 300)
  Start-Sleep -Milliseconds $DelayMs
  [System.Windows.Forms.SendKeys]::SendWait($Keys)
  Start-Sleep -Milliseconds $DelayMs
  Write-Host "[KEYS] '$Keys'" -ForegroundColor Cyan
}

function Wait-Process-Window {
  param([string] $ExeName, [int] $TimeoutSec = 60)
  Write-Host "[WAIT] for $ExeName window (up to ${TimeoutSec}s) ..." -ForegroundColor Yellow
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $procs = Get-Process -Name $ExeName -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
      if ($p.MainWindowHandle -ne 0 -and $p.MainWindowTitle) {
        Write-Host "[WAIT] $ExeName ready: '$($p.MainWindowTitle)'" -ForegroundColor Green
        return $p
      }
    }
    Start-Sleep -Seconds 1
  }
  Write-Host "[WAIT] timeout waiting for $ExeName" -ForegroundColor Red
  return $null
}

function Open-Premiere {
  Write-Host ""
  Write-Host "=== Open Premiere 2026 ===" -ForegroundColor Magenta
  $exe = 'C:\Program Files\Adobe\Adobe Premiere Pro 2026\Adobe Premiere Pro.exe'
  if (-not (Test-Path $exe)) {
    Write-Host "[FAIL] $exe missing" -ForegroundColor Red; return $false
  }
  $existing = Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "[INFO] Premiere already running (pid $($existing.Id))" -ForegroundColor Yellow
  } else {
    Start-Process -FilePath $exe
    Write-Host "[INFO] Started Premiere"
  }
  $proc = Wait-Process-Window -ExeName 'Adobe Premiere Pro' -TimeoutSec 120
  if (-not $proc) { return $false }
  # Premiere shows splash → home screen → eventually edit. Give it time.
  Start-Sleep -Seconds 5
  Take-Screenshot -Name 'premiere-startup' | Out-Null
  return $true
}

function Open-UDT {
  Write-Host ""
  Write-Host "=== Open Adobe UXP Developer Tools ===" -ForegroundColor Magenta
  $exe = 'C:\Program Files\Adobe\Adobe UXP Developer Tools\Adobe UXP Developer Tools.exe'
  if (-not (Test-Path $exe)) {
    Write-Host "[FAIL] $exe missing" -ForegroundColor Red; return $false
  }
  $existing = Get-Process | Where-Object { $_.Path -eq $exe }
  if ($existing) {
    Write-Host "[INFO] UDT already running" -ForegroundColor Yellow
    [Microsoft.VisualBasic.Interaction]::AppActivate($existing[0].Id) | Out-Null
  } else {
    Start-Process -FilePath $exe
    Write-Host "[INFO] Started UDT"
  }
  Start-Sleep -Seconds 4
  Take-Screenshot -Name 'udt-startup' | Out-Null
  return $true
}

function Open-Premiere-Prefs {
  Write-Host ""
  Write-Host "=== Open Premiere Preferences (Ctrl+,) ===" -ForegroundColor Magenta
  if (-not (Activate-Window 'Premiere')) { return $false }
  Start-Sleep -Milliseconds 800
  # Ctrl+, is the standard Adobe shortcut for Preferences on Windows
  Send-Keys '^,'
  Start-Sleep -Seconds 3
  Take-Screenshot -Name 'premiere-prefs-open' | Out-Null
  return $true
}

function Trigger-Full-Flow {
  Open-Premiere | Out-Null
  Start-Sleep -Seconds 10
  Open-UDT | Out-Null
  Start-Sleep -Seconds 3
  # Bring Premiere back to front for Ctrl+,
  Open-Premiere-Prefs | Out-Null
}

switch ($Step) {
  'screenshot'     { Take-Screenshot -Name $ShotName | Out-Null }
  'open-premiere'  { Open-Premiere | Out-Null }
  'open-udt'       { Open-UDT | Out-Null }
  'prefs'          { Open-Premiere-Prefs | Out-Null }
  'full'           { Trigger-Full-Flow }
  default          {
    Write-Host "Unknown step: $Step" -ForegroundColor Red
    Write-Host "Steps: screenshot, open-premiere, open-udt, prefs, full"
    exit 1
  }
}
