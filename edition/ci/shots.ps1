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
Type-Text '{ESC}'; Type-Text '12*7+3'; Start-Sleep 1; Snap '03-search-sum'
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
$r = Start-Process (Join-Path $bin 'OmniHub.exe') -ArgumentList '--restore' -Wait -PassThru
Note ("restore -> exit {0}; Win32PrioritySeparation={1}, power plan: {2}" -f $r.ExitCode, (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl').Win32PrioritySeparation, ((powercfg /getactivescheme) -join ' '))
$r = Start-Process (Join-Path $bin 'OmniHub.exe') -ArgumentList '--purge' -Wait -PassThru
Note "free memory (standby list) -> exit $($r.ExitCode)"

# ---------------------------------------------------------------- OmniDx Browser
Start-Process (Join-Path $bin 'OmniBrowser.exe')
Start-Sleep 10
Snap '20-browser-newtab'
Start-Process (Join-Path $bin 'OmniBrowser.exe') -ArgumentList 'https://omnidx.net'
Start-Sleep 10
Snap '21-browser-omnidx'
Start-Process (Join-Path $bin 'OmniBrowser.exe') -ArgumentList 'https://en.wikipedia.org/wiki/Esports'
Start-Sleep 9
Snap '22-browser-three-tabs'
Stop-Apps

# ---------------------------------------------------------------- setup, then undo
Note 'setup.ps1 -NoTune -NoRestart'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'setup.ps1') -NoTune -NoRestart *>&1 | ForEach-Object { Note "setup: $_" }
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
Note 'setup.ps1 -Undo'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $env:ProgramFiles 'OmniDx\Edition\setup.ps1') -Undo *>&1 | ForEach-Object { Note "undo: $_" }
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep 12
Snap '33-desktop-after-undo'
Note ("after undo: TaskbarAl={0}, Program Files folder there: {1}" -f (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name TaskbarAl -ErrorAction SilentlyContinue).TaskbarAl, (Test-Path (Join-Path $env:ProgramFiles 'OmniDx\Edition')))
foreach ($f in (Join-Path $env:LOCALAPPDATA 'OmniDx\edition-log.txt'), (Join-Path $env:ProgramData 'OmniDx\Edition\setup-log.txt'), (Join-Path $env:ProgramData 'OmniDx\Edition\undo-setup.tsv')) {
  if (Test-Path $f) { Copy-Item $f $Out -Force }
}
Get-ChildItem (Join-Path $env:ProgramData 'OmniDx\Edition') -Filter '*.done' -ErrorAction SilentlyContinue | Copy-Item -Destination $Out -Force
Note 'done'
