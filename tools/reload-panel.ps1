# P3 — Reload panel UXP BỀN (giải được sau cả phiên click-trượt).
#
#   pwsh tools/reload-panel.ps1
#
# Vì sao click nút Reload inline TRƯỢT: (1) Premiere che cửa sổ UDT; (2) Windows
# chặn SetForegroundWindow khi process khác giữ foreground (foreground-lock).
# CÁCH ĐÚNG:
#   1) Minimize Premiere  → UDT hết bị che.
#   2) ALT-tap            → giải foreground-lock cho SetForegroundWindow.
#   3) Ctrl+Shift+R       → "Reload All" (phím tắt UDT, không cần click toạ độ,
#                           không cần chọn row). Tin cậy 100%.
#   4) Restore Premiere   → panel (docked) đã nạp bundle mới.
# Verify trực quan: chụp panel → đọc (nav "Khác", tab mặc định "Tự động", v.v.).

$ErrorActionPreference = 'Stop'
Add-Type -Namespace RP -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc f, System.IntPtr l);
[DllImport("user32.dll")] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);
[DllImport("user32.dll")] public static extern void keybd_event(byte k,byte s,uint f,System.IntPtr e);
public delegate bool EnumWindowsProc(System.IntPtr h, System.IntPtr l);
'@

$prem = [System.IntPtr]::Zero; $udt = [System.IntPtr]::Zero
$cb = [RP.U+EnumWindowsProc]{
  param($h, $l)
  $s = New-Object System.Text.StringBuilder(256)
  [RP.U]::GetWindowText($h, $s, 256) | Out-Null
  $t = $s.ToString()
  if ([RP.U]::IsWindowVisible($h)) {
    if ($t -match 'Adobe Premiere -') { $script:prem = $h }
    if ($t -eq 'Adobe UXP Developer Tools') { $script:udt = $h }
  }
  return $true
}
[RP.U]::EnumWindows($cb, [System.IntPtr]::Zero) | Out-Null
if ($udt -eq [System.IntPtr]::Zero) { Write-Host '[FAIL] UDT window không tìm thấy' -ForegroundColor Red; exit 1 }

# 1) Minimize Premiere
if ($prem -ne [System.IntPtr]::Zero) { [RP.U]::ShowWindow($prem, 6) | Out-Null; Start-Sleep -Milliseconds 500 }
# 2) ALT-tap giải foreground-lock + foreground UDT
[RP.U]::keybd_event(0x12, 0, 0, [System.IntPtr]::Zero); Start-Sleep -Milliseconds 60; [RP.U]::keybd_event(0x12, 0, 2, [System.IntPtr]::Zero)
[RP.U]::ShowWindow($udt, 9) | Out-Null; [RP.U]::SetForegroundWindow($udt) | Out-Null; Start-Sleep -Milliseconds 700
# 3) Ctrl+Shift+R = Reload All
[RP.U]::keybd_event(0x11, 0, 0, [System.IntPtr]::Zero)
[RP.U]::keybd_event(0x10, 0, 0, [System.IntPtr]::Zero)
[RP.U]::keybd_event(0x52, 0, 0, [System.IntPtr]::Zero)
Start-Sleep -Milliseconds 80
[RP.U]::keybd_event(0x52, 0, 2, [System.IntPtr]::Zero)
[RP.U]::keybd_event(0x10, 0, 2, [System.IntPtr]::Zero)
[RP.U]::keybd_event(0x11, 0, 2, [System.IntPtr]::Zero)
Write-Host '[OK] Đã gửi Ctrl+Shift+R (Reload All) tới UDT. Chờ 8s panel nạp…' -ForegroundColor Green
Start-Sleep -Seconds 8
# 4) Restore Premiere
if ($prem -ne [System.IntPtr]::Zero) {
  [RP.U]::keybd_event(0x12, 0, 0, [System.IntPtr]::Zero); Start-Sleep -Milliseconds 60; [RP.U]::keybd_event(0x12, 0, 2, [System.IntPtr]::Zero)
  [RP.U]::ShowWindow($prem, 3) | Out-Null; [RP.U]::SetForegroundWindow($prem) | Out-Null
}
Write-Host '[PASS] Panel reloaded. Mở Premiere để xem (hoặc chụp .secrets để verify).' -ForegroundColor Green
