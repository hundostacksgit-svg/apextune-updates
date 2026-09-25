# Films the real tune on this Windows 11 machine, the way a person runs it:
# Task Manager first (the number before), then Start, "powershell", the one
# line, the app, the key, Run, the live log, the result, and Task Manager
# again (the number after). The screen is recorded the whole time; the input
# is real Windows input (SendInput) along human paths and rhythms (Human.cs).
# Writes the recording, the timed events and the run's own files to $Out.
#
# No security setting is changed. This machine already elevates an
# administrator without a prompt, so the one line gets its rights the way it
# does anywhere: it asks, and Windows says yes.
#
# The one thing staged is the licence check. The typed command is the real
# one and fetches the real go.ps1 from omnidx.net; go.ps1 is pointed (by
# OMNIDX_BASE, which it honours for 127.0.0.1 only) at a copy of the site on
# this machine, whose config names a licence server also on this machine: the
# real Worker code under Node, which issues the key the way the key page does
# after a payment. Everything the tune does to the PC is the real thing.
param(
  [string]$Out = (Join-Path $env:RUNNER_TEMP 'film'),
  [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
)
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Out | Out-Null
$logFile = Join-Path $Out 'film-log.txt'
function Note([string]$t) { $line = "{0:HH:mm:ss.fff} {1}" -f (Get-Date), $t; Write-Host $line; Add-Content $logFile $line }

Add-Type -AssemblyName System.Drawing, UIAutomationClient, UIAutomationTypes
Add-Type -Path (Join-Path $PSScriptRoot 'Human.cs')
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Desk {
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SystemParametersInfoW(int a, int b, string c, int d);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeoutW(IntPtr h, int m, IntPtr w, string l, int f, int t, out IntPtr r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr dc, int x, int y);
  public static int[] Pixel(int x, int y) { IntPtr dc = GetDC(IntPtr.Zero); uint c = GetPixel(dc, x, y); ReleaseDC(IntPtr.Zero, dc); return new int[] { (int)(c & 0xFF), (int)((c >> 8) & 0xFF), (int)((c >> 16) & 0xFF) }; }
}
"@
[void][Desk]::SetProcessDPIAware()
$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$ScrW = [Desk]::GetSystemMetrics(0); $ScrH = [Desk]::GetSystemMetrics(1)
Note "screen ${ScrW}x${ScrH}"

# ---------------------------------------------------------------- helpers
function Tops { try { return @($A::RootElement.FindAll($Scope::Children, [System.Windows.Automation.Condition]::TrueCondition)) } catch { return @() } }
function Win([string]$like, [int]$sec = 30) {
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($t.Elapsed.TotalSeconds -lt $sec) {
    foreach ($w in Tops) { try { if ($w.Current.Name -like $like) { return $w } } catch { } }
    Start-Sleep -Milliseconds 250
  }
  return $null
}
function Find($root, [string]$id = '', [string]$name = '', [int]$sec = 10) {
  $prop = if ($id) { $A::AutomationIdProperty } else { $A::NameProperty }
  $c = New-Object System.Windows.Automation.PropertyCondition($prop, $(if ($id) { $id } else { $name }))
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($t.Elapsed.TotalSeconds -lt $sec) { try { $e = $root.FindFirst($Scope::Descendants, $c); if ($e) { return $e } } catch { }; Start-Sleep -Milliseconds 250 }
  return $null
}
function FindAll($root, [string]$name) {
  $c = New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, $name)
  try { return @($root.FindAll($Scope::Descendants, $c)) } catch { return @() }
}
# Where an element is on screen. A window's rectangle comes from Windows itself; an element's from UI Automation,
# which can answer "nowhere yet" (NaN) for a moment after it appears, so that is asked again.
function Box($e) {
  $hw = [IntPtr]0; try { if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window) { $hw = [IntPtr]$e.Current.NativeWindowHandle } } catch { }
  if ($hw -ne [IntPtr]::Zero) { $r = New-Object Desk+RECT; if ([Desk]::GetWindowRect($hw, [ref]$r)) { return @($r.Left, $r.Top, ($r.Right - $r.Left), ($r.Bottom - $r.Top)) } }
  for ($i = 0; $i -lt 20; $i++) {
    try { $b = $e.Current.BoundingRectangle; if (-not [double]::IsNaN($b.X) -and -not [double]::IsInfinity($b.X) -and $b.Width -gt 0) { return @($b.X, $b.Y, $b.Width, $b.Height) } } catch { }
    Start-Sleep -Milliseconds 250
  }
  throw "no position for $(try { $e.Current.Name } catch { '?' })"
}
function Mid($e, [double]$fx = 0.5, [double]$fy = 0.5) { $b = Box $e; return @([int]($b[0] + $b[2] * $fx), [int]($b[1] + $b[3] * $fy)) }
function Hwnd($e) { return [IntPtr]$e.Current.NativeWindowHandle }
function Invoke($e) { try { $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return $true } catch { return $false } }
function Pause([int]$a, [int]$b) { Start-Sleep -Milliseconds (Get-Random -Minimum $a -Maximum $b) }
$events = New-Object System.Collections.ArrayList
$clock = $null
function Mark([string]$name, $extra = $null) {
  $t = if ($clock) { [math]::Round($clock.Elapsed.TotalSeconds, 2) } else { 0 }
  $e = [ordered]@{ t = $t; what = $name; processes = (Get-Process).Count }
  if ($extra) { foreach ($k in $extra.Keys) { $e[$k] = $extra[$k] } }
  [void]$events.Add($e); Note ("[{0,7:0.00}] {1} processes {2} {3}" -f $t, $name, $e.processes, $(if ($extra) { $extra | ConvertTo-Json -Compress } else { '' }))
}
# Maximize a window the way a person does: a double-click on its title bar.
function Front($e) { $hw = Hwnd $e; if ($hw -ne [IntPtr]::Zero) { [void][Human]::SetForegroundWindow($hw) }; Start-Sleep -Milliseconds 300; return ([Human]::GetForegroundWindow() -eq $hw) }
function Maximize($e) { $hw = Hwnd $e; [void](Front $e); if ($hw -ne [IntPtr]::Zero) { [void][Human]::ShowWindow($hw, 3) }; Pause 700 1000 }

# ---------------------------------------------------------------- the desk, before the camera rolls
# The first-sign-in privacy page this machine opens with, full screen and on top of everything: Next, then
# Accept, as anyone setting up a PC does. Its button is where Windows always puts it, and blue while it is there.
# Next is a bright blue, Accept a dark one; both are clearly blue against the page's near-white.
function PrivacyButton { $c = [Desk]::Pixel([int]($ScrW * 0.846), [int]($ScrH * 0.854)); return ($c[2] -gt 90 -and ($c[2] - $c[0]) -gt 50 -and ($c[2] - $c[1]) -gt 15) }
for ($i = 0; $i -lt 6 -and (PrivacyButton); $i++) {
  Note "first-sign-in privacy page: pressing its button (press $($i + 1))"
  [Human]::ClickAt([int]($ScrW * 0.846), [int]($ScrH * 0.854)); Start-Sleep 5
}
if (PrivacyButton) { Note 'the privacy page is still up'; exit 1 }
# This image asks, a few minutes after sign-in, to update the Windows Subsystem for Linux, in a window that takes the
# keyboard ("press any key"). The update is done here, quietly, first; any prompt already up is closed.
try {
  $wslJob = Start-Job { & wsl.exe --update 2>&1 | Out-String }
  if (Wait-Job $wslJob -Timeout 240) { Note ("wsl --update: " + ((Receive-Job $wslJob) -replace '\s+', ' ').Trim()) } else { Note 'wsl --update still running; carrying on' }
} catch { Note "wsl --update: $_" }
function Tidy { Get-Process wsl -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
Tidy
# The GitHub agent's own console: minimized, not closed (closing it would end this job).
foreach ($w in Tops) {
  try { $n = $w.Current.Name } catch { continue }
  if ($n -like '*GitHub*' -or $n -like '*hosted-compute*' -or $n -like '*Runner*') { [void][Human]::ShowWindow((Hwnd $w), 6); Note "minimized: $n" }
}
foreach ($wp in 'C:\Windows\Web\Wallpaper\Windows\img0.jpg') { if (Test-Path $wp) { [void][Desk]::SystemParametersInfoW(20, 0, $wp, 3); Note "wallpaper $wp" } }

# A copy of the site on this machine, whose config names the licence server on this machine.
$site = Join-Path $env:RUNNER_TEMP 'site'
New-Item -ItemType Directory -Force (Join-Path $site 'tune') | Out-Null
Copy-Item (Join-Path $Repo 'go.ps1') $site -Force
Copy-Item (Join-Path $Repo 'tune\*') (Join-Path $site 'tune') -Recurse -Force
$cfgPath = Join-Path $site 'tune\config.json'
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$cfg.api = 'http://127.0.0.1:8787'
[IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
Start-Process python -ArgumentList '-m', 'http.server', '8090', '--bind', '127.0.0.1', '--directory', "`"$site`"" -WindowStyle Hidden
$keyFile = Join-Path $env:RUNNER_TEMP 'film-key.txt'
Start-Process node -ArgumentList "`"$(Join-Path $Repo 'tools\worker-serve.mjs')`"", '--port', '8787', '--key-file', "`"$keyFile`"", '--log', "`"$(Join-Path $Out 'worker-serve.txt')`"" -WindowStyle Hidden -WorkingDirectory $Repo
$ok = $false
foreach ($i in 1..60) { Start-Sleep -Milliseconds 500; try { $h = Invoke-RestMethod http://127.0.0.1:8787/v1/health -TimeoutSec 3; $s = Invoke-WebRequest http://127.0.0.1:8090/go.ps1 -UseBasicParsing -TimeoutSec 3; if ($h.ok -and $s.StatusCode -eq 200 -and (Test-Path $keyFile)) { $ok = $true; break } } catch { } }
if (-not $ok) { Note 'the local site or licence server did not start'; exit 1 }
$key = (Get-Content $keyFile -Raw).Trim()
Note "licence server up; key issued ($($key.Substring(0, 9))...)"
# go.ps1 reads OMNIDX_BASE. A window opened from Start inherits it once Explorer hears the environment changed.
[Environment]::SetEnvironmentVariable('OMNIDX_BASE', 'http://127.0.0.1:8090', 'User')
$r = [IntPtr]::Zero; [void][Desk]::SendMessageTimeoutW([IntPtr]0xffff, 0x1A, [IntPtr]::Zero, 'Environment', 2, 5000, [ref]$r)
Set-Clipboard -Value $key
Start-Sleep 2

# ---------------------------------------------------------------- the recording
function Get-Ffmpeg([string]$arch) {
  $dir = Join-Path $env:RUNNER_TEMP "ffmpeg-$arch"
  if (-not (Test-Path $dir)) {
    Invoke-WebRequest "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-$arch-gpl.zip" -OutFile "$dir.zip" -UseBasicParsing
    Expand-Archive "$dir.zip" -DestinationPath $dir -Force
  }
  $f = Get-ChildItem $dir -Recurse -Filter ffmpeg.exe | Select-Object -First 1 -ExpandProperty FullName
  $v = (& $f -hide_banner -version 2>&1 | Select-Object -First 1) -join ''
  Note "ffmpeg $arch : $v"
  if ($v -match 'ffmpeg version') { return $f } else { return $null }
}
# The x64 build, on ARM too (through Windows' own emulation): BtbN's ARM build does not start on this machine.
$ff = Get-Ffmpeg 'win64'
if (-not $ff) { Note 'no working ffmpeg'; exit 1 }
$raw = Join-Path $Out 'screen.mkv'
$psi = New-Object System.Diagnostics.ProcessStartInfo $ff
$psi.Arguments = "-hide_banner -loglevel warning -f gdigrab -framerate 30 -draw_mouse 1 -i desktop -c:v libx264 -preset ultrafast -crf 14 -pix_fmt yuv420p -y `"$raw`""
$psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
$rec = [System.Diagnostics.Process]::Start($psi)
$errTask = $rec.StandardError.ReadToEndAsync()
Tidy
[Human]::Press(0x1B); Start-Sleep -Milliseconds 400; [Human]::Press(0x1B); Start-Sleep 2
$clock = [Diagnostics.Stopwatch]::StartNew()
Note "recording $raw"
Start-Sleep 2

try {
  # ------------------------------------------------------------ 1. the number before, in Task Manager
  [Human]::MoveTo([int]($ScrW * 0.58), [int]($ScrH * 0.52), 700); Pause 1200 1600
  Mark 'task-manager-open'
  [Human]::Press(0x11, 0x10, 0x1B)   # Ctrl+Shift+Esc
  $tm = Win 'Task Manager' 15
  if ($tm) {
    Pause 900 1300
    Tidy; [void](Front $tm)
    $perf = Find $tm -name 'Performance' -sec 8
    if ($perf) { $p = Mid $perf; [Human]::ClickAt($p[0], $p[1]) } else { Note 'no Performance item' }
    Pause 1600 2100
    $label = @(FindAll $tm 'Processes' | Sort-Object { try { (Box $_)[0] } catch { 0 } } -Descending) | Select-Object -First 1
    if ($label) { $p = Mid $label; [Human]::MoveTo($p[0] + 8, $p[1] + 30) }
    Mark 'before-count'
    [Human]::Drift(3000)
    [Human]::Press(0x12, 0x73)   # Alt+F4
    Pause 800 1100
  } else { Note 'Task Manager did not open' }

  # ------------------------------------------------------------ 2. Start, "powershell", the one line
  Mark 'start-menu'
  [Human]::Press(0x5B); Pause 900 1200
  [Human]::Type('powershell', 1.1); Pause 1100 1500
  [Human]::Press(0x0D)
  $ps = Win '*PowerShell*' 15
  if (-not $ps) { Note 'no PowerShell from Start; Win+R instead'; [Human]::Press(0x1B); Pause 400 600; [Human]::Press(0x5B, 0x52); Pause 800 1000; [Human]::Type('powershell'); [Human]::Press(0x0D); $ps = Win '*PowerShell*' 15 }
  if (-not $ps) { throw 'PowerShell did not open' }
  Pause 1400 1800
  Tidy
  $has = Front $ps
  $p = Mid $ps 0.5 0.6; [Human]::ClickAt($p[0], $p[1]); Pause 500 800
  if (-not $has -and ([Human]::GetForegroundWindow() -ne (Hwnd $ps))) { Note 'PowerShell does not have the keyboard'; throw 'PowerShell does not have the keyboard' }
  Mark 'type-command'
  [Human]::Type('irm omnidx.net/go.ps1 | iex', 1.0, 'omnidx.ne')
  Pause 600 900
  [Human]::Press(0x0D)
  Mark 'command-entered'

  # ------------------------------------------------------------ 3. the app
  $app = Win 'OmniDx Tune' 150
  if (-not $app) { throw 'the app window did not open' }
  Mark 'app-open'
  Pause 1200 1600
  Maximize $app
  $run = Find $app -id 'BtnRun' -sec 20
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($t.Elapsed.TotalSeconds -lt 240) { try { if ($run.Current.IsEnabled) { break } } catch { }; Start-Sleep -Milliseconds 300 }
  $count = Find $app -id 'CountText' -sec 5
  Mark 'app-read' @{ count = $(try { $count.Current.Name } catch { '' }) }
  if ($count) { $p = Mid $count; [Human]::MoveTo($p[0] + 6, $p[1] + 4); [Human]::Drift(2400) }
  $keyBox = Find $app -id 'KeyBox' -sec 5
  $p = Mid $keyBox 0.3 0.5; [Human]::ClickAt($p[0], $p[1]); Pause 600 900
  [Human]::Press(0x11, 0x56)   # Ctrl+V
  Mark 'key-pasted'; Pause 1000 1400
  $p = Mid $run; [Human]::ClickAt($p[0], $p[1])
  Mark 'run'

  # ------------------------------------------------------------ 4. the run, watched
  $result = Find $app -id 'ResultText' -sec 5
  $logBox = Find $app -id 'LogBox' -sec 5
  $t = [Diagnostics.Stopwatch]::StartNew(); $nextLook = 6; $done = ''
  while ($t.Elapsed.TotalMinutes -lt 30) {
    try { $done = $result.Current.Name } catch { }
    if ($done) { break }
    if ($t.Elapsed.TotalSeconds -gt $nextLook -and $logBox) {
      # Eyes on the log: the pointer wanders to where the reading is, and rests.
      $p = Mid $logBox (0.3 + 0.4 * (Get-Random -Maximum 1.0)) (0.35 + 0.5 * (Get-Random -Maximum 1.0))
      [Human]::MoveTo($p[0], $p[1])
      [Human]::Drift(1500); $nextLook = $t.Elapsed.TotalSeconds + (Get-Random -Minimum 7 -Maximum 16)
    }
    Start-Sleep -Milliseconds 400
  }
  Mark 'done' @{ result = $done }
  if ($result) { $p = Mid $result 0.35 0.5; [Human]::MoveTo($p[0], $p[1]); [Human]::Drift(4000) }

  # ------------------------------------------------------------ 5. the number after, in Task Manager
  Pause 800 1200
  Mark 'task-manager-again'
  [Human]::Press(0x11, 0x10, 0x1B)
  $tm = Win 'Task Manager' 15
  if ($tm) {
    Pause 1500 1900
    Tidy; [void](Front $tm)
    $label = @(FindAll $tm 'Processes' | Sort-Object { try { (Box $_)[0] } catch { 0 } } -Descending) | Select-Object -First 1
    if (-not $label -or (Box $label)[0] -lt (Box $tm)[0] + 250) {
      $perf = Find $tm -name 'Performance' -sec 5; if ($perf) { $p = Mid $perf; [Human]::ClickAt($p[0], $p[1]); Pause 1600 2000 }
      $label = @(FindAll $tm 'Processes' | Sort-Object { try { (Box $_)[0] } catch { 0 } } -Descending) | Select-Object -First 1
    }
    if ($label) { $p = Mid $label; [Human]::MoveTo($p[0] + 8, $p[1] + 30) }
    Mark 'after-count'
    [Human]::Drift(4500)
  }
  Pause 1500 2000
} catch {
  Note "stopped: $_"
} finally {
  Mark 'end'
  try { $rec.StandardInput.Write('q'); $rec.StandardInput.Flush() } catch { }
  if (-not $rec.WaitForExit(90000)) { $rec.Kill() }
  Note ("ffmpeg: " + (($errTask.Result -split "`n" | Select-Object -Last 5) -join ' | '))
  $events | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Out 'events.json') -Encoding UTF8
  foreach ($pat in 'summary-*.json', 'report-*.html', 'report-*.txt', 'log-*.txt', 'card-*.png') {
    Get-ChildItem C:\OmniDx -Filter $pat -ErrorAction SilentlyContinue | Copy-Item -Destination $Out -ErrorAction SilentlyContinue
  }
  if (Test-Path $raw) { Note ("recording: {0:0.0} MB" -f ((Get-Item $raw).Length / 1MB)) }
}
