<#
  OmniDx Tune - the Cut.

  One run, on one PC. It reads the machine, makes a restore point and an undo
  script, then cuts the process count and tunes the system for competitive
  play: every startup app off, the services nobody uses set to start only when
  asked, the preinstalled apps nobody opens removed, telemetry and background
  activity off, an "OmniDx" power plan built for performance, the network
  stack set for low latency, Discord / Spotify / the browsers told to behave,
  a profile per game, and a BIOS checklist written for the exact board it
  found.

  It is deliberately careful:
    - nothing runs until a restore point exists (or you said not to make one)
    - every registry value and every service start type it changes is recorded
      first, and undo.ps1 puts them all back in reverse order
    - security is never lowered: Defender, Windows Update, Secure Boot, the
      CPU mitigations and BitLocker are not touched. The one exception, memory
      integrity (VBS/HVCI), is off only when you pass -Aggressive and only
      after it has told you what that means
    - what it keeps is decided by what it found: a laptop keeps its battery,
      touch and hibernation; a paired Bluetooth headset keeps Bluetooth; a real
      printer keeps the spooler; Windows Hello keeps biometrics; Wi-Fi keeps
      the Wi-Fi service; a VPN keeps its adapter's services
    - it measures. The report says how many processes there were, how many
      there are, and what is still running - never a number it did not count

  Run it through the one-liner on omnidx.net, which handles the key and the
  elevation:   irm omnidx.net/go.ps1 | iex

  Or by hand, in an administrator PowerShell:
    & ([scriptblock]::Create((irm https://omnidx.net/tune/omnidx.ps1))) -Key TUNE-XXXX-XXXX-XXXX-XXXX

  Windows 10 (1903+) and Windows 11. PowerShell 5.1, which every one of them has.
#>
[CmdletBinding()]
param(
  # The key from the page after you paid. Locks to this PC on first run.
  [string]$Key = $env:OMNIDX_KEY,
  # The licence server. Empty means the key is checked and bound on this PC only.
  [string]$Api = $env:OMNIDX_API,
  # Also switch memory integrity (VBS / HVCI) off. More frames, less security. Asked about first.
  [switch]$Aggressive,
  # Remove the Xbox apps and set their services to manual. Off by default: Game Pass and Minecraft need them.
  [switch]$CutXbox,
  # Startup entries to leave enabled, by the name Task Manager shows (e.g. -Keep 'Wallpaper Engine','RTSS').
  [string[]]$Keep = @(),
  # Point DNS at Cloudflare (1.1.1.1). Off by default; your router's DNS is usually fine.
  [switch]$Dns,
  # Skip the restore point. Only sensible if System Restore is broken on this machine.
  [switch]$NoRestorePoint,
  # Put everything back from the last run and stop.
  [switch]$Undo,
  # Read the machine and count the processes. Change nothing.
  [switch]$Report,
  # Do not leave the one-shot task that writes the after-restart process count.
  [switch]$NoAfterCount,
  # Answer every question yes.
  [switch]$Yes
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$script:Version = '1.1.0'
$script:Root = 'C:\OmniDx'
$script:Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$script:Changes = New-Object System.Collections.ArrayList
$script:Log = New-Object System.Collections.ArrayList
$script:Warnings = New-Object System.Collections.ArrayList
$script:Kept = New-Object System.Collections.ArrayList
$script:GamesFound = New-Object System.Collections.ArrayList
$script:Timer = [System.Diagnostics.Stopwatch]::StartNew()
# The signed-in person's hive and folders. Normally the same as the account
# running this; when a standard user gave an administrator's password at the
# UAC prompt, HKCU would be the administrator's hive and every per-user tweak
# would land on the wrong account. Resolve-User (in Main) fixes these up.
$script:HKCU = 'HKCU:'
$script:AppData = $env:APPDATA
$script:LocalAppData = $env:LOCALAPPDATA
$script:UserProfile = $env:USERPROFILE
$script:UserName = $env:USERNAME

# ---------------------------------------------------------------------------
# saying things
# ---------------------------------------------------------------------------
function Say([string]$t, [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c; [void]$script:Log.Add($t) }
function Head([string]$t) { Write-Host ''; Write-Host ("== " + $t) -ForegroundColor Magenta; [void]$script:Log.Add(""); [void]$script:Log.Add("== $t") }
function Did([string]$t) { Write-Host ("  + " + $t) -ForegroundColor DarkGray; [void]$script:Log.Add("  + $t") }
function Warn([string]$t) { Write-Host ("  ! " + $t) -ForegroundColor Yellow; [void]$script:Log.Add("  ! $t"); [void]$script:Warnings.Add($t) }
function Keep([string]$what, [string]$why) { [void]$script:Kept.Add(("{0}: {1}" -f $what, $why)) }
function Ask([string]$q) {
  if ($Yes) { return $true }
  $a = Read-Host ("  " + $q + " [Y/n]")
  return ($a -eq '' -or $a -match '^[Yy]')
}

# ---------------------------------------------------------------------------
# the key
# ---------------------------------------------------------------------------
$script:Alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
$script:KeySalt = 'omnidx-tune-2026'

function Get-Fnv1a([string]$s) {
  [uint64]$h = 2166136261
  foreach ($ch in $s.ToCharArray()) {
    $h = $h -bxor [uint64][int]$ch
    $h = ($h * 16777619) -band 0xFFFFFFFF
  }
  return [uint64]$h
}

function Get-KeyChecksum([string]$tag, [string]$payload) {
  [uint64]$h = Get-Fnv1a ("{0}:{1}:{2}" -f $script:KeySalt, $tag, $payload)
  $out = ''
  for ($i = 0; $i -lt 4; $i++) {
    $out += $script:Alphabet[[int]($h % 32)]
    $h = [uint64][math]::Floor($h / 32) + ($h % 7)
  }
  return $out
}

<# TUNE-XXXX-XXXX-XXXX-CCCC is one PC; SQUAD-XXXX-XXXX-XXXX-CCCC is five. The
   last block is a checksum, so a mistyped key is caught here rather than on
   the server. The server is what makes a key real. #>
function Read-Key([string]$raw) {
  $c = ($raw -replace '[^A-Za-z0-9]', '').ToUpperInvariant()
  if ($c -match '^(TUNE|SQUAD)([A-Z0-9]{12})([A-Z0-9]{4})$') {
    $tag = $Matches[1]; $payload = $Matches[2]; $sum = $Matches[3]
    foreach ($ch in $payload.ToCharArray()) { if ($script:Alphabet.IndexOf($ch) -lt 0) { return $null } }
    if ((Get-KeyChecksum $tag $payload) -ne $sum) { return $null }
    $seats = if ($tag -eq 'SQUAD') { 5 } else { 1 }
    $pretty = "{0}-{1}-{2}-{3}-{4}" -f $tag, $payload.Substring(0, 4), $payload.Substring(4, 4), $payload.Substring(8, 4), $sum
    return @{ tag = $tag; payload = $payload; key = $pretty; seats = $seats }
  }
  return $null
}

<# What makes this PC this PC: the board's UUID, its serial and the CPU id.
   Not the Windows install id, so a reinstall on the same machine still
   matches; not the disk, so a new SSD does not lose the key. #>
function Get-Hwid {
  $csp = Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue
  $bb = Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue
  $cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
  $raw = "{0}|{1}|{2}" -f $csp.UUID, $bb.SerialNumber, $cpu.ProcessorId
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($raw))
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
}

function Test-Licence($parsed, [string]$hwid, $machine) {
  $regPath = 'HKLM:\SOFTWARE\OmniDx\Tune'
  if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
  $local = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue

  if ($Api) {
    try {
      $body = @{ key = $parsed.key; hwid = $hwid; machine = $machine } | ConvertTo-Json -Compress
      $r = Invoke-RestMethod -Method Post -Uri ("{0}/v1/tune/claim" -f $Api.TrimEnd('/')) -ContentType 'application/json' -Body $body -TimeoutSec 20
      if (-not $r.ok) { throw "refused" }
      Set-ItemProperty -Path $regPath -Name Key -Value $parsed.key
      Set-ItemProperty -Path $regPath -Name Hwid -Value $hwid
      Set-ItemProperty -Path $regPath -Name Bound -Value (Get-Date -Format s)
      Say ("  Key accepted. PC {0} of {1} on this key." -f $r.used, $r.seats) 'Green'
      return $true
    } catch {
      $msg = $_.Exception.Message
      $resp = $_.ErrorDetails.Message
      if ($resp) { try { $msg = (ConvertFrom-Json $resp).error } catch { } }
      # A key already bound here keeps working with the server unreachable.
      if ($local.Key -eq $parsed.key -and $local.Hwid -eq $hwid -and $msg -notmatch 'another|revoked|refunded|not issued|not valid') {
        Warn "Could not reach the licence server ($msg). This PC is already on this key, so carrying on."
        return $true
      }
      Say ("  " + $msg) 'Red'
      return $false
    }
  }

  # No server: the key is checked by its checksum and locked to this PC here.
  if ($local.Key -and $local.Hwid -and $local.Key -ne $parsed.key) {
    Say "  A different key is already bound to this PC. One key per PC." 'Red'
    return $false
  }
  Set-ItemProperty -Path $regPath -Name Key -Value $parsed.key
  Set-ItemProperty -Path $regPath -Name Hwid -Value $hwid
  Set-ItemProperty -Path $regPath -Name Bound -Value (Get-Date -Format s)
  Say "  Key accepted and locked to this PC." 'Green'
  return $true
}

# ---------------------------------------------------------------------------
# recording every change, so undo.ps1 can put it back
# ---------------------------------------------------------------------------
function Record($entry) { [void]$script:Changes.Add($entry) }

function Resolve-Hive([string]$p) {
  if ($p -like 'HKCU:*' -and $script:HKCU -ne 'HKCU:') { return $script:HKCU + $p.Substring(5) }
  return $p
}

function Set-Reg([string]$path, [string]$name, $value, [string]$kind = 'DWord') {
  $path = Resolve-Hive $path
  $existed = Test-Path $path
  if (-not $existed) { New-Item -Path $path -Force | Out-Null }
  $prev = $null; $had = $false
  try {
    $item = Get-ItemProperty -Path $path -Name $name -ErrorAction Stop
    $prev = $item.$name; $had = $true
  } catch { }
  if ($had -and ($prev -is [byte[]]) -and ($value -is [byte[]])) {
    if ([System.Linq.Enumerable]::SequenceEqual([byte[]]$prev, [byte[]]$value)) { return }
  } elseif ($had -and "$prev" -eq "$value") { return }
  try {
    New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $kind -Force -ErrorAction Stop | Out-Null
    Record @{ type = 'reg'; path = $path; name = $name; had = $had; prev = $prev; kind = $kind; keyExisted = $existed }
  } catch {
    Warn ("Could not set {0}\{1}: {2}" -f $path, $name, $_.Exception.Message)
  }
}

function Remove-Reg([string]$path, [string]$name) {
  $path = Resolve-Hive $path
  try {
    $item = Get-ItemProperty -Path $path -Name $name -ErrorAction Stop
    $prev = $item.$name
    $kind = (Get-Item $path).GetValueKind($name).ToString()
    if ($kind -eq 'ExpandString') { $kind = 'ExpandString' }
    Remove-ItemProperty -Path $path -Name $name -Force -ErrorAction Stop
    Record @{ type = 'reg'; path = $path; name = $name; had = $true; prev = $prev; kind = $kind; keyExisted = $true; removed = $true }
  } catch { }
}

function Set-ServiceStart([string]$name, [string]$start, [string]$why = '') {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $svc) { return }
  $prev = (Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue).StartMode
  if (-not $prev) { $prev = $svc.StartType.ToString() }
  $want = switch ($start) { 'Disabled' { 'Disabled' } 'Manual' { 'Manual' } default { 'Automatic' } }
  if ($prev -eq 'Auto') { $prev = 'Automatic' }
  if ($prev -eq $want) { return }
  $scStart = switch ($want) { 'Disabled' { 'disabled' } 'Manual' { 'demand' } default { 'auto' } }
  $out = & sc.exe config $name start= $scStart 2>&1
  if ($LASTEXITCODE -ne 0) {
    try { Set-Service -Name $name -StartupType $want -ErrorAction Stop } catch { Warn ("Service {0} would not change ({1})" -f $name, $_.Exception.Message); return }
  }
  if ($want -ne 'Automatic' -and $svc.Status -eq 'Running') {
    try { Stop-Service -Name $name -Force -ErrorAction Stop -WarningAction SilentlyContinue } catch { }
  }
  Record @{ type = 'service'; name = $name; prev = $prev; now = $want }
  Did ("{0} -> {1}{2}" -f $name, $want.ToLower(), $(if ($why) { "  ($why)" } else { '' }))
}

function Save-Changes {
  $dir = Join-Path $script:Root 'undo'
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $file = Join-Path $dir ("changes-{0}.json" -f $script:Stamp)
  $script:Changes | ConvertTo-Json -Depth 6 | Set-Content -Path $file -Encoding UTF8
  Copy-Item $file (Join-Path $dir 'changes-latest.json') -Force
  return $file
}

# ---------------------------------------------------------------------------
# undo
# ---------------------------------------------------------------------------
$script:UndoScript = @'
<#  OmniDx Tune - undo.
    Puts back every registry value and service start type the tune changed, in
    reverse order, from changes-latest.json next to this file. Restores the
    power plan that was active before and removes the OmniDx plan. Re-enables
    hibernation if it was on. Store apps that were removed are listed at the
    end with where to get them back.
    Run in an administrator PowerShell:  powershell -ExecutionPolicy Bypass -File undo.ps1
#>
param([string]$File = (Join-Path $PSScriptRoot 'changes-latest.json'))
$ErrorActionPreference = 'Continue'
if (-not (Test-Path $File)) { Write-Host "No changes file at $File" -ForegroundColor Red; exit 1 }
$changes = @(Get-Content $File -Raw | ConvertFrom-Json)
[array]::Reverse($changes)
$removedApps = @()
$done = 0; $failed = 0
Write-Host ("Putting back {0} changes from {1}" -f $changes.Count, $File)
foreach ($c in $changes) {
  try {
    switch ($c.type) {
      'reg' {
        if ($c.removed) {
          New-ItemProperty -Path $c.path -Name $c.name -Value $c.prev -PropertyType $c.kind -Force | Out-Null
        } elseif ($c.had) {
          $v = $c.prev
          if ($c.kind -eq 'Binary' -and $v) { $v = [byte[]]($v | ForEach-Object { [byte]$_ }) }
          New-ItemProperty -Path $c.path -Name $c.name -Value $v -PropertyType $c.kind -Force | Out-Null
        } else {
          Remove-ItemProperty -Path $c.path -Name $c.name -Force -ErrorAction SilentlyContinue
          if (-not $c.keyExisted) {
            $left = Get-Item $c.path -ErrorAction SilentlyContinue
            if ($left -and $left.ValueCount -eq 0 -and $left.SubKeyCount -eq 0) { Remove-Item $c.path -Force -ErrorAction SilentlyContinue }
          }
        }
        Write-Host ("restored {0}\{1}" -f $c.path, $c.name) -ForegroundColor DarkGray
      }
      'service' {
        $s = switch ($c.prev) { 'Disabled' { 'disabled' } 'Manual' { 'demand' } 'Automatic' { 'auto' } 'Boot' { 'boot' } 'System' { 'system' } default { 'auto' } }
        & sc.exe config $c.name start= $s | Out-Null
        Write-Host ("service {0} -> {1}" -f $c.name, $c.prev) -ForegroundColor DarkGray
      }
      'power' {
        if ($c.prev) { & powercfg /setactive $c.prev | Out-Null }
        if ($c.created) { & powercfg /delete $c.created | Out-Null }
        Write-Host "power plan restored" -ForegroundColor DarkGray
      }
      'hibernate' { if ($c.prev -eq 'on') { & powercfg /h on | Out-Null; Write-Host "hibernation on" -ForegroundColor DarkGray } }
      'netsh' { foreach ($cmd in $c.restore) { & cmd.exe /c $cmd | Out-Null }; Write-Host "tcp settings restored" -ForegroundColor DarkGray }
      'nic' {
        try { Set-NetAdapterAdvancedProperty -Name $c.adapter -DisplayName $c.property -DisplayValue $c.prev -NoRestart -ErrorAction Stop } catch { }
        Write-Host ("{0}: {1} -> {2}" -f $c.adapter, $c.property, $c.prev) -ForegroundColor DarkGray
      }
      'nicpower' { try { Enable-NetAdapterPowerManagement -Name $c.adapter -ErrorAction Stop } catch { } }
      'dns' { try { Set-DnsClientServerAddress -InterfaceIndex $c.index -ResetServerAddresses -ErrorAction Stop } catch { } }
      'task' { try { Enable-ScheduledTask -TaskPath $c.path -TaskName $c.name -ErrorAction Stop | Out-Null } catch { } }
      'file' { if (Test-Path $c.backup) { Copy-Item $c.backup $c.path -Force; Write-Host ("file restored {0}" -f $c.path) -ForegroundColor DarkGray } }
      'appx' { $removedApps += $c.name }
      'fsutil' { & fsutil behavior set disablelastaccess $c.prev | Out-Null }
      'mmagent' { try { Enable-MMAgent -ApplicationPreLaunch -ErrorAction Stop } catch { } }
      'task-created' { try { Unregister-ScheduledTask -TaskName $c.name -Confirm:$false -ErrorAction Stop } catch { } }
    }
    $done++
  } catch { Write-Host ("could not undo {0}: {1}" -f ($c | ConvertTo-Json -Compress), $_.Exception.Message) -ForegroundColor Yellow; $failed++ }
}
if ($removedApps.Count) {
  Write-Host ""
  Write-Host "These Store apps were removed. Reinstall any you want from the Microsoft Store (search the name):" -ForegroundColor Yellow
  $removedApps | Sort-Object -Unique | ForEach-Object { Write-Host ("  " + $_) }
}
Write-Host ""
Write-Host ("Done: {0} put back{1}. Restart to finish." -f $done, $(if ($failed) { ", $failed could not be" } else { '' })) -ForegroundColor Green
'@

# ---------------------------------------------------------------------------
# the machine
# ---------------------------------------------------------------------------
function Get-Machine {
  $os = Get-CimInstance Win32_OperatingSystem
  $cs = Get-CimInstance Win32_ComputerSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $bb = Get-CimInstance Win32_BaseBoard
  $bios = Get-CimInstance Win32_BIOS
  $gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -and $_.Name -notmatch 'Basic Display|Remote|Virtual' })
  $gpu = $gpus | Sort-Object { if ($_.Name -match 'NVIDIA|Radeon RX|Radeon Pro|Arc') { 0 } else { 1 } } | Select-Object -First 1
  $vendor = if ($gpu.Name -match 'NVIDIA|GeForce|RTX|GTX') { 'NVIDIA' } elseif ($gpu.Name -match 'AMD|Radeon') { 'AMD' } elseif ($gpu.Name -match 'Intel|Arc') { 'Intel' } else { 'Unknown' }
  $battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
  $laptop = ($battery -ne $null) -or ($cs.PCSystemType -eq 2) -or ($cs.PCSystemTypeEx -eq 2)
  $disks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue)
  $allSsd = $disks.Count -gt 0 -and -not ($disks | Where-Object { $_.MediaType -eq 'HDD' })
  $nvme = ($disks | Where-Object { $_.BusType -eq 'NVMe' }).Count -gt 0
  $ramGb = [math]::Round($cs.TotalPhysicalMemory / 1GB)
  $build = [int]$os.BuildNumber
  $win = if ($build -ge 22000) { 11 } else { 10 }
  $refresh = ($gpus | ForEach-Object { $_.CurrentRefreshRate } | Where-Object { $_ -gt 0 } | Measure-Object -Maximum).Maximum
  $printers = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'Microsoft|OneNote|Fax|XPS|PDF' })
  $bt = @(Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -notmatch 'Adapter|Enumerator|Radio|Microsoft|Generic|RFCOMM|LE Generic|Service' })
  $btRadio = @(Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue).Count -gt 0
  $wifi = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.PhysicalMediaType -match '802.11|Native' -or $_.Name -match 'Wi-?Fi|Wireless' }).Count -gt 0
  $touch = @(Get-PnpDevice -Class HIDClass -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'touch screen|touchscreen' }).Count -gt 0
  $bio = @(Get-PnpDevice -Class Biometric -Status OK -ErrorAction SilentlyContinue).Count -gt 0
  $vpn = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'TAP|Wintun|WireGuard|VPN|NordLynx|Proton|Mullvad|Cloudflare WARP' }).Count -gt 0
  $xboxUsed = (Get-AppxPackage -Name Microsoft.GamingApp -ErrorAction SilentlyContinue) -ne $null -or (Test-Path (Join-Path $script:AppData '.minecraft')) -or (Get-AppxPackage -Name Microsoft.MinecraftUWP -ErrorAction SilentlyContinue) -ne $null
  $xboxPad = @(Get-PnpDevice -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Xbox' -and $_.Class -match 'HIDClass|XboxComposite|XnaComposite|USB|Bluetooth' }).Count -gt 0
  $live = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' })
  $wifiLive = @($live | Where-Object { $_.PhysicalMediaType -match '802.11|Native' -or $_.Name -match 'Wi-?Fi|Wireless' }).Count -gt 0
  $vm = ($cs.Model -match 'Virtual|VMware|VirtualBox|KVM|QEMU|HVM') -or ($cs.Manufacturer -match 'QEMU|Xen|innotek|VMware')
  $domain = [bool]$cs.PartOfDomain
  $driverVer = $gpu.DriverVersion
  $driverDate = $null; try { if ($gpu.DriverDate) { $driverDate = [datetime]$gpu.DriverDate } } catch { }
  $mem = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue)
  $sticks = $mem.Count
  $ramRated = ($mem | ForEach-Object { $_.Speed } | Where-Object { $_ } | Measure-Object -Maximum).Maximum
  $ramNow = ($mem | ForEach-Object { $_.ConfiguredClockSpeed } | Where-Object { $_ } | Measure-Object -Maximum).Maximum
  $ramSlow = [bool]($ramRated -and $ramNow -and ($ramNow -lt ($ramRated - 100)))
  $pf = @(Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue)
  $noPageFile = ($pf.Count -eq 0) -and (-not $cs.AutomaticManagedPagefile)
  $onBattery = $false; if ($battery) { $onBattery = (($battery | Select-Object -First 1).BatteryStatus -eq 1) }
  $sysHdd = $false
  try {
    $dn = (Get-Partition -DriveLetter ($env:SystemDrive.Substring(0, 1)) -ErrorAction Stop | Get-Disk -ErrorAction Stop).Number
    $pd = $disks | Where-Object { [int]$_.DeviceId -eq [int]$dn } | Select-Object -First 1
    if ($pd -and $pd.MediaType -eq 'HDD') { $sysHdd = $true }
  } catch { }
  $maxRefresh = 0; try { $maxRefresh = (Get-CimInstance CIM_VideoControllerResolution -ErrorAction Stop | ForEach-Object { $_.RefreshRate } | Where-Object { $_ } | Measure-Object -Maximum).Maximum } catch { }
  $otherAv = @(); try { $otherAv = @(Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop | ForEach-Object { $_.displayName } | Where-Object { $_ -and $_ -notmatch 'Defender' } | Sort-Object -Unique) } catch { }
  $installed = @()
  foreach ($uk in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') { $installed += @(Get-ItemProperty $uk -ErrorAction SilentlyContinue | ForEach-Object { $_.DisplayName } | Where-Object { $_ }) }
  $optimizers = @($installed | Where-Object { $_ -match 'Advanced SystemCare|Razer Cortex|CCleaner|Driver Booster|Wise Care|Glary|PC Optimizer|Smart Game Booster|Outbyte|Restoro|Reimage|Booster' } | Sort-Object -Unique)
  $oem = @($installed | Where-Object { $_ -match 'SupportAssist|HP Support Assistant|HP Analytics|HP Wolf|Lenovo Vantage|Lenovo System Update|Armoury Crate|MyASUS|Dragon Center|MSI Center|Acer Care|Predator Sense|Alienware Command|Omen Gaming Hub|Aura Sync|LiveDash|McAfee|Norton' } | Sort-Object -Unique)
  $uefi = $env:firmware_type -eq 'UEFI'
  $secureBoot = $false; try { $secureBoot = Confirm-SecureBootUEFI -ErrorAction Stop } catch { }
  $tpm = $false; try { $tpm = (Get-Tpm -ErrorAction Stop).TpmPresent } catch { }
  $vbsOn = $false; try { $dg = Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction Stop; $vbsOn = ($dg.VirtualizationBasedSecurityStatus -eq 2) -or ($dg.SecurityServicesRunning -contains 2) } catch { }
  @{
    os = "$($os.Caption) $($os.Version) (build $build)"; win = $win; build = $build
    cpu = $cpu.Name.Trim(); cpuVendor = $(if ($cpu.Manufacturer -match 'AMD') { 'AMD' } else { 'Intel' }); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors
    gpu = $gpu.Name; gpuVendor = $vendor; ramGb = $ramGb
    board = ("{0} {1}" -f $bb.Manufacturer, $bb.Product).Trim(); boardVendor = $bb.Manufacturer; bios = ("{0} {1}" -f $bios.Manufacturer, $bios.SMBIOSBIOSVersion).Trim(); biosDate = $bios.ReleaseDate
    laptop = $laptop; allSsd = $allSsd; nvme = $nvme; refresh = $refresh
    printers = $printers.Count; btDevices = $bt.Count; btRadio = $btRadio; wifi = $wifi; touch = $touch; biometric = $bio; vpn = $vpn; xboxUsed = $xboxUsed
    uefi = $uefi; secureBoot = $secureBoot; tpm = $tpm; vbs = $vbsOn
    name = $cs.Name
    xboxPad = $xboxPad; wifiLive = $wifiLive; vm = $vm; domain = $domain
    driverVer = $driverVer; driverDate = $driverDate
    sticks = $sticks; ramRated = $ramRated; ramNow = $ramNow; ramSlow = $ramSlow
    noPageFile = $noPageFile; onBattery = $onBattery; sysHdd = $sysHdd; maxRefresh = $maxRefresh
    otherAv = $otherAv; optimizers = $optimizers; oem = $oem
  }
}

function Show-Machine($m) {
  Say ("  {0}" -f $m.os)
  Say ("  CPU   {0}  ({1} cores / {2} threads)" -f $m.cpu, $m.cores, $m.threads)
  Say ("  GPU   {0}" -f $m.gpu)
  if ($m.driverVer) { Say ("  Driver {0}{1}" -f $m.driverVer, $(if ($m.driverDate) { " ({0})" -f $m.driverDate.ToString('MMM yyyy') } else { '' })) }
  Say ("  RAM   {0} GB{1}{2}" -f $m.ramGb, $(if ($m.sticks) { ", $($m.sticks) stick$(if ($m.sticks -ne 1) { 's' })" } else { '' }), $(if ($m.ramNow) { ", $($m.ramNow) MT/s$(if ($m.ramRated -and $m.ramRated -ne $m.ramNow) { " of $($m.ramRated) rated" })" } else { '' }))
  Say ("  Board {0}  |  BIOS {1}" -f $m.board, $m.bios)
  Say ("  {0}{1}{2}, {3}" -f $(if ($m.laptop) { 'Laptop' } else { 'Desktop' }), $(if ($m.allSsd) { ', all SSD' } else { ', has a hard disk' }), $(if ($m.nvme) { ', NVMe' } else { '' }), $(if ($m.refresh) { "$($m.refresh) Hz" } else { 'refresh unknown' }))
  Say ("  Keeps: {0}" -f (@(
    $(if ($m.printers) { "printer" }), $(if ($m.btDevices) { "Bluetooth ($($m.btDevices) paired)" }), $(if ($m.wifi) { "Wi-Fi" }),
    $(if ($m.touch) { "touch" }), $(if ($m.biometric) { "Windows Hello" }), $(if ($m.vpn) { "VPN" }), $(if ($m.xboxUsed -and -not $CutXbox) { "Xbox / Game Pass" }), $(if ($m.xboxPad -and -not $CutXbox) { "Xbox controller" }), $(if ($m.laptop) { "battery, hibernate" })
  ) | Where-Object { $_ }) -join ', ')
  Say ("  UEFI {0}, Secure Boot {1}, TPM {2}, memory integrity {3}" -f $m.uefi, $m.secureBoot, $m.tpm, $(if ($m.vbs) { 'on' } else { 'off' }))
}

<# Things worth more than any tweak, said once, up front. Nothing here changes
   anything; it is the advice a friend who builds PCs would give after one
   look at yours. #>
function Show-Advice($m) {
  if ($m.ramSlow) { Warn ("RAM is running at {0} MT/s but is rated for {1}: the memory profile (XMP / EXPO) is off in the BIOS. That is item 1 on your checklist and the biggest free gain on this PC." -f $m.ramNow, $m.ramRated) }
  if ($m.sticks -eq 1) { Warn "One stick of RAM: single channel. A matching second stick is the biggest upgrade this PC can get." }
  if ($m.maxRefresh -and $m.refresh -and $m.refresh -ge 24 -and ($m.maxRefresh -gt ($m.refresh + 1))) { Warn ("Your display can do {0} Hz but Windows is set to {1} Hz. Settings > System > Display > Advanced display." -f $m.maxRefresh, $m.refresh) }
  if ($m.driverDate -and ($m.driverDate -lt (Get-Date).AddMonths(-12))) { Warn ("The GPU driver dates from {0}. A current driver is worth more than most tweaks." -f $m.driverDate.ToString('MMM yyyy')) }
  if ($m.noPageFile) { Warn "No page file. Some games crash without one: System > Advanced > Performance > Virtual memory > System managed." }
  if ($m.sysHdd) { Warn "Windows is on a hard disk. An SSD is the biggest upgrade this PC can get; no tweak comes close." }
  if ($m.ramGb -lt 16) { Warn ("{0} GB of RAM. 16 GB is the floor for current games; the tune helps, but it cannot make memory." -f $m.ramGb) }
  if ($m.win -eq 10 -and $m.build -lt 19045) { Warn "Windows 10 is not on 22H2. Update it: the last builds fixed things no tweak can." }
  if ($m.onBattery) { Warn "Running on battery. Plug in: the restore point and the cut are best done on mains, and the plan is tuned for mains." }
  if ($m.optimizers.Count) { Warn ("Another optimizer is installed ({0}). Two of these fighting over the same settings is worse than one; consider removing it." -f ($m.optimizers -join ', ')) }
  if ($m.oem.Count) { Say ("  OEM extras found: {0}. Not touched; remove any you do not use from Settings > Apps." -f ($m.oem -join ', ')) }
  if ($m.otherAv.Count) { Say ("  Antivirus: {0}. Not touched." -f ($m.otherAv -join ', ')) }
  if ($m.vm) { Warn "This looks like a virtual machine. The tune will run, but the numbers mean little here." }
}

<# An estimate of what this PC needs after the tune and a restart: what
   Windows itself runs on this build, plus the services and driver helpers
   this hardware keeps. Printed as "about", because it is one. #>
function Get-SafeBar($m) {
  $t = 62
  if ($m.win -eq 11) { $t += 6 }
  switch ($m.gpuVendor) { 'NVIDIA' { $t += 6 } 'AMD' { $t += 4 } 'Intel' { $t += 2 } }
  if ($m.laptop) { $t += 8 }
  if ($m.printers) { $t += 2 }
  if ($m.btRadio) { $t += 3 }
  if ($m.wifi) { $t += 2 }
  if ($m.biometric) { $t += 2 }
  if ($m.vpn) { $t += 4 }
  if ($m.vbs) { $t += 2 }
  if ($m.xboxUsed -and -not $CutXbox) { $t += 5 }
  if ($m.otherAv.Count) { $t += 6 }
  return $t
}

<# Which services this PC keeps, and why. Built from what Get-Machine found,
   used by the cut and by the free report, so the two never disagree. #>
function Get-KeepList($m) {
  $k = @{}
  if ($m.printers) { $k['Spooler'] = 'a printer is installed' }
  if ($m.btDevices -or $m.btRadio) { foreach ($n in 'bthserv', 'BTAGService', 'BthAvctpSvc') { $k[$n] = 'Bluetooth is in use' } }
  if ($m.wifi) { $k['WlanSvc'] = $(if ($m.wifiLive) { 'Wi-Fi is your connection' } else { 'a Wi-Fi adapter is present' }); $k['RmSvc'] = 'a Wi-Fi adapter is present' }
  if ($m.touch -or $m.laptop) { $k['TabletInputService'] = $(if ($m.touch) { 'touch screen' } else { 'laptop' }) }
  if ($m.biometric) { $k['WbioSrvc'] = 'a Windows Hello reader is present' }
  if ($m.laptop) { foreach ($n in 'SensorService', 'SensrSvc', 'SensorDataService', 'WwanSvc') { $k[$n] = 'laptop' } }
  if ($m.vpn) { foreach ($n in 'iphlpsvc', 'SSDPSRV', 'upnphost') { $k[$n] = 'a VPN adapter is present' } }
  if (-not $m.allSsd) { $k['SysMain'] = 'a hard disk benefits from prefetch' }
  if ($m.xboxUsed -and -not $CutXbox) { foreach ($n in 'XblAuthManager', 'XblGameSave', 'XboxNetApiSvc', 'XboxGipSvc') { $k[$n] = 'Game Pass, the Xbox app or Minecraft is installed' } }
  if ($m.xboxPad -and -not $CutXbox) { $k['XboxGipSvc'] = 'an Xbox controller is connected' }
  $k['Themes'] = 'Windows 10 falls back to the classic look without it'
  return $k
}

function Test-PendingReboot {
  if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { return $true }
  if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { return $true }
  return $false
}

<# When a standard account gave an administrator's password at the UAC prompt,
   HKCU and %APPDATA% belong to the administrator, not to the person at the
   keyboard. Point every per-user change at the signed-in account instead. #>
function Resolve-User {
  try {
    $console = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).UserName
    if (-not $console) { return }
    $me = "$env:USERDOMAIN\$env:USERNAME"
    if ($console -ieq $me) { return }
    $sid = (New-Object System.Security.Principal.NTAccount($console)).Translate([System.Security.Principal.SecurityIdentifier]).Value
    if (-not (Test-Path "Registry::HKEY_USERS\$sid")) { return }
    $prof = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction Stop).ProfileImagePath
    if (-not $prof -or -not (Test-Path $prof)) { return }
    $script:HKCU = "Registry::HKEY_USERS\$sid"
    $script:UserProfile = $prof
    $script:AppData = Join-Path $prof 'AppData\Roaming'
    $script:LocalAppData = Join-Path $prof 'AppData\Local'
    $script:UserName = ($console -split '\\')[-1]
    Warn ("Tuning the signed-in account {0}; administrator rights came from {1}. Per-user settings go to {0}." -f $console, $me)
  } catch { }
}

function Save-ProcessList([string]$tag) {
  try {
    $rows = Get-Process -ErrorAction SilentlyContinue | Group-Object ProcessName | Sort-Object -Property @{ Expression = 'Count'; Descending = $true }, @{ Expression = 'Name'; Descending = $false } | ForEach-Object { "{0,-40} x{1,-3} {2,8:N0} MB" -f $_.Name, $_.Count, (($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB) }
    Set-Content -Path (Join-Path $script:Root ("processes-{0}-{1}.txt" -f $tag, $script:Stamp)) -Value $rows -Encoding UTF8
  } catch { }
}

<# The number that counts is the one after a restart, and nobody is at the
   keyboard to read it then. One task, run once at the next sign-in, writes it
   to a text file and removes itself. Disclosed in the report; -NoAfterCount
   skips it; undo removes it. #>
function Register-AfterCount {
  if ($NoAfterCount) { return }
  try {
    $name = 'OmniDx after-restart count'
    $out = Join-Path $script:Root 'after-restart.txt'
    $cmd = "Start-Sleep -Seconds 120; `$n = (Get-Process | Measure-Object).Count; Add-Content -Path '$out' -Value ((Get-Date -Format s) + '  processes after restart: ' + `$n); Unregister-ScheduledTask -TaskName '$name' -Confirm:`$false"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "' + $cmd + '"')
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -RunLevel Highest -Force -ErrorAction Stop | Out-Null
    Record @{ type = 'task-created'; name = $name }
    Did "One task runs once at your next sign-in: it writes the after-restart process count to C:\OmniDx\after-restart.txt, then removes itself."
  } catch { Warn ("Could not set the after-restart count task ({0})." -f $_.Exception.Message) }
}

# ---------------------------------------------------------------------------
# restore point and backups
# ---------------------------------------------------------------------------
function New-Safety {
  Head "Safety first"
  New-Item -ItemType Directory -Path $script:Root -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $script:Root 'undo') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $script:Root 'backup') -Force | Out-Null
  $free = 0; try { $free = [math]::Round((Get-PSDrive -Name $env:SystemDrive.Substring(0, 1) -ErrorAction Stop).Free / 1GB, 1) } catch { }
  if ($free -and $free -lt 3) { Warn ("Only {0} GB free on {1}. A restore point needs room, and Windows itself wants more than this." -f $free, $env:SystemDrive) }

  if (-not $NoRestorePoint) {
    try {
      Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction Stop
      # Windows refuses a second restore point within 24 hours unless told not to.
      Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' 'SystemRestorePointCreationFrequency' 0
      Say "  Making a restore point (this can take a minute)..."
      Checkpoint-Computer -Description ("OmniDx Tune " + $script:Stamp) -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
      Did "Restore point made. Windows can go back to this moment from Recovery."
    } catch {
      Warn ("Could not make a restore point ({0}). The undo script still records everything." -f $_.Exception.Message)
      if (-not (Ask "Carry on without a restore point?")) { throw "Stopped before changing anything." }
    }
  } else { Warn "Restore point skipped (-NoRestorePoint)." }

  # Full exports of the registry areas this touches, on top of the per-value log.
  $bk = Join-Path $script:Root ("backup\" + $script:Stamp)
  New-Item -ItemType Directory -Path $bk -Force | Out-Null
  $areas = @(
    'HKCU\Software\Microsoft\Windows\CurrentVersion\Run', 'HKLM\Software\Microsoft\Windows\CurrentVersion\Run',
    'HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved', 'HKLM\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved',
    'HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile', 'HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl',
    'HKCU\Control Panel\Desktop', 'HKCU\Control Panel\Mouse', 'HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters',
    'HKCU\Software\Microsoft\DirectX\UserGpuPreferences', 'HKCU\System\GameConfigStore', 'HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers'
  )
  $i = 0
  foreach ($a in $areas) { $i++; & reg.exe export $a (Join-Path $bk ("{0:00}.reg" -f $i)) /y 2>$null | Out-Null }
  Get-Service | Select-Object Name, StartType, Status | ConvertTo-Json | Set-Content (Join-Path $bk 'services.json') -Encoding UTF8
  Did ("Registry and service list backed up to {0}" -f $bk)
  Set-Content -Path (Join-Path $script:Root 'undo\undo.ps1') -Value $script:UndoScript -Encoding UTF8
  Did "undo.ps1 written to C:\OmniDx\undo"
}

# ---------------------------------------------------------------------------
# the cut: startup
# ---------------------------------------------------------------------------
$script:StartupKeep = @('SecurityHealth', 'Windows Security notification icon') + $Keep

function Test-Keep([string]$name) {
  foreach ($k in $script:StartupKeep) { if ($k -and ($name -like "*$k*")) { return $true } }
  return $false
}

<# Everything that starts with Windows for the signed-in person: the Run keys,
   the Startup folders and the Store apps that register themselves separately.
   Each entry knows the switch that turns it off. #>
function Get-StartupEntries {
  $hk = $script:HKCU
  $entries = @()
  $pairs = @(
    @{ run = "$hk\Software\Microsoft\Windows\CurrentVersion\Run"; ok = "$hk\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" },
    @{ run = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; ok = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
    @{ run = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; ok = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32' }
  )
  foreach ($p in $pairs) {
    if (-not (Test-Path $p.run)) { continue }
    $item = Get-Item $p.run
    foreach ($name in $item.GetValueNames()) {
      if (-not $name) { continue }
      $state = $null; try { $state = (Get-ItemProperty -Path $p.ok -Name $name -ErrorAction Stop).$name } catch { }
      $on = -not ($state -and $state[0] -eq 3)
      $entries += @{ name = $name; label = $name; ok = $p.ok; value = $name; on = $on; kind = 'run' }
    }
  }
  $folders = @(
    @{ dir = (Join-Path $script:AppData 'Microsoft\Windows\Start Menu\Programs\Startup'); ok = "$hk\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder" },
    @{ dir = (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\StartUp'); ok = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder' }
  )
  foreach ($f in $folders) {
    if (-not (Test-Path $f.dir)) { continue }
    foreach ($file in Get-ChildItem $f.dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' }) {
      $base = [IO.Path]::GetFileNameWithoutExtension($file.Name)
      $state = $null; try { $state = (Get-ItemProperty -Path $f.ok -Name $file.Name -ErrorAction Stop).($file.Name) } catch { }
      $on = -not ($state -and $state[0] -eq 3)
      $entries += @{ name = $base; label = ("{0} (Startup folder)" -f $base); ok = $f.ok; value = $file.Name; on = $on; kind = 'folder' }
    }
  }
  $appBase = "$hk\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData"
  if (Test-Path $appBase) {
    foreach ($pkg in Get-ChildItem $appBase -ErrorAction SilentlyContinue) {
      foreach ($task in Get-ChildItem $pkg.PSPath -ErrorAction SilentlyContinue) {
        $state = (Get-ItemProperty $task.PSPath -Name State -ErrorAction SilentlyContinue).State
        if ($state -eq 2) {
          $label = ($pkg.PSChildName -split '_')[0]
          $entries += @{ name = $label; label = ("{0} (Store app)" -f $label); ok = $task.PSPath; value = 'State'; on = $true; kind = 'store' }
        }
      }
    }
  }
  return @($entries)
}

function Cut-Startup {
  Head "Startup apps"
  $disabled = [byte[]](3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  $live = @(Get-StartupEntries | Where-Object { $_.on -and -not (Test-Keep $_.name) })
  if (-not $live.Count) { Say "  Nothing starts with Windows that is not already off."; return }
  Say ("  {0} things start with Windows:" -f $live.Count)
  for ($i = 0; $i -lt $live.Count; $i++) { Say ("   {0,2}. {1}" -f ($i + 1), $live[$i].label) 'White' }
  if (-not $Yes) {
    $pick = Read-Host "  Numbers to leave ON (e.g. 2,5), or Enter to switch all of them off"
    foreach ($n in ($pick -split '[,\s]+' | Where-Object { $_ -match '^\d+$' })) {
      $idx = [int]$n - 1
      if ($idx -ge 0 -and $idx -lt $live.Count) { $script:StartupKeep += $live[$idx].name }
    }
  }
  $n = 0
  foreach ($e in $live) {
    if (Test-Keep $e.name) { Keep $e.name 'you chose to leave it on at startup'; Did ("kept {0}" -f $e.label); continue }
    if ($e.kind -eq 'store') { Set-Reg $e.ok 'State' 1 'DWord' } else { Set-Reg $e.ok $e.value $disabled 'Binary' }
    $n++; Did ("off: {0}" -f $e.label)
  }
  Say ("  {0} startup entries switched off. Task Manager > Startup can switch any one back on." -f $n)
}

# ---------------------------------------------------------------------------
# the cut: services, decided by what the machine has
# ---------------------------------------------------------------------------
# Off entirely: telemetry and the things a PC built for games never needs.
$script:ServiceOff = @(
  @('DiagTrack', 'telemetry'), @('dmwappushservice', 'telemetry push'), @('diagnosticshub.standardcollector.service', 'diagnostics hub'),
  @('WerSvc', 'error reporting'), @('wercplsupport', 'error reporting'), @('PcaSvc', 'compatibility assistant'),
  @('MapsBroker', 'offline maps'), @('lfsvc', 'geolocation'), @('RetailDemo', 'retail demo'), @('RemoteRegistry', 'remote registry'),
  @('Fax', 'fax'), @('WMPNetworkSvc', 'media sharing'), @('TrkWks', 'link tracking'), @('WalletService', 'wallet'),
  @('wisvc', 'insider program'), @('DoSvc', 'delivery optimisation p2p'), @('SEMgrSvc', 'payments and NFC'), @('MessagingService', 'SMS'),
  @('PhoneSvc', 'Phone Link'), @('TapiSrv', 'telephony'), @('WpcMonSvc', 'parental controls'), @('SharedAccess', 'internet connection sharing'),
  @('CscService', 'offline files'), @('icssvc', 'mobile hotspot'), @('edgeupdate', 'Edge updater (runs on demand)'), @('edgeupdatem', 'Edge updater'),
  @('WbioSrvc', 'biometrics'), @('SysMain', 'superfetch'), @('WSearch', 'search indexing'), @('Spooler', 'print spooler'),
  @('bthserv', 'bluetooth'), @('BTAGService', 'bluetooth audio'), @('BthAvctpSvc', 'bluetooth audio'), @('WlanSvc', 'wi-fi'),
  @('TabletInputService', 'touch keyboard'), @('SensorService', 'sensors'), @('SensrSvc', 'sensors'), @('SensorDataService', 'sensors'),
  @('AJRouter', 'AllJoyn'), @('NcbService', 'network connection broker'), @('CDPSvc', 'connected devices'), @('CDPUserSvc', 'connected devices'),
  @('OneSyncSvc', 'mail/contacts sync'), @('PimIndexMaintenanceSvc', 'contacts index'), @('UnistoreSvc', 'user data storage'), @('UserDataSvc', 'user data'),
  @('XblAuthManager', 'xbox sign-in'), @('XblGameSave', 'xbox game save'), @('XboxNetApiSvc', 'xbox networking'), @('XboxGipSvc', 'xbox accessories'),
  @('RmSvc', 'radio management'), @('WwanSvc', 'mobile broadband'), @('SSDPSRV', 'ssdp discovery'), @('upnphost', 'upnp'),
  @('FrameServer', 'camera frame server'), @('perceptionsimulation', 'mixed reality'), @('spectrum', 'mixed reality'),
  @('DPS', 'diagnostic policy'), @('WdiServiceHost', 'diagnostics'), @('WdiSystemHost', 'diagnostics'), @('stisvc', 'scanner (WIA)'),
  @('SCardSvr', 'smart card'), @('ScDeviceEnum', 'smart card'), @('CertPropSvc', 'smart card'), @('WebClient', 'webdav'),
  @('lmhosts', 'netbios'), @('iphlpsvc', 'ipv6 tunnels'), @('TermService', 'remote desktop'), @('SessionEnv', 'remote desktop'), @('UmRdpService', 'remote desktop'),
  @('Themes', 'themes'), @('cbdhsvc', 'clipboard history'), @('WpnService', 'push notifications'), @('WpnUserService', 'push notifications')
)
# The ones this machine actually uses go to manual instead of off, or stay.
$script:ManualOnly = @('SysMain', 'WSearch', 'edgeupdate', 'edgeupdatem', 'DPS', 'WdiServiceHost', 'WdiSystemHost', 'iphlpsvc', 'SSDPSRV', 'upnphost',
  'NcbService', 'CDPSvc', 'CDPUserSvc', 'OneSyncSvc', 'PimIndexMaintenanceSvc', 'UnistoreSvc', 'UserDataSvc', 'XblAuthManager', 'XblGameSave',
  'XboxNetApiSvc', 'XboxGipSvc', 'RmSvc', 'FrameServer', 'stisvc', 'WebClient', 'lmhosts', 'TermService', 'SessionEnv', 'UmRdpService',
  'WpnService', 'WpnUserService', 'cbdhsvc', 'SensorService', 'SensrSvc', 'SensorDataService', 'TabletInputService', 'BTAGService', 'BthAvctpSvc', 'DoSvc')

function Cut-Services($m) {
  Head "Services"
  $keep = Get-KeepList $m
  Keep 'Defender, the firewall, Windows Update, audio, networking' 'always'
  foreach ($pair in $script:ServiceOff) {
    $name = $pair[0]; $why = $pair[1]
    if ($keep.ContainsKey($name)) { if (Get-Service -Name $name -ErrorAction SilentlyContinue) { Keep $name $keep[$name] }; continue }
    $mode = if ($script:ManualOnly -contains $name) { 'Manual' } else { 'Disabled' }
    # Per-user services carry a suffix (CDPUserSvc_1a2b3c); catch the family.
    $matches = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $name -or $_.Name -like ($name + '_*') })
    foreach ($svc in $matches) { Set-ServiceStart $svc.Name $mode $why }
  }
  # Windows Search: not off, manual - the search box still works, the background indexer stops.
  Say "  Kept on purpose: Defender, Windows Update, audio, networking, Bluetooth if you use it, printing if you have a printer, Windows Hello if it is set up."
}

# ---------------------------------------------------------------------------
# the cut: scheduled tasks and preinstalled apps
# ---------------------------------------------------------------------------
$script:TaskList = @(
  @('\Microsoft\Windows\Application Experience\', 'Microsoft Compatibility Appraiser'), @('\Microsoft\Windows\Application Experience\', 'ProgramDataUpdater'),
  @('\Microsoft\Windows\Application Experience\', 'StartupAppTask'), @('\Microsoft\Windows\Application Experience\', 'PcaPatchDbTask'),
  @('\Microsoft\Windows\Customer Experience Improvement Program\', 'Consolidator'), @('\Microsoft\Windows\Customer Experience Improvement Program\', 'UsbCeip'),
  @('\Microsoft\Windows\Customer Experience Improvement Program\', 'KernelCeipTask'), @('\Microsoft\Windows\DiskDiagnostic\', 'Microsoft-Windows-DiskDiagnosticDataCollector'),
  @('\Microsoft\Windows\Feedback\Siuf\', 'DmClient'), @('\Microsoft\Windows\Feedback\Siuf\', 'DmClientOnScenarioDownload'),
  @('\Microsoft\Windows\Windows Error Reporting\', 'QueueReporting'), @('\Microsoft\Windows\Maps\', 'MapsUpdateTask'), @('\Microsoft\Windows\Maps\', 'MapsToastTask'),
  @('\Microsoft\Windows\Autochk\', 'Proxy'), @('\Microsoft\Windows\CloudExperienceHost\', 'CreateObjectTask'), @('\Microsoft\Windows\Shell\', 'FamilySafetyMonitor'),
  @('\Microsoft\Windows\Shell\', 'FamilySafetyRefreshTask'), @('\Microsoft\Windows\Device Information\', 'Device'), @('\Microsoft\Windows\Device Information\', 'Device User'),
  @('\Microsoft\Windows\PushToInstall\', 'LoginCheck'), @('\Microsoft\Windows\Power Efficiency Diagnostics\', 'AnalyzeSystem'),
  @('\Microsoft\XblGameSave\', 'XblGameSaveTask'), @('\Microsoft\Windows\Speech\', 'SpeechModelDownloadTask'), @('\Microsoft\Windows\Retail Demo\', 'CleanupOfflineContent'),
  @('\Microsoft\Windows\NetTrace\', 'GatherNetworkInfo'), @('\Microsoft\Windows\Application Experience\', 'MareBackup'),
  @('\Microsoft\Windows\Location\', 'Notifications'), @('\Microsoft\Windows\Location\', 'WindowsActionDialog'),
  @('\Microsoft\Office\', 'OfficeTelemetryAgentLogOn'), @('\Microsoft\Office\', 'OfficeTelemetryAgentFallBack'),
  @('\Microsoft\Windows\Diagnosis\', 'Scheduled'), @('\Microsoft\Windows\WwanSvc\', 'OobeDiscovery')
)

function Cut-Tasks {
  Head "Scheduled tasks"
  $n = 0
  foreach ($t in $script:TaskList) {
    $task = Get-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction SilentlyContinue
    if ($task -and $task.State -ne 'Disabled') {
      try { Disable-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction Stop | Out-Null; Record @{ type = 'task'; path = $t[0]; name = $t[1] }; $n++; Did $t[1] } catch { }
    }
  }
  Say ("  {0} telemetry and feedback tasks disabled." -f $n)
}

$script:JunkApps = @(
  'Microsoft.YourPhone', 'MicrosoftWindows.CrossDevice', 'Microsoft.549981C3F5F10', 'Microsoft.WindowsFeedbackHub', 'Microsoft.GetHelp', 'Microsoft.Getstarted',
  'Microsoft.WindowsMaps', 'Microsoft.MicrosoftSolitaireCollection', 'Microsoft.MixedReality.Portal', 'Microsoft.Microsoft3DViewer', 'Microsoft.People',
  'Microsoft.SkypeApp', 'MicrosoftTeams', 'MSTeams', 'Clipchamp.Clipchamp', 'Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.BingSearch', 'Microsoft.Todos',
  'Microsoft.MicrosoftOfficeHub', 'Microsoft.Office.OneNote', 'Microsoft.PowerAutomateDesktop', 'MicrosoftCorporationII.MicrosoftFamily', 'Microsoft.Copilot', 'MicrosoftWindows.Client.WebExperience',
  'Microsoft.Windows.DevHome', 'Microsoft.Windows.Ai.Copilot.Provider', 'Microsoft.WindowsCommunicationsApps', 'Microsoft.Messaging', 'Microsoft.OneConnect',
  'Microsoft.Print3D', 'Microsoft.Wallet', 'Microsoft.WindowsAlarms', 'Microsoft.MicrosoftStickyNotes', 'Microsoft.Advertising.Xaml', 'MicrosoftCorporationII.QuickAssist',
  '*Disney*', '*TikTok*', '*Instagram*', '*Facebook*', '*CandyCrush*', '*king.com*', '*Netflix*', '*Twitter*', '*Amazon*', '*Hulu*', '*Dolby*', '*Prime*', '*LinkedIn*', '*McAfee*', '*Norton*', '*Booking*', '*Duolingo*', '*Fitbit*', '*Flipboard*', '*HiddenCity*', '*Hearts*', '*Plex*', '*Roblox*Store*', '*Sway*', '*Wunderlist*', '*ESPN*', '*BubbleWitch*', '*MarchofEmpires*', '*RoyalRevolt*', '*Speed Test*', '*Sidia*', '*WhatsApp*Stub*'
)

function Cut-Apps($m) {
  Head "Preinstalled apps"
  # Quick Assist and Sticky Notes come back from the Store in one press; both are in the undo list.
  $junk = @($script:JunkApps)
  if ($CutXbox) { $junk += 'Microsoft.XboxApp', 'Microsoft.GamingApp', 'Microsoft.Xbox.TCUI', 'Microsoft.XboxGamingOverlay', 'Microsoft.XboxIdentityProvider', 'Microsoft.XboxSpeechToTextOverlay', 'Microsoft.XboxGameOverlay' }
  $n = 0
  foreach ($pat in $junk) {
    foreach ($pkg in Get-AppxPackage -Name $pat -AllUsers -ErrorAction SilentlyContinue) {
      if ($pkg.NonRemovable -or $pkg.IsFramework) { continue }
      try {
        Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction Stop
        Record @{ type = 'appx'; name = $pkg.Name }; $n++; Did $pkg.Name
      } catch {
        try { Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction Stop; Record @{ type = 'appx'; name = $pkg.Name }; $n++; Did $pkg.Name } catch { }
      }
    }
    foreach ($prov in Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like $pat }) {
      try { Remove-AppxProvisionedPackage -Online -PackageName $prov.PackageName -ErrorAction Stop | Out-Null } catch { }
    }
  }
  Say ("  {0} apps removed. Spotify, the Store, the Xbox apps{1}, Photos, Calculator, Media Player and Notepad stay." -f $n, $(if ($CutXbox) { ' (no - you said -CutXbox)' } else { '' }))
}

# ---------------------------------------------------------------------------
# the cut: telemetry, background, the shell
# ---------------------------------------------------------------------------
function Cut-Telemetry($m) {
  Head "Telemetry, background activity, the shell"
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'AllowTelemetry' 0
  Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection' 'AllowTelemetry' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' 'Enabled' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Privacy' 'TailoredExperiencesWithDiagnosticDataEnabled' 0
  $cdm = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
  foreach ($v in 'SilentInstalledAppsEnabled', 'SystemPaneSuggestionsEnabled', 'SoftLandingEnabled', 'PreInstalledAppsEnabled', 'OemPreInstalledAppsEnabled', 'PreInstalledAppsEverEnabled', 'ContentDeliveryAllowed', 'SubscribedContent-338388Enabled', 'SubscribedContent-338389Enabled', 'SubscribedContent-353694Enabled', 'SubscribedContent-353696Enabled', 'SubscribedContent-310093Enabled', 'SubscribedContent-338393Enabled') { Set-Reg $cdm $v 0 }
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'EnableActivityFeed' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'PublishUserActivities' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'UploadUserActivities' 0
  Set-Reg 'HKCU:\Software\Microsoft\Siuf\Rules' 'NumberOfSIUFInPeriod' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' 'DODownloadMode' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' 'DisableWindowsConsumerFeatures' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' 'DisableSoftLanding' 1
  # Background apps: nothing runs behind your game without being opened.
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy' 'LetAppsRunInBackground' 2
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications' 'GlobalUserDisabled' 1
  # Widgets, news, chat, Copilot, Cortana, search highlights, web results in the start menu.
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Feeds' 'EnableFeeds' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarDa' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarMn' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ShowCopilotButton' 0
  Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'AllowCortana' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'DisableWebSearch' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'ConnectedSearchUseWeb' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'BingSearchEnabled' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\SearchSettings' 'IsDynamicSearchBoxEnabled' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'Start_TrackProgs' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'Start_IrisRecommendations' 0
  # Game DVR off (the background recorder), Game Mode on.
  Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_Enabled' 0
  Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_FSEBehaviorMode' 2
  Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_HonorUserFSEBehaviorMode' 1
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'AppCaptureEnabled' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR' 'AllowGameDVR' 0
  Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'AutoGameModeEnabled' 1
  Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'AllowAutoGameMode' 1
  Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'UseNexusForGameBarEnabled' 0
  # Edge: no pre-launch, no background tabs after close.
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'StartupBoostEnabled' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'BackgroundModeEnabled' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'HardwareAccelerationModeEnabled' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'HubsSidebarEnabled' 0
  # Recall (24H2 and later): nothing screenshots your desktop every few seconds.
  Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
  # Lock screen tips and Spotlight ads; Windows Error Reporting off (its service already is).
  Set-Reg $cdm 'RotatingLockScreenOverlayEnabled' 0
  Set-Reg $cdm 'SubscribedContent-338387Enabled' 0
  Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting' 'Disabled' 1
  # The classic right-click menu on 11: one click fewer, every time.
  if ($m.win -eq 11) { Set-Reg 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32' '(default)' '' 'String' }
  Say "  Telemetry off, background apps off, widgets/news/Copilot/Cortana off, Game DVR off, Game Mode on."
}

# ---------------------------------------------------------------------------
# performance: scheduler, visuals, input, timers, memory, disk, gpu
# ---------------------------------------------------------------------------
function Tune-System($m) {
  Head "System tuning"
  # The multimedia scheduler: games get the CPU, and the network is not throttled for them.
  $sp = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
  Set-Reg $sp 'NetworkThrottlingIndex' 0xFFFFFFFF
  Set-Reg $sp 'SystemResponsiveness' 0
  $games = Join-Path $sp 'Tasks\Games'
  Set-Reg $games 'GPU Priority' 8
  Set-Reg $games 'Priority' 6
  Set-Reg $games 'Scheduling Category' 'High' 'String'
  Set-Reg $games 'SFIO Priority' 'High' 'String'
  Set-Reg $games 'Background Only' 'False' 'String'
  # Short, variable quanta with a foreground boost: the game in front gets the CPU.
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl' 'Win32PrioritySeparation' 38
  # Power throttling and CPU core parking off; the OmniDx plan does the rest.
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling' 'PowerThrottlingOff' 1
  # Games may ask for the 0.5 ms timer on 11 (it is off by default there since 2004).
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel' 'GlobalTimerResolutionRequests' 1
  # Keep the kernel in RAM rather than paging it, with 16 GB or more.
  if ($m.ramGb -ge 16) { Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' 'DisablePagingExecutive' 1 }
  # Hardware-accelerated GPU scheduling (build 2004+, supported GPU). Ignored where unsupported.
  if ($m.build -ge 19041 -and $m.gpuVendor -in 'NVIDIA', 'AMD', 'Intel') { Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode' 2 }
  # Windows 11: optimisations for windowed games and VRR on.
  if ($m.win -eq 11) { Set-Reg 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' 'DirectXUserGlobalSettings' 'SwapEffectUpgradeEnable=1;VRROptimizeEnable=1;' 'String' }
  # Visuals: animations and transparency off, fonts still smooth, thumbnails still there.
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 3
  Set-Reg 'HKCU:\Control Panel\Desktop' 'UserPreferencesMask' ([byte[]](0x90, 0x12, 0x03, 0x80, 0x10, 0x00, 0x00, 0x00)) 'Binary'
  Set-Reg 'HKCU:\Control Panel\Desktop' 'MenuShowDelay' '0' 'String'
  Set-Reg 'HKCU:\Control Panel\Desktop' 'FontSmoothing' '2' 'String'
  Set-Reg 'HKCU:\Control Panel\Desktop\WindowMetrics' 'MinAnimate' '0' 'String'
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarAnimations' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ListviewAlphaSelect' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ListviewShadow' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'IconsOnly' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\DWM' 'EnableAeroPeek' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency' 0
  # Mouse: no acceleration. The one setting every competitive player changes first.
  Set-Reg 'HKCU:\Control Panel\Mouse' 'MouseSpeed' '0' 'String'
  Set-Reg 'HKCU:\Control Panel\Mouse' 'MouseThreshold1' '0' 'String'
  Set-Reg 'HKCU:\Control Panel\Mouse' 'MouseThreshold2' '0' 'String'
  # Fast Startup off: a real shutdown is a real shutdown, and drivers start clean.
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' 'HiberbootEnabled' 0
  # Explorer noise.
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ShowSyncProviderNotifications' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'HideFileExt' 0
  # Sticky Keys, Toggle Keys and Filter Keys shortcuts off: five taps of Shift in a fight should not open a dialog.
  Set-Reg 'HKCU:\Control Panel\Accessibility\StickyKeys' 'Flags' '506' 'String'
  Set-Reg 'HKCU:\Control Panel\Accessibility\ToggleKeys' 'Flags' '58' 'String'
  Set-Reg 'HKCU:\Control Panel\Accessibility\Keyboard Response' 'Flags' '122' 'String'
  # The ten-second delay Windows puts in front of startup apps: gone, so anything you kept starts at once.
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize' 'StartupDelayInMSec' 0
  # Store apps pre-launching in the background (Edge, mostly).
  try { if ((Get-MMAgent -ErrorAction Stop).ApplicationPreLaunch) { Disable-MMAgent -ApplicationPreLaunch -ErrorAction Stop; Record @{ type = 'mmagent'; feature = 'ApplicationPreLaunch' }; Did "App pre-launch off" } } catch { }
  # NTFS: stop writing "last accessed" on every file read.
  try {
    $q = (& fsutil behavior query disablelastaccess 2>$null) -join ' '
    if ($q -match '= (\d)') { $prev = $Matches[1]; if ($prev -ne '1') { & fsutil behavior set disablelastaccess 1 | Out-Null; Record @{ type = 'fsutil'; prev = $prev } } }
  } catch { }
  Say "  Scheduler set for the game in front, throttling off, visuals lean, mouse acceleration off, HAGS on."
}

# ---------------------------------------------------------------------------
# the OmniDx power plan
# ---------------------------------------------------------------------------
function New-PowerPlan($m) {
  Head "The OmniDx power plan"
  $prevActive = $null
  $act = (& powercfg /getactivescheme) -join ' '
  if ($act -match '([0-9a-f\-]{36})') { $prevActive = $Matches[1] }
  # An existing OmniDx plan from a previous run is replaced, not stacked.
  foreach ($line in (& powercfg /list)) { if ($line -match '([0-9a-f\-]{36}).*\(OmniDx\)') { & powercfg /delete $Matches[1] | Out-Null } }
  $ultimate = 'e9a42b02-d5df-448d-aa00-03f14749eb61'; $high = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
  $dup = (& powercfg /duplicatescheme $ultimate) -join ' '
  if ($dup -notmatch '([0-9a-f\-]{36})') { $dup = (& powercfg /duplicatescheme $high) -join ' ' }
  if ($dup -notmatch '([0-9a-f\-]{36})') { Warn "Could not create the power plan."; return }
  $guid = $Matches[1]
  & powercfg /changename $guid 'OmniDx' 'Built by OmniDx Tune for performance. Undo restores the plan that was active before.' | Out-Null
  $sub = @{ proc = '54533251-82be-4824-96c1-47b60b740d00'; pci = '501a4d13-42af-4429-9fd1-a8218c268e20'; usb = '2a737441-1930-4402-8d77-b2bebba308a3'; disk = '0012ee47-9041-4b5d-9b77-535fba8b1442'; sleep = '238c9fa8-0aad-41ed-83f4-97be242c8f20'; video = '7516b95f-f776-4464-8c53-06167f40cc99'; buttons = '4f971e89-eebd-4455-a8de-9e59040e7347'; gfx = '5fb4938d-1ee8-4b0f-9a3c-5036b0ab995c' }
  $set = { param($s, $v, $val) & powercfg /setacvalueindex $guid $s $v $val | Out-Null }
  # Processor: 100% minimum and maximum, aggressive boost, no core parking, no idle demotion games.
  & $set $sub.proc '893dee8e-2bef-41e0-89c6-b55d0929964c' 100      # min state
  & $set $sub.proc 'bc5038f7-23e0-4960-96da-33abaf5935ec' 100      # max state
  & $set $sub.proc 'be337238-0d82-4146-a960-4f3749d470c7' 2        # boost mode: aggressive
  & $set $sub.proc '0cc5b647-c1df-4637-891a-dec35c318583' 100      # core parking min cores
  & $set $sub.proc 'ea062031-0e34-4ff1-9b6d-eb1059334028' 100      # core parking max cores
  & $set $sub.proc '94d3a615-a899-4ac5-ae2b-e4d8f634367f' 1        # system cooling: active
  & $set $sub.proc '45bcc044-d885-43e2-8605-ee0ec6e96b59' 100      # boost policy
  # Buses and disks never sleep on mains.
  & $set $sub.pci 'ee12f906-d277-404b-b6da-e5fa1a576df5' 0         # PCIe link state: off
  & $set $sub.usb '48e6b7a6-50f5-4782-a5d4-53bb50f7e6c9' 0         # USB selective suspend: off
  & $set $sub.usb '0853a681-27c8-4100-a2fd-82013e970683' 0         # USB 3 link power: off
  & $set $sub.disk '6738e2c4-e8a5-4a42-b16a-e040e769756e' 0        # disk off: never
  & $set $sub.sleep '29f6c1db-86da-48c5-9fdb-f2b67b1f44da' 0       # sleep: never
  & $set $sub.sleep '9d7815a6-7ee4-497e-8888-515a05f02364' 0       # hibernate: never
  & $set $sub.sleep '94ac6d29-73ce-41a6-809f-6363ba21b47e' 0       # hybrid sleep: off
  & $set $sub.video '3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e' 900     # display off after 15 min (0 = never; 15 min saves the panel)
  & $set $sub.gfx 'dd848b2a-8a5d-4451-9ae2-39cd41658f6c' 2         # GPU preference: max performance (where the sub-group exists)
  if ($m.laptop) {
    # On battery the plan stays sensible: it is your battery. Mains gets the full treatment.
    & powercfg /setdcvalueindex $guid $sub.proc '893dee8e-2bef-41e0-89c6-b55d0929964c' 5 | Out-Null
    & powercfg /setdcvalueindex $guid $sub.proc 'bc5038f7-23e0-4960-96da-33abaf5935ec' 100 | Out-Null
    & powercfg /setdcvalueindex $guid $sub.sleep '29f6c1db-86da-48c5-9fdb-f2b67b1f44da' 1800 | Out-Null
  }
  & powercfg /setactive $guid | Out-Null
  Record @{ type = 'power'; prev = $prevActive; created = $guid }
  Did "OmniDx plan created and active: CPU 100/100, boost aggressive, no core parking, PCIe and USB power saving off, no sleep on mains."
  # Hibernation off frees the hiberfile and ends Fast Startup for good - on a desktop.
  if (-not $m.laptop) {
    $hib = if (((& powercfg /a) -join ' ') -match 'Hibernate') { 'on' } else { 'off' }
    if ($hib -eq 'on') { & powercfg /h off | Out-Null; Record @{ type = 'hibernate'; prev = 'on' }; Did "Hibernation off (desktop): hiberfil.sys gone, clean boots." }
  }
}

# ---------------------------------------------------------------------------
# network: for the game's packets, not for downloads
# ---------------------------------------------------------------------------
function Tune-Network($m) {
  Head "Network"
  $restore = @('netsh int tcp set global autotuninglevel=normal', 'netsh int tcp set global ecncapability=default', 'netsh int tcp set global timestamps=default', 'netsh int tcp set global rss=enabled', 'netsh int tcp set global initialrto=1000', 'netsh int tcp set supplemental internet congestionprovider=default', 'netsh int tcp set global rsc=enabled')
  Record @{ type = 'netsh'; restore = $restore }
  & netsh int tcp set global autotuninglevel=normal | Out-Null      # normal is right; "disabled" is the myth that halves download speed
  & netsh int tcp set global ecncapability=disabled | Out-Null
  & netsh int tcp set global timestamps=disabled | Out-Null
  & netsh int tcp set global rss=enabled | Out-Null
  & netsh int tcp set global initialrto=2000 | Out-Null
  & netsh int tcp set supplemental internet congestionprovider=ctcp 2>$null | Out-Null
  & netsh int tcp set global rsc=disabled | Out-Null
  Did "TCP: autotuning normal, ECN and timestamps off, receive-side scaling on, segment coalescing off, CTCP."
  # Nagle off on the adapter you actually use: small packets go now, not after a 200 ms wait.
  $active = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Sort-Object -Property LinkSpeed -Descending
  $ifBase = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces'
  foreach ($a in $active) {
    Say ("  Live adapter: {0} ({1})" -f $a.Name, $a.LinkSpeed)
    $guid = $a.InterfaceGuid
    $p = Join-Path $ifBase $guid
    if (Test-Path $p) { Set-Reg $p 'TcpAckFrequency' 1; Set-Reg $p 'TCPNoDelay' 1; Set-Reg $p 'TcpDelAckTicks' 0 }
    # Adapter power saving and interrupt coalescing off; the names differ by driver, so try each.
    try { Disable-NetAdapterPowerManagement -Name $a.Name -ErrorAction Stop; Record @{ type = 'nicpower'; adapter = $a.Name } } catch { }
    foreach ($prop in @(@('Energy-Efficient Ethernet', 'Disabled'), @('Energy Efficient Ethernet', 'Disabled'), @('EEE', 'Disabled'), @('Green Ethernet', 'Disabled'), @('Power Saving Mode', 'Disabled'), @('Interrupt Moderation', 'Disabled'), @('Ultra Low Power Mode', 'Disabled'), @('Advanced EEE', 'Disabled'), @('Gigabit Lite', 'Disabled'), @('System Idle Power Saver', 'Disabled'), @('Reduce Speed On Power Down', 'Disabled'))) {
      $cur = Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName $prop[0] -ErrorAction SilentlyContinue
      if ($cur -and $cur.DisplayValue -ne $prop[1]) {
        try { Set-NetAdapterAdvancedProperty -Name $a.Name -DisplayName $prop[0] -DisplayValue $prop[1] -NoRestart -ErrorAction Stop; Record @{ type = 'nic'; adapter = $a.Name; property = $prop[0]; prev = $cur.DisplayValue }; Did ("{0}: {1} off" -f $a.Name, $prop[0]) } catch { }
      }
    }
    Did ("{0}: Nagle off, power saving off" -f $a.Name)
    if ($Dns) {
      try { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses '1.1.1.1', '1.0.0.1' -ErrorAction Stop; Record @{ type = 'dns'; index = $a.ifIndex }; Did ("{0}: DNS 1.1.1.1" -f $a.Name) } catch { }
    }
  }
  # The "reserve 20% bandwidth" QoS limit, and the network location awareness delays.
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Psched' 'NonBestEffortLimit' 0
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' 'DefaultTTL' 64
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters' 'IRPStackSize' 30
  & ipconfig /flushdns | Out-Null
  Say "  Latency over throughput on the live adapter. Downloads are not slower; the first byte of a small packet is faster."
}

# ---------------------------------------------------------------------------
# the apps: Discord, Spotify, browsers
# ---------------------------------------------------------------------------
function Set-JsonFile([string]$path, [hashtable]$values) {
  $obj = @{}
  if (Test-Path $path) {
    try { $obj = Get-Content $path -Raw | ConvertFrom-Json } catch { $obj = New-Object PSObject }
    $bk = Join-Path $script:Root ("backup\{0}\{1}.bak" -f $script:Stamp, [IO.Path]::GetFileName($path))
    Copy-Item $path $bk -Force; Record @{ type = 'file'; path = $path; backup = $bk }
  }
  foreach ($k in $values.Keys) {
    if ($obj.PSObject.Properties.Name -contains $k) { $obj.$k = $values[$k] } else { $obj | Add-Member -NotePropertyName $k -NotePropertyValue $values[$k] -Force }
  }
  $obj | ConvertTo-Json -Depth 8 | Set-Content -Path $path -Encoding UTF8
}

function Tune-Apps($m) {
  Head "Discord, Spotify, browsers"
  # Discord: hardware acceleration on, not opening with Windows. Only when it is closed - it rewrites its own settings on exit.
  $disc = Join-Path $script:AppData 'discord\settings.json'
  if (Test-Path (Split-Path $disc)) {
    if (Get-Process -Name Discord -ErrorAction SilentlyContinue) {
      if (Ask "Discord is running. Close it now so it can be tuned?") { Get-Process -Name Discord -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3 }
    }
    if (Get-Process -Name Discord -ErrorAction SilentlyContinue) { Warn "Discord is running, so its settings were left alone. Close it and run again to tune it." }
    else { Set-JsonFile $disc @{ enableHardwareAcceleration = $true; OPEN_ON_STARTUP = $false; MINIMIZE_TO_TRAY = $true; START_MINIMIZED = $false }; Did "Discord: hardware acceleration on, no auto-start" }
  }
  # Spotify (desktop and Store): hardware acceleration on, no auto-start. Its prefs file is key=value lines.
  $prefs = @((Join-Path $script:AppData 'Spotify\prefs'))
  $store = Get-ChildItem (Join-Path $script:LocalAppData 'Packages') -Directory -Filter 'SpotifyAB.SpotifyMusic_*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($store) { $prefs += (Join-Path $store.FullName 'LocalState\Spotify\prefs') }
  if (($prefs | Where-Object { Test-Path $_ }) -and (Get-Process -Name Spotify -ErrorAction SilentlyContinue)) {
    if (Ask "Spotify is running. Close it now so it can be tuned?") { Get-Process -Name Spotify -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3 }
  }
  foreach ($pf in $prefs) {
    if (-not (Test-Path $pf)) { continue }
    if (Get-Process -Name Spotify -ErrorAction SilentlyContinue) { Warn "Spotify is running, so its settings were left alone. Close it and run again."; break }
    $bk = Join-Path $script:Root ("backup\{0}\spotify-prefs.bak" -f $script:Stamp); Copy-Item $pf $bk -Force; Record @{ type = 'file'; path = $pf; backup = $bk }
    $lines = @(Get-Content $pf) | Where-Object { $_ -notmatch '^(ui\.hardware_acceleration|app\.autostart-mode|app\.autostart-configured|ui\.show_friend_feed|audio\.normalize_v2)=' }
    $lines += 'ui.hardware_acceleration=true', 'app.autostart-mode="off"', 'app.autostart-configured=true', 'ui.show_friend_feed=false'
    Set-Content -Path $pf -Value $lines -Encoding UTF8
    Did "Spotify: hardware acceleration on, no auto-start, friend feed off"
  }
  # Chrome / Brave: stop running in the background after the window closes; keep GPU acceleration on.
  foreach ($pol in @('HKLM:\SOFTWARE\Policies\Google\Chrome', 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave')) {
    $exe = if ($pol -match 'Google') { "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", (Join-Path $script:LocalAppData 'Google\Chrome\Application\chrome.exe') } else { "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", (Join-Path $script:LocalAppData 'BraveSoftware\Brave-Browser\Application\brave.exe') }
    if (-not ($exe | Where-Object { Test-Path $_ })) { continue }
    Set-Reg $pol 'BackgroundModeEnabled' 0
    Set-Reg $pol 'HardwareAccelerationModeEnabled' 1
    Did ("{0}: no background mode, hardware acceleration on" -f $(if ($pol -match 'Google') { 'Chrome' } else { 'Brave' }))
  }
  Did "Edge: no startup boost, no background mode, hardware acceleration on"
  # Steam: no auto-start comes from the startup cut; the overlay is per game, and left alone.
  Say "  Nothing that changes how an app looks or sounds; only what it does when you are not looking at it."
}

# ---------------------------------------------------------------------------
# game profiles
# ---------------------------------------------------------------------------
$script:Games = @(
  @{ name = 'Fortnite'; exes = @('FortniteClient-Win64-Shipping.exe'); notes = @('Performance mode (Alpha) in Video settings is the biggest single gain on any GPU.', '3D resolution 100%, view distance far, everything else low or off; meshes low is what pros run.', 'Frame limit: 2x your refresh rate, or unlimited with a 240 Hz panel.', 'DirectX 12 only if Performance mode stutters for you; otherwise leave it.') },
  @{ name = 'VALORANT'; exes = @('VALORANT-Win64-Shipping.exe', 'VALORANT.exe'); notes = @('Vanguard (vgc, vgk) is deliberately untouched - VALORANT will not start without it.', 'On Windows 11 it also needs Secure Boot and TPM 2.0 on; the BIOS checklist covers both.', 'Multithreaded rendering on, raw input buffer on, Nvidia Reflex on + boost, limit FPS off, V-Sync off.', 'Material, texture, detail and UI quality low; anti-aliasing MSAA 2x or none.') },
  @{ name = 'Counter-Strike 2'; exes = @('cs2.exe'); notes = @('Launch options in Steam: -high -novid -nojoy -allow_third_party_software', 'Multicore rendering on, Nvidia Reflex enabled + boost, V-Sync off, FSR off, shader detail low, MSAA 2x.', 'Set the max FPS in-game (fps_max) to 0 or just above your refresh rate for stable frame times.') },
  @{ name = 'Marvel Rivals'; exes = @('Marvel-Win64-Shipping.exe', 'MarvelRivals_Launcher.exe'); notes = @('Graphics quality Low, then Model detail Low, shadows Low, post-processing Low: that is where the frames are.', 'Lumen (global illumination) off if the game offers it; Frame Generation only if you are GPU-bound.', 'Reflex / Anti-Lag 2 on. Limit FPS to your refresh rate to keep 1% lows steady.') },
  @{ name = 'Apex Legends'; exes = @('r5apex.exe', 'r5apex_dx12.exe'); notes = @('Launch options: +fps_max 0 -novid -high', 'Texture streaming budget as high as your VRAM allows (it is a quality setting that costs nothing), everything else low.', 'V-Sync off, adaptive resolution FPS target 0, anti-aliasing TSAA or none.') },
  @{ name = 'Call of Duty (Warzone / MW)'; exes = @('cod.exe', 'ModernWarfare.exe', 'Warzone.exe'); notes = @('Rendering resolution 100%, Nvidia Reflex on + boost, V-Sync off, texture resolution normal, shadows low, particle quality low.', 'On-demand texture streaming off if your connection stutters mid-match.') },
  @{ name = 'Overwatch 2'; exes = @('Overwatch.exe'); notes = @('Render scale 100%, texture quality high (free), everything else low, Reflex enabled + boost, reduce buffering on if you play below 144 fps.') },
  @{ name = 'Rainbow Six Siege'; exes = @('RainbowSix.exe', 'RainbowSix_DX11.exe', 'RainbowSix_Vulkan.exe'); notes = @('Vulkan if your GPU supports it well; texture filtering anisotropic 16x is free; shadows low, ambient occlusion off, lens effects off.') },
  @{ name = 'Rocket League'; exes = @('RocketLeague.exe'); notes = @('Render quality high performance, render detail custom: world detail low, particle detail low, light shafts off, dynamic shadows off; FPS max 250.') },
  @{ name = 'Minecraft'; exes = @('javaw.exe', 'Minecraft.Windows.exe'); notes = @('Java edition: use Sodium (or OptiFine) and give Java 4 GB in the launcher, not more; render distance 12.', 'Bedrock: V-Sync off, render distance 12 chunks, fancy leaves off.') },
  @{ name = 'Roblox'; exes = @('RobloxPlayerBeta.exe'); notes = @('Graphics mode Manual, quality level 3-5, and turn "Reduce Motion" on in settings for the steadiest frames.') },
  @{ name = 'League of Legends'; exes = @('League of Legends.exe'); notes = @('Character quality medium, environment low, effects low, shadows off, anti-aliasing off, frame rate cap uncapped or 240.') },
  @{ name = 'GTA V / Online'; exes = @('GTA5.exe', 'GTA5_Enhanced.exe'); notes = @('FXAA on, MSAA off, VSync off, population density 60%, shadow quality normal, reflection quality normal, grass normal, extended distance scaling off.') },
  @{ name = 'Rust'; exes = @('RustClient.exe'); notes = @('Launch options: -high -maxMem=16384 -malloc=system -force-feature-level-11-0', 'Anti-aliasing FXAA, water quality 0, shadow quality 0, draw distance 1500, grass displacement off.') },
  @{ name = 'Escape from Tarkov'; exes = @('EscapeFromTarkov.exe'); notes = @('Texture quality high (VRAM permitting), shadows low, object LOD 2, overall visibility 400, HBAO off, SSR off, anisotropic per texture.') },
  @{ name = 'PUBG'; exes = @('TslGame.exe'); notes = @('Render scale 100, anti-aliasing low, post-processing very low, shadows very low, textures medium, effects very low, foliage very low, view distance medium.') }
)

<# Where games live on this PC: every Steam library the client knows about,
   each Epic game's own folder, Riot, Xbox, and the usual places. Asking the
   launchers is faster and surer than crawling Program Files. #>
function Get-GameRoots {
  $roots = New-Object System.Collections.ArrayList
  $steam = $null
  foreach ($k in 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') { try { $steam = (Get-ItemProperty $k -ErrorAction Stop).InstallPath; if ($steam) { break } } catch { } }
  if ($steam) {
    $c = Join-Path $steam 'steamapps\common'; if ((Test-Path $c) -and -not $roots.Contains($c)) { [void]$roots.Add($c) }
    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
      foreach ($mt in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) {
        $lib = Join-Path ($mt.Groups[1].Value -replace '\\\\', '\') 'steamapps\common'
        if ((Test-Path $lib) -and -not $roots.Contains($lib)) { [void]$roots.Add($lib) }
      }
    }
  }
  foreach ($mf in Get-ChildItem (Join-Path $env:ProgramData 'Epic\EpicGamesLauncher\Data\Manifests') -Filter '*.item' -ErrorAction SilentlyContinue) {
    try { $loc = (Get-Content $mf.FullName -Raw | ConvertFrom-Json).InstallLocation; if ($loc -and (Test-Path $loc) -and -not $roots.Contains($loc)) { [void]$roots.Add($loc) } } catch { }
  }
  foreach ($r in 'C:\Riot Games', 'D:\Riot Games', 'C:\XboxGames', 'D:\XboxGames', 'C:\Games', 'D:\Games', "$env:ProgramFiles", "${env:ProgramFiles(x86)}", (Join-Path $script:LocalAppData 'Programs'), (Join-Path $script:LocalAppData 'Roblox\Versions')) {
    if ($r -and (Test-Path $r) -and -not $roots.Contains($r)) { [void]$roots.Add($r) }
  }
  return @($roots)
}

function Set-GameProfiles {
  Head "Game profiles"
  $gp = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
  $layers = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'
  $found = @()
  $roots = Get-GameRoots
  Say ("  Looking in {0} game folders" -f $roots.Count)
  foreach ($g in $script:Games) {
    foreach ($exe in $g.exes) {
      # Where the game is installed, if it is: the exe is looked up by name inside the launchers' own folders.
      $paths = @()
      foreach ($root in $roots) {
        $hit = Get-ChildItem -Path $root -Filter $exe -Recurse -Depth 4 -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { $paths += $hit.FullName }
      }
      # High-performance GPU, priority class high, and the DVR exclusion - by exe name, so they apply wherever it lives.
      $ifeo = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$exe\PerfOptions"
      Set-Reg $ifeo 'CpuPriorityClass' 3
      Set-Reg $ifeo 'IoPriority' 3
      Set-Reg $ifeo 'PagePriority' 5
      foreach ($p in $paths) {
        Set-Reg $gp $p 'GpuPreference=2;' 'String'
        # Fullscreen optimisations off for this exe: real exclusive fullscreen, lowest input latency.
        Set-Reg $layers $p '~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE' 'String'
      }
      if ($paths.Count -and $found -notcontains $g.name) { $found += $g.name; [void]$script:GamesFound.Add($g.name) }
    }
  }
  if ($found.Count) { Did ("Installed and profiled: {0}" -f ($found -join ', ')) } else { Did "No listed game found on the usual drives; the CPU-priority profiles are in place for when one is installed." }
  Say "  Every listed game: high CPU priority, high-performance GPU, fullscreen optimisations off, Game DVR off. In-game settings are in the report."
}

# ---------------------------------------------------------------------------
# GPU vendor extras
# ---------------------------------------------------------------------------
function Tune-Gpu($m) {
  if ($m.gpuVendor -ne 'NVIDIA') { return }
  Head "NVIDIA extras"
  Set-ServiceStart 'NvTelemetryContainer' 'Disabled' 'NVIDIA telemetry'
  $n = 0
  foreach ($t in Get-ScheduledTask -TaskPath '\' -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match '^Nv(TmRep|TmMon|ProfileUpdater|DriverUpdateCheck|NodeLauncher)' -and $_.State -ne 'Disabled' }) {
    try { Disable-ScheduledTask -TaskPath '\' -TaskName $t.TaskName -ErrorAction Stop | Out-Null; Record @{ type = 'task'; path = '\'; name = $t.TaskName }; $n++ } catch { }
  }
  Did ("NVIDIA telemetry service off, {0} NVIDIA crash-report and updater tasks off. The display driver and its container are untouched." -f $n)
}

# ---------------------------------------------------------------------------
# memory integrity (opt-in)
# ---------------------------------------------------------------------------
function Set-Vbs($m) {
  if (-not $Aggressive -or -not $m.vbs) { return }
  Head "Memory integrity (VBS / HVCI)"
  Say "  Memory integrity is on. Turning it off is worth 5-15% in CPU-bound games and removes a layer of kernel protection." 'Yellow'
  Say "  Microsoft offers this same switch under Windows Security > Core isolation. It is your call." 'Yellow'
  if (-not (Ask "Turn memory integrity off?")) { Say "  Left on."; return }
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' 'Enabled' 0
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard' 'EnableVirtualizationBasedSecurity' 0
  Did "Memory integrity off after restart. Undo puts it back."
}

# ---------------------------------------------------------------------------
# the BIOS checklist, for this board
# ---------------------------------------------------------------------------
function Get-BiosChecklist($m) {
  $v = "$($m.boardVendor) $($m.bios)".ToLower()
  $keyHint = if ($v -match 'asus|asustek') { 'Del (or F2) while the ROG / ASUS logo shows' }
    elseif ($v -match 'msi|micro-star') { 'Del while the MSI logo shows' }
    elseif ($v -match 'gigabyte|aorus') { 'Del while the logo shows' }
    elseif ($v -match 'asrock') { 'F2 or Del while the logo shows' }
    elseif ($v -match 'dell|alienware') { 'F2 while the Dell logo shows' }
    elseif ($v -match 'hp|hewlett|omen') { 'F10 while the HP logo shows' }
    elseif ($v -match 'lenovo|legion') { 'F2 (or the Novo button) while the Lenovo logo shows' }
    elseif ($v -match 'acer|predator') { 'F2 while the Acer logo shows' }
    else { 'Del or F2 while the logo shows' }
  $where = if ($v -match 'asus') { 'Advanced Mode (F7) > Ai Tweaker for memory, Advanced > CPU Configuration, Advanced > PCI Subsystem Settings, Boot > CSM, Advanced > Trusted Computing' }
    elseif ($v -match 'msi') { 'Advanced Mode (F7) > OC for memory and PBO, Settings > Advanced > PCI Subsystem Settings, Settings > Boot, Settings > Security > Trusted Computing' }
    elseif ($v -match 'gigabyte|aorus') { 'Tweaker for memory and PBO, Settings > IO Ports for Above 4G / Re-Size BAR, Boot > CSM, Settings > Miscellaneous > Trusted Computing' }
    elseif ($v -match 'asrock') { 'OC Tweaker for memory, Advanced > CPU Configuration, Advanced > PCI Configuration, Boot > CSM, Security > Intel Platform Trust / AMD fTPM' }
    else { 'the Advanced / Overclocking pages for memory, the PCI or Chipset page for Above 4G / Re-Size BAR, the Boot page for CSM, the Security page for TPM and Secure Boot' }
  $mem = if ($m.cpuVendor -eq 'AMD') { 'EXPO (or DOCP / A-XMP on older boards)' } else { 'XMP' }
  $lines = @(
    "BIOS checklist for: $($m.board)  ($($m.bios))",
    "CPU $($m.cpu) | GPU $($m.gpu) | $($m.ramGb) GB RAM",
    "",
    "How to get in: restart, then press $keyHint.",
    "Where things are: $where.",
    "",
    $(if ($m.ramSlow) { "1. Memory profile: enable $mem. CONFIRMED OFF on this PC: the RAM runs at $($m.ramNow) MT/s and is rated for $($m.ramRated). This is the single biggest free gain on any PC. Pick the profile matching the speed printed on the sticks." } elseif ($m.ramRated -and $m.ramNow) { "1. Memory profile: $mem looks to be on already ($($m.ramNow) MT/s of $($m.ramRated) rated). Check it stayed on after any BIOS update or CMOS reset." } else { "1. Memory profile: enable $mem. Your RAM is running at the slow default until you do; this is the single biggest free gain on any PC. Pick the profile matching the speed printed on the sticks." }),
    "2. Re-Size BAR / Smart Access Memory: set Above 4G Decoding = Enabled, then Re-Size BAR Support = Auto/Enabled. Needs CSM off (next line). Worth 5-15% in many games on RTX 30/40/50 and RX 6000+.",
    $(if ($m.uefi) { "3. CSM (Compatibility Support Module): Disabled. You already boot UEFI, so nothing depends on it, and Re-Size BAR needs it off." } else { "3. CSM: you are booting in legacy mode, so leave CSM on for now. Converting to UEFI (mbr2gpt) first is a separate job; Re-Size BAR will wait until then." }),
    $(if ($m.secureBoot) { "4. Secure Boot: already on. Leave it on (VALORANT, Fortnite's anti-cheat and Windows 11 all expect it)." } else { "4. Secure Boot: Enabled. Windows 11 and Vanguard expect it; on 10 it costs nothing. Set OS Type / Secure Boot Mode to Windows UEFI if asked." }),
    $(if ($m.tpm) { "5. TPM: present. Leave fTPM / PTT enabled." } else { "5. TPM: not detected. Enable AMD fTPM (AMD) or Intel PTT (Intel) under Security / Trusted Computing. VALORANT on Windows 11 will not run without it." }),
    $(if ($m.cpuVendor -eq 'AMD') { "6. Precision Boost Overdrive: Enabled (or Advanced with the Curve Optimizer at a modest negative offset like -15 all-core if you know your cooler). Never a positive voltage offset." } else { "6. Intel: leave MultiCore Enhancement at Auto; set the long and short power limits (PL1/PL2) to the chip's rated maximum if the board runs them lower. Do not touch voltages." }),
    "7. Global C-states / package C-states: Auto is fine. Disabling them buys nothing measurable in games and raises idle heat.",
    "8. Fast Boot: Enabled. Full Screen Logo / Boot Logo: Disabled (a second off every boot).",
    "9. Fan curves: set the CPU fan to reach 100% by 80 C and the case fans to a steady ramp. Sustained boost needs airflow more than anything.",
    $(if ($m.wifiLive) { "10. Onboard devices you do not use: serial port, onboard audio if you use USB audio, RGB controllers. Keep Wi-Fi and Bluetooth on: Wi-Fi is your connection." } else { "10. Onboard devices you do not use: serial port, Wi-Fi/Bluetooth if wired, onboard audio if you use USB audio, RGB controllers. Each one removed is an interrupt source gone." }),
    "11. HPET: leave at default. The 'disable HPET' tweak is from 2013 and hurts more than it helps on modern Windows.",
    "12. Virtualisation (SVM / VT-x): leave on if you use WSL, Docker, an emulator, or if VALORANT runs on Windows 11 for you; otherwise off saves a little scheduling overhead.",
    "",
    "After saving: Windows will boot normally. If it does not (rare, usually CSM), go back in and re-enable the last thing you changed.",
    "Do not update the BIOS unless the vendor's notes mention a fix for your exact problem; a failed flash is the one thing here that cannot be undone from Windows."
  )
  return $lines
}

# ---------------------------------------------------------------------------
# GPU control-panel notes
# ---------------------------------------------------------------------------
function Get-GpuNotes($m) {
  switch ($m.gpuVendor) {
    'NVIDIA' { @('NVIDIA Control Panel > Manage 3D settings (global): Low Latency Mode = Ultra, Power management = Prefer maximum performance, Vertical sync = Off, Texture filtering quality = High performance, Shader cache size = 10 GB, Threaded optimisation = Auto.', 'NVIDIA app: in-game overlay off unless you record; Reflex on in every game that has it.', 'Drivers: use the Game Ready driver, clean install ticked, GeForce Experience / NVIDIA app not set to start with Windows (the tune already switched it off).') }
    'AMD' { @('AMD Software > Gaming > Graphics: Radeon Anti-Lag = On (Anti-Lag 2 in games that support it), Radeon Boost = Off for competitive, Radeon Chill = Off, Wait for vertical refresh = Off, Texture filtering = Performance, Surface format optimisation = On, Tessellation = AMD optimised.', 'Shader cache = AMD optimised. Enhanced Sync off. Instant replay off unless you record.') }
    'Intel' { @('Intel Graphics Command Center: Endurance Gaming off on mains, Adaptive tessellation on, V-Sync off, Anisotropic filtering per-application.') }
    default { @('GPU not identified; use the vendor control panel to set low-latency mode on, power management to maximum performance and V-Sync off.') }
  }
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
function Get-ProcessCount { (Get-Process -ErrorAction SilentlyContinue | Measure-Object).Count }

function Write-Report($m, $before, $after, $changesFile) {
  $rep = Join-Path $script:Root ("report-{0}.txt" -f $script:Stamp)
  $target = Get-SafeBar $m
  $top = Get-Process -ErrorAction SilentlyContinue | Group-Object ProcessName | Sort-Object Count -Descending | Select-Object -First 12 | ForEach-Object { "  {0,-28} x{1}" -f $_.Name, $_.Count }
  $found = @($script:GamesFound)
  $gameLines = @()
  foreach ($g in $script:Games) { if ($found -contains $g.name) { $gameLines += @("  $($g.name)  (installed)") + @($g.notes | ForEach-Object { "    - $_" }) } }
  $others = @($script:Games | Where-Object { $found -notcontains $_.name } | ForEach-Object { $_.name })
  if ($others.Count) { $gameLines += ("  Not found on this PC (the same profile applies if you install them): " + ($others -join ', ')) }
  $lines = @(
    "OmniDx Tune $($script:Version) - report, $((Get-Date).ToString('f'))", "",
    "MACHINE", @($script:Log | Where-Object { $_ -match '^  (CPU|GPU|RAM|Board|Laptop|Desktop|Keeps|UEFI|Microsoft|Windows|Driver)' }), "",
    "PROCESSES", "  before: $before", "  now:    $after  (many of these are only waiting to be stopped; the number after a restart is the one that counts)",
    "  target for this PC after a restart: about $target. Every launcher, overlay and driver utility you keep open adds to it.",
    "  full lists: processes-before-$($script:Stamp).txt and processes-after-$($script:Stamp).txt next to this file; after-restart.txt appears after your next sign-in.", "",
    "STILL RUNNING (most instances)", @($top), "",
    "KEPT, AND WHY", @($(if ($script:Kept.Count) { $script:Kept | Sort-Object -Unique | ForEach-Object { "  $_" } } else { "  nothing needed keeping" })), "",
    "WHAT WAS DONE", @($script:Log | Where-Object { $_ -match '^(==|  \+)' }), "",
    "WARNINGS ($($script:Warnings.Count))", @($(if ($script:Warnings.Count) { $script:Warnings | ForEach-Object { "  ! $_" } } else { "  none" })), "",
    "GPU CONTROL PANEL", @(Get-GpuNotes $m | ForEach-Object { "  - $_" }), "",
    "PER GAME", @($gameLines), "",
    "BIOS", @(Get-BiosChecklist $m | ForEach-Object { "  $_" }), "",
    "UNDO", "  Administrator PowerShell:  powershell -ExecutionPolicy Bypass -File C:\OmniDx\undo\undo.ps1", "  Or Windows Recovery > System Restore > the point named 'OmniDx Tune $($script:Stamp)'.", "  Changes recorded in: $changesFile"
  )
  $flat = @(); foreach ($l in $lines) { if ($l -is [array]) { $flat += $l } else { $flat += $l } }
  Set-Content -Path $rep -Value $flat -Encoding UTF8
  Set-Content -Path (Join-Path $script:Root ("bios-{0}.txt" -f (($m.board -replace '[^A-Za-z0-9]+', '-').Trim('-')))) -Value (Get-BiosChecklist $m) -Encoding UTF8
  try {
    $summary = @{ version = $script:Version; stamp = $script:Stamp; before = $before; after = $after; target = $target; changes = $script:Changes.Count; warnings = $script:Warnings.Count; seconds = [int]$script:Timer.Elapsed.TotalSeconds; os = $m.os; cpu = $m.cpu; gpu = $m.gpu; ramGb = $m.ramGb; board = $m.board; laptop = $m.laptop; games = $found }
    $summary | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $script:Root ("summary-{0}.json" -f $script:Stamp)) -Encoding UTF8
  } catch { }
  return $rep
}

<# The free look. Same read as the tune, then: what it would switch off on
   this PC, counted; what it would keep, and why; the advice; the target.
   Nothing changes and no key is asked for. The BIOS checklist and the
   per-game settings are in the paid report. #>
function Write-Preview($m, $before) {
  Head "What the tune would do here"
  $keep = Get-KeepList $m
  $startup = @(Get-StartupEntries | Where-Object { $_.on -and -not (Test-Keep $_.name) })
  $svcOff = @(); $svcKeep = @()
  foreach ($pair in $script:ServiceOff) {
    $name = $pair[0]
    $svc = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { ($_.Name -eq $name -or $_.Name -like ($name + '_*')) -and $_.StartType -ne 'Disabled' })
    if (-not $svc.Count) { continue }
    if ($keep.ContainsKey($name)) { $svcKeep += ("{0} ({1})" -f $name, $keep[$name]) } else { $svcOff += ("{0} ({1})" -f $name, $pair[1]) }
  }
  $tasks = @(); foreach ($t in $script:TaskList) { $task = Get-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction SilentlyContinue; if ($task -and $task.State -ne 'Disabled') { $tasks += $t[1] } }
  $apps = @(); foreach ($pat in $script:JunkApps) { foreach ($pkg in Get-AppxPackage -Name $pat -AllUsers -ErrorAction SilentlyContinue) { if (-not ($pkg.NonRemovable -or $pkg.IsFramework)) { $apps += $pkg.Name } } }
  $apps = @($apps | Sort-Object -Unique)
  $target = Get-SafeBar $m
  Say ("  Startup entries it would switch off: {0}" -f $startup.Count) 'White'
  foreach ($e in $startup) { Say ("    - {0}" -f $e.label) }
  Say ("  Services it would stop or set to manual: {0}" -f $svcOff.Count) 'White'
  Say ("  Services it would keep for this PC: {0}" -f $svcKeep.Count) 'White'
  foreach ($k in $svcKeep) { Say ("    - {0}" -f $k) }
  Say ("  Scheduled tasks it would switch off: {0}" -f $tasks.Count) 'White'
  Say ("  Preinstalled apps it would remove: {0}" -f $apps.Count) 'White'
  Say ("  Plus: the OmniDx power plan, network latency settings, Discord / Spotify / browser, game profiles, the BIOS checklist for {0}." -f $m.board) 'White'
  Say ("  Processes now: {0}. Target after the tune and a restart: about {1}." -f $before, $target) 'Green'
  $rep = Join-Path $script:Root ("report-preview-{0}.txt" -f $script:Stamp)
  $lines = @(
    "OmniDx Tune $($script:Version) - free report (nothing was changed), $((Get-Date).ToString('f'))", "",
    "MACHINE", @($script:Log | Where-Object { $_ -match '^  (CPU|GPU|RAM|Board|Laptop|Desktop|Keeps|UEFI|Microsoft|Windows|Driver)' }), "",
    "PROCESSES", "  now: $before", "  target for this PC after the tune and a restart: about $target", "",
    "WHAT THE TUNE WOULD DO HERE",
    "  startup entries off: $($startup.Count)", @($startup | ForEach-Object { "    - $($_.label)" }),
    "  services stopped or set to manual: $($svcOff.Count)", @($svcOff | ForEach-Object { "    - $_" }),
    "  scheduled tasks off: $($tasks.Count)", @($tasks | ForEach-Object { "    - $_" }),
    "  preinstalled apps removed: $($apps.Count)", @($apps | ForEach-Object { "    - $_" }),
    "  plus the OmniDx power plan, network, Discord / Spotify / browsers, game profiles, memory integrity only if asked", "",
    "KEPT FOR THIS PC, AND WHY", @($(if ($svcKeep.Count) { $svcKeep | ForEach-Object { "  $_" } } else { "  nothing needed keeping" })), "",
    "WARNINGS ($($script:Warnings.Count))", @($(if ($script:Warnings.Count) { $script:Warnings | ForEach-Object { "  ! $_" } } else { "  none" })), "",
    "THE PAID REPORT ADDS", "  the BIOS checklist for $($m.board) ($($m.bios)), the GPU control-panel settings, and the competitive settings for each game found.", "  omnidx.net - one payment, one PC, undo in one line."
  )
  $flat = @(); foreach ($l in $lines) { if ($l -is [array]) { $flat += $l } else { $flat += $l } }
  Set-Content -Path $rep -Value $flat -Encoding UTF8
  Say ("  Saved: {0}" -f $rep)
  try { Start-Process notepad.exe $rep } catch { }
}

function Invoke-Undo {
  $u = Join-Path $script:Root 'undo\undo.ps1'
  if (-not (Test-Path $u)) { Say "Nothing to undo: no run recorded in C:\OmniDx\undo." 'Yellow'; return }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $u
}

function Main {
  Write-Host ''
  Write-Host '  OmniDx Tune' -ForegroundColor Magenta -NoNewline; Write-Host ("  v{0}" -f $script:Version) -ForegroundColor DarkGray
  Write-Host '  200 processes. Under 100. One run.' -ForegroundColor DarkGray
  Write-Host ''

  if ($PSVersionTable.PSEdition -eq 'Core') { Say "  Run this in Windows PowerShell (the blue one, version 5.1), not PowerShell 7: the restore point and Store app commands only exist there. The one command on omnidx.net picks the right one for you." 'Red'; return }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { Say "  Run this in an administrator PowerShell (right-click PowerShell > Run as administrator), or use the one-liner on omnidx.net which does it for you." 'Red'; return }
  if ([Environment]::OSVersion.Version.Major -lt 10) { Say "  Windows 10 or 11 only." 'Red'; return }

  New-Item -ItemType Directory -Path $script:Root -Force | Out-Null
  try { Start-Transcript -Path (Join-Path $script:Root ("log-{0}.txt" -f $script:Stamp)) -Append -ErrorAction Stop | Out-Null } catch { }
  try {
    if ($Undo) { Invoke-Undo; return }
    Resolve-User

    Head "Reading this PC"
    $m = Get-Machine
    # Windows Server is refused: it is not what this is for. The one exception is
    # the check that runs on a Windows Server build machine, in report mode.
    if ($m.os -match 'Server' -and -not $env:OMNIDX_ALLOW_SERVER) { Say "  This is Windows Server. The tune is for Windows 10 and 11." 'Red'; return }
    if ($m.build -lt 18362) { Say "  Windows 10 version 1903 or newer is needed. Update Windows first." 'Red'; return }
    Show-Machine $m
    Show-Advice $m
    try { $m | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $script:Root ("machine-{0}.json" -f $script:Stamp)) -Encoding UTF8 } catch { }
    $before = Get-ProcessCount
    Say ("  Processes running now: {0}" -f $before) 'White'
    Say ("  Target for this PC after the tune and a restart: about {0}" -f (Get-SafeBar $m)) 'White'
    if ($Report) { Write-Preview $m $before; return }

    Head "Your key"
    if (-not $Key) { $Key = Read-Host "  Paste your key (from the page after you paid)" }
    $parsed = Read-Key $Key
    if (-not $parsed) { Say "  That is not an OmniDx key. It looks like TUNE-XXXX-XXXX-XXXX-XXXX; check it for typos, or get it again at omnidx.net/studio/activate/." 'Red'; return }
    $hwid = Get-Hwid
    $machine = @{ cpu = $m.cpu; gpu = $m.gpu; board = $m.board; os = $m.os; name = $m.name; version = $script:Version }
    if (-not (Test-Licence $parsed $hwid $machine)) { return }

    if ($m.domain) {
      Warn "This PC is joined to a domain (a work or school machine). Group policy can put settings back, and IT may have opinions."
      if (-not (Ask "Carry on anyway?")) { Say "  Stopped. Nothing changed."; return }
    }
    if (Test-PendingReboot) {
      Warn "Windows has an update waiting for a restart. Changing services under a pending update is asking for trouble."
      if (Ask "Restart now, then run the command again afterwards? (recommended)") { Restart-Computer -Force; return }
    }

    Say ""
    Say "  What happens next: a restore point, a backup, then the cut. Nothing that lowers security. Undo is one file." 'White'
    Say "  It will ask which startup apps to leave on, and offer to close Discord and Spotify so they can be tuned." 'White'
    if (-not (Ask "Go?")) { Say "  Stopped. Nothing changed."; return }

    Save-ProcessList 'before'
    New-Safety
    Cut-Startup
    Cut-Services $m
    Cut-Tasks
    Cut-Apps $m
    Cut-Telemetry $m
    Tune-System $m
    New-PowerPlan $m
    Tune-Network $m
    Tune-Apps $m
    Set-GameProfiles
    Tune-Gpu $m
    Set-Vbs $m
    Register-AfterCount

    $changesFile = Save-Changes
    $after = Get-ProcessCount
    Save-ProcessList 'after'
    $rep = Write-Report $m $before $after $changesFile

    Head "Done"
    Say ("  Processes: {0} -> {1} now, in {2} seconds. Restart for the real number: the services that were told to stop are still unwinding." -f $before, $after, [int]$script:Timer.Elapsed.TotalSeconds) 'Green'
    Say ("  Report, BIOS checklist and per-game settings: {0}" -f $rep) 'White'
    Say "  Undo, any time: powershell -ExecutionPolicy Bypass -File C:\OmniDx\undo\undo.ps1" 'White'
    Say "  Next: restart, then do the BIOS checklist - the memory profile alone is worth more than half of this." 'White'
    try { Start-Process notepad.exe $rep } catch { }
    if (Ask "Restart now?") { Restart-Computer -Force }
  } finally {
    try { Stop-Transcript | Out-Null } catch { }
  }
}

Main
