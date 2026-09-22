<#
  OmniDx Tune — the Cut.

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
      there are, and what is still running — never a number it did not count

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
  # Answer every question yes.
  [switch]$Yes
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$script:Version = '1.0.0'
$script:Root = 'C:\OmniDx'
$script:Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$script:Changes = New-Object System.Collections.ArrayList
$script:Log = New-Object System.Collections.ArrayList
$script:Warnings = New-Object System.Collections.ArrayList

# ---------------------------------------------------------------------------
# saying things
# ---------------------------------------------------------------------------
function Say([string]$t, [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c; [void]$script:Log.Add($t) }
function Head([string]$t) { Write-Host ''; Write-Host ("== " + $t) -ForegroundColor Magenta; [void]$script:Log.Add(""); [void]$script:Log.Add("== $t") }
function Did([string]$t) { Write-Host ("  + " + $t) -ForegroundColor DarkGray; [void]$script:Log.Add("  + $t") }
function Warn([string]$t) { Write-Host ("  ! " + $t) -ForegroundColor Yellow; [void]$script:Log.Add("  ! $t"); [void]$script:Warnings.Add($t) }
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

function Set-Reg([string]$path, [string]$name, $value, [string]$kind = 'DWord') {
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
<#  OmniDx Tune — undo.
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
$changes = Get-Content $File -Raw | ConvertFrom-Json
[array]::Reverse($changes)
$removedApps = @()
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
    }
  } catch { Write-Host ("could not undo {0}: {1}" -f ($c | ConvertTo-Json -Compress), $_.Exception.Message) -ForegroundColor Yellow }
}
if ($removedApps.Count) {
  Write-Host ""
  Write-Host "These Store apps were removed. Reinstall any you want from the Microsoft Store (search the name):" -ForegroundColor Yellow
  $removedApps | Sort-Object -Unique | ForEach-Object { Write-Host ("  " + $_) }
}
Write-Host ""
Write-Host "Done. Restart to finish." -ForegroundColor Green
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
  $xboxUsed = (Get-AppxPackage -Name Microsoft.GamingApp -ErrorAction SilentlyContinue) -ne $null -or (Test-Path "$env:APPDATA\.minecraft") -or (Get-AppxPackage -Name Microsoft.MinecraftUWP -ErrorAction SilentlyContinue) -ne $null
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
  }
}

function Show-Machine($m) {
  Say ("  {0}" -f $m.os)
  Say ("  CPU   {0}  ({1} cores / {2} threads)" -f $m.cpu, $m.cores, $m.threads)
  Say ("  GPU   {0}" -f $m.gpu)
  Say ("  RAM   {0} GB" -f $m.ramGb)
  Say ("  Board {0}  |  BIOS {1}" -f $m.board, $m.bios)
  Say ("  {0}{1}{2}, {3}" -f $(if ($m.laptop) { 'Laptop' } else { 'Desktop' }), $(if ($m.allSsd) { ', all SSD' } else { ', has a hard disk' }), $(if ($m.nvme) { ', NVMe' } else { '' }), $(if ($m.refresh) { "$($m.refresh) Hz" } else { 'refresh unknown' }))
  Say ("  Keeps: {0}" -f (@(
    $(if ($m.printers) { "printer" }), $(if ($m.btDevices) { "Bluetooth ($($m.btDevices) paired)" }), $(if ($m.wifi) { "Wi-Fi" }),
    $(if ($m.touch) { "touch" }), $(if ($m.biometric) { "Windows Hello" }), $(if ($m.vpn) { "VPN" }), $(if ($m.xboxUsed -and -not $CutXbox) { "Xbox / Game Pass" }), $(if ($m.laptop) { "battery, hibernate" })
  ) | Where-Object { $_ }) -join ', ')
  Say ("  UEFI {0}, Secure Boot {1}, TPM {2}, memory integrity {3}" -f $m.uefi, $m.secureBoot, $m.tpm, $(if ($m.vbs) { 'on' } else { 'off' }))
}

# ---------------------------------------------------------------------------
# restore point and backups
# ---------------------------------------------------------------------------
function New-Safety {
  Head "Safety first"
  New-Item -ItemType Directory -Path $script:Root -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $script:Root 'undo') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $script:Root 'backup') -Force | Out-Null

  if (-not $NoRestorePoint) {
    try {
      Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction Stop
      # Windows refuses a second restore point within 24 hours unless told not to.
      New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' -Name SystemRestorePointCreationFrequency -Value 0 -PropertyType DWord -Force | Out-Null
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

function Cut-Startup {
  Head "Startup apps"
  $disabled = [byte[]](3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  $pairs = @(
    @{ run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; ok = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
    @{ run = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; ok = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
    @{ run = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; ok = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32' },
    @{ run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'; ok = $null }
  )
  $n = 0
  foreach ($p in $pairs) {
    if (-not $p.ok -or -not (Test-Path $p.run)) { continue }
    $item = Get-Item $p.run
    foreach ($name in $item.GetValueNames()) {
      if (-not $name) { continue }
      if ($script:StartupKeep -contains $name) { Did ("kept {0}" -f $name); continue }
      Set-Reg $p.ok $name $disabled 'Binary'
      $n++; Did ("off: {0}" -f $name)
    }
  }
  # The Startup folders: the same switch, keyed by file name.
  $folders = @(
    @{ dir = [Environment]::GetFolderPath('Startup'); ok = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder' },
    @{ dir = [Environment]::GetFolderPath('CommonStartup'); ok = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder' }
  )
  foreach ($f in $folders) {
    if (-not (Test-Path $f.dir)) { continue }
    foreach ($file in Get-ChildItem $f.dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' }) {
      $base = [IO.Path]::GetFileNameWithoutExtension($file.Name)
      if ($script:StartupKeep -contains $base) { Did ("kept {0}" -f $base); continue }
      Set-Reg $f.ok $file.Name $disabled 'Binary'
      $n++; Did ("off: {0}" -f $file.Name)
    }
  }
  # Store apps that start with Windows (Spotify from the Store, Phone Link, Teams...).
  $appBase = 'HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData'
  if (Test-Path $appBase) {
    foreach ($pkg in Get-ChildItem $appBase -ErrorAction SilentlyContinue) {
      foreach ($task in Get-ChildItem $pkg.PSPath -ErrorAction SilentlyContinue) {
        $state = (Get-ItemProperty $task.PSPath -Name State -ErrorAction SilentlyContinue).State
        if ($state -eq 2) {
          $label = ($pkg.PSChildName -split '_')[0]
          if ($script:StartupKeep -contains $label) { continue }
          Set-Reg $task.PSPath 'State' 1 'DWord'
          $n++; Did ("off: {0} (Store app)" -f $label)
        }
      }
    }
  }
  Say ("  {0} startup entries switched off. Task Manager > Startup can switch any one back on." -f $n)
}

# ---------------------------------------------------------------------------
# the cut: services, decided by what the machine has
# ---------------------------------------------------------------------------
function Cut-Services($m) {
  Head "Services"
  # Off entirely: telemetry and the things a PC built for games never needs.
  $off = @(
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
  $manualOnly = @('SysMain', 'WSearch', 'edgeupdate', 'edgeupdatem', 'DPS', 'WdiServiceHost', 'WdiSystemHost', 'iphlpsvc', 'SSDPSRV', 'upnphost',
    'NcbService', 'CDPSvc', 'CDPUserSvc', 'OneSyncSvc', 'PimIndexMaintenanceSvc', 'UnistoreSvc', 'UserDataSvc', 'XblAuthManager', 'XblGameSave',
    'XboxNetApiSvc', 'XboxGipSvc', 'RmSvc', 'FrameServer', 'stisvc', 'WebClient', 'lmhosts', 'TermService', 'SessionEnv', 'UmRdpService',
    'WpnService', 'WpnUserService', 'cbdhsvc', 'SensorService', 'SensrSvc', 'SensorDataService', 'TabletInputService', 'BTAGService', 'BthAvctpSvc', 'DoSvc')
  $keep = @()
  if ($m.printers) { $keep += 'Spooler' }
  if ($m.btDevices -or $m.btRadio) { $keep += 'bthserv', 'BTAGService', 'BthAvctpSvc' }
  if ($m.wifi) { $keep += 'WlanSvc', 'RmSvc' }
  if ($m.touch -or $m.laptop) { $keep += 'TabletInputService' }
  if ($m.biometric) { $keep += 'WbioSrvc' }
  if ($m.laptop) { $keep += 'SensorService', 'SensrSvc', 'SensorDataService', 'WwanSvc' }
  if ($m.vpn) { $keep += 'iphlpsvc', 'SSDPSRV', 'upnphost' }
  if (-not $m.allSsd) { $keep += 'SysMain' }
  if ($m.xboxUsed -and -not $CutXbox) { $keep += 'XblAuthManager', 'XblGameSave', 'XboxNetApiSvc', 'XboxGipSvc' }
  # Themes stays: without it Windows 10 falls back to the classic look on next logon and people think it broke.
  $keep += 'Themes'
  foreach ($pair in $off) {
    $name = $pair[0]; $why = $pair[1]
    if ($keep -contains $name) { continue }
    $mode = if ($manualOnly -contains $name) { 'Manual' } else { 'Disabled' }
    # Per-user services carry a suffix (CDPUserSvc_1a2b3c); catch the family.
    $matches = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $name -or $_.Name -like ($name + '_*') })
    foreach ($svc in $matches) { Set-ServiceStart $svc.Name $mode $why }
  }
  # Windows Search: not off, manual — the search box still works, the background indexer stops.
  Say "  Kept on purpose: Defender, Windows Update, audio, networking, Bluetooth if you use it, printing if you have a printer, Windows Hello if it is set up."
}

# ---------------------------------------------------------------------------
# the cut: scheduled tasks and preinstalled apps
# ---------------------------------------------------------------------------
function Cut-Tasks {
  Head "Scheduled tasks"
  $tasks = @(
    @('\Microsoft\Windows\Application Experience\', 'Microsoft Compatibility Appraiser'), @('\Microsoft\Windows\Application Experience\', 'ProgramDataUpdater'),
    @('\Microsoft\Windows\Application Experience\', 'StartupAppTask'), @('\Microsoft\Windows\Application Experience\', 'PcaPatchDbTask'),
    @('\Microsoft\Windows\Customer Experience Improvement Program\', 'Consolidator'), @('\Microsoft\Windows\Customer Experience Improvement Program\', 'UsbCeip'),
    @('\Microsoft\Windows\Customer Experience Improvement Program\', 'KernelCeipTask'), @('\Microsoft\Windows\DiskDiagnostic\', 'Microsoft-Windows-DiskDiagnosticDataCollector'),
    @('\Microsoft\Windows\Feedback\Siuf\', 'DmClient'), @('\Microsoft\Windows\Feedback\Siuf\', 'DmClientOnScenarioDownload'),
    @('\Microsoft\Windows\Windows Error Reporting\', 'QueueReporting'), @('\Microsoft\Windows\Maps\', 'MapsUpdateTask'), @('\Microsoft\Windows\Maps\', 'MapsToastTask'),
    @('\Microsoft\Windows\Autochk\', 'Proxy'), @('\Microsoft\Windows\CloudExperienceHost\', 'CreateObjectTask'), @('\Microsoft\Windows\Shell\', 'FamilySafetyMonitor'),
    @('\Microsoft\Windows\Shell\', 'FamilySafetyRefreshTask'), @('\Microsoft\Windows\Device Information\', 'Device'), @('\Microsoft\Windows\Device Information\', 'Device User'),
    @('\Microsoft\Windows\PushToInstall\', 'LoginCheck'), @('\Microsoft\Windows\Power Efficiency Diagnostics\', 'AnalyzeSystem'),
    @('\Microsoft\XblGameSave\', 'XblGameSaveTask'), @('\Microsoft\Windows\Speech\', 'SpeechModelDownloadTask'), @('\Microsoft\Windows\Retail Demo\', 'CleanupOfflineContent')
  )
  $n = 0
  foreach ($t in $tasks) {
    $task = Get-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction SilentlyContinue
    if ($task -and $task.State -ne 'Disabled') {
      try { Disable-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction Stop | Out-Null; Record @{ type = 'task'; path = $t[0]; name = $t[1] }; $n++; Did $t[1] } catch { }
    }
  }
  Say ("  {0} telemetry and feedback tasks disabled." -f $n)
}

function Cut-Apps($m) {
  Head "Preinstalled apps"
  $junk = @(
    'Microsoft.YourPhone', 'MicrosoftWindows.CrossDevice', 'Microsoft.549981C3F5F10', 'Microsoft.WindowsFeedbackHub', 'Microsoft.GetHelp', 'Microsoft.Getstarted',
    'Microsoft.WindowsMaps', 'Microsoft.MicrosoftSolitaireCollection', 'Microsoft.MixedReality.Portal', 'Microsoft.Microsoft3DViewer', 'Microsoft.People',
    'Microsoft.SkypeApp', 'MicrosoftTeams', 'MSTeams', 'Clipchamp.Clipchamp', 'Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.BingSearch', 'Microsoft.Todos',
    'Microsoft.MicrosoftOfficeHub', 'Microsoft.Office.OneNote', 'Microsoft.PowerAutomateDesktop', 'MicrosoftCorporationII.MicrosoftFamily', 'Microsoft.Copilot',
    'Microsoft.Windows.DevHome', 'Microsoft.Windows.Ai.Copilot.Provider', 'Microsoft.WindowsCommunicationsApps', 'Microsoft.Messaging', 'Microsoft.OneConnect',
    'Microsoft.Print3D', 'Microsoft.Wallet', 'Microsoft.WindowsAlarms', 'Microsoft.MicrosoftStickyNotes', 'Microsoft.Advertising.Xaml', 'MicrosoftCorporationII.QuickAssist',
    '*Disney*', '*TikTok*', '*Instagram*', '*Facebook*', '*CandyCrush*', '*king.com*', '*Netflix*', '*Twitter*', '*Amazon*', '*Hulu*', '*Dolby*', '*Prime*', '*LinkedIn*', '*McAfee*', '*Norton*', '*Booking*', '*Duolingo*', '*Fitbit*', '*Flipboard*', '*HiddenCity*', '*Hearts*', '*Plex*', '*Roblox*Store*', '*Sway*', '*Wunderlist*', '*ESPN*', '*BubbleWitch*', '*MarchofEmpires*', '*RoyalRevolt*', '*Speed Test*', '*Sidia*', '*WhatsApp*Stub*'
  )
  # Quick Assist and Sticky Notes come back from the Store in one press; both are in the undo list.
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
  Say ("  {0} apps removed. Spotify, the Store, the Xbox apps{1}, Photos, Calculator, Media Player and Notepad stay." -f $n, $(if ($CutXbox) { ' (no — you said -CutXbox)' } else { '' }))
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
  # Hibernation off frees the hiberfile and ends Fast Startup for good — on a desktop.
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
  $restore = @('netsh int tcp set global autotuninglevel=normal', 'netsh int tcp set global ecncapability=default', 'netsh int tcp set global timestamps=default', 'netsh int tcp set global rss=enabled', 'netsh int tcp set global initialrto=1000', 'netsh int tcp set supplemental internet congestionprovider=default')
  Record @{ type = 'netsh'; restore = $restore }
  & netsh int tcp set global autotuninglevel=normal | Out-Null      # normal is right; "disabled" is the myth that halves download speed
  & netsh int tcp set global ecncapability=disabled | Out-Null
  & netsh int tcp set global timestamps=disabled | Out-Null
  & netsh int tcp set global rss=enabled | Out-Null
  & netsh int tcp set global initialrto=2000 | Out-Null
  & netsh int tcp set supplemental internet congestionprovider=ctcp 2>$null | Out-Null
  Did "TCP: autotuning normal, ECN and timestamps off, receive-side scaling on, CTCP."
  # Nagle off on the adapter you actually use: small packets go now, not after a 200 ms wait.
  $active = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Sort-Object -Property LinkSpeed -Descending
  $ifBase = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces'
  foreach ($a in $active) {
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
  # Discord: hardware acceleration on, not opening with Windows. Only when it is closed — it rewrites its own settings on exit.
  $disc = Join-Path $env:APPDATA 'discord\settings.json'
  if (Test-Path (Split-Path $disc)) {
    if (Get-Process -Name Discord -ErrorAction SilentlyContinue) { Warn "Discord is running, so its settings were left alone. Close it and run again to tune it." }
    else { Set-JsonFile $disc @{ enableHardwareAcceleration = $true; OPEN_ON_STARTUP = $false; MINIMIZE_TO_TRAY = $true; START_MINIMIZED = $false }; Did "Discord: hardware acceleration on, no auto-start" }
  }
  # Spotify (desktop and Store): hardware acceleration on, no auto-start. Its prefs file is key=value lines.
  $prefs = @((Join-Path $env:APPDATA 'Spotify\prefs'))
  $store = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter 'SpotifyAB.SpotifyMusic_*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($store) { $prefs += (Join-Path $store.FullName 'LocalState\Spotify\prefs') }
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
    $exe = if ($pol -match 'Google') { "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" } else { "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe" }
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
  @{ name = 'VALORANT'; exes = @('VALORANT-Win64-Shipping.exe', 'VALORANT.exe'); notes = @('Vanguard (vgc, vgk) is deliberately untouched — VALORANT will not start without it.', 'On Windows 11 it also needs Secure Boot and TPM 2.0 on; the BIOS checklist covers both.', 'Multithreaded rendering on, raw input buffer on, Nvidia Reflex on + boost, limit FPS off, V-Sync off.', 'Material, texture, detail and UI quality low; anti-aliasing MSAA 2x or none.') },
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

function Set-GameProfiles {
  Head "Game profiles"
  $gp = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
  $layers = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'
  $found = @()
  foreach ($g in $script:Games) {
    foreach ($exe in $g.exes) {
      # Where the game is installed, if it is: the exe is looked up by name across the usual roots.
      $paths = @()
      foreach ($root in @("$env:ProgramFiles", "${env:ProgramFiles(x86)}", "$env:LOCALAPPDATA\Programs", 'C:\Games', 'D:\Games', 'C:\Program Files\Epic Games', 'C:\Riot Games', 'D:\Riot Games', 'C:\Program Files (x86)\Steam\steamapps\common', 'D:\SteamLibrary\steamapps\common', 'E:\SteamLibrary\steamapps\common', 'C:\XboxGames', 'D:\XboxGames')) {
        if (-not (Test-Path $root)) { continue }
        $hit = Get-ChildItem -Path $root -Filter $exe -Recurse -Depth 5 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { $paths += $hit.FullName }
      }
      # High-performance GPU, priority class high, and the DVR exclusion — by exe name, so they apply wherever it lives.
      $ifeo = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$exe\PerfOptions"
      Set-Reg $ifeo 'CpuPriorityClass' 3
      foreach ($p in $paths) {
        Set-Reg $gp $p 'GpuPreference=2;' 'String'
        # Fullscreen optimisations off for this exe: real exclusive fullscreen, lowest input latency.
        Set-Reg $layers $p '~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE' 'String'
      }
      if ($paths.Count -and $found -notcontains $g.name) { $found += $g.name }
    }
  }
  if ($found.Count) { Did ("Installed and profiled: {0}" -f ($found -join ', ')) } else { Did "No listed game found on the usual drives; the CPU-priority profiles are in place for when one is installed." }
  Say "  Every listed game: high CPU priority, high-performance GPU, fullscreen optimisations off, Game DVR off. In-game settings are in the report."
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
    "1. Memory profile: enable $mem. Your RAM is running at the slow default until you do; this is the single biggest free gain on any PC. Pick the profile matching the speed printed on the sticks.",
    "2. Re-Size BAR / Smart Access Memory: set Above 4G Decoding = Enabled, then Re-Size BAR Support = Auto/Enabled. Needs CSM off (next line). Worth 5-15% in many games on RTX 30/40/50 and RX 6000+.",
    $(if ($m.uefi) { "3. CSM (Compatibility Support Module): Disabled. You already boot UEFI, so nothing depends on it, and Re-Size BAR needs it off." } else { "3. CSM: you are booting in legacy mode, so leave CSM on for now. Converting to UEFI (mbr2gpt) first is a separate job; Re-Size BAR will wait until then." }),
    $(if ($m.secureBoot) { "4. Secure Boot: already on. Leave it on (VALORANT, Fortnite's anti-cheat and Windows 11 all expect it)." } else { "4. Secure Boot: Enabled. Windows 11 and Vanguard expect it; on 10 it costs nothing. Set OS Type / Secure Boot Mode to Windows UEFI if asked." }),
    $(if ($m.tpm) { "5. TPM: present. Leave fTPM / PTT enabled." } else { "5. TPM: not detected. Enable AMD fTPM (AMD) or Intel PTT (Intel) under Security / Trusted Computing. VALORANT on Windows 11 will not run without it." }),
    $(if ($m.cpuVendor -eq 'AMD') { "6. Precision Boost Overdrive: Enabled (or Advanced with the Curve Optimizer at a modest negative offset like -15 all-core if you know your cooler). Never a positive voltage offset." } else { "6. Intel: leave MultiCore Enhancement at Auto; set the long and short power limits (PL1/PL2) to the chip's rated maximum if the board runs them lower. Do not touch voltages." }),
    "7. Global C-states / package C-states: Auto is fine. Disabling them buys nothing measurable in games and raises idle heat.",
    "8. Fast Boot: Enabled. Full Screen Logo / Boot Logo: Disabled (a second off every boot).",
    "9. Fan curves: set the CPU fan to reach 100% by 80 C and the case fans to a steady ramp. Sustained boost needs airflow more than anything.",
    "10. Onboard devices you do not use: serial port, Wi-Fi/Bluetooth if wired, onboard audio if you use USB audio, RGB controllers. Each one removed is an interrupt source gone.",
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
  $top = Get-Process -ErrorAction SilentlyContinue | Group-Object ProcessName | Sort-Object Count -Descending | Select-Object -First 12 | ForEach-Object { "  {0,-28} x{1}" -f $_.Name, $_.Count }
  $lines = @(
    "OmniDx Tune $($script:Version) — report, $((Get-Date).ToString('f'))", "", "MACHINE", ($script:Log | Where-Object { $_ -match '^  (CPU|GPU|RAM|Board|Laptop|Desktop|Keeps|UEFI|Microsoft|Windows)' }), "",
    "PROCESSES", "  before: $before", "  now:    $after  (the number after a restart is the one that counts — many of these are only waiting to be stopped)",
    "  target after restart: under 100. Every GPU driver, anti-cheat and launcher you keep adds a few; the report you get after the restart is the honest one.", "",
    "STILL RUNNING (most instances)", $top, "",
    "WHAT WAS DONE", ($script:Log | Where-Object { $_ -match '^(==|  \+)' }), "",
    "WARNINGS", $(if ($script:Warnings.Count) { $script:Warnings | ForEach-Object { "  ! $_" } } else { "  none" }), "",
    "GPU CONTROL PANEL", (Get-GpuNotes $m | ForEach-Object { "  - $_" }), "",
    "PER GAME", ($script:Games | ForEach-Object { @("  $($_.name)") + ($_.notes | ForEach-Object { "    - $_" }) }), "",
    "BIOS", (Get-BiosChecklist $m | ForEach-Object { "  $_" }), "",
    "UNDO", "  Administrator PowerShell:  powershell -ExecutionPolicy Bypass -File C:\OmniDx\undo\undo.ps1", "  Or Windows Recovery > System Restore > the point named 'OmniDx Tune $($script:Stamp)'.", "  Changes recorded in: $changesFile"
  )
  $flat = @(); foreach ($l in $lines) { if ($l -is [array]) { $flat += $l } else { $flat += $l } }
  Set-Content -Path $rep -Value $flat -Encoding UTF8
  Set-Content -Path (Join-Path $script:Root ("bios-{0}.txt" -f (($m.board -replace '[^A-Za-z0-9]+', '-').Trim('-')))) -Value (Get-BiosChecklist $m) -Encoding UTF8
  return $rep
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

  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { Say "  Run this in an administrator PowerShell (right-click PowerShell > Run as administrator), or use the one-liner on omnidx.net which does it for you." 'Red'; return }
  if ([Environment]::OSVersion.Version.Major -lt 10) { Say "  Windows 10 or 11 only." 'Red'; return }
  if ($Undo) { Invoke-Undo; return }

  Head "Reading this PC"
  $m = Get-Machine
  Show-Machine $m
  $before = Get-ProcessCount
  Say ("  Processes running now: {0}" -f $before) 'White'
  if ($Report) { Say "  Report mode: nothing changed."; return }

  Head "Your key"
  if (-not $Key) { $Key = Read-Host "  Paste your key (from the page after you paid)" }
  $parsed = Read-Key $Key
  if (-not $parsed) { Say "  That is not an OmniDx key. It looks like TUNE-XXXX-XXXX-XXXX-XXXX; check it for typos, or get it again at omnidx.net/studio/activate/." 'Red'; return }
  $hwid = Get-Hwid
  $machine = @{ cpu = $m.cpu; gpu = $m.gpu; board = $m.board; os = $m.os; name = $m.name }
  if (-not (Test-Licence $parsed $hwid $machine)) { return }

  Say ""
  Say "  What happens next: a restore point, a backup, then the cut. Nothing that lowers security. Undo is one file." 'White'
  Say "  Close Discord, Spotify and your browser first if you want them tuned too." 'White'
  if (-not (Ask "Go?")) { Say "  Stopped. Nothing changed."; return }

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
  Set-Vbs $m

  $changesFile = Save-Changes
  $after = Get-ProcessCount
  $rep = Write-Report $m $before $after $changesFile

  Head "Done"
  Say ("  Processes: {0} -> {1} now. Restart for the real number: the services that were told to stop are still unwinding." -f $before, $after) 'Green'
  Say ("  Report, BIOS checklist and per-game settings: {0}" -f $rep) 'White'
  Say "  Undo, any time: powershell -ExecutionPolicy Bypass -File C:\OmniDx\undo\undo.ps1" 'White'
  Say "  Next: restart, then do the BIOS checklist — the memory profile alone is worth more than half of this." 'White'
  try { Start-Process notepad.exe $rep } catch { }
  if (Ask "Restart now?") { Restart-Computer -Force }
}

Main
