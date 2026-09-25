# Films the real tune on this Windows machine, the way a person would run it:
# Task Manager first (the number before), then an administrator PowerShell,
# the one line, the app, the key, Run, the live log, the result, and Task
# Manager again (the number after). No security setting is changed to film
# it: the PowerShell window is opened with the rights this job already has. The screen is
# recorded the whole time; the input is real Windows input (SendInput), sent
# by Human.cs along human paths and rhythms. Writes the recording, a list of
# timed events and the run's own files to $Out.
#
# The one thing staged: the licence check. The typed command is the real one
# and fetches the real go.ps1 from omnidx.net; go.ps1 is pointed (by
# OMNIDX_BASE, which it honours for 127.0.0.1 only) at a copy of the site on
# this machine, whose config names a licence server also on this machine: the
# real Worker code under Node, which issues the key the way the key page does
# after a payment. Everything the tune does to the PC is the real thing.
param(
  [string]$Out = (Join-Path $env:RUNNER_TEMP 'film'),
  [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [int]$Width = 1920, [int]$Height = 1080
)
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Out | Out-Null
$logFile = Join-Path $Out 'film-log.txt'
function Note([string]$t) { $line = "{0:HH:mm:ss.fff} {1}" -f (Get-Date), $t; Write-Host $line; Add-Content $logFile $line }

Add-Type -AssemblyName System.Drawing, UIAutomationClient, UIAutomationTypes
Add-Type -Path (Join-Path $PSScriptRoot 'Human.cs')
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Screen2 {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplaySettingsW(string d, int m, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int ChangeDisplaySettingsExW(string d, ref DEVMODE dm, IntPtr h, int f, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SystemParametersInfoW(int a, int b, string c, int d);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeoutW(IntPtr h, int m, IntPtr w, string l, int f, int t, out IntPtr r);
}
"@
[void][Screen2]::SetProcessDPIAware()
$A = [System.Windows.Automation.AutomationElement]
function Size { "{0}x{1}" -f [Screen2]::GetSystemMetrics(0), [Screen2]::GetSystemMetrics(1) }

# ---------------------------------------------------------------- the stage
Note "screen as found: $(Size)"
$cur = New-Object Screen2+DEVMODE; $cur.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($cur)
[void][Screen2]::EnumDisplaySettingsW($null, -1, [ref]$cur)
$cur.dmPelsWidth = $Width; $cur.dmPelsHeight = $Height; $cur.dmFields = 0x80000 -bor 0x100000
Note ("resolution {0}x{1}: {2}" -f $Width, $Height, [Screen2]::ChangeDisplaySettingsExW($null, [ref]$cur, [IntPtr]::Zero, 0x01, [IntPtr]::Zero))
Start-Sleep 2
Note "screen now: $(Size)"
$W = [Screen2]::GetSystemMetrics(0); $H = [Screen2]::GetSystemMetrics(1)

# Windows 11's own wallpaper, as a PC out of the box has it.
foreach ($wp in 'C:\Windows\Web\Wallpaper\Windows\img19.jpg', 'C:\Windows\Web\Wallpaper\Windows\img0.jpg') {
  if (Test-Path $wp) { [void][Screen2]::SystemParametersInfoW(20, 0, $wp, 3); Note "wallpaper $wp"; break }
}
# A copy of the site on this machine, whose config names the licence server on this machine.
$site = Join-Path $env:RUNNER_TEMP 'site'
New-Item -ItemType Directory -Force (Join-Path $site 'tune') | Out-Null
Copy-Item (Join-Path $Repo 'go.ps1') $site -Force
Copy-Item (Join-Path $Repo 'tune\*') (Join-Path $site 'tune') -Recurse -Force
$cfgPath = Join-Path $site 'tune\config.json'
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$cfg.api = 'http://127.0.0.1:8787'
[IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
Start-Process python -ArgumentList '-m', 'http.server', '8090', '--bind', '127.0.0.1', '--directory', $site -WindowStyle Hidden
$keyFile = Join-Path $env:RUNNER_TEMP 'film-key.txt'
Start-Process node -ArgumentList (Join-Path $Repo 'tools\worker-serve.mjs'), '--port', '8787', '--key-file', $keyFile, '--log', (Join-Path $Out 'worker-serve.txt') -WindowStyle Hidden -WorkingDirectory $Repo
$ok = $false
foreach ($i in 1..60) { Start-Sleep -Milliseconds 500; try { $h = Invoke-RestMethod http://127.0.0.1:8787/v1/health -TimeoutSec 3; $s = Invoke-WebRequest http://127.0.0.1:8090/go.ps1 -UseBasicParsing -TimeoutSec 3; if ($h.ok -and $s.StatusCode -eq 200 -and (Test-Path $keyFile)) { $ok = $true; break } } catch { } }
if (-not $ok) { Note 'the local site or licence server did not start'; exit 1 }
$key = (Get-Content $keyFile -Raw).Trim()
Note "licence server up; key issued ($($key.Substring(0, 9))...)"
# go.ps1 reads OMNIDX_BASE; the PowerShell window below is started from this process and inherits it.
$env:OMNIDX_BASE = 'http://127.0.0.1:8090'
Set-Clipboard -Value $key

# ---------------------------------------------------------------- helpers
function Win([string]$like, [int]$sec = 30) {
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($t.Elapsed.TotalSeconds -lt $sec) {
    foreach ($w in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
      try { if ($w.Current.Name -like $like) { return $w } } catch { }
    }
    Start-Sleep -Milliseconds 250
  }
  return $null
}
function Find($root, [string]$id = '', [string]$name = '', [int]$sec = 10) {
  $prop = if ($id) { $A::AutomationIdProperty } else { $A::NameProperty }
  $c = New-Object System.Windows.Automation.PropertyCondition($prop, $(if ($id) { $id } else { $name }))
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($t.Elapsed.TotalSeconds -lt $sec) { try { $e = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c); if ($e) { return $e } } catch { }; Start-Sleep -Milliseconds 250 }
  return $null
}
function FindAll($root, [string]$name) {
  $c = New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, $name)
  try { return @($root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $c)) } catch { return @() }
}
function Mid($e, [double]$fx = 0.5, [double]$fy = 0.5) { $b = $e.Current.BoundingRectangle; return @([int]($b.X + $b.Width * $fx), [int]($b.Y + $b.Height * $fy)) }
function Hwnd($e) { return [IntPtr]$e.Current.NativeWindowHandle }
function Place($e, [int]$x, [int]$y, [int]$w, [int]$h) { $hw = Hwnd $e; if ($hw -ne [IntPtr]::Zero) { [void][Human]::MoveWindow($hw, $x, $y, $w, $h, $true) } }
$events = New-Object System.Collections.ArrayList
$clock = $null
function Mark([string]$name, $extra = $null) {
  $t = if ($clock) { [math]::Round($clock.Elapsed.TotalSeconds, 2) } else { 0 }
  $e = [ordered]@{ t = $t; what = $name; processes = (Get-Process).Count }
  if ($extra) { foreach ($k in $extra.Keys) { $e[$k] = $extra[$k] } }
  [void]$events.Add($e); Note ("[{0,7:0.00}] {1} {2}" -f $t, $name, (($extra | ConvertTo-Json -Compress) -as [string]))
}
function Pause([int]$a, [int]$b) { Start-Sleep -Milliseconds (Get-Random -Minimum $a -Maximum $b) }

# ---------------------------------------------------------------- the recording
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'winarm64' } else { 'win64' }
$ffDir = Join-Path $env:RUNNER_TEMP 'ffmpeg'
Invoke-WebRequest "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-$arch-gpl.zip" -OutFile "$ffDir.zip" -UseBasicParsing
Expand-Archive "$ffDir.zip" -DestinationPath $ffDir -Force
$ff = Get-ChildItem $ffDir -Recurse -Filter ffmpeg.exe | Select-Object -First 1 -ExpandProperty FullName
$raw = Join-Path $Out 'screen.mkv'
$grab = if ($env:FILM_GRAB -eq 'ddagrab') { "-f lavfi -i ddagrab=framerate=30:draw_mouse=1,hwdownload,format=bgra" } else { "-f gdigrab -framerate 30 -draw_mouse 1 -i desktop" }
$psi = New-Object System.Diagnostics.ProcessStartInfo $ff
$psi.Arguments = "-hide_banner -loglevel warning $grab -c:v libx264 -preset ultrafast -crf 16 -pix_fmt yuv420p -y `"$raw`""
$psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
$rec = [System.Diagnostics.Process]::Start($psi)
$errTask = $rec.StandardError.ReadToEndAsync()
$clock = [Diagnostics.Stopwatch]::StartNew()
Note "recording $raw"
Start-Sleep 2

try {
  # ------------------------------------------------------------ 1. the number before, in Task Manager
  [Human]::MoveTo([int]($W * 0.62), [int]($H * 0.55), 700); Pause 900 1400
  Mark 'task-manager-open'
  [Human]::Press(0x11, 0x10, 0x1B)   # Ctrl+Shift+Esc
  $tm = Win 'Task Manager' 15
  if ($tm) {
    Place $tm ([int]($W * 0.5 - 520)) ([int]($H * 0.5 - 360)) 1040 720; Pause 1100 1500
    $perf = Find $tm -name 'Performance' -sec 8
    if ($perf) { $p = Mid $perf; [Human]::ClickAt($p[0], $p[1]) } else { Note 'no Performance item' }
    Pause 1500 2000
    $label = @(FindAll $tm 'Processes' | Sort-Object { $_.Current.BoundingRectangle.X } -Descending) | Select-Object -First 1
    if ($label) { $p = Mid $label; [Human]::MoveTo($p[0] + 10, $p[1] + 34) }
    Mark 'before-count'
    [Human]::Drift(2600)
    $b = $tm.Current.BoundingRectangle; [Human]::ClickAt([int]($b.Right - 24), [int]($b.Top + 18))   # close
    Pause 700 1000
  } else { Note 'Task Manager did not open' }

  # ------------------------------------------------------------ 2. PowerShell (administrator) and the one line
  # Opened from this process, which already has administrator rights, so Windows asks nothing and no security
  # setting is changed to film it. The edit cuts to the window as it opens.
  Mark 'powershell'
  Start-Process powershell.exe -WorkingDirectory $env:USERPROFILE
  $ps = Win '*PowerShell*' 20
  if (-not $ps) { throw 'PowerShell did not open' }
  Place $ps ([int]($W * 0.5 - 560)) ([int]($H * 0.5 - 330)) 1120 620; Pause 1500 1900
  $p = Mid $ps 0.5 0.55; [Human]::MoveTo($p[0], $p[1]); Pause 500 800
  Mark 'type-command'
  [Human]::Type('irm omnidx.net/go.ps1 | iex', 1.0, 'omnidx.ne')
  Pause 500 800
  [Human]::Press(0x0D)
  Mark 'command-entered'

  # ------------------------------------------------------------ 4. the app
  $app = Win 'OmniDx Tune' 120
  if (-not $app) { throw 'the app window did not open' }
  Mark 'app-open'
  Place $app ([int]($W * 0.5 - 560)) ([int]($H * 0.5 - 380)) 1120 760
  $run = Find $app -id 'BtnRun' -sec 20
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($t.Elapsed.TotalSeconds -lt 240) { try { if ($run.Current.IsEnabled) { break } } catch { }; Start-Sleep -Milliseconds 300 }
  $count = Find $app -id 'CountText' -sec 5
  Mark 'app-read' @{ count = $(try { $count.Current.Name } catch { '' }) }
  if ($count) { $p = Mid $count; [Human]::MoveTo($p[0] + 6, $p[1] + 4); [Human]::Drift(2200) }
  $keyBox = Find $app -id 'KeyBox' -sec 5
  $p = Mid $keyBox 0.3 0.5; [Human]::ClickAt($p[0], $p[1]); Pause 500 800
  [Human]::Press(0x11, 0x56)   # Ctrl+V
  Mark 'key-pasted'; Pause 900 1300
  $p = Mid $run; [Human]::ClickAt($p[0], $p[1])
  Mark 'run'

  # ------------------------------------------------------------ 5. the run, watched
  $result = Find $app -id 'ResultText' -sec 5
  $logBox = Find $app -id 'LogBox' -sec 5
  $t = [Diagnostics.Stopwatch]::StartNew(); $nextLook = 6
  while ($t.Elapsed.TotalMinutes -lt 30) {
    $done = ''; try { $done = $result.Current.Name } catch { }
    if ($done) { break }
    if ($t.Elapsed.TotalSeconds -gt $nextLook) {
      # Eyes on the log: the pointer wanders to where the reading is, and rests.
      $lb = $logBox.Current.BoundingRectangle
      [Human]::MoveTo([int]($lb.X + $lb.Width * (0.35 + 0.3 * (Get-Random -Maximum 1.0))), [int]($lb.Y + $lb.Height * (0.45 + 0.4 * (Get-Random -Maximum 1.0))))
      [Human]::Drift(1500); $nextLook = $t.Elapsed.TotalSeconds + (Get-Random -Minimum 7 -Maximum 16)
    }
    Start-Sleep -Milliseconds 400
  }
  Mark 'done' @{ result = $done }
  $p = Mid $result 0.4 0.5; [Human]::MoveTo($p[0], $p[1]); [Human]::Drift(3500)

  # ------------------------------------------------------------ 6. the report
  $open = Find $app -id 'BtnOpenReport' -sec 5
  if ($open -and $open.Current.IsEnabled -and $env:FILM_REPORT -eq '1') {
    $p = Mid $open; [Human]::ClickAt($p[0], $p[1])
    $edge = Win '*Edge*' 25
    if ($edge) {
      Mark 'report'
      Place $edge ([int]($W * 0.5 - 700)) ([int]($H * 0.5 - 450)) 1400 900; Pause 2500 3200
      [Human]::MoveTo([int]($W * 0.5), [int]($H * 0.55)); Pause 600 900
      for ($i = 0; $i -lt 6; $i++) { [Human]::Wheel(-3); Pause 1100 1700 }
      [Human]::Drift(1500)
    } else { Note 'no browser window with the report' }
  }

  # ------------------------------------------------------------ 7. the number after, in Task Manager
  Pause 800 1200
  Mark 'task-manager-again'
  [Human]::Press(0x11, 0x10, 0x1B)
  $tm = Win 'Task Manager' 15
  if ($tm) {
    Place $tm ([int]($W * 0.5 - 520)) ([int]($H * 0.5 - 360)) 1040 720; Pause 1400 1800
    $label = @(FindAll $tm 'Processes' | Sort-Object { $_.Current.BoundingRectangle.X } -Descending) | Select-Object -First 1
    if (-not $label -or $label.Current.BoundingRectangle.X -lt $tm.Current.BoundingRectangle.X + 300) {
      $perf = Find $tm -name 'Performance' -sec 5; if ($perf) { $p = Mid $perf; [Human]::ClickAt($p[0], $p[1]); Pause 1500 1900 }
      $label = @(FindAll $tm 'Processes' | Sort-Object { $_.Current.BoundingRectangle.X } -Descending) | Select-Object -First 1
    }
    if ($label) { $p = Mid $label; [Human]::MoveTo($p[0] + 10, $p[1] + 34) }
    Mark 'after-count'
    [Human]::Drift(4000)
  }
  Pause 1500 2000
} catch {
  Note "stopped: $_"
} finally {
  Mark 'end'
  try { $rec.StandardInput.Write('q'); $rec.StandardInput.Flush() } catch { }
  if (-not $rec.WaitForExit(60000)) { $rec.Kill() }
  Note ("ffmpeg: " + ($errTask.Result -split "`n" | Select-Object -Last 5) -join ' | ')
  $events | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Out 'events.json') -Encoding UTF8
  foreach ($pat in 'summary-*.json', 'report-*.html', 'report-*.txt', 'log-*.txt', 'card-*.png') {
    Get-ChildItem C:\OmniDx -Filter $pat -ErrorAction SilentlyContinue | Copy-Item -Destination $Out -ErrorAction SilentlyContinue
  }
  if (Test-Path $raw) { Note ("recording: {0:0.0} MB" -f ((Get-Item $raw).Length / 1MB)) }
}
