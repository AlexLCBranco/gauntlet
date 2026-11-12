# Answers Edge's folder picker for scripts/save-on-disk (a measurement, not a
# test): finds the "select folder" dialog of a Playwright-launched Edge,
# gives it -Path, then presses the browser's own "Edit files" confirmation.
# A test can't click these (they are Windows' and the browser's, not the
# page's); UI Automation can. Only windows of browsers started by
# Playwright are touched, never the owner's own Edge.
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$TimeoutSec = 40
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]
# The dialog's own controls are plain Win32 ones: text and clicks by message.
Add-Type -Namespace Gauntlet -Name Win32 -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, string lParam);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
'@
$WM_SETTEXT = 0x000C
$BM_CLICK = 0x00F5

function Get-TestBrowserPids {
  $all = Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'"
  ($all | Where-Object { $_.CommandLine -match 'playwright' } | ForEach-Object { [int]$_.ProcessId })
}
function New-Cond($prop, $value) { New-Object System.Windows.Automation.PropertyCondition($prop, $value) }

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$picked = $false
$confirmed = $false
$seen = @()
while ((Get-Date) -lt $deadline -and -not $confirmed) {
  $pids = @(Get-TestBrowserPids)
  $tops = $AE::RootElement.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($top in $tops) {
    $procId = 0
    try { $procId = $top.Current.ProcessId } catch { continue }
    if ($pids -notcontains $procId) { continue }
    if (-not $picked) {
      # Windows' folder dialog: class #32770, the folder box is 1152, OK is 1.
      $dialog = $null
      if ($top.Current.ClassName -eq "#32770") { $dialog = $top }
      else { $dialog = $top.FindFirst($TS::Descendants, (New-Cond $AE::ClassNameProperty "#32770")) }
      if ($dialog) {
        $edit = $dialog.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.AndCondition((New-Cond $AE::ClassNameProperty "Edit"), (New-Cond $AE::AutomationIdProperty "1152"))))
        $ok = $dialog.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.AndCondition((New-Cond $AE::ClassNameProperty "Button"), (New-Cond $AE::AutomationIdProperty "1"))))
        if ($edit -and $ok) {
          [void][Gauntlet.Win32]::SendMessage([IntPtr]$edit.Current.NativeWindowHandle, $WM_SETTEXT, [IntPtr]::Zero, $Path)
          Start-Sleep -Milliseconds 400
          [void][Gauntlet.Win32]::PostMessage([IntPtr]$ok.Current.NativeWindowHandle, $BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero)
          $picked = $true
          Write-Output "picked: $Path"
          Start-Sleep -Milliseconds 800
        }
      }
    } else {
      # The browser's confirmation ("Let site edit files?"): its accept button.
      $buttons = $top.FindAll($TS::Descendants, (New-Cond $AE::ControlTypeProperty $CT::Button))
      foreach ($b in $buttons) {
        $name = $b.Current.Name
        if ($seen -notcontains $name) { $seen += $name }
        if ($name -match '^(Edit files|Save changes|View files|Allow|Allow this time|Allow on every visit)$') {
          $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
          $confirmed = $true
          Write-Output "confirmed: $name"
          break
        }
      }
    }
    if ($confirmed) { break }
  }
  Start-Sleep -Milliseconds 400
}
if (-not $picked) { Write-Output "FAILED: the folder dialog was not found"; exit 2 }
if (-not $confirmed) { Write-Output ("NOT CONFIRMED (no confirmation shown, or its button has another name). Buttons seen: " + ($seen -join " | ")); exit 3 }
exit 0
