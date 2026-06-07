# Tự reload panel qua UDT + verify render qua server log (.secrets/server.log).
# PASS khi sau reload xuất hiện "panel lifecycle" (React mount + WS notify chạy).
# Dựa trên auto-reload-verify.ps1 nhưng đọc log thật của server đang chạy.
param(
  [string]$LogPath = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) '.secrets\server.log')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $LogPath)) { Write-Host "[FAIL] log not found: $LogPath" -ForegroundColor Red; exit 2 }

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
  if ([WinAPI.X]::IsWindowVisible($h) -and $sb.ToString() -eq 'Adobe UXP Developer Tools') { $script:udtHwnd = $h; return $false }
  return $true
}
[WinAPI.X]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($udtHwnd -eq [IntPtr]::Zero) { Write-Host '[FAIL] UDT window not found' -ForegroundColor Red; exit 3 }

[WinAPI.X]::ShowWindow($udtHwnd, 9) | Out-Null
[WinAPI.X]::SetForegroundWindow($udtHwnd) | Out-Null
Start-Sleep -Milliseconds 700
$rect = New-Object WinAPI.X+RECT
[WinAPI.X]::GetWindowRect($udtHwnd, [ref]$rect) | Out-Null
$clickX = $rect.Right - 388
$clickY = $rect.Top + 252
Write-Host "[INFO] UDT rect L$($rect.Left) T$($rect.Top) R$($rect.Right) B$($rect.Bottom) -> Reload click ($clickX,$clickY)"

$preLogSize = (Get-Item $LogPath).Length
Write-Host "[INFO] log pre-size: $preLogSize"
[WinAPI.X]::SetCursorPos($clickX, $clickY) | Out-Null
Start-Sleep -Milliseconds 300
[WinAPI.X]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 90
[WinAPI.X]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Write-Host '[INFO] Reload clicked. Waiting 10s…'
Start-Sleep -Seconds 10

$postLogSize = (Get-Item $LogPath).Length
$newBytes = $postLogSize - $preLogSize
Write-Host "[INFO] log grew by $newBytes bytes"
if ($newBytes -le 0) { Write-Host '[WARN] No new log — reload click may have missed.' -ForegroundColor Yellow; exit 4 }
$reader = [System.IO.File]::Open($LogPath, 'Open', 'Read', 'ReadWrite')
$reader.Seek($preLogSize, 'Begin') | Out-Null
$buf = New-Object byte[] $newBytes
$reader.Read($buf, 0, $newBytes) | Out-Null
$reader.Close()
$txt = [System.Text.Encoding]::UTF8.GetString($buf)

$lifecycle = $txt -match 'panel lifecycle'
$registered = $txt -match 'UXP panel registered'
$err = $txt -match 'panel error reported'
Write-Host ''
Write-Host "  panel registered: $(if($registered){'FOUND'}else{'-'})"
Write-Host "  panel lifecycle:  $(if($lifecycle){'FOUND'}else{'-'})"
Write-Host "  panel error:      $(if($err){'FOUND'}else{'-'})"
if ($err) {
  Write-Host '── error excerpt ──' -ForegroundColor Red
  $txt -split "`n" | Where-Object { $_ -match 'panel error reported|message|stack' } | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" }
  exit 5
}
if ($lifecycle) { Write-Host '[PASS] Panel mounted + WS notify OK — UI rendering.' -ForegroundColor Green; exit 0 }
if ($registered) { Write-Host '[PARTIAL] Panel registered but no lifecycle.' -ForegroundColor Yellow; exit 6 }
Write-Host '[FAIL] No panel signal after reload.' -ForegroundColor Yellow; exit 7
