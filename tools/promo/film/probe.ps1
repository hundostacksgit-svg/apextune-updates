# What a GitHub Windows machine offers for filming: the desktop, its size, a
# resolution change, screen recording speed, and what runs. Writes to $Out.
param([string]$Out = (Join-Path $env:RUNNER_TEMP 'film'))
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Out | Out-Null
$os = Get-CimInstance Win32_OperatingSystem
"os: $($os.Caption) $($os.Version) build $($os.BuildNumber)"
"arch: $env:PROCESSOR_ARCHITECTURE  cpu: $((Get-CimInstance Win32_Processor | Select-Object -First 1).Name)"
"user: $env:USERNAME  interactive: $([Environment]::UserInteractive)  session: $((Get-Process -Id $PID).SessionId)"
"explorer running: $([bool](Get-Process explorer -ErrorAction SilentlyContinue))"
"uac EnableLUA: $((Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System).EnableLUA)"
"processes: $((Get-Process).Count)"
Get-Process | Sort-Object Name | ForEach-Object { "{0,-40} {1}" -f $_.Name, $_.SessionId } | Set-Content (Join-Path $Out 'processes.txt')
Get-Service | Where-Object Status -eq Running | Sort-Object Name | ForEach-Object { $_.Name } | Set-Content (Join-Path $Out 'services.txt')
foreach ($t in 'node', 'python', 'gh', 'ffmpeg', 'winget', 'wt') { "{0}: {1}" -f $t, ((Get-Command $t -ErrorAction SilentlyContinue).Source) }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Disp {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern bool EnumDisplaySettings(string d, int m, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern int ChangeDisplaySettings(ref DEVMODE dm, int f);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@
function Shot([string]$name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try { $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save((Join-Path $Out "$name.png")); "shot $name ${($b.Width)}x$($b.Height)" } catch { "shot $name failed: $_" }
  $g.Dispose(); $bmp.Dispose()
}
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "screen: $($b.Width)x$($b.Height)"
Shot 'desktop-as-found'
$dm = New-Object Disp+DEVMODE; $dm.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($dm)
$modes = @(); $i = 0
while ([Disp]::EnumDisplaySettings($null, $i, [ref]$dm)) { $modes += "$($dm.dmPelsWidth)x$($dm.dmPelsHeight)@$($dm.dmDisplayFrequency)"; $i++ }
"modes: " + (($modes | Select-Object -Unique) -join ', ')
$cur = New-Object Disp+DEVMODE; $cur.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($cur)
[void][Disp]::EnumDisplaySettings($null, -1, [ref]$cur)
$cur.dmPelsWidth = 1920; $cur.dmPelsHeight = 1080; $cur.dmFields = 0x80000 -bor 0x100000
"change to 1920x1080: $([Disp]::ChangeDisplaySettings([ref]$cur, 0))  (0 = done)"
Start-Sleep 3
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "screen now: $($b.Width)x$($b.Height)"
Shot 'desktop-1080'

# ffmpeg: the native build for the machine, recording the desktop while a window opens and the pointer moves.
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'winarm64' } else { 'win64' }
$zip = Join-Path $env:RUNNER_TEMP 'ffmpeg.zip'
try {
  Invoke-WebRequest "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-$arch-gpl.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive $zip -DestinationPath (Join-Path $env:RUNNER_TEMP 'ffmpeg') -Force
  $ff = Get-ChildItem (Join-Path $env:RUNNER_TEMP 'ffmpeg') -Recurse -Filter ffmpeg.exe | Select-Object -First 1 -ExpandProperty FullName
  "ffmpeg: $ff ($arch)"
} catch { "ffmpeg download failed: $_"; $ff = $null }
if ($ff) {
  foreach ($src in @(@{ n = 'gdigrab'; a = @('-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '1', '-i', 'desktop') },
                     @{ n = 'ddagrab'; a = @('-f', 'lavfi', '-i', 'ddagrab=framerate=30:draw_mouse=1,hwdownload,format=bgra') })) {
    $file = Join-Path $Out "test-$($src.n).mp4"; $log = Join-Path $Out "test-$($src.n).log"
    $args = $src.a + @('-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-y', $file)
    $p = Start-Process $ff -ArgumentList $args -PassThru -NoNewWindow -RedirectStandardError $log
    Start-Sleep 1; $np = Start-Process notepad -PassThru
    for ($k = 0; $k -lt 120; $k++) { [void][Disp]::SetCursorPos([int](960 + 400 * [math]::Cos($k / 10)), [int](540 + 250 * [math]::Sin($k / 10))); Start-Sleep -Milliseconds 50 }
    $p.WaitForExit(30000) | Out-Null; try { $np.Kill() } catch { }
    "$($src.n): exit $($p.ExitCode), $(if (Test-Path $file) { (Get-Item $file).Length } else { 0 }) bytes; " + ((Get-Content $log -ErrorAction SilentlyContinue | Select-String 'frame=' | Select-Object -Last 1) -replace '\s+', ' ')
  }
}
