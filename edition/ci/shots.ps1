<#
  The Windows check for OmniDx Edition: builds the apps, opens each one, types into them, takes a picture of the
  screen at each step; then runs setup (no tune, no restart) and undo, and pictures the desktop after each.
  Run by .github/workflows/edition.yml on a hosted Windows machine; the pictures go out with the run.
#>
param([string]$Out = (Join-Path $env:RUNNER_TEMP 'edition-shots'))
$ErrorActionPreference = 'Continue'
$here = Split-Path $PSScriptRoot
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$log = Join-Path $Out 'check-log.txt'
function Note([string]$t) { $l = "{0:HH:mm:ss} {1}" -f (Get-Date), $t; Write-Host $l; Add-Content $log $l }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Shot {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int ChangeDisplaySettings(ref DEVMODE d, int flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE d);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, IntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SystemParametersInfo(int a, int b, string c, int d);
  public static string Resize(int w, int h) {
    var d = new DEVMODE(); d.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
    EnumDisplaySettings(null, -1, ref d);
    string before = d.dmPelsWidth + "x" + d.dmPelsHeight;
    d.dmPelsWidth = w; d.dmPelsHeight = h; d.dmFields = 0x80000 | 0x100000;
    int r = ChangeDisplaySettings(ref d, 1);
    return before + " -> " + w + "x" + h + ": " + r;
  }
  public static void Keys(byte mod, byte vk) { if (mod != 0) keybd_event(mod, 0, 0, IntPtr.Zero); keybd_event(vk, 0, 0, IntPtr.Zero); keybd_event(vk, 0, 2, IntPtr.Zero); if (mod != 0) keybd_event(mod, 0, 2, IntPtr.Zero); }
}
'@
[void][Shot]::SetProcessDPIAware()
function Snap([string]$name) {
  $b = [Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object Drawing.Bitmap $b.Width, $b.Height
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [Drawing.Point]::Empty, $b.Size)
  $bmp.Save((Join-Path $Out "$name.png"), [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Note "shot $name ($($b.Width)x$($b.Height))"
}
function Type-Text([string]$t) { [Windows.Forms.SendKeys]::SendWait($t); Start-Sleep -Milliseconds 400 }
# What must hold: a miss is written down and fails the job at the end, after every picture is taken.
$script:Failed = @()
function Check([bool]$ok, [string]$what) { if ($ok) { Note "ok: $what" } else { Note "CHECK FAILED: $what"; $script:Failed += $what } }
function Browser-Title { $p = Get-Process OmniBrowser -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p) { $p.MainWindowTitle } else { '' } }
function Stop-Apps { foreach ($n in 'OmniSearch', 'OmniHub', 'OmniBrowser') { Get-Process $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }; Start-Sleep 1 }

Note ("Windows {0} build {1}; screen {2}" -f (Get-CimInstance Win32_OperatingSystem).Caption, [Environment]::OSVersion.Version.Build, [Shot]::Resize(1920, 1080))
Start-Sleep 2
# The Edition's wallpaper behind the app pictures.
[void][Shot]::SystemParametersInfo(20, 0, (Join-Path $here 'assets\wallpaper.jpg'), 3)
# Close whatever the machine opened at sign-in (Server Manager, a console window) so the pictures show the apps.
Get-Process ServerManager -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
[Shot]::SetCursorPos(1900, 20) | Out-Null

$wv = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -Name pv -ErrorAction SilentlyContinue).pv
Note "WebView2 runtime: $(if ($wv) { $wv } else { 'not installed' })"
if (-not $wv) {
  $boot = Join-Path $env:TEMP 'wv2.exe'
  (New-Object Net.WebClient).DownloadFile('https://go.microsoft.com/fwlink/p/?LinkId=2124703', $boot)
  Start-Process $boot -ArgumentList '/silent', '/install' -Wait
  Note ("WebView2 runtime now: {0}" -f (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -Name pv -ErrorAction SilentlyContinue).pv)
}

# ---------------------------------------------------------------- build
$bin = Join-Path $here 'bin'
try { & (Join-Path $here 'build.ps1') -Out $bin *>&1 | ForEach-Object { Note "build: $_" } } catch { Note "BUILD FAILED: $_"; exit 1 }
foreach ($e in 'OmniSearch', 'OmniHub', 'OmniBrowser') { if (-not (Test-Path (Join-Path $bin "$e.exe"))) { Note "MISSING $e.exe"; exit 1 } }

# ---------------------------------------------------------------- OmniDx Search
Stop-Apps
Start-Process (Join-Path $bin 'OmniSearch.exe')
Start-Sleep 5
Snap '01-search-home'
Type-Text 'disp'; Start-Sleep 1; Snap '02-search-display'
Type-Text '{ESC}'; Type-Text '12*7{+}3'; Start-Sleep 1; Snap '03-search-sum'
Type-Text '{ESC}'; Type-Text 'task'; Start-Sleep 1; Snap '04-search-task'
Type-Text '{ESC}'; Type-Text 'omnidx.net'; Start-Sleep 1; Snap '05-search-web'
Type-Text '{ESC}'; Type-Text '{ESC}'; Start-Sleep 1
# Opening it again from a second start (the taskbar button's way).
Start-Process (Join-Path $bin 'OmniSearch.exe'); Start-Sleep 2; Snap '06-search-again'
Type-Text '{ESC}'

# ---------------------------------------------------------------- OmniDx Hub
foreach ($p in 'welcome', 'home', 'presets', 'games', 'tune', 'about') {
  Get-Process OmniHub -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep 1
  $a = if ($p -eq 'welcome') { '--welcome' } else { "--page $p" }
  Start-Process (Join-Path $bin 'OmniHub.exe') -ArgumentList $a
  Start-Sleep 5
  Snap "1$([array]::IndexOf(@('welcome', 'home', 'presets', 'games', 'tune', 'about'), $p))-hub-$p"
}
Get-Process OmniHub -ErrorAction SilentlyContinue | Stop-Process -Force
# The presets themselves (this machine runs the job as an administrator).
foreach ($pre in 'Insane', 'Competitive') {
  $r = Start-Process (Join-Path $bin 'OmniHub.exe') -ArgumentList '--apply', $pre -Wait -PassThru
  Note "preset $pre -> exit $($r.ExitCode)"
}
Note ("after Competitive: Win32PrioritySeparation={0}, power plan: {1}" -f (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl').Win32PrioritySeparation, ((powercfg /getactivescheme) -join ' '))
$gtr = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel' -Name GlobalTimerResolutionRequests -ErrorAction SilentlyContinue).GlobalTimerResolutionRequests
$dx = (Get-ItemProperty 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' -Name DirectXUserGlobalSettings -ErrorAction SilentlyContinue).DirectXUserGlobalSettings
Check ($gtr -eq 1) "Competitive: Game Boost's timer reaches every app (GlobalTimerResolutionRequests=$gtr)"
Check ("$dx" -match 'SwapEffectUpgradeEnable=1;') "Competitive: windowed games get the flip model (DirectXUserGlobalSettings='$dx')"
# Game Boost's Efficiency mode (Competitive is on): a browser in the background drops below normal while Boost is on
# and is put back after. Judged on Edge's main process, whose priority Edge does not change by itself.
Start-Process msedge.exe -ArgumentList '--no-first-run', '--no-default-browser-check', 'about:blank' -WindowStyle Minimized
Start-Sleep 8
function Edge-Main { Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object -First 1 }
function Prio([int]$id) { try { "$((Get-Process -Id $id -ErrorAction Stop).PriorityClass)" } catch { 'gone' } }
if (-not (Get-Process OmniSearch -ErrorAction SilentlyContinue)) { Start-Process (Join-Path $bin 'OmniSearch.exe') -ArgumentList '--background'; Start-Sleep 3 }
$edge = Edge-Main
if ($edge) {
  $before = Prio $edge.ProcessId
  Start-Process (Join-Path $bin 'OmniSearch.exe') -ArgumentList '--boost'; Start-Sleep 5
  $during = Prio $edge.ProcessId
  Start-Process (Join-Path $bin 'OmniSearch.exe') -ArgumentList '--unboost'; Start-Sleep 4
  $after = Prio $edge.ProcessId
  Note "Edge's main process: $before, with Game Boost on $during, after $after"
  Check ($before -eq 'Normal' -and $during -eq 'BelowNormal') 'Game Boost: a background browser runs in Efficiency mode while it is on'
  Check ($after -eq 'Normal') 'Game Boost: the browser is back to normal when it ends'
} else { Note 'Edge did not start here; the Efficiency mode check is skipped' }
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$r = Start-Process (Join-Path $bin 'OmniHub.exe') -ArgumentList '--restore' -Wait -PassThru
Note ("restore -> exit {0}; Win32PrioritySeparation={1}, power plan: {2}" -f $r.ExitCode, (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl').Win32PrioritySeparation, ((powercfg /getactivescheme) -join ' '))
$r = Start-Process (Join-Path $bin 'OmniHub.exe') -ArgumentList '--purge' -Wait -PassThru
Note "free memory (standby list) -> exit $($r.ExitCode)"

# ---------------------------------------------------------------- OmniDx Browser
Start-Process (Join-Path $bin 'OmniBrowser.exe')
Start-Sleep 10
Snap '20-browser-newtab'
# Typed into the new tab's address bar, as a person would; the page then has the keys.
Type-Text 'omnidx.net{ENTER}'
Start-Sleep 10
Snap '21-browser-omnidx'
# Ctrl+T while the page has the keys (WebView2 keeps them from the window): a new tab opens at once and takes the
# typing that follows, even while its engine is still starting.
[Shot]::Keys(0x11, 0x54)
Start-Sleep -Milliseconds 800
$t1 = Browser-Title
Type-Text 'en.wikipedia.org/wiki/Esports{ENTER}'
Start-Sleep 9
Snap '22-browser-ctrl-t'
$t2 = Browser-Title
Check ($t1 -like 'New tab*') "Ctrl+T from the page opened a new tab (title then: '$t1')"
Check ($t2 -like '*Esports*') "the typing after Ctrl+T went to the new tab (title now: '$t2')"
# Ctrl+W from the page closes it, back to omnidx.net.
[Shot]::Keys(0x11, 0x57)
Start-Sleep 2
$t3 = Browser-Title
Check ($t3 -and $t3 -notlike '*Esports*') "Ctrl+W from the page closed the tab (title now: '$t3')"
Start-Process (Join-Path $bin 'OmniBrowser.exe') -ArgumentList 'https://en.wikipedia.org/wiki/Esports'
Start-Sleep 9
Snap '23-browser-tabs'
Stop-Apps

# ---------------------------------------------------------------- setup, then undo
# With a key, while Windows Update waits for a restart (made to look so here, the way a fresh install usually is at
# its first sign-in): the tune must be put off until the sign-in after the restart, not run and not lost. Nothing
# reaches omnidx.net: the tune's address is a closed port on this machine.
$env:OMNIDX_BASE = 'http://127.0.0.1:9'
$wu = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
$realWait = (Test-Path $wu) -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
if (-not (Test-Path $wu)) { New-Item $wu -Force | Out-Null }
$tf = Join-Path $env:ProgramData 'OmniDx\Edition\tune-waiting.json'
$ek = 'HKCU:\Software\OmniDx\Edition'
function Tune-Task { Get-ScheduledTask -TaskName 'Edition Tune' -TaskPath '\OmniDx\' -ErrorAction SilentlyContinue }
# The lean stage's services, as they were: checked again after setup and after undo.
function Start-Of([string]$svc) { (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$svc" -Name Start -ErrorAction SilentlyContinue).Start }
$leanBefore = @{}; foreach ($svc in 'DiagTrack', 'dmwappushservice', 'TrkWks', 'Spooler', 'WSearch') { $leanBefore[$svc] = Start-Of $svc }
function Reserved { ((& dism.exe /Online /Get-ReservedStorageState /English 2>&1) -join ' ') -replace '.*Reserved storage is (\w+).*', '$1' }
$rsBefore = Reserved
Note "reserved storage before setup: $rsBefore"
$sa = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$saBefore = (Get-ItemProperty $sa -Name SecurityHealth -ErrorAction SilentlyContinue).SecurityHealth
Note ("before setup: " + (($leanBefore.Keys | Sort-Object | ForEach-Object { "$_=$($leanBefore[$_])" }) -join ', ') + "; SecurityHealth startup: " + $(if ($saBefore) { ($saBefore | ForEach-Object { '{0:X2}' -f $_ }) -join '' } else { 'none' }))
Note 'setup.ps1 -Key (a test key) -NoRestart, with an update restart waiting'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'setup.ps1') -Key 'TUNE-TEST-TEST-TEST-TEST' -NoRestart *>&1 | ForEach-Object { Note "setup: $_" }
$task = Tune-Task
$who = if (Test-Path $tf) { @((Get-Acl $tf).Access | ForEach-Object { $_.IdentityReference.Value }) } else { @() }
Check ([bool]$task -and "$($task.Principal.RunLevel)" -eq 'Highest') "the tune is put off to a sign-in task that runs as administrator ($(if ($task) { $task.Principal.RunLevel } else { 'no task' }))"
Check ($who.Count -gt 0 -and -not ($who | Where-Object { $_ -notmatch 'SYSTEM$|Administrators$' })) "the waiting key is readable by the system and administrators only ($($who -join ', '))"
Check ((Get-ItemProperty $ek -Name TunePending -ErrorAction SilentlyContinue).TunePending -eq '1') 'the welcome is told to wait for the tune'
# The lean stage: telemetry and link tracking off where this Windows has them; Store apps kept from the background.
foreach ($svc in 'DiagTrack', 'dmwappushservice', 'TrkWks') { if ($null -ne $leanBefore[$svc]) { Check ((Start-Of $svc) -eq 4) "lean: $svc is off ($($leanBefore[$svc]) -> $(Start-Of $svc))" } }
Check ((Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy' -Name LetAppsRunInBackground -ErrorAction SilentlyContinue).LetAppsRunInBackground -eq 2) 'lean: Store apps only run while open'
Check ((Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' -Name DisableSearch -ErrorAction SilentlyContinue).DisableSearch -eq 1) "lean: Windows' own search is off (OmniDx Search is Windows + S)"
if ($rsBefore -eq 'enabled') { Check ((Reserved) -eq 'disabled') "lean: the space held back for updates is given back ($rsBefore -> $(Reserved))" }
Note ("lean: Spooler {0} -> {1}, WSearch {2} -> {3}" -f $leanBefore['Spooler'], (Start-Of 'Spooler'), $leanBefore['WSearch'], (Start-Of 'WSearch'))
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue   # Explorer restarts with the new taskbar
Start-Sleep 12
Stop-Apps
Start-Process (Join-Path $env:ProgramFiles 'OmniDx\Edition\OmniSearch.exe') -ArgumentList '--background'
Start-Sleep 4
Snap '30-desktop-after-setup'
[Shot]::Keys(0x5B, 0x53)   # Windows + S
Start-Sleep 2
Snap '31-win-s'
Type-Text '{ESC}'
Note ("hot key: {0}" -f (Get-ItemProperty 'HKCU:\Software\OmniDx\Edition' -Name Hotkey -ErrorAction SilentlyContinue).Hotkey)
Start-Process (Join-Path $env:ProgramFiles 'OmniDx\Edition\OmniHub.exe') -ArgumentList '--welcome'
Start-Sleep 5
Snap '32-welcome-after-setup'
Stop-Apps
# The sign-in after the restart, as the task runs it. Windows Update still waiting: put off again, key kept.
$edSetup = Join-Path $env:ProgramFiles 'OmniDx\Edition\setup.ps1'
Note 'setup.ps1 -TuneOnly -NoRestart, the update restart still waiting'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $edSetup -TuneOnly -NoRestart *>&1 | ForEach-Object { Note "tune-only: $_" }
$job = $null; try { $job = Get-Content $tf -Raw | ConvertFrom-Json } catch { }
Check ($job -and [int]$job.tries -eq 1 -and [bool](Tune-Task)) "still waiting: put off again, key and task kept (tries: $(if ($job) { $job.tries } else { 'no file' }))"
if ($realWait) { Note 'this machine really has an update restart waiting: the tune-only run is not checked' }
else {
  Remove-Item $wu -Force
  # The update is done: the tune runs (and stops at once here, its address being closed), then the welcome shows.
  Note 'setup.ps1 -TuneOnly -NoRestart, no update waiting'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $edSetup -TuneOnly -NoRestart *>&1 | ForEach-Object { Note "tune-only: $_" }
  Start-Sleep 5
  Snap '34-welcome-after-tune'
  Check (-not (Test-Path $tf)) 'the waiting key is deleted once the tune has it'
  Check (-not (Tune-Task)) 'the sign-in task is gone'
  Check ($null -eq (Get-ItemProperty $ek -Name TunePending -ErrorAction SilentlyContinue)) 'the tune stopped without a restart, so the welcome waits no longer'
  Check ([bool](Get-Process OmniHub -ErrorAction SilentlyContinue)) 'the welcome opened'
  Stop-Apps
}
Remove-Item Env:\OMNIDX_BASE -ErrorAction SilentlyContinue
Note 'setup.ps1 -Undo'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $env:ProgramFiles 'OmniDx\Edition\setup.ps1') -Undo *>&1 | ForEach-Object { Note "undo: $_" }
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep 12
Snap '33-desktop-after-undo'
foreach ($svc in $leanBefore.Keys) { Check ((Start-Of $svc) -eq $leanBefore[$svc]) "undo: $svc is back as it was ($($leanBefore[$svc]) -> $(Start-Of $svc))" }
if ($rsBefore -in 'enabled', 'disabled') { Check ((Reserved) -eq $rsBefore) "undo: reserved storage is $rsBefore again ($(Reserved))" }
$saAfter = (Get-ItemProperty $sa -Name SecurityHealth -ErrorAction SilentlyContinue).SecurityHealth
Check ("$saAfter" -eq "$saBefore") 'undo: the Windows Security tray icon starts as it did'
Check ($null -eq (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy' -Name LetAppsRunInBackground -ErrorAction SilentlyContinue)) 'undo: the background-apps policy is gone'
Check ($null -eq (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' -Name DisableSearch -ErrorAction SilentlyContinue)) "undo: Windows' own search is back"
Note ("after undo: TaskbarAl={0}, Program Files folder there: {1}" -f (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name TaskbarAl -ErrorAction SilentlyContinue).TaskbarAl, (Test-Path (Join-Path $env:ProgramFiles 'OmniDx\Edition')))
foreach ($f in (Join-Path $env:LOCALAPPDATA 'OmniDx\edition-log.txt'), (Join-Path $env:ProgramData 'OmniDx\Edition\setup-log.txt'), (Join-Path $env:ProgramData 'OmniDx\Edition\undo-setup.tsv')) {
  if (Test-Path $f) { Copy-Item $f $Out -Force }
}
Get-ChildItem (Join-Path $env:ProgramData 'OmniDx\Edition') -Filter '*.done' -ErrorAction SilentlyContinue | Copy-Item -Destination $Out -Force
Check (-not (Tune-Task) -and -not (Test-Path $tf)) 'undo leaves no tune task and no key behind'
if ($script:Failed.Count) { Note ("{0} check(s) failed: {1}" -f $script:Failed.Count, ($script:Failed -join ' | ')); exit 1 }
Note 'done'
