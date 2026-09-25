# What a GitHub Windows machine offers for filming: the desktop, its size, a
# resolution change, screen recording, and what runs. Writes to $Out.
param([string]$Out = (Join-Path $env:RUNNER_TEMP 'film'))
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Out | Out-Null
$os = Get-CimInstance Win32_OperatingSystem
"os: $($os.Caption) $($os.Version) build $($os.BuildNumber)"
"arch: $env:PROCESSOR_ARCHITECTURE  cpu: $((Get-CimInstance Win32_Processor | Select-Object -First 1).Name)"
$elev = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
"user: $env:USERNAME  elevated: $elev  session: $((Get-Process -Id $PID).SessionId)"
$sys = Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System
"uac: EnableLUA $($sys.EnableLUA), ConsentPromptBehaviorAdmin $($sys.ConsentPromptBehaviorAdmin), PromptOnSecureDesktop $($sys.PromptOnSecureDesktop)"
"explorer: " + ((Get-Process explorer -ErrorAction SilentlyContinue | ForEach-Object { "pid $($_.Id) session $($_.SessionId)" }) -join '; ')
"processes: $((Get-Process).Count)"
Get-CimInstance Win32_VideoController | ForEach-Object { "video: $($_.Name) $($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution) driver $($_.DriverVersion)" }
Get-Process | Sort-Object Name | ForEach-Object { "{0,-40} {1}" -f $_.Name, $_.SessionId } | Set-Content (Join-Path $Out 'processes.txt')
"terminal: " + ((Get-AppxPackage *WindowsTerminal* -ErrorAction SilentlyContinue).PackageFullName)
"edge: " + (Test-Path "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe")
"wallpaper: " + ((Get-ItemProperty 'HKCU:\Control Panel\Desktop').WallPaper) + "; img0: " + (Test-Path C:\Windows\Web\Wallpaper\Windows\img0.jpg)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Disp {
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
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DISPLAY_DEVICE { public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString; public int StateFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool EnumDisplaySettingsW(string d, int m, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int ChangeDisplaySettingsExW(string d, ref DEVMODE dm, IntPtr h, int f, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplayDevicesW(string d, int i, ref DISPLAY_DEVICE dd, int f);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[void][Disp]::SetProcessDPIAware()
function Size { "{0}x{1}" -f [Disp]::GetSystemMetrics(0), [Disp]::GetSystemMetrics(1) }
function Shot([string]$name) {
  $w = [Disp]::GetSystemMetrics(0); $h = [Disp]::GetSystemMetrics(1)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try { $g.CopyFromScreen(0, 0, 0, 0, (New-Object System.Drawing.Size $w, $h)); $bmp.Save((Join-Path $Out "$name.png")); "shot $name ${w}x${h}" } catch { "shot $name failed: $_" }
  $g.Dispose(); $bmp.Dispose()
}
"screen: $(Size)"
Shot 'desktop-as-found'
for ($i = 0; $i -lt 4; $i++) {
  $dd = New-Object Disp+DISPLAY_DEVICE; $dd.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dd)
  if (-not [Disp]::EnumDisplayDevicesW($null, $i, [ref]$dd, 0)) { break }
  "device $i : $($dd.DeviceName) '$($dd.DeviceString)' flags $($dd.StateFlags)"
}
$dm = New-Object Disp+DEVMODE; $dm.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($dm)
"DEVMODE size $($dm.dmSize)"
$modes = @(); $i = 0
while ([Disp]::EnumDisplaySettingsW($null, $i, [ref]$dm)) { $modes += "$($dm.dmPelsWidth)x$($dm.dmPelsHeight)"; $i++; if ($i -gt 400) { break } }
"modes ($i): " + (($modes | Select-Object -Unique) -join ', ')
if (-not $i) { "EnumDisplaySettings error: $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
foreach ($want in @(@(1920, 1080), @(1600, 900), @(1366, 768), @(1280, 1024))) {
  $cur = New-Object Disp+DEVMODE; $cur.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($cur)
  [void][Disp]::EnumDisplaySettingsW($null, -1, [ref]$cur)
  $cur.dmPelsWidth = $want[0]; $cur.dmPelsHeight = $want[1]; $cur.dmFields = 0x80000 -bor 0x100000
  $r = [Disp]::ChangeDisplaySettingsExW($null, [ref]$cur, [IntPtr]::Zero, 0x01, [IntPtr]::Zero)
  Start-Sleep 2
  "change to $($want[0])x$($want[1]): $r (0 = done), screen now $(Size)"
  if ((Size) -eq "$($want[0])x$($want[1])") { break }
}
Shot 'desktop-after-change'

# ffmpeg, the native build, run in the foreground with its own output kept.
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'winarm64' } else { 'win64' }
$zip = Join-Path $env:RUNNER_TEMP 'ffmpeg.zip'
try {
  Invoke-WebRequest "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-$arch-gpl.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive $zip -DestinationPath (Join-Path $env:RUNNER_TEMP 'ffmpeg') -Force
  $ff = Get-ChildItem (Join-Path $env:RUNNER_TEMP 'ffmpeg') -Recurse -Filter ffmpeg.exe | Select-Object -First 1 -ExpandProperty FullName
  "ffmpeg: $ff"
  "ffmpeg -version: " + ((& $ff -hide_banner -version 2>&1 | Select-Object -First 1) -join ' ')
} catch { "ffmpeg download failed: $_"; $ff = $null }
if ($ff) {
  foreach ($src in @(@{ n = 'gdigrab'; a = '-f gdigrab -framerate 30 -draw_mouse 1 -i desktop' },
                     @{ n = 'ddagrab'; a = '-f lavfi -i ddagrab=framerate=30:draw_mouse=1,hwdownload,format=bgra' })) {
    $file = Join-Path $Out "test-$($src.n).mp4"; $log = Join-Path $Out "test-$($src.n).txt"
    $cmd = "`"$ff`" -hide_banner $($src.a) -t 8 -c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p -y `"$file`" > `"$log`" 2>&1"
    $job = Start-Job -ScriptBlock { param($c) cmd.exe /c $c } -ArgumentList $cmd
    Start-Sleep 1; $np = Start-Process notepad -PassThru
    for ($k = 0; $k -lt 120; $k++) { $w = [Disp]::GetSystemMetrics(0); $h = [Disp]::GetSystemMetrics(1); [void][Disp]::SetCursorPos([int]($w / 2 + $w / 4 * [math]::Cos($k / 10)), [int]($h / 2 + $h / 4 * [math]::Sin($k / 10))); Start-Sleep -Milliseconds 50 }
    $job | Wait-Job -Timeout 40 | Out-Null; try { $np.Kill() } catch { }
    "$($src.n): $(if (Test-Path $file) { (Get-Item $file).Length } else { 0 }) bytes; " + ((Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 4) -join ' | ')
  }
}
