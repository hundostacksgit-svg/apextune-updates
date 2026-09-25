# The filming helper inside the test PC. It never clicks or types: every
# click and key comes from outside, through the PC's (virtual) mouse and
# keyboard, the way a person's hands do it (director.py). This only answers
# questions from the filming machine: where a window or a button is on
# screen, what a label says, how many processes are running; and it puts
# the key on the clipboard, as copying it from the key page would.
$ErrorActionPreference = 'Continue'
$Base = 'http://10.0.2.2:8099'
$Log = 'C:\film\agent-log.txt'
function Note([string]$t) { try { Add-Content $Log ("{0:HH:mm:ss.fff} {1}" -f (Get-Date), $t) } catch { } }
$elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Note "starting: user $env:USERNAME, elevated $elevated, pid $PID"
# One copy at a time: it is started more than one way at the first sign-in.
$one = New-Object System.Threading.Mutex($false, 'Global\OmniDxFilmAgent')
if (-not $one.WaitOne(0)) { Note 'another copy is running; leaving'; exit 0 }
trap { Note "error: $_"; continue }
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class Desk {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public static string Title(IntPtr h) { var s = new StringBuilder(512); GetWindowTextW(h, s, 512); return s.ToString(); }
}
"@
[void][Desk]::SetProcessDPIAware()
$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

function Tops { try { return @($A::RootElement.FindAll($Scope::Children, [System.Windows.Automation.Condition]::TrueCondition)) } catch { return @() } }
function Win([string]$like) { foreach ($w in Tops) { try { if ($w.Current.Name -like $like) { return $w } } catch { } }; return $null }
function Rect($e) {
  try {
    if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window -and $e.Current.NativeWindowHandle) {
      $r = New-Object Desk+RECT
      if ([Desk]::GetWindowRect([IntPtr]$e.Current.NativeWindowHandle, [ref]$r)) { return @{ x = $r.Left; y = $r.Top; w = $r.Right - $r.Left; h = $r.Bottom - $r.Top } }
    }
    $b = $e.Current.BoundingRectangle
    if ([double]::IsNaN($b.X) -or [double]::IsInfinity($b.X) -or $b.Width -le 0) { return $null }
    return @{ x = [int]$b.X; y = [int]$b.Y; w = [int]$b.Width; h = [int]$b.Height }
  } catch { return $null }
}
function Describe($e) {
  if (-not $e) { return $null }
  $r = Rect $e; if (-not $r) { return $null }
  $v = ''; try { $v = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { }
  $r.name = "$($e.Current.Name)"; $r.value = "$v"; $r.enabled = [bool]$e.Current.IsEnabled; $r.id = "$($e.Current.AutomationId)"
  return $r
}
function FindIn($root, $q) {
  $conds = @()
  if ($q.id) { $conds += New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, "$($q.id)") }
  if ($q.name) { $conds += New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, "$($q.name)") }
  $c = if ($conds.Count -eq 1) { $conds[0] } else { New-Object System.Windows.Automation.AndCondition($conds) }
  $all = @($root.FindAll($Scope::Descendants, $c))
  $found = @($all | ForEach-Object { Describe $_ } | Where-Object { $_ })
  if (-not $found.Count) { return $null }
  switch ("$($q.pick)") {
    'rightmost' { return ($found | Sort-Object { $_.x } -Descending)[0] }
    'lowest' { return ($found | Sort-Object { $_.y } -Descending)[0] }
    default { return $found[0] }
  }
}
function Answer($q) {
  switch ($q.op) {
    'procs' { return @{ n = @(Get-Process).Count } }
    'screen' { return @{ w = [Desk]::GetSystemMetrics(0); h = [Desk]::GetSystemMetrics(1) } }
    'fg' { $h = [Desk]::GetForegroundWindow(); $r = New-Object Desk+RECT; [void][Desk]::GetWindowRect($h, [ref]$r); return @{ title = [Desk]::Title($h); x = $r.Left; y = $r.Top; w = $r.Right - $r.Left; h = $r.Bottom - $r.Top } }
    'wins' { return @(Tops | ForEach-Object { try { $d = Describe $_; if ($d) { $d } } catch { } }) }
    'win' { $w = Win "$($q.like)"; if ($w) { return (Describe $w) } else { return $null } }
    'find' {
      $root = if ($q.like) { Win "$($q.like)" } else { $A::RootElement }
      if (-not $root) { return $null }
      return (FindIn $root $q)
    }
    'clip' { Set-Clipboard -Value "$($q.text)"; return @{ ok = $true } }
    'read' { if (Test-Path "$($q.path)") { return @{ text = (Get-Content "$($q.path)" -Raw) } } else { return $null } }
    'upload' {
      $n = 0
      foreach ($f in @(Get-ChildItem "$($q.dir)" -File -ErrorAction SilentlyContinue)) {
        try { Invoke-RestMethod -Method Post -Uri ("$Base/upload?name=" + [uri]::EscapeDataString($f.Name)) -InFile $f.FullName -ContentType 'application/octet-stream' -TimeoutSec 60 | Out-Null; $n++ } catch { Note "upload $($f.Name): $_" }
      }
      return @{ files = $n }
    }
    'ps' { return @{ out = ((Invoke-Expression "$($q.code)" 2>&1 | Out-String)) } }
    default { return @{ error = "unknown op $($q.op)" } }
  }
}

$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString('o')
Note "agent up; boot $boot; user $env:USERNAME"
$last = 0; $fails = 0
while ($true) {
  $q = $null
  try { $q = Invoke-RestMethod ("$Base/next?after=$last&boot=" + [uri]::EscapeDataString($boot)) -TimeoutSec 40; $fails = 0 }
  catch { $fails++; if ($fails -le 3 -or $fails % 60 -eq 0) { Note "no answer from $Base ($fails): $_" }; Start-Sleep -Milliseconds 700; continue }
  if (-not $q -or -not $q.id) { continue }
  $last = [int]$q.id
  $res = $null
  try { $res = Answer $q } catch { $res = @{ error = "$_" } }
  $body = @{ id = $last; result = $res } | ConvertTo-Json -Depth 6 -Compress
  try { Invoke-RestMethod -Method Post -Uri "$Base/done" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json' -TimeoutSec 15 | Out-Null } catch { Note "done $last : $_" }
}
