# L3 — Autonomous reload + verify panel render
#
# 1. Click UDT Reload button (known coords for current UDT layout)
# 2. Wait 6s for plugin reload
# 3. Tail server log for fresh `panel lifecycle` event AFTER reload time
# 4. If found → PASS (panel mounted + WS notify worked)
#    If NOT found but `panel error reported` found → return the error
#    If neither → panel didn't mount or didn't reach our telemetry code
#
# Usage:
#   pwsh tools/auto-reload-verify.ps1
#   powershell -ExecutionPolicy Bypass -File tools/auto-reload-verify.ps1

$ErrorActionPreference = 'Stop'
$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$LOG  = Join-Path $env:TEMP 'server.log'

if (-not (Test-Path $LOG)) {
  Write-Host "[FAIL] $LOG not found. Start server with output > $LOG first." -ForegroundColor Red
  exit 2
}

# Find UDT window
Add-Type -Namespace WinAPI -Name X -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
'@

$udtHwnd = [IntPtr]::Zero
$cb = [WinAPI.X+EnumWindowsProc]{
  param($h, $l)
  $sb = New-Object System.Text.StringBuilder(256)
  [WinAPI.X]::GetWindowText($h, $sb, 256) | Out-Null
  if ([WinAPI.X]::IsWindowVisible($h) -and $sb.ToString() -eq 'Adobe UXP Developer Tools') {
    $script:udtHwnd = $h
    return $false
  }
  return $true
}
[WinAPI.X]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($udtHwnd -eq [IntPtr]::Zero) {
  Write-Host '[FAIL] UDT window not found' -ForegroundColor Red
  exit 3
}
Write-Host "[INFO] UDT hwnd: $udtHwnd"

# Bring to front + compute Reload coords (relative to window origin)
[WinAPI.X]::ShowWindow($udtHwnd, 9) | Out-Null
[WinAPI.X]::SetForegroundWindow($udtHwnd) | Out-Null
Start-Sleep -Milliseconds 600
$rect = New-Object WinAPI.X+RECT
[WinAPI.X]::GetWindowRect($udtHwnd, [ref]$rect) | Out-Null
$winW = $rect.Right - $rect.Left

# Reload button position is proportional to UDT layout. From our 2408x1044
# observation: Reload is at displayed (1685, 210) on a 2000-wide capture
# (native 2022, 252). It's a fixed offset from right side of the row.
# Empirically: Reload-x = winRight - 388, Reload-y = winTop + 252
$clickX = $rect.Right - 388
$clickY = $rect.Top + 252
Write-Host "[INFO] Reload click target: ($clickX, $clickY)"

# Time gate — only count log entries written after this point.
$gateMs = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$preLogSize = (Get-Item $LOG).Length
Write-Host "[INFO] log size pre-click: $preLogSize bytes  gateMs=$gateMs"

# Click Reload
[WinAPI.X]::SetCursorPos($clickX, $clickY) | Out-Null
Start-Sleep -Milliseconds 250
[WinAPI.X]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 80
[WinAPI.X]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Write-Host '[INFO] Reload clicked. Waiting 8s for panel mount + WS notify…'
Start-Sleep -Seconds 8

# Tail log diff
$postLogSize = (Get-Item $LOG).Length
$newBytes = $postLogSize - $preLogSize
Write-Host "[INFO] log grew by $newBytes bytes"
if ($newBytes -le 0) {
  Write-Host '[FAIL] No new log entries — server may have crashed' -ForegroundColor Red
  exit 4
}
$reader = [System.IO.File]::Open($LOG, 'Open', 'Read', 'ReadWrite')
$reader.Seek($preLogSize, 'Begin') | Out-Null
$buf = New-Object byte[] $newBytes
$reader.Read($buf, 0, $newBytes) | Out-Null
$reader.Close()
$newText = [System.Text.Encoding]::UTF8.GetString($buf)

$lifecycleHit = $newText -match 'panel lifecycle'
$errorHit = $newText -match 'panel error reported'
$pingHit = ($newText | Select-String '_panel.ping' -AllMatches).Matches.Count
$registerHit = $newText -match 'UXP panel registered'

Write-Host ''
Write-Host '──── Log analysis ────────────────────────────────────────'
Write-Host "  panel lifecycle:   $(if($lifecycleHit){'✔ FOUND'}else{'✗ MISSING'})"
Write-Host "  panel error:       $(if($errorHit){'✔ FOUND'}else{'✗ MISSING'})"
Write-Host "  panel registered:  $(if($registerHit){'✔ FOUND'}else{'✗ MISSING'})"
Write-Host "  _panel.ping count: $pingHit"

if ($errorHit) {
  Write-Host ''
  Write-Host '──── Panel error excerpt ─────────────────────────────────' -ForegroundColor Red
  $newText -split "`n" | Where-Object { $_ -match 'panel error reported|message:|stack:' } | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" }
  exit 5
}

if ($lifecycleHit) {
  Write-Host ''
  Write-Host '[PASS] Panel mounted + WS notify roundtrip works.' -ForegroundColor Green
  Write-Host '       React tree IS rendering. If user still sees blank,' -ForegroundColor Green
  Write-Host '       the issue is CSS / layout, not JS init.' -ForegroundColor Green
  exit 0
}

Write-Host ''
Write-Host '[FAIL] Panel registered but no lifecycle notify.' -ForegroundColor Yellow
Write-Host '       Means React rendered some but App.tsx useEffect did not fire,'
Write-Host '       OR wsClient.notify() not implemented in this bundle.' -ForegroundColor Yellow
exit 6
