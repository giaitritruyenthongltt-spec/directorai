# Channel C - UI Automation drives Premiere's NATIVE Import dialog.
# No pixel-click: find controls by NAME/role. Trigger Ctrl+I then fill path + Open.
#   powershell -ExecutionPolicy Bypass -File tools/uia-import-fcpxml.ps1 "E:\T11\_recut_test_recut.fcpxml"
param([string]$Path = "E:\T11\_recut_test_recut.fcpxml")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$AE  = [System.Windows.Automation.AutomationElement]
$TS  = [System.Windows.Automation.TreeScope]
$CT  = [System.Windows.Automation.ControlType]
$VP  = [System.Windows.Automation.ValuePattern]
$IP  = [System.Windows.Automation.InvokePattern]

$sig = @'
using System;
using System.Runtime.InteropServices;
public class K {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk,byte sc,uint f,UIntPtr e);
  public static void Click(int x,int y){ SetCursorPos(x,y); System.Threading.Thread.Sleep(120);
    mouse_event(0x02,0,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(60); mouse_event(0x04,0,0,0,UIntPtr.Zero); }
  public static void CtrlI(){ keybd_event(0x11,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(40);
    keybd_event(0x49,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(50);
    keybd_event(0x49,0,2,UIntPtr.Zero); System.Threading.Thread.Sleep(40); keybd_event(0x11,0,2,UIntPtr.Zero); }
}
'@
Add-Type $sig

$pr = Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pr) { Write-Host '[FAIL] Premiere not running'; exit 2 }
$pid0 = $pr.Id
Write-Host "[INFO] Premiere pid=$pid0"

# 1. Focus native panel (timeline) so Ctrl+I is not swallowed by the webview panel
[K]::ShowWindow($pr.MainWindowHandle, 9) | Out-Null
[K]::SetForegroundWindow($pr.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
[K]::Click(500, 1000)   # timeline area (native) - focus main frame
Start-Sleep -Milliseconds 300

# 2. Ctrl+I
[K]::CtrlI()
Write-Host '[INFO] Sent Ctrl+I, waiting for Import dialog...'

# 3. Wait for Import dialog (top-level window, same pid or name contains Import)
$root = $AE::RootElement
$dlg = $null
for ($i=0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 400
  $wins = $root.FindAll($TS::Children, (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Window)))
  foreach ($w in $wins) {
    $nm = ''
    try { $nm = $w.Current.Name } catch {}
    $wpid = 0
    try { $wpid = $w.Current.ProcessId } catch {}
    if ($nm -match 'Import' -or ($wpid -eq $pid0 -and $nm -ne '' -and $nm -notmatch 'Adobe Premiere - ')) {
      $dlg = $w; break
    }
  }
  if ($dlg) { break }
}
if (-not $dlg) {
  Write-Host '[WARN] No Import dialog via UIA. Top-level windows:'
  $wins = $root.FindAll($TS::Children, (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Window)))
  foreach ($w in $wins) { try { Write-Host ("   - pid={0} name='{1}'" -f $w.Current.ProcessId, $w.Current.Name) } catch {} }
  exit 3
}
Write-Host ("[OK] Dialog: '{0}'" -f $dlg.Current.Name)

# 4. File name field (Edit). Try directly, then via ComboBox.
$edit = $dlg.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.AndCondition(
  (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Edit)),
  (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, 'File name:')) )))
if (-not $edit) {
  $combo = $dlg.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty,'File name:')))
  if ($combo) { $edit = $combo.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Edit))) }
}
if (-not $edit) {
  $edit = $dlg.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Edit)))
}
if (-not $edit) { Write-Host '[FAIL] File name Edit not found'; exit 4 }

$vp = $edit.GetCurrentPattern($VP::Pattern)
$vp.SetValue($Path)
Write-Host "[OK] Filled path: $Path"
Start-Sleep -Milliseconds 300

# 5. Open button
$open = $dlg.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.AndCondition(
  (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Button)),
  (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, 'Open')) )))
if (-not $open) {
  foreach ($bn in @('&Open','Import','OK')) {
    $open = $dlg.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.AndCondition(
      (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Button)),
      (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $bn)) )))
    if ($open) { break }
  }
}
if (-not $open) {
  Write-Host '[WARN] Open button not found. Buttons in dialog:'
  $btns = $dlg.FindAll($TS::Descendants, (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Button)))
  foreach ($b in $btns) { try { Write-Host ("   - '{0}'" -f $b.Current.Name) } catch {} }
  exit 5
}
$open.GetCurrentPattern($IP::Pattern).Invoke()
Write-Host '[OK] Clicked Open. Waiting for Premiere to process FCPXML...'
Start-Sleep -Seconds 3
Write-Host '[DONE] Check seq-count to confirm new sequence.'
