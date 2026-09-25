<#
  OmniDx Edition setup.

  Turns a fresh, genuine Windows 10 or 11 install into OmniDx Edition: the OmniDx look (wallpaper, lock screen,
  account picture, dark violet theme), the taskbar on the left with OmniDx Search on Windows + S, OmniDx Browser and
  OmniDx Hub, the Competitive preset, and the OmniDx tune in Extreme when a key is given. Windows itself is the one
  you installed from Microsoft, unmodified: this sets it up, the way you could by hand, and writes down every value
  it changes first.

  Run once, as administrator (the Edition USB stick's answer file runs it at the first sign-in):
    .\setup.ps1                              everything, then a restart
    .\setup.ps1 -Key TUNE-XXXX-XXXX-XXXX-XXXX  the same, with the tune (Extreme) as the last step
    .\setup.ps1 -Preset Insane               start on another preset (Balanced, Competitive, Insane)
    .\setup.ps1 -KeepBrowser                 leave the default browser as it is
    .\setup.ps1 -Undo                        put back everything the Edition changed

  Everything it writes down is in C:\ProgramData\OmniDx\Edition (undo-setup.tsv, presets-undo.tsv, setup-log.txt).
#>
[CmdletBinding()]
param(
  [string]$Key = $env:OMNIDX_KEY,
  [ValidateSet('Balanced', 'Competitive', 'Insane')][string]$Preset = 'Competitive',
  [switch]$NoTune,
  [switch]$NoExtreme,
  [switch]$KeepBrowser,
  [switch]$NoRestart,
  [switch]$Undo
)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
$Version = '1.0.0'
$Here = $PSScriptRoot
$Dest = Join-Path $env:ProgramFiles 'OmniDx\Edition'
$Data = Join-Path $env:ProgramData 'OmniDx\Edition'
$Menu = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\OmniDx'
$UndoFile = Join-Path $Data 'undo-setup.tsv'
New-Item -ItemType Directory -Force -Path $Data | Out-Null
$LogFile = Join-Path $Data 'setup-log.txt'

function Note([string]$t, [string]$c = 'Gray') {
  Write-Host "  $t" -ForegroundColor $c
  try { Add-Content -Path $LogFile -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $t) } catch { }
}
function Head([string]$t) { Write-Host ''; Write-Host "  $t" -ForegroundColor Magenta; try { Add-Content -Path $LogFile -Value "== $t" } catch { } }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host '  OmniDx Edition setup needs administrator rights. Asking...' -ForegroundColor Yellow
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', "`"$PSCommandPath`"") + @($PSBoundParameters.GetEnumerator() | ForEach-Object { if ($_.Value -is [switch]) { if ($_.Value) { "-$($_.Key)" } } else { "-$($_.Key)"; "`"$($_.Value)`"" } })
  Start-Process powershell.exe -Verb RunAs -ArgumentList $a
  return
}

Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class EdNative {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SystemParametersInfo(int a, int b, string c, int d);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, int m, IntPtr w, string l, int f, int t, out IntPtr r);
  public static void Broadcast() { IntPtr r; SendMessageTimeout((IntPtr)0xFFFF, 0x1A, IntPtr.Zero, "ImmersiveColorSet", 2, 3000, out r); SendMessageTimeout((IntPtr)0xFFFF, 0x1A, IntPtr.Zero, "TraySettings", 2, 3000, out r); }
}
'@ -ErrorAction SilentlyContinue

# ---------------------------------------------------------------- the record
# One line per change, tab-separated, the same format OmniDx Hub keeps for the presets:
#   reg <hive> <path> <name> <kind|absent> <value>     a value, as it was
#   key <hive> <path>                                  a key the Edition made (removed on undo)
#   file <path> <backup|->                             a file the Edition replaced (put back) or made (removed)
#   task <name>                                        a scheduled task the Edition made
$script:Seen = @{}
if (Test-Path $UndoFile) { foreach ($l in Get-Content $UndoFile) { $p = $l -split "`t"; if ($p.Count -ge 3) { $script:Seen[($p[0..([Math]::Min(3, $p.Count - 1))] -join '|')] = $true } } }
function Remember([string[]]$fields, [string]$id) {
  if ($script:Seen[$id]) { return }
  $script:Seen[$id] = $true
  Add-Content -Path $UndoFile -Value ($fields -join "`t") -Encoding UTF8
}
function Split-Reg([string]$path) {
  if ($path -match '^(HKLM|HKCU):\\(.+)$') { return @($Matches[1], $Matches[2]) }
  throw "not a registry path: $path"
}
function Encode($v, [string]$kind) {
  if ($null -eq $v) { return '' }
  switch ($kind) {
    'Binary' { return [Convert]::ToBase64String([byte[]]$v) }
    'MultiString' { return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((@($v) -join "`0"))) }
    'String' { return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$v)) }
    'ExpandString' { return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$v)) }
    default { return [string]$v }
  }
}
function Set-Reg([string]$path, [string]$name, $value, [string]$type = 'DWord') {
  $hp = Split-Reg $path
  $id = "reg|$($hp[0])|$($hp[1])|$name"
  if (-not $script:Seen[$id]) {
    $kind = 'absent'; $old = $null
    if (Test-Path $path) {
      $k = Get-Item -LiteralPath $path
      $vn = if ($name -eq '(default)') { '' } else { $name }   # the key's own value is the empty name
      if ($k.GetValueNames() -contains $vn) { $kind = $k.GetValueKind($vn).ToString(); $old = $k.GetValue($vn, $null, 'DoNotExpandEnvironmentNames') }
    } else {
      # The key did not exist: remember the topmost missing one, so undo removes what setup made.
      $top = $path
      while ((Split-Path $top) -and -not (Test-Path (Split-Path $top))) { $top = Split-Path $top }
      $th = Split-Reg $top
      Remember @('key', $th[0], $th[1]) "key|$($th[0])|$($th[1])"
    }
    Remember @('reg', $hp[0], $hp[1], $name, $kind, (Encode $old $kind)) $id
  }
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $type -Force | Out-Null
}
function New-Key([string]$path) {
  if (Test-Path $path) { return }
  $hp = Split-Reg $path
  Remember @('key', $hp[0], $hp[1]) "key|$($hp[0])|$($hp[1])"
  New-Item -Path $path -Force | Out-Null
}
function Put-File([string]$from, [string]$to) {
  $id = "file|$to"
  if (-not $script:Seen[$id]) {
    $backup = '-'
    if (Test-Path $to) {
      $bdir = Join-Path $Data 'backup'; New-Item -ItemType Directory -Force -Path $bdir | Out-Null
      $backup = Join-Path $bdir (($to -replace '[:\\]', '_'))
      Copy-Item $to $backup -Force
    }
    Remember @('file', $to, $backup) $id
  }
  try { Copy-Item $from $to -Force -ErrorAction Stop }
  catch {
    # Windows' own pictures belong to SYSTEM: take ownership for administrators, then copy.
    & takeown.exe /f $to /a 2>&1 | Out-Null
    & icacls.exe $to /grant '*S-1-5-32-544:F' 2>&1 | Out-Null
    Copy-Item $from $to -Force
  }
}

# A file set aside: kept in the backup folder, put back on undo.
function Drop-File([string]$path) {
  $bdir = Join-Path $Data 'backup'; New-Item -ItemType Directory -Force -Path $bdir | Out-Null
  $backup = Join-Path $bdir (($path -replace '[:\\]', '_'))
  Copy-Item $path $backup -Force
  Remember @('file', $path, $backup) "file|$path"
  Remove-Item $path -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- undo
if ($Undo) {
  Head 'Removing OmniDx Edition'
  foreach ($n in 'OmniSearch', 'OmniBrowser', 'OmniHub') { Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
  $hub = Join-Path $Dest 'OmniHub.exe'
  if (Test-Path $hub) { Note 'The presets: putting back what they changed'; Start-Process $hub -ArgumentList '--restore' -Wait }
  if (-not (Test-Path $UndoFile)) { Note 'Nothing recorded; nothing to put back.' 'Yellow' }
  else {
    $lines = @(Get-Content $UndoFile)
    [array]::Reverse($lines)
    foreach ($l in $lines) {
      $p = $l -split "`t"
      try {
        switch ($p[0]) {
          'reg' {
            $path = "$($p[1]):\$($p[2])"
            if ($p[4] -eq 'absent') { Remove-ItemProperty -Path $path -Name $p[3] -ErrorAction SilentlyContinue }
            else {
              $v = switch ($p[4]) {
                'DWord' { [int]$p[5] } 'QWord' { [long]$p[5] } 'Binary' { [Convert]::FromBase64String($p[5]) }
                'MultiString' { ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[5]))) -split "`0" }
                default { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[5])) }
              }
              if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
              New-ItemProperty -Path $path -Name $p[3] -Value $v -PropertyType $p[4] -Force | Out-Null
            }
          }
          'key' { Remove-Item -Path "$($p[1]):\$($p[2])" -Recurse -Force -ErrorAction SilentlyContinue }
          'file' { if ($p[2] -eq '-') { Remove-Item $p[1] -Recurse -Force -ErrorAction SilentlyContinue } else { Copy-Item $p[2] $p[1] -Force -ErrorAction SilentlyContinue } }
          'task' { Unregister-ScheduledTask -TaskName $p[1] -TaskPath '\OmniDx\' -Confirm:$false -ErrorAction SilentlyContinue }
          'sounds' {
            foreach ($ev in Get-ChildItem 'HKCU:\AppEvents\Schemes\Apps' -ErrorAction SilentlyContinue | Get-ChildItem -ErrorAction SilentlyContinue) {
              $def = Join-Path $ev.PSPath '.Default'; $cur = Join-Path $ev.PSPath '.Current'
              if (Test-Path $def) { if (-not (Test-Path $cur)) { New-Item $cur -Force | Out-Null }; Set-Item -Path $cur -Value ((Get-Item $def).GetValue('')) }
            }
          }
        }
      } catch { Note ("could not put back: {0} ({1})" -f $l, $_.Exception.Message) 'Yellow' }
    }
    Move-Item $UndoFile ($UndoFile + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.done') -Force
  }
  $wp = (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -Name WallPaper -ErrorAction SilentlyContinue).WallPaper
  try { [void][EdNative]::SystemParametersInfo(20, 0, "$wp", 3); [EdNative]::Broadcast() } catch { }
  Remove-Item $Menu -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $Dest -Recurse -Force -ErrorAction SilentlyContinue
  Note 'OmniDx Edition removed. The tune''s own changes stay (undo them from its report or with $env:OMNIDX_MODE=''undo''; irm omnidx.net/go.ps1 | iex).' 'Green'
  Note 'Restart to see the taskbar and the sign-in screen as they were.' 'Green'
  return
}

# ---------------------------------------------------------------- setup
Write-Host ''
Write-Host '  OmniDx Edition' -ForegroundColor Magenta
Write-Host "  Setting up this Windows for games. About three minutes; the PC restarts at the end." -ForegroundColor Gray
Note "setup $Version on $((Get-CimInstance Win32_OperatingSystem).Caption) build $([Environment]::OSVersion.Version.Build), as $env:USERNAME"
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 18362) { Note 'OmniDx Edition needs Windows 10 version 1903 or later, or Windows 11.' 'Red'; return }
$win11 = $build -ge 22000

Head '1. The apps'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
if ((Resolve-Path $Here).Path.TrimEnd('\') -ne (Resolve-Path $Dest).Path.TrimEnd('\')) {
  foreach ($d in 'apps', 'assets', 'webview2') { if (Test-Path (Join-Path $Here $d)) { Copy-Item (Join-Path $Here $d) $Dest -Recurse -Force } }
  Copy-Item (Join-Path $Here 'build.ps1'), (Join-Path $Here 'setup.ps1') $Dest -Force
}
Remember @('file', $Dest, '-') "file|$Dest"
$built = $true
try { & (Join-Path $Dest 'build.ps1') -Out $Dest } catch { Note ("The apps did not build: {0}" -f $_.Exception.Message) 'Red'; $built = $false }
foreach ($a in 'OmniSearch', 'OmniHub', 'OmniBrowser') { if (-not (Test-Path (Join-Path $Dest "$a.exe"))) { Note "$a.exe is missing" 'Yellow'; if ($a -ne 'OmniBrowser') { $built = $false } } }
$hasBrowser = Test-Path (Join-Path $Dest 'OmniBrowser.exe')

# WebView2 is part of Windows 11 and every up-to-date Windows 10; if it is missing, Microsoft's installer puts it in.
$wv = @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') |
  Where-Object { (Get-ItemProperty $_ -Name pv -ErrorAction SilentlyContinue).pv -match '^[1-9]' }
if ($hasBrowser -and -not $wv) {
  Note 'WebView2 is missing: installing it from Microsoft'
  try {
    $boot = Join-Path $env:TEMP 'MicrosoftEdgeWebview2Setup.exe'
    (New-Object System.Net.WebClient).DownloadFile('https://go.microsoft.com/fwlink/p/?LinkId=2124703', $boot)
    Start-Process $boot -ArgumentList '/silent', '/install' -Wait
  } catch { Note ("WebView2 could not be installed: {0}" -f $_.Exception.Message) 'Yellow' }
}

# Start menu entries (Windows' own shortcuts, so Start, the taskbar and OmniDx Search list them).
New-Item -ItemType Directory -Force -Path $Menu | Out-Null
Remember @('file', $Menu, '-') "file|$Menu"
$shell = New-Object -ComObject WScript.Shell
$apps = @(@('OmniDx Search', 'OmniSearch', 'Apps, games, settings, files and the web: Windows + S'), @('OmniDx Hub', 'OmniHub', 'Presets, Game Boost, your games and the tune'))
if ($hasBrowser) { $apps += , @('OmniDx Browser', 'OmniBrowser', 'The web, light: sleeping tabs, trackers blocked') }
foreach ($a in $apps) {
  $lnk = $shell.CreateShortcut((Join-Path $Menu "$($a[0]).lnk"))
  $lnk.TargetPath = Join-Path $Dest "$($a[1]).exe"; $lnk.WorkingDirectory = $Dest; $lnk.Description = $a[2]
  $lnk.IconLocation = (Join-Path $Dest "$($a[1]).exe") + ',0'
  $lnk.Save()
}
Note 'OmniDx Search, Hub and Browser built and in Start' 'Green'

Head '2. The look'
# The wallpaper and the lock screen: the site's black and violet, with the logo.
foreach ($f in 'wallpaper.jpg', 'lockscreen.jpg', 'oem.bmp') { Copy-Item (Join-Path $Here "assets\$f") (Join-Path $Data $f) -Force }
$wall = Join-Path $Data 'wallpaper.jpg'; $lock = Join-Path $Data 'lockscreen.jpg'
Set-Reg 'HKCU:\Control Panel\Desktop' 'WallPaper' $wall 'String'
Set-Reg 'HKCU:\Control Panel\Desktop' 'WallpaperStyle' '10' 'String'
Set-Reg 'HKCU:\Control Panel\Desktop' 'TileWallpaper' '0' 'String'
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers' 'BackgroundType' 0
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\DesktopSpotlight\Settings' 'EnabledState' 0
try { [void][EdNative]::SystemParametersInfo(20, 0, $wall, 3) } catch { }
$csp = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\PersonalizationCSP'
Set-Reg $csp 'LockScreenImagePath' $lock 'String'
Set-Reg $csp 'LockScreenImageUrl' $lock 'String'
Set-Reg $csp 'LockScreenImageStatus' 1
$cdm = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
foreach ($n in 'RotatingLockScreenEnabled', 'RotatingLockScreenOverlayEnabled', 'SubscribedContent-338387Enabled', 'SubscribedContent-338388Enabled', 'SubscribedContent-338389Enabled', 'SubscribedContent-353698Enabled', 'SoftLandingEnabled', 'SystemPaneSuggestionsEnabled') { Set-Reg $cdm $n 0 }
Note 'Wallpaper and lock screen' 'Green'

# Dark, with the OmniDx violet as the accent: Start, the taskbar and the Settings highlights.
$pers = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
Set-Reg $pers 'AppsUseLightTheme' 0
Set-Reg $pers 'SystemUsesLightTheme' 0
Set-Reg $pers 'ColorPrevalence' 1
Set-Reg 'HKCU:\Control Panel\Desktop' 'AutoColorization' 0
# Eight shades, lightest to darkest, the fourth the accent itself (#8B5CF6).
$palette = [byte[]](0xE9, 0xD5, 0xFF, 0, 0xD8, 0xB4, 0xFE, 0, 0xC0, 0x84, 0xFC, 0, 0x8B, 0x5C, 0xF6, 0, 0x6D, 0x28, 0xD9, 0, 0x5B, 0x21, 0xB6, 0, 0x3B, 0x07, 0x64, 0, 0x2E, 0x10, 0x65, 0)
$acc = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Accent'
Set-Reg $acc 'AccentPalette' $palette 'Binary'
Set-Reg $acc 'AccentColorMenu' 0xFFF65C8B
Set-Reg $acc 'StartColorMenu' 0xFFB6215B
$dwm = 'HKCU:\Software\Microsoft\Windows\DWM'
Set-Reg $dwm 'AccentColor' 0xFFF65C8B
Set-Reg $dwm 'ColorizationColor' 0xC48B5CF6
Set-Reg $dwm 'ColorizationAfterglow' 0xC48B5CF6
Set-Reg $dwm 'ColorPrevalence' 0
Set-Reg $dwm 'EnableWindowColorization' 1
Note 'Dark theme, violet accent on Start and the taskbar' 'Green'

# The account picture (every account without its own picture) and the PC maker's line in Settings > About.
$pics = Join-Path $env:ProgramData 'Microsoft\User Account Pictures'
foreach ($f in 'user.png', 'user.bmp', 'user-32.png', 'user-40.png', 'user-48.png', 'user-192.png') {
  try { Put-File (Join-Path $Here "assets\account\$f") (Join-Path $pics $f) } catch { Note ("account picture {0}: {1}" -f $f, $_.Exception.Message) 'Yellow' }
}
$oem = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\OEMInformation'
Set-Reg $oem 'Manufacturer' 'OmniDx' 'String'
Set-Reg $oem 'Model' "OmniDx Edition $Version" 'String'
Set-Reg $oem 'SupportURL' 'https://omnidx.net' 'String'
Set-Reg $oem 'Logo' (Join-Path $Data 'oem.bmp') 'String'
Note 'Account picture and the OmniDx line in Settings > About' 'Green'

# Quiet: no Windows sounds for every little thing, no start-up sound.
$scheme = (Get-Item 'HKCU:\AppEvents\Schemes' -ErrorAction SilentlyContinue).GetValue('')
Remember @('sounds', 'scheme', "$scheme") 'sounds|scheme'
Set-Reg 'HKCU:\AppEvents\Schemes' '(default)' '.None' 'String'
foreach ($ev in Get-ChildItem 'HKCU:\AppEvents\Schemes\Apps' -ErrorAction SilentlyContinue | Get-ChildItem -ErrorAction SilentlyContinue) {
  $cur = Join-Path $ev.PSPath '.Current'
  if (Test-Path $cur) { Set-Item -Path $cur -Value '' -ErrorAction SilentlyContinue }
}
Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\LogonUI\BootAnimation' 'DisableStartupSound' 1
Note 'No system sounds' 'Green'

Head '3. The taskbar, Start and search'
$adv = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
Set-Reg $adv 'TaskbarAl' 0                   # the apps on the left, next to Start
Set-Reg $adv 'ShowTaskViewButton' 0
Set-Reg $adv 'TaskbarMn' 0
Set-Reg $adv 'ShowCopilotButton' 0
Set-Reg $adv 'Start_Layout' 1                # more pins, fewer recommendations
Set-Reg $adv 'Start_IrisRecommendations' 0
Set-Reg $adv 'Start_TrackDocs' 0
Set-Reg $adv 'Start_TrackProgs' 0
Set-Reg $adv 'Start_AccountNotifications' 0
Set-Reg $adv 'LaunchTo' 1                    # File Explorer opens on This PC
Set-Reg $adv 'HideFileExt' 0
Set-Reg $adv 'UseCompactMode' 1
Set-Reg $adv 'DisabledHotkeys' 'S' 'String'  # Windows + S goes to OmniDx Search
Set-Reg "$adv\TaskbarDeveloperSettings" 'TaskbarEndTask' 1
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'SearchboxTaskbarMode' 0
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 0
Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1
if ($win11) { Set-Reg 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32' '(default)' '' 'String' }

# The taskbar's pins, once: Search, the browser, File Explorer, the Hub, and Terminal where Windows has it.
$pins = @()
$pins += '<taskbar:DesktopApp DesktopApplicationLinkPath="%ALLUSERSPROFILE%\Microsoft\Windows\Start Menu\Programs\OmniDx\OmniDx Search.lnk"/>'
if ($hasBrowser) { $pins += '<taskbar:DesktopApp DesktopApplicationLinkPath="%ALLUSERSPROFILE%\Microsoft\Windows\Start Menu\Programs\OmniDx\OmniDx Browser.lnk"/>' }
$pins += '<taskbar:DesktopApp DesktopApplicationID="Microsoft.Windows.Explorer"/>'
$pins += '<taskbar:DesktopApp DesktopApplicationLinkPath="%ALLUSERSPROFILE%\Microsoft\Windows\Start Menu\Programs\OmniDx\OmniDx Hub.lnk"/>'
if (Get-AppxPackage -Name 'Microsoft.WindowsTerminal' -ErrorAction SilentlyContinue) { $pins += '<taskbar:UWA AppUserModelID="Microsoft.WindowsTerminal_8wekyb3d8bbwe!App"/>' }
$layout = Join-Path $Data 'taskbar.xml'
@"
<?xml version="1.0" encoding="utf-8"?>
<LayoutModificationTemplate xmlns="http://schemas.microsoft.com/Start/2014/LayoutModification" xmlns:defaultlayout="http://schemas.microsoft.com/Start/2014/FullDefaultLayout" xmlns:start="http://schemas.microsoft.com/Start/2014/StartLayout" xmlns:taskbar="http://schemas.microsoft.com/Start/2014/TaskbarLayout" Version="1">
  <CustomTaskbarLayoutCollection PinListPlacement="Replace">
    <defaultlayout:TaskbarLayout>
      <taskbar:TaskbarPinList>
        $($pins -join "`r`n        ")
      </taskbar:TaskbarPinList>
    </defaultlayout:TaskbarLayout>
  </CustomTaskbarLayoutCollection>
</LayoutModificationTemplate>
"@ | Set-Content -Path $layout -Encoding UTF8
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Explorer' 'StartLayoutFile' $layout 'ExpandString'
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Explorer' 'LockedStartLayout' 0
# Edge's desktop shortcut goes (Edge stays: Windows needs it, and it is one search away).
foreach ($d in (Join-Path $env:PUBLIC 'Desktop\Microsoft Edge.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Microsoft Edge.lnk')) {
  if (Test-Path $d) { Drop-File $d }
}
Note 'Taskbar on the left: OmniDx Search, Browser, File Explorer, Hub. Windows + S is OmniDx Search.' 'Green'

if ($hasBrowser) {
  Head '4. OmniDx Browser as a browser'
  $exe = Join-Path $Dest 'OmniBrowser.exe'
  $reg = 'HKLM:\SOFTWARE\Clients\StartMenuInternet\OmniDx Browser'
  New-Key $reg
  Set-Reg $reg '(default)' 'OmniDx Browser' 'String'
  Set-Reg "$reg\DefaultIcon" '(default)' "$exe,0" 'String'
  Set-Reg "$reg\shell\open\command" '(default)' "`"$exe`"" 'String'
  Set-Reg "$reg\Capabilities" 'ApplicationName' 'OmniDx Browser' 'String'
  Set-Reg "$reg\Capabilities" 'ApplicationDescription' 'The web, light: sleeping tabs, trackers blocked, nothing else running.' 'String'
  Set-Reg "$reg\Capabilities" 'ApplicationIcon' "$exe,0" 'String'
  foreach ($s in 'http', 'https') { Set-Reg "$reg\Capabilities\URLAssociations" $s 'OmniDxBrowserURL' 'String' }
  foreach ($x in '.htm', '.html', '.pdf', '.svg', '.webp') { Set-Reg "$reg\Capabilities\FileAssociations" $x 'OmniDxBrowserHTML' 'String' }
  Set-Reg "$reg\Capabilities\StartMenu" 'StartMenuInternet' 'OmniDx Browser' 'String'
  Set-Reg 'HKLM:\SOFTWARE\RegisteredApplications' 'OmniDx Browser' 'Software\Clients\StartMenuInternet\OmniDx Browser\Capabilities' 'String'
  foreach ($pid1 in 'OmniDxBrowserURL', 'OmniDxBrowserHTML') {
    $c = "HKLM:\SOFTWARE\Classes\$pid1"
    New-Key $c
    Set-Reg $c '(default)' 'OmniDx Browser document' 'String'
    if ($pid1 -eq 'OmniDxBrowserURL') { Set-Reg $c 'URL Protocol' '' 'String' }
    Set-Reg "$c\DefaultIcon" '(default)' "$exe,0" 'String'
    Set-Reg "$c\shell\open\command" '(default)' "`"$exe`" `"%1`"" 'String'
  }
  Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\OmniBrowser.exe' '(default)' $exe 'String'
  if (-not $KeepBrowser) {
    # Windows' own way for a PC's owner to set the default apps: a file it reads at sign-in.
    $assoc = Join-Path $Data 'default-apps.xml'
    @'
<?xml version="1.0" encoding="UTF-8"?>
<DefaultAssociations>
  <Association Identifier="http" ProgId="OmniDxBrowserURL" ApplicationName="OmniDx Browser" />
  <Association Identifier="https" ProgId="OmniDxBrowserURL" ApplicationName="OmniDx Browser" />
  <Association Identifier=".htm" ProgId="OmniDxBrowserHTML" ApplicationName="OmniDx Browser" />
  <Association Identifier=".html" ProgId="OmniDxBrowserHTML" ApplicationName="OmniDx Browser" />
</DefaultAssociations>
'@ | Set-Content -Path $assoc -Encoding UTF8
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'DefaultAssociationsConfiguration' $assoc 'String'
    Note 'OmniDx Browser is the default browser from the next sign-in (Settings > Default apps changes it back)' 'Green'
  } else { Note 'OmniDx Browser registered; the default browser left as it is' 'Green' }
}

Head '5. Running in the background, and the first sign-in'
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Set-Reg $run 'OmniDx Search' "`"$(Join-Path $Dest 'OmniSearch.exe')`" --background" 'String'
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' 'OmniDx Welcome' "`"$(Join-Path $Dest 'OmniHub.exe')`" --welcome" 'String'
# Free up memory: the standby list needs an administrator, so a task that runs as the system does it on request.
# Anyone signed in may start it; it does that one thing, with nothing passed in.
try {
  $svc = New-Object -ComObject Schedule.Service; $svc.Connect()
  $root = $svc.GetFolder('\')
  try { $folder = $root.GetFolder('OmniDx') } catch { $folder = $root.CreateFolder('OmniDx') }
  $def = $svc.NewTask(0)
  $def.RegistrationInfo.Description = 'OmniDx Edition: empties the standby list when OmniDx Search, Hub or Game Boost asks.'
  $def.Settings.ExecutionTimeLimit = 'PT2M'; $def.Settings.AllowDemandStart = $true; $def.Settings.DisallowStartIfOnBatteries = $false; $def.Settings.StopIfGoingOnBatteries = $false
  $act = $def.Actions.Create(0); $act.Path = Join-Path $Dest 'OmniHub.exe'; $act.Arguments = '--purge'
  $def.Principal.UserId = 'S-1-5-18'; $def.Principal.LogonType = 5; $def.Principal.RunLevel = 1
  [void]$folder.RegisterTaskDefinition('Edition Free Memory', $def, 6, 'SYSTEM', $null, 5, 'D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;AU)')
  Remember @('task', 'Edition Free Memory') 'task|Edition Free Memory'
  Note 'The Free up memory task' 'Green'
} catch { Note ("Free up memory task: {0}" -f $_.Exception.Message) 'Yellow' }

Head "6. The $Preset preset"
if ($built) {
  $p = Start-Process (Join-Path $Dest 'OmniHub.exe') -ArgumentList '--apply', $Preset -Wait -PassThru
  Note ("{0} preset: {1}" -f $Preset, $(if ($p.ExitCode -eq 0) { 'applied' } else { "exit $($p.ExitCode)" })) $(if ($p.ExitCode -eq 0) { 'Green' } else { 'Yellow' })
}
@{ version = $Version; installed = (Get-Date -Format s); preset = $Preset; browser = [bool]$hasBrowser } | ConvertTo-Json | Set-Content (Join-Path $Data 'edition.json')
try { [EdNative]::Broadcast() } catch { }
if ($built) { Start-Process (Join-Path $Dest 'OmniSearch.exe') -ArgumentList '--background' }

# ---------------------------------------------------------------- the tune, last: it restarts the PC itself
if (-not $Key) {
  foreach ($d in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
    $kf = Join-Path $d.Root 'omnidx\key.txt'
    if (Test-Path $kf) { $Key = (Get-Content $kf -Raw).Trim(); Note "Key found on $($d.Root)"; break }
  }
}
if ($Key -and -not $NoTune) {
  Head ('7. The OmniDx tune' + $(if ($NoExtreme) { '' } else { ' (Extreme)' }))
  Note 'The tune reads the PC, makes a restore point, cuts what is not used and restarts the PC when it is done.'
  $base = 'https://omnidx.net'
  if ("$env:OMNIDX_BASE" -match '^http://(127\.0\.0\.1|localhost)(:\d+)?$') { $base = "$env:OMNIDX_BASE" }
  $env:OMNIDX_KEY = $Key
  $env:OMNIDX_MODE = 'console'
  $env:OMNIDX_FLAGS = $(if ($NoExtreme) { '-Yes' } else { '-Extreme -Yes' })
  try { Invoke-Expression ((New-Object System.Net.WebClient).DownloadString("$base/go.ps1")) }
  catch { Note ("The tune stopped: {0}" -f $_.Exception.Message) 'Yellow' }
  $env:OMNIDX_KEY = ''
}
elseif (-not $NoTune) { Note 'No key given: the tune is one click in OmniDx Hub > Tune when you want it.' }

Note 'OmniDx Edition is set up.' 'Green'
if (-not $NoRestart) {
  Note 'Restarting in 15 seconds so Windows loads the new taskbar, search key and sign-in picture.'
  & shutdown.exe /r /t 15 /c 'OmniDx Edition is set up. Restarting in 15 seconds.'
}
