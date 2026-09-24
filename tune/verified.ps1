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
  # The licence server. When not given, read from omnidx.net/tune/config.json. A first run needs it: nothing else can vouch for a key.
  [string]$Api = $env:OMNIDX_API,
  # Also switch memory integrity (VBS / HVCI) off. More frames, less security. Asked about first.
  [switch]$Aggressive,
  # Remove the Xbox apps and set their services to manual. Off by default: Game Pass and Minecraft need them.
  [switch]$CutXbox,
  # Extreme (caution): the standard tune plus every extra service, Game Bar entirely, animations and transparency,
  # the taskbar search box, notification toasts and badges, multi-plane overlay, memory compression, SysMain on SSDs,
  # Windows Search, the dynamic tick, and the Xbox pieces unless Game Pass or Minecraft is in use. A few more frames and
  # steadier lows for fewer conveniences. Asked about first; recorded and undone like everything else.
  [switch]$Extreme,
  # Startup entries to leave enabled, by the name Task Manager shows (e.g. -Keep 'Wallpaper Engine','RTSS').
  [string[]]$Keep = @(),
  # Point DNS at Cloudflare (1.1.1.1). Off by default; your router's DNS is usually fine.
  [switch]$Dns,
  # Skip the restore point. Only sensible if System Restore is broken on this machine.
  [switch]$NoRestorePoint,
  # Put everything back from the last run and stop.
  [switch]$Undo,
  # Put back only the newest run (the Extreme one, say) and leave the earlier runs and the keep task in place.
  [switch]$UndoLast,
  # Read the machine and count the processes. Change nothing.
  [switch]$Report,
  # Check a key's format and checksum, then stop. Nothing is read or bound.
  [switch]$CheckKey,
  # Say what is still in place from earlier runs, what Windows has put back and when the keep task last ran. Changes nothing.
  [switch]$Status,
  # Do not leave the small sign-in task that puts the tune back after a Windows update turns pieces of it on again.
  [switch]$NoKeep,
  # Zip the logs, the machine as read, the numbers and the change records to the desktop for support. No key, no registry exports, none of your files.
  [switch]$SupportBundle,
  # Do not leave the one-shot task that writes the after-restart process count.
  [switch]$NoAfterCount,
  # Answer every question yes.
  [switch]$Yes,
  # Phases to leave out, by name: startup services tasks apps debloat telemetry
  # system power network programs games nvidia cleanup keep. The app uses this.
  [string[]]$Skip = @(),
  # Never restart or offer to. The app has its own button for that.
  [switch]$NoRestart,
  # Open the window instead of the console flow.
  [switch]$Gui,
  # With -Gui: render the window to this PNG without showing it, then stop.
  [string]$Screenshot,
  # Read the PC and print one JSON line for the app: machine, startup entries, counts.
  [switch]$Probe,
  # Print how much of itself the script can see (the app needs its own text).
  [switch]$SelfTest
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$script:Version = '1.68.0'
$script:Root = 'C:\OmniDx'
# To the second: two runs inside one minute (a refusal, then a retry) once shared a stamp, and the second's
# record would have overwritten the first's, taking its undo with it.
$script:Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$script:Changes = New-Object System.Collections.ArrayList
$script:Log = New-Object System.Collections.ArrayList
$script:Warnings = New-Object System.Collections.ArrayList
$script:Kept = New-Object System.Collections.ArrayList
$script:RestorePointMade = $false
$script:GamesFound = New-Object System.Collections.ArrayList
$script:ExtremeDeclined = $false
$script:Timer = [System.Diagnostics.Stopwatch]::StartNew()
# The window runs the work in a second PowerShell instance, which needs this
# script's text. From a file that is the file; from memory (the one command)
# it is the scriptblock the bootstrapper made.
$script:SelfText = ''
try { $script:SelfText = [string]$MyInvocation.MyCommand.ScriptBlock } catch { }
if ((-not $script:SelfText -or $script:SelfText.Length -lt 1000) -and $PSCommandPath -and (Test-Path $PSCommandPath)) { $script:SelfText = Get-Content $PSCommandPath -Raw }
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
function Plural([int]$n, [string]$one, [string]$many) { if ($n -eq 1) { return "$n $one" } else { return "$n $many" } }
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

<# 32-bit FNV-1a, the same four lines as tunekey.js, worker.js and
   make-tune-key.py. PowerShell turns an overflowing product into a double
   and loses the low bits, so the multiply is done exactly with BigInteger
   and cut back to 32 bits. #>
function Get-Fnv1a([string]$s) {
  [long]$h = 2166136261
  foreach ($ch in $s.ToCharArray()) {
    $h = $h -bxor [long][int]$ch
    $h = [long](([bigint]$h * [bigint]16777619) % [bigint]4294967296)
  }
  return $h
}

function Get-KeyChecksum([string]$tag, [string]$payload) {
  [long]$h = Get-Fnv1a ("{0}:{1}:{2}" -f $script:KeySalt, $tag, $payload)
  $out = ''
  for ($i = 0; $i -lt 4; $i++) {
    $out += $script:Alphabet[[int]($h % 32)]
    $h = [long][math]::Floor($h / 32) + [long]($h % 7)
  }
  return $out
}

<# TUNE-XXXX-XXXX-XXXX-CCCC is one PC (a Squad order is three of them); the
   older SQUAD-XXXX-XXXX-XXXX-CCCC tag is three PCs on one key, still read. The
   last block is a checksum, so a mistyped key is caught here rather than on
   the server. The server is what makes a key real. #>
function Read-Key([string]$raw) {
  $c = ($raw -replace '[^A-Za-z0-9]', '').ToUpperInvariant()
  if ($c -match '^(TUNE|SQUAD)([A-Z0-9]{12})([A-Z0-9]{4})$') {
    $tag = $Matches[1]; $payload = $Matches[2]; $sum = $Matches[3]
    foreach ($ch in $payload.ToCharArray()) { if ($script:Alphabet.IndexOf($ch) -lt 0) { return $null } }
    if ((Get-KeyChecksum $tag $payload) -ne $sum) { return $null }
    $seats = if ($tag -eq 'SQUAD') { 3 } else { 1 }
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

<# The server's view of a key, for status and the key check: issued or not,
   switched off by a refund or not, and on how many PCs. The server comes
   from -Api or from config.json; with neither, nothing is asked. #>
function Get-ServerView([string]$key) {
  $api = $Api
  if (-not $api) {
    try {
      $web = New-Object System.Net.WebClient; $web.Headers['User-Agent'] = 'OmniDxTune/script'
      $cfg = $web.DownloadString('https://omnidx.net/tune/config.json?v=' + [DateTime]::UtcNow.Ticks) | ConvertFrom-Json
      if ($cfg.api) { $api = [string]$cfg.api }
    } catch { }
  }
  if (-not $api) { return $null }
  try {
    $r = Invoke-RestMethod -Method Post -Uri ("{0}/v1/tune/check" -f $api.TrimEnd('/')) -ContentType 'application/json' -Body (@{ key = $key } | ConvertTo-Json -Compress) -TimeoutSec 15
    if ($r.ok) { return ("issued; on {0} of {1} PC{2}" -f $r.used, $r.seats, $(if ($r.seats -ne 1) { 's' } else { '' })) }
    return [string]$r.reason
  } catch { return $null }
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
      Say ("  The licence server did not accept the key: {0}. Nothing has changed on this PC. If it keeps happening, email support with your Square receipt." -f $msg) 'Red'
      return $false
    }
  }

  # No server configured. A key this PC already holds from an earlier, server-checked run
  # keeps working (the server may be down, or gone); a first run has nothing to vouch for
  # the key, and stops. The checksum only catches typos; the server is what makes a key real.
  if ($local.Key -eq $parsed.key -and $local.Hwid -eq $hwid -and $local.Bound) {
    Say "  This key is already bound to this PC from an earlier run; the licence server is not configured right now, so carrying on with that." 'Yellow'
    return $true
  }
  Say "  The licence server is not switched on, so a key cannot be checked yet. Nothing has changed on this PC. If you bought a key, email support with your Square receipt." 'Red'
  return $false
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
  # One open of the key says whether it exists and what the value is now. A probe plus a thrown error for
  # every value not yet there cost the game-profile phase five of its six seconds on the build machine (1.61.0).
  $key = $null; try { $key = @(Get-Item -Path $path -ErrorAction SilentlyContinue)[0] } catch { }
  $existed = $null -ne $key
  if (-not $existed) {
    try { New-Item -Path $path -Force -ErrorAction Stop | Out-Null }
    catch { Warn ("Could not create {0} (Windows protects it): {1} left as it is." -f $path, $name); return }
  }
  $prev = $null; $had = $false
  if ($existed) {
    $vn = if ($name -eq '(default)') { '' } else { $name }
    try { if (@($key.GetValueNames()) -contains $vn) { $prev = $key.GetValue($vn); $had = $true } } catch { }
  }
  if ($had -and ($prev -is [byte[]]) -and ($value -is [byte[]])) {
    if ([System.Linq.Enumerable]::SequenceEqual([byte[]]$prev, [byte[]]$value)) { return }
  } elseif ($had -and $kind -eq 'DWord' -and ($prev -is [int] -or $prev -is [int64] -or $prev -is [uint32]) -and ($value -is [int] -or $value -is [int64] -or $value -is [uint32])) {
    if (([int64]$prev -band [int64]4294967295) -eq ([int64]$value -band [int64]4294967295)) { return }
  } elseif ($had -and "$prev" -eq "$value") { return }
  try {
    New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $kind -Force -ErrorAction Stop | Out-Null
    Record @{ type = 'reg'; path = $path; name = $name; had = $had; prev = $prev; kind = $kind; keyExisted = $existed; value = $value }
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
  # One WMI read for every service's start mode (Cut-Services fills it); a query per service cost fourteen seconds.
  $prev = $null
  if ($script:SvcModes -and $script:SvcModes.ContainsKey($name)) { $prev = $script:SvcModes[$name] }
  else { $prev = (Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue).StartMode }
  if (-not $prev) { $prev = $svc.StartType.ToString() }
  $want = switch ($start) { 'Disabled' { 'Disabled' } 'Manual' { 'Manual' } default { 'Automatic' } }
  if ($prev -eq 'Auto') { $prev = 'Automatic' }
  if ($prev -eq $want) { return }
  # A service somebody already disabled is further off than manual. Moving it to manual would let the next
  # thing that asks start it again: on the build machine, search indexing came back with eight processes that way.
  if ($prev -eq 'Disabled' -and $want -eq 'Manual') { Did ("{0} already disabled; left that way" -f $name); return }
  # The cmdlet first (in-process; one sc.exe per service was most of what was left of the phase after 1.67.0),
  # sc.exe when it refuses: some per-user templates and protected services take one and not the other.
  $set = $false
  try { Set-Service -Name $name -StartupType $want -ErrorAction Stop; $set = $true } catch { }
  if (-not $set) {
    $scStart = switch ($want) { 'Disabled' { 'disabled' } 'Manual' { 'demand' } default { 'auto' } }
    $out = & sc.exe config $name start= $scStart 2>&1
    if ($LASTEXITCODE -ne 0) { Warn ("Service {0} would not change ({1})" -f $name, (($out | Out-String).Trim() -replace '\s+', ' ')); return }
  }
  # The stop is asked for and the run moves on: waiting for each service to finish stopping was most of the
  # phase's six to ten seconds on the build machine, and the count at the end already allows for services
  # still unwinding (it says so). The keep task, unattended at sign-in, still waits.
  if ($want -ne 'Automatic' -and $svc.Status -eq 'Running') {
    try { Stop-Service -Name $name -Force -NoWait -ErrorAction Stop -WarningAction SilentlyContinue } catch { }
  }
  Record @{ type = 'service'; name = $name; prev = $prev; now = $want }
  Did ("{0} -> {1}{2}" -f $name, $want.ToLower(), $(if ($why) { "  ($why)" } else { '' }))
}

function Save-Changes {
  $dir = Join-Path $script:Root 'undo'
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $file = Join-Path $dir ("changes-{0}.json" -f $script:Stamp)
  # Always an array, and always a file: a run that found everything already done records
  # nothing, and an empty pipeline into ConvertTo-Json would write no file at all.
  $json = if ($script:Changes.Count) { ConvertTo-Json -InputObject @($script:Changes) -Depth 6 } else { '[]' }
  Set-Content -Path $file -Value $json -Encoding UTF8
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
    With no argument it walks back every run recorded here, newest first, so
    a PC tuned twice ends up as it was before the first run; each record is
    then moved to done\ so a later run starts clean. -File puts back one
    record only (the newest, for -UndoLast), moves it to done\ as well, and
    leaves the earlier runs standing. The keep task goes only when no run is
    left recorded; with runs still in place it keeps keeping them.
    Run in an administrator PowerShell:  powershell -ExecutionPolicy Bypass -File undo.ps1
#>
param([string]$File)
$ErrorActionPreference = 'Continue'
$dir = $PSScriptRoot
if ($File) { $files = @($File) }
else { $files = @(Get-ChildItem $dir -Filter 'changes-*.json' -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'changes-latest.json' } | Sort-Object Name -Descending | ForEach-Object { $_.FullName }) }
if (-not $files.Count) { Write-Host "No run recorded in $dir" -ForegroundColor Red; exit 1 }
foreach ($f in $files) { if (-not (Test-Path $f)) { Write-Host "No changes file at $f" -ForegroundColor Red; exit 1 } }
$removedApps = @()
$done = 0; $failed = 0
# DISM work (a capability or an optional feature going back) can take minutes
# each, and with Windows Update unreachable it can sit for an hour. Each gets
# a few minutes in a background job; past that it is reported, and
# Settings > Apps > Optional features finishes it later.
function Invoke-Timed([scriptblock]$work, [object[]]$argList, [int]$seconds) {
  $job = Start-Job -ScriptBlock $work -ArgumentList $argList
  if (-not (Wait-Job $job -Timeout $seconds)) { Stop-Job $job -ErrorAction SilentlyContinue; Remove-Job $job -Force -ErrorAction SilentlyContinue; return 'timeout' }
  $state = $job.State; $errs = @($job.ChildJobs | ForEach-Object { $_.Error }).Count
  Receive-Job $job -ErrorAction SilentlyContinue | Out-Null; Remove-Job $job -Force -ErrorAction SilentlyContinue
  if ($state -eq 'Completed' -and $errs -eq 0) { return 'ok' } else { return 'failed' }
}
# The legacy pieces go back in one DISM session (a session per piece cost
# minutes); if DISM will not take them together they go one at a time, and
# if the batch simply timed out (Windows Update out of reach) one at a time
# would only time out again, so it says where to add them later instead.
function Restore-Dism([string]$verb, [string]$flag, [string[]]$names, [string]$what) {
  if (-not $names -or -not $names.Count) { return 0 }
  if ($env:OMNIDX_SKIP_DISM -eq '1') { Write-Host ("{0} {1}(s) left for Settings > Apps > Optional features, as asked (OMNIDX_SKIP_DISM): {2}" -f $names.Count, $what, ($names -join ', ')) -ForegroundColor Yellow; return 0 }
  Write-Host ("{0} {1}(s) going back in one go (this can take a few minutes)..." -f $names.Count, $what) -ForegroundColor DarkGray
  $dargs = @('/online', $verb) + @($names | ForEach-Object { "$flag`:$_" }) + @('/NoRestart', '/Quiet')
  $r = Invoke-Timed { param($a) & dism.exe @a *>&1 | Out-Null; if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) { throw "dism exit $LASTEXITCODE" } } @(, $dargs) 600
  if ($r -eq 'ok') { foreach ($n in $names) { Write-Host ("{0} back: {1}" -f $what, $n) -ForegroundColor DarkGray }; return $names.Count }
  if ($r -eq 'timeout') { Write-Host ("They did not come back in ten minutes; Windows Update is probably out of reach. Settings > Apps > Optional features adds them later: {0}" -f ($names -join ', ')) -ForegroundColor Yellow; return 0 }
  Write-Host "DISM would not take them together; one at a time..." -ForegroundColor Yellow
  $ok = 0
  for ($i = 0; $i -lt $names.Count; $i++) {
    $n = $names[$i]
    $one = @('/online', $verb, "$flag`:$n", '/NoRestart', '/Quiet')
    $r = Invoke-Timed { param($a) & dism.exe @a *>&1 | Out-Null; if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) { throw "dism exit $LASTEXITCODE" } } @(, $one) 300
    if ($r -eq 'ok') { Write-Host ("{0} back: {1}" -f $what, $n) -ForegroundColor DarkGray; $ok++; continue }
    if ($r -eq 'timeout') {
      # One timeout means Windows Update is out of reach; the rest would only wait five minutes each for the same answer.
      $rest = @($names | Select-Object -Skip $i)
      Write-Host ("{0} did not come back in five minutes; Windows Update is probably out of reach. Settings > Apps > Optional features adds these later: {1}" -f $n, ($rest -join ', ')) -ForegroundColor Yellow
      break
    }
    Write-Host ("{0} did not come back here ({1}); Settings > Apps > Optional features adds it" -f $n, $r) -ForegroundColor Yellow
  }
  return $ok
}
$capsBack = New-Object System.Collections.ArrayList
$featsBack = New-Object System.Collections.ArrayList
foreach ($rec in $files) {
$changes = @(Get-Content $rec -Raw | ConvertFrom-Json | ForEach-Object { $_ })
[array]::Reverse($changes)
Write-Host ("Putting back {0} from {1}" -f $(if ($changes.Count -eq 1) { '1 change' } else { "$($changes.Count) changes" }), $rec)
foreach ($c in $changes) {
  try {
    $deferred = $false
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
      'fsutil' { $setting = $(if ($c.setting) { $c.setting } else { 'disablelastaccess' }); & fsutil behavior set $setting $c.prev | Out-Null; Write-Host ("fsutil {0} -> {1}" -f $setting, $c.prev) -ForegroundColor DarkGray }
      'mmagent' { try { if ($c.feature -eq 'MemoryCompression') { Enable-MMAgent -MemoryCompression -ErrorAction Stop } else { Enable-MMAgent -ApplicationPreLaunch -ErrorAction Stop } } catch { } }
      'bcdedit' { & bcdedit /deletevalue $c.name 2>$null | Out-Null; Write-Host ("boot setting {0} back to default" -f $c.name) -ForegroundColor DarkGray }
      'bcdset' { & bcdedit /set $c.name $c.prev 2>$null | Out-Null; Write-Host ("boot setting {0} back to {1}" -f $c.name, $c.prev) -ForegroundColor DarkGray }
      'task-created' { if ($c.name -ne 'OmniDx keep') { try { Unregister-ScheduledTask -TaskName $c.name -Confirm:$false -ErrorAction Stop } catch { } } }
      'mppref' { $p = @{}; $p[$c.name] = $c.prev; try { Set-MpPreference @p -ErrorAction Stop; Write-Host ("Defender {0} -> {1}" -f $c.name, $c.prev) -ForegroundColor DarkGray } catch { } }
      'capability' { if (-not $capsBack.Contains($c.name)) { [void]$capsBack.Add($c.name) }; $deferred = $true }
      'feature' { if (-not $featsBack.Contains($c.name)) { [void]$featsBack.Add($c.name) }; $deferred = $true }
      'onedrive' {
        if (Test-Path $c.setup) {
          $p = Start-Process $c.setup -ArgumentList '/silent' -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
          if ($p) { if ($p.WaitForExit(180000)) { Write-Host "OneDrive reinstalled" -ForegroundColor DarkGray } else { Write-Host "OneDrive's installer is still running in the background; it finishes on its own" -ForegroundColor Yellow } }
        }
      }
    }
    if (-not $deferred) { $done++ }
  } catch { Write-Host ("could not undo {0}: {1}" -f ($c | ConvertTo-Json -Compress), $_.Exception.Message) -ForegroundColor Yellow; $failed++ }
}
try {
  $doneDir = Join-Path $dir 'done'; New-Item -ItemType Directory -Path $doneDir -Force | Out-Null
  Move-Item $rec (Join-Path $doneDir ([IO.Path]::GetFileName($rec))) -Force
} catch { }
}
# What is left: changes-latest.json follows the newest remaining run, and the keep task stays only while one is.
$left = @(Get-ChildItem $dir -Filter 'changes-20*.json' -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
if ($left.Count) { Copy-Item $left[0].FullName (Join-Path $dir 'changes-latest.json') -Force; Write-Host ("{0} earlier run(s) still in place; the keep task, if there is one, keeps them" -f $left.Count) -ForegroundColor DarkGray }
else {
  Remove-Item (Join-Path $dir 'changes-latest.json') -Force -ErrorAction SilentlyContinue
  try { Unregister-ScheduledTask -TaskName 'OmniDx keep' -Confirm:$false -ErrorAction Stop; Write-Host "keep task removed" -ForegroundColor DarkGray } catch { }
}
# A legacy piece that did not come back is not a failure of the undo: Settings > Apps > Optional features adds it later, and the line says so.
$left = 0
$n = Restore-Dism '/Add-Capability' '/CapabilityName' @($capsBack) 'capability'; $done += $n; $left += (@($capsBack).Count - $n)
$n = Restore-Dism '/Enable-Feature' '/FeatureName' @($featsBack) 'feature'; $done += $n; $left += (@($featsBack).Count - $n)
if ($removedApps.Count) {
  Write-Host ""
  Write-Host "These Store apps were removed. Reinstall any you want from the Microsoft Store (search the name):" -ForegroundColor Yellow
  $removedApps | Sort-Object -Unique | ForEach-Object { Write-Host ("  " + $_) }
}
Write-Host ""
Write-Host ("Done: {0} put back{1}{2}. Restart to finish." -f $done, $(if ($failed) { ", $failed could not be" } else { '' }), $(if ($left) { ", $left left for Settings > Apps > Optional features" } else { '' })) -ForegroundColor Green
'@

# ---------------------------------------------------------------------------
# the machine
# ---------------------------------------------------------------------------
function Get-Machine {
  # How long each slow read takes, kept in the machine record and the probe, so a
  # slow PC (or a slow build machine) says where the seconds went.
  $sw = [System.Diagnostics.Stopwatch]::StartNew(); $tm = [ordered]@{}
  $lap = { param($name) $tm[$name] = [int]$sw.ElapsedMilliseconds; $sw.Restart() }
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
  # The disks straight from the storage class (Get-PhysicalDisk loads the whole Storage module for three fields).
  # MediaType 3 is a hard disk, 4 an SSD; BusType 17 is NVMe. The cmdlet is the fallback when the class is missing.
  $disks = @()
  try { $disks = @(Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_PhysicalDisk -ErrorAction Stop | ForEach-Object { [pscustomobject]@{ DeviceId = $_.DeviceId; MediaType = $(if ($_.MediaType -eq 3) { 'HDD' } elseif ($_.MediaType -eq 4) { 'SSD' } else { 'Unspecified' }); BusType = $(if ($_.BusType -eq 17) { 'NVMe' } else { "$($_.BusType)" }) } }) }
  catch { $disks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue) }
  $allSsd = $disks.Count -gt 0 -and -not ($disks | Where-Object { $_.MediaType -eq 'HDD' })
  $nvme = ($disks | Where-Object { $_.BusType -eq 'NVMe' }).Count -gt 0
  $ramGb = [math]::Round($cs.TotalPhysicalMemory / 1GB)
  $build = [int]$os.BuildNumber
  $win = if ($build -ge 22000) { 11 } else { 10 }
  # A virtual display reports 1 Hz; anything under 24 is not a refresh rate a person set, so it reads as unknown.
  $refresh = ($gpus | ForEach-Object { $_.CurrentRefreshRate } | Where-Object { $_ -ge 24 } | Measure-Object -Maximum).Maximum
  & $lap 'cim'
  # The printer list from its class (Get-Printer loads a module for one field: 2.3 s cold on 1.63.0's read line); the cmdlet is the fallback.
  $printers = @()
  try { $printers = @(Get-CimInstance -Namespace root/StandardCimv2 -ClassName MSFT_Printer -ErrorAction Stop | Where-Object { $_.Name -notmatch 'Microsoft|OneNote|Fax|XPS|PDF' }) }
  catch { $printers = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'Microsoft|OneNote|Fax|XPS|PDF' }) }
  & $lap 'printers'
  # One device listing for the five classes that matter, filtered in memory: 1.58.0's read line showed the
  # five class-by-class queries costing 2.2 s on the build machine, each one walking the whole bus.
  # The same class the cmdlet wraps, asked directly (no module load); the cmdlet is the fallback.
  $devs = @()
  try { $devs = @(Get-CimInstance -ClassName Win32_PnPEntity -Filter "Status = 'OK' AND (PNPClass = 'HIDClass' OR PNPClass = 'XboxComposite' OR PNPClass = 'XnaComposite' OR PNPClass = 'Bluetooth' OR PNPClass = 'Biometric')" -ErrorAction Stop | ForEach-Object { [pscustomobject]@{ Class = $_.PNPClass; FriendlyName = $_.Name } }) }
  catch { $devs = @(Get-PnpDevice -Class HIDClass, XboxComposite, XnaComposite, Bluetooth, Biometric -Status OK -ErrorAction SilentlyContinue) }
  $btAll = @($devs | Where-Object { $_.Class -eq 'Bluetooth' })
  $bt = @($btAll | Where-Object { $_.FriendlyName -notmatch 'Adapter|Enumerator|Radio|Microsoft|Generic|RFCOMM|LE Generic|Service' })
  $btRadio = $btAll.Count -gt 0
  $touch = @($devs | Where-Object { $_.Class -eq 'HIDClass' -and $_.FriendlyName -match 'touch screen|touchscreen' }).Count -gt 0
  $bio = @($devs | Where-Object { $_.Class -eq 'Biometric' }).Count -gt 0
  # Only the device classes a controller can be in, not every device on the bus.
  $xboxPad = @($devs | Where-Object { $_.FriendlyName -match 'Xbox' }).Count -gt 0
  # The adapters once each: the physical ones (Wi-Fi present, which one is live) and all of them (a VPN adapter).
  $physical = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue)
  $wifi = @($physical | Where-Object { $_.PhysicalMediaType -match '802.11|Native' -or $_.Name -match 'Wi-?Fi|Wireless' }).Count -gt 0
  $vpn = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'TAP|Wintun|WireGuard|VPN|NordLynx|Proton|Mullvad|Cloudflare WARP' }).Count -gt 0
  # Game Pass, the Xbox app or Minecraft: the package repository in the registry names every staged Store package by its
  # full name, and reading it costs nothing where loading the Appx module for two lookups was part of the 1.9 s device
  # lap on 1.61.0's read line. The cmdlets are the fallback when the key is missing.
  $xboxUsed = Test-Path (Join-Path $script:AppData '.minecraft')
  if (-not $xboxUsed) {
    $repo = 'HKLM:\SOFTWARE\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\PackageRepository\Packages'
    if (Test-Path $repo) { $xboxUsed = @(Get-ChildItem -Path $repo -Name -ErrorAction SilentlyContinue | Where-Object { $_ -match '^Microsoft\.(GamingApp|MinecraftUWP)_' }).Count -gt 0 }
    else { $xboxUsed = ((Get-AppxPackage -Name Microsoft.GamingApp -ErrorAction SilentlyContinue) -ne $null) -or ((Get-AppxPackage -Name Microsoft.MinecraftUWP -ErrorAction SilentlyContinue) -ne $null) }
  }
  & $lap 'pnp'
  $live = @($physical | Where-Object { $_.Status -eq 'Up' })
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
  # Which disk Windows lives on, from the partition class (Get-Partition and Get-Disk load the Storage module,
  # which 1.60.0's read line showed moving 1.6 s from one lap to another rather than away); the cmdlets are the fallback.
  $sysHdd = $false
  try {
    $letter = $env:SystemDrive.Substring(0, 1)
    $dn = $null
    try { $dn = (Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_Partition -ErrorAction Stop | Where-Object { "$($_.DriveLetter)" -eq $letter } | Select-Object -First 1).DiskNumber }
    catch { $dn = (Get-Partition -DriveLetter $letter -ErrorAction Stop | Get-Disk -ErrorAction Stop).Number }
    if ($null -ne $dn) {
      $pd = $disks | Where-Object { [int]$_.DeviceId -eq [int]$dn } | Select-Object -First 1
      if ($pd -and $pd.MediaType -eq 'HDD') { $sysHdd = $true }
    }
  } catch { }
  & $lap 'memory'
  # Every display mode the driver knows, which some drivers take a long time to list: ten seconds, then it is left out.
  # In a runspace inside this process (a second PowerShell process, as before 1.60.0, cost a second on its own).
  $maxRefresh = 0
  try {
    $ps = [PowerShell]::Create()
    [void]$ps.AddScript('(Get-CimInstance CIM_VideoControllerResolution -ErrorAction Stop | ForEach-Object { $_.RefreshRate } | Where-Object { $_ } | Measure-Object -Maximum).Maximum')
    $h = $ps.BeginInvoke()
    if ($h.AsyncWaitHandle.WaitOne(10000)) { $r = $ps.EndInvoke($h); if ($r -and $r.Count) { $maxRefresh = [int]$r[$r.Count - 1] } }
    else { try { $ps.Stop() } catch { } }
    $ps.Dispose()
  } catch { }
  & $lap 'modes'
  $otherAv = @(); try { $otherAv = @(Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop | ForEach-Object { $_.displayName } | Where-Object { $_ -and $_ -notmatch 'Defender' } | Sort-Object -Unique) } catch { }
  $installed = @()
  foreach ($uk in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') { $installed += @(Get-ItemProperty $uk -ErrorAction SilentlyContinue | ForEach-Object { $_.DisplayName } | Where-Object { $_ }) }
  $optimizers = @($installed | Where-Object { $_ -match 'Advanced SystemCare|Razer Cortex|CCleaner|Driver Booster|Wise Care|Glary|PC Optimizer|Smart Game Booster|Outbyte|Restoro|Reimage|Booster' } | Sort-Object -Unique)
  $oem = @($installed | Where-Object { $_ -match 'SupportAssist|HP Support Assistant|HP Analytics|HP Wolf|Lenovo Vantage|Lenovo System Update|Armoury Crate|MyASUS|Dragon Center|MSI Center|Acer Care|Predator Sense|Alienware Command|Omen Gaming Hub|Aura Sync|LiveDash|McAfee|Norton' } | Sort-Object -Unique)
  $uefi = $env:firmware_type -eq 'UEFI'
  # Secure Boot from the flag Windows records at boot (the cmdlet loads a module to read the same state); the cmdlet is the fallback.
  $secureBoot = $false
  try { $sbv = (Get-Item -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' -ErrorAction Stop).GetValue('UEFISecureBootEnabled'); if ($null -eq $sbv) { throw 'no flag' }; $secureBoot = ([int]$sbv -eq 1) }
  catch { try { $secureBoot = Confirm-SecureBootUEFI -ErrorAction Stop } catch { } }
  # The TPM from its own class (Get-Tpm loads a module to read one field); the cmdlet is the fallback when the class is missing.
  $tpm = $false
  try { $tpm = @(Get-CimInstance -Namespace root/CIMV2/Security/MicrosoftTpm -ClassName Win32_Tpm -ErrorAction Stop).Count -gt 0 }
  catch { try { $tpm = (Get-Tpm -ErrorAction Stop).TpmPresent } catch { } }
  & $lap 'software'
  # A desktop with a graphics card whose monitor is plugged into the motherboard: the integrated chip reports a
  # display mode and the card reports none. Laptops route the screen through the integrated chip by design.
  $displayOnIgpu = $false; $igpuName = ''
  try {
    $discrete = @($gpus | Where-Object { $_.Name -match 'NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Arc' })
    $integrated = @($gpus | Where-Object { $_.Name -match 'Intel\(R\) (UHD|HD|Iris)|AMD Radeon\(TM\) Graphics|Radeon Graphics$|Radeon\(TM\) Vega' -and $_.Name -notmatch 'RX' })
    if (-not $laptop -and $discrete.Count -and $integrated.Count) {
      $cardDrives = @($discrete | Where-Object { $_.CurrentHorizontalResolution -gt 0 }).Count -gt 0
      $chipDrives = @($integrated | Where-Object { $_.CurrentHorizontalResolution -gt 0 }).Count -gt 0
      if ($chipDrives -and -not $cardDrives) { $displayOnIgpu = $true; $igpuName = ($integrated | Select-Object -First 1).Name }
    }
  } catch { }
  # Room on the system drive: games stutter and shader caches fail when it is nearly full.
  $sysFreeGb = -1; $sysPct = -1
  try { $sd = Get-PSDrive -Name $env:SystemDrive.Substring(0, 1) -ErrorAction Stop; if ($sd.Used -ne $null) { $sysFreeGb = [math]::Round($sd.Free / 1GB); $sysPct = [math]::Round(100 * $sd.Free / ($sd.Free + $sd.Used)) } } catch { }
  $vbsOn = $false; $dg = $null; try { $dg = Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction Stop; $vbsOn = ($dg.VirtualizationBasedSecurityStatus -eq 2) -or ($dg.SecurityServicesRunning -contains 2) } catch { }
  # IOMMU (VT-d / AMD-Vi): Windows lists "DMA protection" among the security properties available only when the IOMMU is on.
  # VALORANT's Vanguard and FACEIT require it, with memory integrity, since 2026; the tune reports it and never turns it off.
  $iommu = $false; $hvci = $false
  try { if ($dg) { $iommu = @($dg.AvailableSecurityProperties) -contains 3; $hvci = @($dg.SecurityServicesRunning) -contains 2 } } catch { }
  $riot = Test-Path (Join-Path $env:ProgramData 'Riot Games')
  $faceit = (Test-Path (Join-Path $env:ProgramFiles 'FACEIT AC')) -or ($null -ne (Get-Service -Name 'FACEIT' -ErrorAction SilentlyContinue))
  # A dual-CCD X3D (7900X3D, 7950X3D, 9900X3D, 9950X3D): AMD's driver steers games onto the cache half, and spots them through Game Mode and Game Bar.
  $x3dDual = [bool]($cpu.Name -match '(7900|7950|9900|9950)X3D')
  @{
    os = "$($os.Caption) $($os.Version) (build $build)"; win = $win; build = $build
    cpu = $cpu.Name.Trim(); cpuVendor = $(if ($cpu.Manufacturer -match 'AMD') { 'AMD' } else { 'Intel' }); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors
    gpu = $gpu.Name; gpuVendor = $vendor; ramGb = $ramGb
    board = ("{0} {1}" -f $bb.Manufacturer, $bb.Product).Trim(); boardVendor = $bb.Manufacturer; bios = ("{0} {1}" -f $bios.Manufacturer, $bios.SMBIOSBIOSVersion).Trim(); biosDate = $bios.ReleaseDate
    laptop = $laptop; allSsd = $allSsd; nvme = $nvme; refresh = $refresh
    printers = $printers.Count; btDevices = $bt.Count; btRadio = $btRadio; wifi = $wifi; touch = $touch; biometric = $bio; vpn = $vpn; xboxUsed = $xboxUsed
    uefi = $uefi; secureBoot = $secureBoot; tpm = $tpm; vbs = $vbsOn; iommu = $iommu; hvci = $hvci
    riot = $riot; faceit = $faceit; x3dDual = $x3dDual
    displayOnIgpu = $displayOnIgpu; igpuName = $igpuName; sysFreeGb = $sysFreeGb; sysPct = $sysPct
    name = $cs.Name
    xboxPad = $xboxPad; wifiLive = $wifiLive; vm = $vm; domain = $domain
    driverVer = $driverVer; driverDate = $driverDate
    sticks = $sticks; ramRated = $ramRated; ramNow = $ramNow; ramSlow = $ramSlow
    noPageFile = $noPageFile; onBattery = $onBattery; sysHdd = $sysHdd; maxRefresh = $maxRefresh
    otherAv = $otherAv; optimizers = $optimizers; oem = $oem
    timings = $(& $lap 'security'; $tm)
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
  $keeps = @(
    $(if ($m.printers) { "printer" }), $(if ($m.btDevices) { "Bluetooth ($($m.btDevices) paired)" }), $(if ($m.wifi) { "Wi-Fi" }),
    $(if ($m.touch) { "touch" }), $(if ($m.biometric) { "Windows Hello" }), $(if ($m.vpn) { "VPN" }), $(if ($m.xboxUsed -and -not $CutXbox) { "Xbox / Game Pass" }), $(if ($m.xboxPad -and -not $CutXbox) { "Xbox controller" }), $(if ($m.laptop) { "battery, hibernate" })
  ) | Where-Object { $_ }
  Say ("  Keeps: {0}" -f $(if ($keeps.Count) { $keeps -join ', ' } else { 'nothing extra' }))
  Say ("  UEFI {0}, Secure Boot {1}, TPM {2}, memory integrity {3}, IOMMU {4}" -f $m.uefi, $m.secureBoot, $m.tpm, $(if ($m.vbs) { 'on' } else { 'off' }), $(if ($m.iommu) { 'on' } else { 'off' }))
  # Where the read spent its time, in seconds, largest first: a slow PC (or a slow build machine) says so on its own line.
  if ($m.timings -and $m.timings.Count) {
    $total = 0; foreach ($v in $m.timings.Values) { $total += [int]$v }
    $parts = @($m.timings.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 4 | ForEach-Object { "{0} {1:0.0}" -f $_.Key, ([int]$_.Value / 1000) })
    Say ("  Read in {0:0.0} s ({1})" -f ($total / 1000), ($parts -join ', '))
  }
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
  if ($m.displayOnIgpu) { Warn ("The display seems to be driven by the integrated graphics ({0}) while a {1} is installed. Check the monitor cable is in the graphics card's ports, not the motherboard's; no tweak comes close to that." -f $m.igpuName, $m.gpu) }
  if ($m.sysFreeGb -ge 0 -and ($m.sysFreeGb -lt 20 -or $m.sysPct -lt 10)) { Warn ("{0} has {1} GB free ({2}%). Games stutter and shader caches fail on a full drive: Settings > System > Storage > Temporary files, or move a game to another drive." -f $env:SystemDrive, $m.sysFreeGb, $m.sysPct) }
  if ($m.sysHdd) { Warn "Windows is on a hard disk. An SSD is the biggest upgrade this PC can get; no tweak comes close." }
  if ($m.ramGb -lt 16) { Warn ("{0} GB of RAM. 16 GB is the floor for current games; the tune helps, but it cannot make memory." -f $m.ramGb) }
  if ($m.win -eq 10 -and $m.build -lt 19045) { Warn "Windows 10 is not on 22H2. Update it: the last builds fixed things no tweak can." }
  if ($m.onBattery) { Warn "Running on battery. Plug in: the restore point and the cut are best done on mains, and the plan is tuned for mains." }
  if ($m.optimizers.Count) { Warn ("Another optimizer is installed ({0}). Two of these fighting over the same settings is worse than one; consider removing it." -f ($m.optimizers -join ', ')) }
  if ($m.oem.Count) { Say ("  OEM extras found: {0}. Not touched; remove any you do not use from Settings > Apps." -f ($m.oem -join ', ')) }
  if ($m.otherAv.Count) { Say ("  Antivirus: {0}. Not touched." -f ($m.otherAv -join ', ')) }
  if ($m.vm) { Warn "This looks like a virtual machine. The tune will run, but the numbers mean little here." }
  # The 2026 anti-cheat rules: FACEIT (all players by mid-2026) and Vanguard On-Demand (Windows 11 25H2) want Secure Boot,
  # TPM 2.0, IOMMU and memory integrity on. Said here, once, because turning any of them off is the one "tweak" that ends a game.
  if ($m.riot -or $m.faceit) {
    $who = @($(if ($m.riot) { 'VALORANT (Vanguard)' }), $(if ($m.faceit) { 'FACEIT' })) | Where-Object { $_ }
    $missing = @($(if (-not $m.secureBoot) { 'Secure Boot' }), $(if (-not $m.tpm) { 'TPM 2.0' }), $(if (-not $m.iommu) { 'IOMMU' }), $(if (-not $m.vbs) { 'memory integrity' })) | Where-Object { $_ }
    if ($missing.Count) { Warn ("{0} found. Since 2026 it requires Secure Boot, TPM 2.0, IOMMU and memory integrity on, and {1} {2} off on this PC. The BIOS checklist (items 4, 5 and 12) says where; the tune never turns any of them off." -f ($who -join ' and '), ($missing -join ', '), $(if ($missing.Count -eq 1) { 'is' } else { 'are' })) }
    else { Say ("  {0} found: Secure Boot, TPM, IOMMU and memory integrity are on, which is what its anti-cheat wants. The tune leaves all four alone." -f ($who -join ' and ')) }
  }
  if ($m.x3dDual) {
    $vc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '3D V-Cache' } | Select-Object -First 1
    if (-not $vc) { Warn "Dual-CCD X3D CPU without the AMD 3D V-Cache Performance Optimizer service: games can land on the half without the big cache. Install the AMD chipset driver from amd.com." }
    elseif ("$($vc.StartType)" -eq 'Disabled' -or "$($vc.Status)" -ne 'Running') { Warn "The AMD 3D V-Cache Performance Optimizer service is not running: games can land on the half of the CPU without the big cache. Services > set it to Automatic and start it." }
    else { Say "  Dual-CCD X3D CPU: AMD's optimizer is running, and Game Mode and Game Bar stay on because it spots games through them." }
  }
  # What another tool left switched off: said here as well as in the report, since the console is where most people look.
  foreach ($n in @(Get-LeftoverNotes $m)) { if ($n -notmatch '^Nothing found') { Say ("  ! Left by another tool: " + $n) 'Yellow' } }
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
  if ($m.xboxUsed -and -not (Test-CutXbox $m)) { $t += 5 }
  if ($m.otherAv.Count) { $t += 6 }
  # Extreme groups the service hosts and cuts the extra services: about two dozen processes fewer.
  if ($Extreme -and -not $script:ExtremeDeclined) { $t -= 24 }
  return $t
}

<# Which services this PC keeps, and why. Built from what Get-Machine found,
   used by the cut and by the free report, so the two never disagree. #>
<# Whether the Xbox pieces go: when asked (-CutXbox), or under -Extreme when
   nothing on this PC uses them. #>
function Test-CutXbox($m) { return [bool]($CutXbox -or ($Extreme -and -not $m.xboxUsed -and -not $m.xboxPad -and -not $m.x3dDual)) }

function Get-KeepList($m) {
  $k = @{}
  if ($m.printers) { $k['Spooler'] = 'a printer is installed'; $k['WiaRpc'] = 'a printer (or scanner) is installed'; $k['stisvc'] = 'a printer (or scanner) is installed'; $k['PrintWorkflowUserSvc'] = 'a printer is installed' }
  if ($m.vm) { foreach ($n in 'vmicguestinterface', 'vmicheartbeat', 'vmickvpexchange', 'vmicrdv', 'vmicshutdown', 'vmictimesync', 'vmicvmsession', 'vmicvss') { $k[$n] = 'this is a virtual machine' } }
  if ($m.domain) { $k['cloudidsvc'] = 'joined to a domain' }
  if ($m.touch) { $k['PenService'] = 'touch screen' }
  if ($m.btDevices -or $m.btRadio) { foreach ($n in 'bthserv', 'BTAGService', 'BthAvctpSvc') { $k[$n] = 'Bluetooth is in use' } }
  if ($m.wifi) { $k['WlanSvc'] = $(if ($m.wifiLive) { 'Wi-Fi is your connection' } else { 'a Wi-Fi adapter is present' }); $k['RmSvc'] = 'a Wi-Fi adapter is present' }
  if ($m.touch -or $m.laptop) { $k['TabletInputService'] = $(if ($m.touch) { 'touch screen' } else { 'laptop' }) }
  if ($m.biometric) { $k['WbioSrvc'] = 'a Windows Hello reader is present' }
  if ($m.laptop) { foreach ($n in 'SensorService', 'SensrSvc', 'SensorDataService', 'WwanSvc') { $k[$n] = 'laptop' } }
  if ($m.vpn) { foreach ($n in 'iphlpsvc', 'SSDPSRV', 'upnphost') { $k[$n] = 'a VPN adapter is present' } }
  if (-not $m.allSsd) { $k['SysMain'] = 'a hard disk benefits from prefetch' }
  if ($m.xboxUsed -and -not (Test-CutXbox $m)) { foreach ($n in 'XblAuthManager', 'XblGameSave', 'XboxNetApiSvc', 'XboxGipSvc') { $k[$n] = 'Game Pass, the Xbox app or Minecraft is installed' } }
  if ($m.xboxPad -and -not (Test-CutXbox $m)) { $k['XboxGipSvc'] = 'an Xbox controller is connected' }
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

$script:ProcNames = @{}
function Save-ProcessList([string]$tag) {
  try {
    $procs = @(Get-Process -ErrorAction SilentlyContinue)
    $script:ProcNames[$tag] = @($procs | ForEach-Object { $_.ProcessName } | Sort-Object -Unique)
    $rows = $procs | Group-Object ProcessName | Sort-Object -Property @{ Expression = 'Count'; Descending = $true }, @{ Expression = 'Name'; Descending = $false } | ForEach-Object { "{0,-40} x{1,-3} {2,8:N0} MB" -f $_.Name, $_.Count, (($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB) }
    Set-Content -Path (Join-Path $script:Root ("processes-{0}-{1}.txt" -f $tag, $script:Stamp)) -Value $rows -Encoding UTF8
  } catch { }
}

<# Process names that were running before and are not now: the cut, by name. #>
function Get-GoneProcesses {
  if (-not $script:ProcNames.before -or -not $script:ProcNames.after) { return @() }
  return @($script:ProcNames.before | Where-Object { $script:ProcNames.after -notcontains $_ })
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
    $cmd = "Start-Sleep -Seconds 120; `$p = @(Get-Process); `$o = Get-CimInstance Win32_OperatingSystem; `$m = [math]::Round((`$o.TotalVisibleMemorySize - `$o.FreePhysicalMemory) / 1024); `$c = ''; try { `$s = Get-Counter -Counter '\Processor(_Total)\% Processor Time', '\Processor(_Total)\% DPC Time' -SampleInterval 1 -MaxSamples 3 -ErrorAction Stop; `$c = ', idle CPU ' + [math]::Round((`$s.CounterSamples | Where-Object { `$_.Path -like '*Processor Time' } | Measure-Object CookedValue -Average).Average, 1) + '%, DPC ' + [math]::Round((`$s.CounterSamples | Where-Object { `$_.Path -like '*DPC Time' } | Measure-Object CookedValue -Average).Average, 2) + '%' } catch { }; `$b = ''; for (`$i = 0; `$i -lt 7 -and -not `$b; `$i++) { try { `$e = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 100 } -MaxEvents 1 -ErrorAction Stop; if (`$e.TimeCreated -gt `$o.LastBootUpTime) { `$t = (([xml]`$e.ToXml()).Event.EventData.Data | Where-Object { `$_.Name -eq 'BootTime' } | Select-Object -First 1).'#text'; if (`$t) { `$b = ', boot ' + [math]::Round([double]`$t / 1000, 1) + ' s' } } } catch { }; if (-not `$b -and `$i -lt 6) { Start-Sleep -Seconds 30 } }; Add-Content -Path '$out' -Value ((Get-Date -Format s) + '  after restart: ' + `$p.Count + ' processes, ' + ((`$p | ForEach-Object { `$_.Threads.Count } | Measure-Object -Sum).Sum) + ' threads, ' + ((`$p | Measure-Object HandleCount -Sum).Sum) + ' handles, ' + `$m + ' MB in use' + `$c + `$b); Unregister-ScheduledTask -TaskName '$name' -Confirm:`$false"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "' + $cmd + '"')
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -RunLevel Highest -Force -ErrorAction Stop | Out-Null
    Record @{ type = 'task-created'; name = $name }
    Did "One task runs once at your next sign-in: it writes the after-restart process count, memory, threads, handles, idle CPU and the boot time of that start (it waits up to three minutes more for Windows to log it) to C:\OmniDx\after-restart.txt, then removes itself."
  } catch { Warn ("Could not set the after-restart count task ({0})." -f $_.Exception.Message) }
}

# ---------------------------------------------------------------------------
# keeping it cut
# ---------------------------------------------------------------------------
<# Windows updates turn pieces of the tune back on: a feature update resets
   service start types, re-enables tasks and puts a few values back. This is
   the comparison, shared by -Status (read only) and by keep.ps1 (which fixes
   what drifted at sign-in): every registry value, service start type and
   scheduled task the recorded runs changed, against the machine now. Where
   two runs touched the same thing the newer one wins.

   Deliberately not checked: startup apps and personal preferences (mouse
   acceleration, the taskbar, Game Bar, visual effects, GPU preferences). If
   those change after the tune it was you, in Settings or Task Manager, and
   that must win. Records made by versions before 1.6 carry no target value
   and are skipped. #>
function Get-Drift {
  param([string[]]$Files, [switch]$Fix)
  $yours = @('\Control Panel\', '\StartupApproved\', '\CurrentVersion\Run', '\Explorer\Advanced', '\GameBar', 'GameConfigStore', '\GameDVR', '\Accessibility\', '\UserGpuPreferences', '\VisualEffects', '\Explorer\Serialize', '\Personalization', '\Classes\CLSID\', '\Themes\Personalize', '\PushNotifications', '\Notifications\', '\CurrentVersion\Search', '\WindowMetrics', '\Dwm')
  $entries = @()
  foreach ($f in @($Files | Sort-Object)) { try { $entries += @(Get-Content $f -Raw | ConvertFrom-Json | ForEach-Object { $_ }) } catch { } }
  [array]::Reverse($entries)
  $seen = @{}; $checked = 0; $fixed = 0; $failed = 0
  $drift = New-Object System.Collections.ArrayList
  foreach ($c in $entries) {
    $id = ''
    if ($c.type -eq 'reg') { $id = 'reg|' + $c.path + '|' + $c.name }
    elseif ($c.type -eq 'service') { $id = 'svc|' + $c.name }
    elseif ($c.type -eq 'task') { $id = 'task|' + $c.path + $c.name }
    if (-not $id -or $seen.ContainsKey($id)) { continue }
    $seen[$id] = $true
    try {
      if ($c.type -eq 'reg') {
        if (-not $c.PSObject.Properties['value']) { continue }
        $skip = $false; foreach ($y in $yours) { if ($c.path -like ('*' + $y + '*')) { $skip = $true } }
        if ($skip) { continue }
        $checked++
        $cur = $null; $has = $false
        try { $cur = (Get-ItemProperty -Path $c.path -Name $c.name -ErrorAction Stop).($c.name); $has = $true } catch { }
        if ($c.removed) {
          if (-not $has) { continue }
          [void]$drift.Add(("{0}\{1} is back" -f $c.path, $c.name))
          if ($Fix) { Remove-ItemProperty -Path $c.path -Name $c.name -Force -ErrorAction Stop; $fixed++ }
          continue
        }
        $want = $c.value
        # A DWord reads back as a signed 32-bit value (0xFFFFFFFF is -1), and PowerShell
        # types the literal 0xFFFFFFFF itself as -1; both sides go through the same mask.
        $norm = { param($v, $kind) if ($kind -eq 'DWord') { try { return [string]([int64]$v -band [int64]4294967295) } catch { return "$v" } } else { return (@($v) -join ',') } }
        $same = $false
        if ($has) { $same = ((& $norm $cur $c.kind) -eq (& $norm $want $c.kind)) }
        if ($same) { continue }
        [void]$drift.Add(("{0}\{1} = {2} (wanted {3})" -f $c.path, $c.name, $(if ($has) { (& $norm $cur $c.kind) } else { 'missing' }), (& $norm $want $c.kind)))
        if ($Fix) {
          if ($c.kind -eq 'Binary') { $want = [byte[]]@($want | ForEach-Object { [byte]$_ }) }
          if (-not (Test-Path $c.path)) { New-Item -Path $c.path -Force | Out-Null }
          New-ItemProperty -Path $c.path -Name $c.name -Value $want -PropertyType $c.kind -Force -ErrorAction Stop | Out-Null
          $fixed++
        }
      } elseif ($c.type -eq 'service') {
        $svc = Get-Service -Name $c.name -ErrorAction SilentlyContinue
        if (-not $svc) { continue }
        $checked++
        # WMI lists per-user service instances (WpnUserService_1a2b), not the template the tune configured; Get-Service knows the template.
        $mode = (Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $c.name) -ErrorAction SilentlyContinue).StartMode
        if (-not $mode) { $mode = $svc.StartType.ToString() }
        if ($mode -eq 'Auto' -or $mode -eq 'AutomaticDelayedStart') { $mode = 'Automatic' }
        if ($mode -eq $c.now) { continue }
        [void]$drift.Add(("service {0} is {1} (wanted {2})" -f $c.name, "$mode".ToLower(), "$($c.now)".ToLower()))
        if ($Fix) {
          $s = switch ("$($c.now)") { 'Disabled' { 'disabled' } 'Manual' { 'demand' } default { 'auto' } }
          & sc.exe config $c.name start= $s | Out-Null
          if ($LASTEXITCODE -ne 0) { throw "sc.exe returned $LASTEXITCODE" }
          if ($c.now -ne 'Automatic' -and $svc.Status -eq 'Running') { try { Stop-Service -Name $c.name -Force -ErrorAction Stop -WarningAction SilentlyContinue } catch { } }
          $fixed++
        }
      } elseif ($c.type -eq 'task') {
        $t = Get-ScheduledTask -TaskPath $c.path -TaskName $c.name -ErrorAction SilentlyContinue
        if (-not $t) { continue }
        $checked++
        if ($t.State -eq 'Disabled') { continue }
        [void]$drift.Add(("task {0} is on again" -f $c.name))
        if ($Fix) { Disable-ScheduledTask -TaskPath $c.path -TaskName $c.name -ErrorAction Stop | Out-Null; $fixed++ }
      }
    } catch { $failed++ }
  }
  return @{ checked = $checked; drift = @($drift); fixed = $fixed; failed = $failed }
}

<# keep.ps1: written next to undo.ps1 with Get-Drift's text pasted in, so
   it runs on its own. The sign-in task runs it hidden; by hand, -Check says
   what it would do without doing it. #>
$script:KeepScript = @'
<#  OmniDx Tune - keep.
    Windows updates turn pieces of the tune back on: a service set to start
    again, a task re-enabled, a value reset. This runs three minutes after
    sign-in, compares every recorded change with the machine and puts back
    what drifted. It touches only what the tune recorded in changes-*.json
    next to it, never adds anything, leaves startup apps and personal
    preferences alone, and does nothing at all once undo.ps1 has run.
    By hand, to see what it would do:  powershell -ExecutionPolicy Bypass -File keep.ps1 -Check
    Undo removes the task; -NoKeep on the tune never creates it. Log: C:\OmniDx\keep-log.txt
#>
param([switch]$Check)
$ErrorActionPreference = 'Continue'
$dir = $PSScriptRoot
$files = @(Get-ChildItem $dir -Filter 'changes-*.json' -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'changes-latest.json' } | ForEach-Object { $_.FullName })
$logFile = Join-Path (Split-Path $dir) 'keep-log.txt'
if (-not $files.Count) { Write-Host "Nothing recorded here; nothing to keep."; exit 0 }
__DRIFT__
$r = Get-Drift -Files $files -Fix:(-not $Check)
# The boot time of this start, in Windows' own figure (event 100), when it has been logged by now.
$boot = ''
try {
  $o = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $e = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 100 } -MaxEvents 1 -ErrorAction Stop
  if ($e.TimeCreated -gt $o.LastBootUpTime) {
    $t = (([xml]$e.ToXml()).Event.EventData.Data | Where-Object { $_.Name -eq 'BootTime' } | Select-Object -First 1).'#text'
    if ($t) { $boot = '; boot {0} s' -f [math]::Round([double]$t / 1000, 1) }
  }
} catch { }
$line = "{0}  checked {1}, {2} had drifted{3}{4}; {5} processes running{6}" -f (Get-Date -Format s), $r.checked, $r.drift.Count, $(if ($Check) { ' (check only)' } elseif ($r.fixed) { ", $($r.fixed) put back" } else { '' }), $(if ($r.failed) { ", $($r.failed) could not be" } else { '' }), @(Get-Process -ErrorAction SilentlyContinue).Count, $boot
Write-Host $line -ForegroundColor $(if ($r.drift.Count) { 'Yellow' } else { 'Green' })
foreach ($d in $r.drift) { Write-Host ("  " + $d) -ForegroundColor DarkGray }
try {
  $old = @(); if (Test-Path $logFile) { $old = @(Get-Content $logFile -ErrorAction SilentlyContinue | Select-Object -Last 199) }
  Set-Content -Path $logFile -Value ($old + @($line) + @($r.drift | ForEach-Object { "  " + $_ })) -Encoding UTF8
} catch { }
# The card with this start's count: the same picture the run wrote, with the number that counts,
# written fresh at every sign-in as card-after-restart.png. Drawn with the run's own code, pasted below.
if (-not $Check) {
  try {
    function Say { param([string]$t, [string]$c = 'Gray') Write-Host $t }
__CARD__
    $root = Split-Path $dir
    $stamps = @($files | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($_) -replace '^changes-', '' })
    $sum = Get-ChildItem $root -Filter 'summary-*.json' -ErrorAction SilentlyContinue | Where-Object { $stamps -contains ($_.BaseName -replace '^summary-', '') } | Sort-Object Name -Descending | Select-Object -First 1
    if ($sum) {
      $s = Get-Content $sum.FullName -Raw | ConvertFrom-Json
      $script:Root = $root; $script:Stamp = 'after-restart'; $script:Version = "$($s.version)"
      Write-Card @{ cpu = "$($s.cpu)"; gpu = "$($s.gpu)" } ([int]$s.before) (@(Get-Process -ErrorAction SilentlyContinue).Count) 'after a restart'
      if ($script:Card) { Write-Host ("  card: " + $script:Card) -ForegroundColor DarkGray }
    }
  } catch { }
}
# A feature update resets things by the dozen. That is worth one notification; a stray value is not.
if (-not $Check -and $r.fixed -ge 5) {
  try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>OmniDx Tune</text><text>A Windows update turned $($r.fixed) settings back on. They are back off. The list is in C:\OmniDx\keep-log.txt.</text></binding></visual></toast>")
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show((New-Object Windows.UI.Notifications.ToastNotification $xml))
  } catch { }
}
'@

<# The keep task itself. Asked about; -NoKeep or -Skip keep leaves it out. It
   runs as this account at this account's sign-in, three minutes after, with
   a ten-minute limit, and is recorded so undo removes it. When the
   administrator rights came from a different account than the one signed
   in, the task would fire at the wrong sign-in, so it is not made. #>
<# A run that says no to keeping it cut also takes down a keep task an
   earlier run left, so "no" means no from now on, not just for this run. #>
function Remove-KeepTask([string]$why) {
  if (-not (Get-ScheduledTask -TaskName 'OmniDx keep' -ErrorAction SilentlyContinue)) { return }
  try { Unregister-ScheduledTask -TaskName 'OmniDx keep' -Confirm:$false -ErrorAction Stop; Did ("Keep task from an earlier run removed ({0})." -f $why) }
  catch { Warn ("Could not remove the keep task from an earlier run ({0})." -f $_.Exception.Message) }
}

function Register-Keep {
  Head "Keeping it cut"
  if ($NoKeep) { Say "  Not kept (-NoKeep)."; Remove-KeepTask '-NoKeep'; return }
  if ($script:UserName -ne $env:USERNAME) { Say "  Not kept: administrator rights came from a different account than the one signed in. Run the command again after a big update instead."; return }
  Say "  Windows updates turn some of this back on. A small task can check three minutes after each sign-in and put the tune back. It only touches what this run recorded, leaves your own settings alone, and undo removes it." 'White'
  if (-not (Ask "Keep it cut after updates?")) { Say "  Not kept. Run the command again after a big update instead: same key, same PC, free."; Remove-KeepTask 'you said no'; return }
  try {
    $keep = Join-Path $script:Root 'undo\keep.ps1'
    $card = "    function New-RoundedPath {" + ${function:New-RoundedPath}.ToString() + "}`n    function Write-Card {" + ${function:Write-Card}.ToString() + "}"
    Set-Content -Path $keep -Value ($script:KeepScript.Replace('__DRIFT__', ("function Get-Drift {" + ${function:Get-Drift}.ToString() + "}")).Replace('__CARD__', $card)) -Encoding UTF8
    $name = 'OmniDx keep'
    $who = "$env:USERDOMAIN\$env:USERNAME"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $keep + '"')
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $who
    $trigger.Delay = 'PT3M'
    $principal = New-ScheduledTaskPrincipal -UserId $who -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null
    Record @{ type = 'task-created'; name = $name }
    Did "Task 'OmniDx keep' runs three minutes after sign-in, puts back whatever an update turned on, notes that start's boot time and writes card-after-restart.png with that start's count. Log: C:\OmniDx\keep-log.txt. Undo removes it."
  } catch { Warn ("Could not set the keep task ({0}). Run the command again after a big update instead." -f $_.Exception.Message) }
}

<# Ten runs of everything stay in C:\OmniDx; older logs, reports and
   snapshots go. Undo records stay until undo moves them, and a run's
   backup folder stays as long as its record does. #>
function Limit-History {
  $keep = 10
  foreach ($pat in 'log-*.txt', 'machine-*.json', 'processes-before-*.txt', 'processes-after-*.txt', 'report-20*.txt', 'report-20*.html', 'report-preview-*.txt', 'summary-*.json', 'card-*.png') {
    try { Get-ChildItem $script:Root -Filter $pat -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item -Force -ErrorAction SilentlyContinue } catch { }
  }
  try {
    $live = @(Get-ChildItem (Join-Path $script:Root 'undo') -Filter 'changes-*.json' -ErrorAction SilentlyContinue | ForEach-Object { $_.BaseName -replace '^changes-', '' })
    Get-ChildItem (Join-Path $script:Root 'backup') -Directory -ErrorAction SilentlyContinue | Where-Object { $live -notcontains $_.Name } | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  } catch { }
}

<# -Status: the runs recorded here, whether their settings are still in
   place, what Windows put back, the keep task and its last line, the
   after-restart count, and the key. Reads only. #>
function Show-Status {
  Head "Status"
  $dir = Join-Path $script:Root 'undo'
  $files = @(Get-ChildItem $dir -Filter 'changes-*.json' -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'changes-latest.json' } | Sort-Object Name)
  $undone = @(Get-ChildItem (Join-Path $dir 'done') -Filter 'changes-*.json' -ErrorAction SilentlyContinue)
  $lic = Get-ItemProperty 'HKLM:\SOFTWARE\OmniDx\Tune' -ErrorAction SilentlyContinue
  if ($lic -and $lic.Key) {
    Say ("  Key: {0}-****-****-{1}, bound to this PC {2}" -f $lic.Key.Split('-')[0], $lic.Key.Split('-')[-1], "$($lic.Bound)".Substring(0, [math]::Min(10, "$($lic.Bound)".Length)))
    $view = Get-ServerView $lic.Key
    if ($view) { Say ("  The licence server says: {0}." -f $view) $(if ($view -match 'issued;') { 'Gray' } else { 'Yellow' }) }
  } else { Say "  Key: none bound on this PC yet." }
  if (-not $files.Count) {
    Say ("  Runs in place: none{0}." -f $(if ($undone.Count) { " ({0} undone)" -f $undone.Count } else { '' }))
    if (Get-ScheduledTask -TaskName 'OmniDx keep' -ErrorAction SilentlyContinue) { Say "  Keep task: still registered with nothing to keep; undo removes it." 'Yellow' } else { Say "  Keep task: none." }
    Say ("  Processes running now: {0}" -f (Get-ProcessCount)) 'White'
    return
  }
  foreach ($f in $files) {
    $n = 0; try { $n = @(Get-Content $f.FullName -Raw | ConvertFrom-Json | ForEach-Object { $_ }).Count } catch { }
    Say ("  Run {0}: {1} recorded" -f ($f.BaseName -replace '^changes-', ''), (Plural $n 'change' 'changes'))
  }
  if ($undone.Count) { Say ("  Runs in place: {0} ({1} undone earlier, in undo\done)." -f $files.Count, $undone.Count) }
  $r = Get-Drift -Files @($files | ForEach-Object { $_.FullName })
  if ($r.drift.Count) {
    Say ("  Settings checked: {0}. Windows has put back {1}:" -f $r.checked, $r.drift.Count) 'Yellow'
    $r.drift | Select-Object -First 20 | ForEach-Object { Say ("    - " + $_) }
    if ($r.drift.Count -gt 20) { Say ("    ... and {0} more" -f ($r.drift.Count - 20)) }
    Say "  The keep task puts these back at your next sign-in; or run the command again now (same key, same PC, free)." 'White'
  } else { Say ("  Settings checked: {0}. All still in place." -f $r.checked) 'Green' }
  Say "  (Startup apps and personal preferences are not checked: if those changed, it was you, and that wins.)"
  $task = Get-ScheduledTask -TaskName 'OmniDx keep' -ErrorAction SilentlyContinue
  $keepLog = Join-Path $script:Root 'keep-log.txt'
  $last = $null; if (Test-Path $keepLog) { $last = @(Get-Content $keepLog -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\d{4}-' }) | Select-Object -Last 1 }
  if ($task) { Say ("  Keep task: on ({0}). {1}" -f $task.State, $(if ($last) { "Last: $last" } else { 'Has not run yet; it runs three minutes after sign-in.' })) }
  else { Say "  Keep task: not set. Run the tune again and answer yes to keep it cut, or leave it; the tune holds until a big update either way." }
  $ar = Join-Path $script:Root 'after-restart.txt'
  $arCount = 0
  $kc = Join-Path $script:Root 'card-after-restart.png'
  if (Test-Path $kc) { Say ("  Card with the last start's count, for posting: {0} (the keep task writes it fresh at every sign-in)" -f $kc) 'White' }
  if (Test-Path $ar) { $l = @(Get-Content $ar -ErrorAction SilentlyContinue) | Select-Object -Last 1; if ($l) { Say ("  After restart: {0}" -f $l) 'White'; if ($l -match 'after restart: (\d+) processes') { $arCount = [int]$Matches[1] } } }
  # The newest run still in place (its record is not in undo\done), so an undone Extreme does not speak for the tune.
  $stamps = @($files | ForEach-Object { $_.BaseName -replace '^changes-', '' })
  $sum = Get-ChildItem $script:Root -Filter 'summary-*.json' -ErrorAction SilentlyContinue | Where-Object { $stamps -contains ($_.BaseName -replace '^summary-', '') } | Sort-Object Name -Descending | Select-Object -First 1
  if ($sum) {
    try {
      $s = Get-Content $sum.FullName -Raw | ConvertFrom-Json; Say ("  Last run in place: {0} -> {1} processes, target about {2} after a restart" -f $s.before, $s.after, $s.target)
      # The card with the number that counts: before the tune, and after a restart.
      if ($arCount -and $s.before) {
        $mm = @{ cpu = ''; gpu = '' }
        $mj = Join-Path $script:Root ("machine-{0}.json" -f ($sum.BaseName -replace '^summary-', ''))
        try { if (Test-Path $mj) { $mo = Get-Content $mj -Raw | ConvertFrom-Json; $mm = @{ cpu = $mo.cpu; gpu = $mo.gpu } } } catch { }
        if (-not $mm.cpu) { try { $mm = @{ cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name.Trim(); gpu = (Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic Display|Remote|Virtual' } | Select-Object -First 1).Name } } catch { } }
        Write-Card $mm ([int]$s.before) $arCount 'after a restart'
        if ($script:Card) { Say ("  A card with the after-restart number, for posting: {0}" -f $script:Card) 'White' }
      }
    } catch { }
  }
  $bootNow = Get-BootSeconds
  if ($bootNow -ne $null) {
    $was = $null; if ($sum) { try { $was = (Get-Content $sum.FullName -Raw | ConvertFrom-Json).bootBefore } catch { } }
    Say ("  Last measured start: {0} s{1}. Windows' own figure for the last full start; it updates a few minutes after each restart." -f $bootNow, $(if ($was) { ' (before the tune: {0} s)' -f $was } else { '' })) 'White'
  }
  if (Test-Path $keepLog) {
    $boots = @(Get-Content $keepLog -ErrorAction SilentlyContinue | ForEach-Object { if ($_ -match '^\d{4}-.*; boot ([\d.]+) s') { $Matches[1] } })
    if ($boots.Count -gt 1) { Say ("  Starts since the tune, as the keep task saw them, oldest first: {0} s" -f (($boots | Select-Object -Last 8) -join ', ')) }
  }
  Say ("  Processes running now: {0}" -f (Get-ProcessCount)) 'White'
  # The answer to "why is the number up again": what runs now that did not run right after the tune.
  $afterFile = Get-ChildItem $script:Root -Filter 'processes-after-*.txt' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($afterFile) {
    $then = @(Get-Content $afterFile.FullName -ErrorAction SilentlyContinue | ForEach-Object { ($_ -split '\s{2,}')[0].Trim() } | Where-Object { $_ })
    $now = @(Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessName } | Sort-Object -Unique)
    $new = @($now | Where-Object { $then -notcontains $_ })
    if ($new.Count) { Say ("  Running now, not running after the tune: {0}{1}. Whatever you opened since, or a launcher that came back; nothing here is a setting." -f (($new | Select-Object -First 12) -join ', '), $(if ($new.Count -gt 12) { " and $($new.Count - 12) more" } else { '' })) }
    else { Say "  Nothing runs now that was not running right after the tune." }
  }
}

<# Everything support would ask for, as one zip on the desktop: the run
   logs, the PC as it was read, the numbers, the change records. No key (any
   key in a log is masked), no registry exports, none of your files. #>
function New-SupportBundle {
  Head "Support bundle"
  if (-not (Test-Path $script:Root)) { Say "  Nothing to bundle: the tune has not run on this PC." 'Yellow'; return }
  $desk = [Environment]::GetFolderPath('Desktop'); if (-not $desk) { $desk = $env:USERPROFILE }
  $zip = Join-Path $desk ("omnidx-support-{0}.zip" -f $script:Stamp)
  $stage = Join-Path $env:TEMP ("omnidx-support-{0}" -f $script:Stamp)
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  $n = 0
  foreach ($pat in 'log-*.txt', 'machine-*.json', 'summary-*.json', 'report-*.txt', 'report-preview-*.txt', 'keep-log.txt', 'after-restart.txt', 'README.txt') {
    foreach ($f in Get-ChildItem $script:Root -Filter $pat -File -ErrorAction SilentlyContinue) {
      try { (Get-Content $f.FullName -Raw -ErrorAction Stop) -replace '\b(TUNE|SQUAD)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b', '$1-****-****-****-****' | Set-Content -Path (Join-Path $stage $f.Name) -Encoding UTF8; $n++ } catch { }
    }
  }
  foreach ($f in Get-ChildItem (Join-Path $script:Root 'undo') -Filter 'changes-*.json' -File -ErrorAction SilentlyContinue) { try { Copy-Item $f.FullName (Join-Path $stage $f.Name) -Force; $n++ } catch { } }
  if (-not $n) { Say "  Nothing to bundle yet." 'Yellow'; Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue; return }
  try {
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force -ErrorAction Stop
    Say ("  {0} files zipped to {1}" -f $n, $zip) 'Green'
    Say "  Attach it to your email. It holds the run logs, the PC as it was read, the numbers and the change records; no key, no registry exports, none of your files."
    try { Start-Process explorer.exe ("/select,`"{0}`"" -f $zip) } catch { }
  } catch { Say ("  Could not write the zip ({0})." -f $_.Exception.Message) 'Red' }
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}

<# Ten seconds to change your mind. #>
function Invoke-Restart {
  Say "  Restarting in 10 seconds. Press any key to stay." 'White'
  for ($i = 10; $i -gt 0; $i--) {
    try { if ([Console]::KeyAvailable) { [void][Console]::ReadKey($true); Write-Host ''; Say "  Staying. Restart when you are ready."; return } } catch { }
    Write-Host ("  {0}" -f $i) -ForegroundColor DarkGray -NoNewline
    Start-Sleep -Seconds 1
  }
  Write-Host ''
  Restart-Computer -Force
}

<# The one file in C:\OmniDx a person opens first. #>
$script:ReadMe = @'
OmniDx Tune __VERSION__ - what is in this folder

This folder is everything the tune left on this PC. Nothing runs from here
except the two scheduled tasks named below, and nothing here talks to the
internet.

  report-<date>.html / .txt   what it found, what it changed, the numbers,
                              the BIOS checklist, the per-game settings, and
                              what another tool left switched off, with the
                              way back. Open the .html in a browser.
  summary-<date>.json         the same numbers, for machines
  log-<date>.txt              a transcript of the run
  machine-<date>.json         the PC as it read it
  processes-before/after-<date>.txt   every process, grouped, before and after
  after-restart.txt           the process count taken at the next sign-in by a
                              one-shot task that then deletes itself
  keep-log.txt                one line per sign-in from the keep task, if you
                              said yes to it: what a Windows update had turned
                              back on, and that it was put back
  bios-<board>.txt            the BIOS checklist on its own
  undo\undo.ps1               puts everything back, every run, newest first.
                              Administrator PowerShell:
                              powershell -ExecutionPolicy Bypass -File C:\OmniDx\undo\undo.ps1
  undo\changes-<date>.json    the record of one run: every value, service and
                              task, with what it was before. Undo moves these
                              to undo\done\ when it has used them.
  undo\keep.ps1               what the keep task runs: compares the records
                              with the machine and sets again what drifted.
                              keep.ps1 -Check only looks.
  backup\<date>\              registry exports of the areas touched, the
                              service list, and Discord / Spotify settings
                              files, from before the run

Status, any time (changes nothing):
  $env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex

Run it again, same key, same PC, free:
  irm omnidx.net/go.ps1 | iex

The last ten runs are kept here; older logs and reports are removed on the
next run. Undo records stay until undo uses them.
'@

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
      $script:RestorePointMade = $true
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
  try { Set-Content -Path (Join-Path $script:Root 'README.txt') -Value ($script:ReadMe.Replace('__VERSION__', $script:Version)) -Encoding UTF8 } catch { }
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
<# The startup entries an earlier run (still in place, not undone) switched
   off: if one of them is on again, a person turned it back on in Task
   Manager, and a later run must not cut it again without being told to. #>
function Get-CutStartup {
  $cut = @{}
  foreach ($f in Get-ChildItem (Join-Path $script:Root 'undo') -Filter 'changes-20*.json' -ErrorAction SilentlyContinue) {
    try {
      foreach ($c in @(Get-Content $f.FullName -Raw | ConvertFrom-Json | ForEach-Object { $_ })) {
        if ($c.type -eq 'reg' -and $c.path -like '*StartupApproved*') { $cut[("{0}|{1}" -f $c.path, $c.name).ToLower()] = $true }
        elseif ($c.type -eq 'reg' -and $c.path -like '*AppModel\SystemAppData*' -and $c.name -eq 'State') { $cut[("{0}|State" -f $c.path).ToLower()] = $true }
      }
    } catch { }
  }
  return $cut
}

function Get-StartupEntries {
  $hk = $script:HKCU
  $cut = Get-CutStartup
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
      $entries += @{ name = $name; label = $name; ok = $p.ok; value = $name; on = $on; kind = 'run'; wasCut = [bool]$cut[("{0}|{1}" -f $p.ok, $name).ToLower()] }
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
      $entries += @{ name = $base; label = ("{0} (Startup folder)" -f $base); ok = $f.ok; value = $file.Name; on = $on; kind = 'folder'; wasCut = [bool]$cut[("{0}|{1}" -f $f.ok, $file.Name).ToLower()] }
    }
  }
  $appBase = "$hk\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData"
  if (Test-Path $appBase) {
    foreach ($pkg in Get-ChildItem $appBase -ErrorAction SilentlyContinue) {
      foreach ($task in Get-ChildItem $pkg.PSPath -ErrorAction SilentlyContinue) {
        $state = (Get-ItemProperty $task.PSPath -Name State -ErrorAction SilentlyContinue).State
        if ($state -eq 2) {
          $label = ($pkg.PSChildName -split '_')[0]
          $entries += @{ name = $label; label = ("{0} (Store app)" -f $label); ok = $task.PSPath; value = 'State'; on = $true; kind = 'store'; wasCut = [bool]$cut[("{0}|State" -f $task.PSPath).ToLower()] }
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
  Say ("  {0} with Windows:" -f (Plural $live.Count 'thing starts' 'things start'))
  $back = @($live | Where-Object { $_.wasCut })
  for ($i = 0; $i -lt $live.Count; $i++) { Say ("   {0,2}. {1}{2}" -f ($i + 1), $live[$i].label, $(if ($live[$i].wasCut) { '  (you turned it back on after the last run: stays on)' } else { '' })) 'White' }
  # Turned back on by hand since an earlier run: that was a decision, and it stands unless this run is told otherwise.
  foreach ($e in $back) { $script:StartupKeep += $e.name; Keep $e.name 'you turned it back on after the last run' }
  if (-not $Yes) {
    $pick = Read-Host $(if ($back.Count) { "  Numbers to leave ON (e.g. 2,5), Enter to switch the rest off, or 'all' to cut the ones you turned back on too" } else { "  Numbers to leave ON (e.g. 2,5), or Enter to switch all of them off" })
    if ($pick -match '^\s*all\s*$') { $script:StartupKeep = @($script:StartupKeep | Where-Object { $n = $_; -not ($back | Where-Object { $_.name -eq $n }) }) }
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
  Say ("  {0} switched off. Task Manager > Startup can switch any one back on." -f (Plural $n 'startup entry' 'startup entries'))
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
  @('Themes', 'themes'), @('cbdhsvc', 'clipboard history'), @('WpnService', 'push notifications'), @('WpnUserService', 'push notifications'),
  @('p2psvc', 'peer networking'), @('p2pimsvc', 'peer networking identity'), @('PNRPsvc', 'peer name resolution'), @('PNRPAutoReg', 'peer name publication'),
  @('RemoteAccess', 'routing and remote access'), @('SNMPTRAP', 'SNMP traps'), @('SharedRealitySvc', 'mixed reality spatial data'), @('shpamsvc', 'shared PC accounts'),
  @('SmsRouter', 'SMS routing'), @('TroubleshootingSvc', 'recommended troubleshooting'), @('UevAgentService', 'user experience virtualisation'), @('workfolderssvc', 'Work Folders sync'),
  @('WFDSConMgrSvc', 'Wi-Fi Direct'), @('WiaRpc', 'still image (scanners)'), @('svsvc', 'spot verifier'), @('autotimesvc', 'cellular time'),
  @('EntAppSvc', 'enterprise app management'), @('fhsvc', 'File History'), @('DusmSvc', 'data usage'),
  @('vmicguestinterface', 'Hyper-V guest'), @('vmicheartbeat', 'Hyper-V guest'), @('vmickvpexchange', 'Hyper-V guest'), @('vmicrdv', 'Hyper-V guest'),
  @('vmicshutdown', 'Hyper-V guest'), @('vmictimesync', 'Hyper-V guest'), @('vmicvmsession', 'Hyper-V guest'), @('vmicvss', 'Hyper-V guest')
)
# Extreme only: the services a person might notice going. Manual unless the
# list below says off; -Extreme sets them, the standard tune leaves them.
$script:ExtremeServices = @(
  @('CaptureService', 'screen capture for apps'), @('NPSMSvc', 'media controls (Now Playing)'), @('PrintWorkflowUserSvc', 'print workflow (kept with a printer)'),
  @('AarSvc', 'voice activation'), @('BcastDVRUserService', 'Game DVR broadcasting'), @('cloudidsvc', 'cloud identity (kept on a domain)'),
  @('DevicesFlowUserSvc', 'connect-to-device flow'), @('DeviceAssociationBrokerSvc', 'device pairing broker'), @('DevQueryBroker', 'device query broker'),
  @('PenService', 'pen input (kept with touch)'), @('SysMain', 'superfetch, off on an SSD'), @('WSearch', 'search indexing, off'),
  @('WpnService', 'notifications, off'), @('WpnUserService', 'notifications, off'), @('cbdhsvc', 'clipboard history, off'),
  @('CDPSvc', 'nearby sharing, off'), @('CDPUserSvc', 'nearby sharing, off'), @('TabletInputService', 'touch keyboard (kept with touch)'),
  @('SgrmBroker', 'System Guard attestation broker, off (24H2 no longer ships it)')
)
$script:ExtremeOff = @('SysMain', 'WSearch', 'WpnService', 'WpnUserService', 'cbdhsvc', 'CDPSvc', 'CDPUserSvc', 'BcastDVRUserService', 'AarSvc', 'SgrmBroker')
# The ones this machine actually uses go to manual instead of off, or stay.
$script:ManualOnly = @('SysMain', 'WSearch', 'edgeupdate', 'edgeupdatem', 'DPS', 'WdiServiceHost', 'WdiSystemHost', 'iphlpsvc', 'SSDPSRV', 'upnphost',
  'NcbService', 'CDPSvc', 'CDPUserSvc', 'OneSyncSvc', 'PimIndexMaintenanceSvc', 'UnistoreSvc', 'UserDataSvc', 'XblAuthManager', 'XblGameSave',
  'XboxNetApiSvc', 'XboxGipSvc', 'RmSvc', 'FrameServer', 'stisvc', 'WebClient', 'lmhosts', 'TermService', 'SessionEnv', 'UmRdpService',
  'WpnService', 'WpnUserService', 'cbdhsvc', 'SensorService', 'SensrSvc', 'SensorDataService', 'TabletInputService', 'BTAGService', 'BthAvctpSvc', 'DoSvc',
  'WFDSConMgrSvc', 'WiaRpc', 'svsvc', 'autotimesvc', 'EntAppSvc', 'fhsvc', 'DusmSvc')

function Cut-Services($m) {
  Head "Services"
  $keep = Get-KeepList $m
  Keep 'Defender, the firewall, Windows Update, audio, networking' 'always'
  # The service list and every start mode, read once. The full listing does not
  # include the per-user templates (CDPUserSvc, WpnUserService...), only their
  # instances, so a name missing from it is looked up directly before it is
  # taken as absent.
  $all = @(Get-Service -ErrorAction SilentlyContinue)
  $byName = @{}; foreach ($svc in $all) { $byName[$svc.Name] = $svc }
  $exists = { param($n) if ($byName.ContainsKey($n)) { return $true }; return [bool](Get-Service -Name $n -ErrorAction SilentlyContinue) }
  $script:SvcModes = @{}; foreach ($w in @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue)) { $script:SvcModes[$w.Name] = $w.StartMode }
  foreach ($pair in $script:ServiceOff) {
    $name = $pair[0]; $why = $pair[1]
    if ($keep.ContainsKey($name)) { if (& $exists $name) { Keep $name $keep[$name] }; continue }
    $mode = if ($script:ManualOnly -contains $name) { 'Manual' } else { 'Disabled' }
    # Per-user services carry a suffix (CDPUserSvc_1a2b3c). The template is
    # the one whose start type can be set; the instances are only stopped.
    if (& $exists $name) { Set-ServiceStart $name $mode $why }
    foreach ($inst in @($all | Where-Object { $_.Name -like ($name + '_*') -and $_.Status -eq 'Running' })) {
      try { Stop-Service -Name $inst.Name -Force -NoWait -ErrorAction Stop -WarningAction SilentlyContinue } catch { }
    }
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
  @('\Microsoft\Windows\Diagnosis\', 'Scheduled'), @('\Microsoft\Windows\WwanSvc\', 'OobeDiscovery'),
  # Background work a gaming PC never asked for: the compatibility appraisers, memory and disk-usage
  # diagnostics, data-usage bookkeeping, the flighting reporters, SQM, offline files, storage tiers,
  # remote assistance, print provisioning, media-library sharing, the indexer's maintenance, roaming
  # profile uploads, the shared-PC cleanup, the Store's remote install and the end-of-support nag.
  @('\Microsoft\Windows\Application Experience\', 'PcaWallpaperAppDetect'), @('\Microsoft\Windows\Application Experience\', 'Microsoft Compatibility Appraiser Exp'),
  @('\Microsoft\Windows\Diagnosis\', 'RecommendedTroubleshootingScanner'), @('\Microsoft\Windows\DiskFootprint\', 'Diagnostics'),
  @('\Microsoft\Windows\DUSM\', 'dusmtask'), @('\Microsoft\Windows\Flighting\FeatureConfig\', 'UsageDataFlushing'),
  @('\Microsoft\Windows\Flighting\FeatureConfig\', 'UsageDataReporting'), @('\Microsoft\Windows\HelloFace\', 'FODCleanupTask'),
  @('\Microsoft\Windows\MemoryDiagnostic\', 'ProcessMemoryDiagnosticEvents'), @('\Microsoft\Windows\MemoryDiagnostic\', 'RunFullMemoryDiagnostic'),
  @('\Microsoft\Windows\Offline Files\', 'Background Synchronization'), @('\Microsoft\Windows\Offline Files\', 'Logon Synchronization'),
  @('\Microsoft\Windows\PI\', 'Sqm-Tasks'), @('\Microsoft\Windows\Printing\', 'EduPrintProv'),
  @('\Microsoft\Windows\PushToInstall\', 'Registration'), @('\Microsoft\Windows\RemoteAssistance\', 'RemoteAssistanceTask'),
  @('\Microsoft\Windows\SharedPC\', 'Account Cleanup'), @('\Microsoft\Windows\Shell\', 'IndexerAutomaticMaintenance'),
  @('\Microsoft\Windows\Storage Tiers Management\', 'Storage Tiers Management Initialization'), @('\Microsoft\Windows\UPnP\', 'UPnPHostConfig'),
  @('\Microsoft\Windows\User Profile Service\', 'HiveUploadTask'), @('\Microsoft\Windows\WDI\', 'ResolutionHost'),
  @('\Microsoft\Windows\Windows Media Sharing\', 'UpdateLibrary'), @('\Microsoft\Windows\Work Folders\', 'Work Folders Logon Synchronization'),
  @('\Microsoft\Windows\Work Folders\', 'Work Folders Maintenance Work'), @('\Microsoft\Windows\Setup\', 'EOSNotify'),
  @('\Microsoft\Windows\Setup\', 'EOSNotify2')
)

<# Every scheduled task once, then lookups: asking for them one by one took
   thirteen seconds on the build machine. #>
function Get-TaskIndex {
  $idx = @{}
  foreach ($t in Get-ScheduledTask -ErrorAction SilentlyContinue) { $idx[($t.TaskPath + $t.TaskName).ToLower()] = $t }
  return $idx
}

function Cut-Tasks {
  Head "Scheduled tasks"
  $n = 0
  $idx = Get-TaskIndex
  foreach ($t in $script:TaskList) {
    $task = $idx[($t[0] + $t[1]).ToLower()]
    if ($task -and $task.State -ne 'Disabled') {
      try { Disable-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction Stop | Out-Null; Record @{ type = 'task'; path = $t[0]; name = $t[1] }; $n++; Did $t[1] } catch { }
    }
  }
  Say ("  {0} disabled." -f (Plural $n 'telemetry, feedback or background task' 'telemetry, feedback and background tasks'))
}

$script:JunkApps = @(
  'Microsoft.YourPhone', 'MicrosoftWindows.CrossDevice', 'Microsoft.549981C3F5F10', 'Microsoft.WindowsFeedbackHub', 'Microsoft.GetHelp', 'Microsoft.Getstarted',
  'Microsoft.WindowsMaps', 'Microsoft.MicrosoftSolitaireCollection', 'Microsoft.MixedReality.Portal', 'Microsoft.Microsoft3DViewer', 'Microsoft.People',
  'Microsoft.SkypeApp', 'MicrosoftTeams', 'MSTeams', 'Clipchamp.Clipchamp', 'Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.BingSearch', 'Microsoft.Todos',
  'Microsoft.MicrosoftOfficeHub', 'Microsoft.Office.OneNote', 'Microsoft.PowerAutomateDesktop', 'MicrosoftCorporationII.MicrosoftFamily', 'Microsoft.Copilot', 'MicrosoftWindows.Client.WebExperience',
  'Microsoft.Windows.DevHome', 'Microsoft.Windows.Ai.Copilot.Provider', 'Microsoft.WindowsCommunicationsApps', 'Microsoft.Messaging', 'Microsoft.OneConnect',
  'Microsoft.Print3D', 'Microsoft.Wallet', 'Microsoft.WindowsAlarms', 'Microsoft.MicrosoftStickyNotes', 'Microsoft.Advertising.Xaml', 'MicrosoftCorporationII.QuickAssist',
  'Microsoft.OutlookForWindows', 'Microsoft.Edge.GameAssist', 'Microsoft.WidgetsPlatformRuntime', 'Microsoft.MicrosoftJournal', 'Microsoft.Whiteboard',
  'Microsoft.BingTranslator', 'Microsoft.BingFinance', 'Microsoft.BingSports', 'Microsoft.News', 'Microsoft.MicrosoftPowerBIForWindows', 'Microsoft.NetworkSpeedTest',
  'Microsoft.Office.Sway', 'Microsoft.WindowsReadingList', 'Microsoft.3DBuilder', 'Microsoft.Microsoft3DViewer', 'Microsoft.MicrosoftJigsaw', 'Microsoft.MicrosoftMahjong',
  '*Disney*', '*TikTok*', '*Instagram*', '*Facebook*', '*CandyCrush*', '*king.com*', '*Netflix*', '*Twitter*', '*Amazon*', '*Hulu*', '*Dolby*', '*Prime*', '*LinkedIn*', '*McAfee*', '*Norton*', '*Booking*', '*Duolingo*', '*Fitbit*', '*Flipboard*', '*HiddenCity*', '*Hearts*', '*Plex*', '*Roblox*Store*', '*Sway*', '*Wunderlist*', '*ESPN*', '*BubbleWitch*', '*MarchofEmpires*', '*RoyalRevolt*', '*Speed Test*', '*Sidia*', '*WhatsApp*Stub*',
  '*ACGMediaPlayer*', '*ActiproSoftware*', '*AdobePhotoshopExpress*', '*Asphalt*', '*AutodeskSketchBook*', '*CaesarsSlots*', '*COOKINGFEVER*', '*CyberLink*', '*DrawboardPDF*', '*EclipseManager*', '*FarmVille*', '*Keeper*', '*PandoraMedia*', '*PhototasticCollage*', '*PicsArt*', '*PolarrPhoto*', '*Shazam*', '*SlingTV*', '*TuneInRadio*', '*Viber*', '*WinZipUniversal*', '*XING*', '*Solitaire*', '*Pinterest*', '*Messenger*', '*Spotify*Stub*', '*ExpressVPN*', '*Simplenote*', '*Hidden*Object*'
)

<# The rest of the debloat: what Windows and the PC maker put on the disk
   that nobody asked for. Each list says what a thing is, so the report and
   the site can say so too. Undo puts every one of these back except the
   cleared caches, which were junk. #>
$script:Capabilities = @(
  @('App.StepsRecorder', 'Steps Recorder (screenshots every click, retired by Microsoft)'),
  @('Media.WindowsMediaPlayer', 'the 2009 Windows Media Player (the Store one stays)'),
  @('Microsoft.Windows.WordPad', 'WordPad (retired by Microsoft)'),
  @('MathRecognizer', 'Math Input Panel'),
  @('Browser.InternetExplorer', 'Internet Explorer 11'),
  @('Print.Fax.Scan', 'Windows Fax and Scan (kept when a printer is installed)'),
  @('Hello.Face', 'Windows Hello face recognition (kept when a Hello camera or reader is present)')
)
# The exact package ids behind the list above. Asking DISM for a name it knows
# takes a second or two; asking it to list every capability on the PC took a
# minute and a half on the build machine. Hello.Face carries a build number, so
# the ones that have shipped are all tried.
$script:CapabilityIds = @{
  'App.StepsRecorder' = @('App.StepsRecorder~~~~0.0.1.0')
  'Media.WindowsMediaPlayer' = @('Media.WindowsMediaPlayer~~~~0.0.12.0')
  'Microsoft.Windows.WordPad' = @('Microsoft.Windows.WordPad~~~~0.0.1.0')
  'MathRecognizer' = @('MathRecognizer~~~~0.0.1.0')
  'Browser.InternetExplorer' = @('Browser.InternetExplorer~~~~0.0.11.0')
  'Print.Fax.Scan' = @('Print.Fax.Scan~~~~0.0.1.0')
  'Hello.Face' = @('Hello.Face.20134~~~~0.0.1.0', 'Hello.Face.18967~~~~0.0.1.0', 'Hello.Face.17658~~~~0.0.1.0')
}
# The component store's record of each capability, by package name. A name verified on the build machine
# (the check's discovery step, 1.62.0) decides by state without DISM; a hint says whether the store mentions
# the piece at all, and a piece it never mentions is not on the PC. Anything else is asked of DISM by name.
# Steps Recorder, Math Input Panel, Internet Explorer and the Server name of the old Media Player were verified
# by the check on the build machine; the client Media Player name, WordPad and Fax and Scan are the names the
# feature-on-demand packages ship under (build 17763 onward). A name that matches nothing goes to DISM.
$script:CapabilityPackages = @{
  'App.StepsRecorder' = @('Microsoft-Windows-StepsRecorder-Package~31bf3856ad364e35~amd64~~')
  'Media.WindowsMediaPlayer' = @('Microsoft-Windows-MediaPlayer-Opt-Package~31bf3856ad364e35~amd64~~', 'Microsoft-Windows-MediaPlayer-Package~31bf3856ad364e35~amd64~~')
  'Microsoft.Windows.WordPad' = @('Microsoft-Windows-WordPad-FoD-Package~31bf3856ad364e35~amd64~~')
  'MathRecognizer' = @('Microsoft-Windows-TabletPCMath-Package~31bf3856ad364e35~amd64~~')
  'Browser.InternetExplorer' = @('Microsoft-Windows-InternetExplorer-Optional-Package~31bf3856ad364e35~amd64~~')
  'Print.Fax.Scan' = @('Microsoft-Windows-Printing-WFS-FoD-Package~31bf3856ad364e35~amd64~~')
}
# Hello Face ships as Microsoft-Windows-Hello-Face-Package, but its capability id carries a build number the
# package name does not, so when the store mentions it DISM is asked which id is installed.
$script:CapabilityHints = @{
  'App.StepsRecorder' = 'StepsRecorder'
  'Media.WindowsMediaPlayer' = 'MediaPlayer'
  'Microsoft.Windows.WordPad' = 'WordPad'
  'MathRecognizer' = 'Math|TabletPC'
  'Browser.InternetExplorer' = 'InternetExplorer-Optional'
  'Print.Fax.Scan' = 'WFS|Fax-Client'
  'Hello.Face' = 'Hello'
}
$script:Features = @(
  @('MicrosoftWindowsPowerShellV2Root', 'the PowerShell 2.0 engine: old, bypasses modern security logging, nothing needs it'),
  @('MicrosoftWindowsPowerShellV2', 'the PowerShell 2.0 engine'),
  @('Printing-XPSServices-Features', 'XPS printing and viewer'),
  @('WorkFolders-Client', 'Work Folders (corporate sync)'),
  @('WindowsMediaPlayer', 'the 2009 Windows Media Player'),
  @('Internet-Explorer-Optional-amd64', 'Internet Explorer 11')
)

function Cut-Apps($m) {
  Head "Preinstalled apps"
  # Quick Assist and Sticky Notes come back from the Store in one press; both are in the undo list.
  $junk = @($script:JunkApps)
  if (Test-CutXbox $m) { $junk += 'Microsoft.XboxApp', 'Microsoft.GamingApp', 'Microsoft.Xbox.TCUI', 'Microsoft.XboxGamingOverlay', 'Microsoft.XboxIdentityProvider', 'Microsoft.XboxSpeechToTextOverlay', 'Microsoft.XboxGameOverlay' }
  $n = 0
  # Every package and every provisioned package once; asking per pattern cost twenty-five seconds.
  $allPkgs = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue)
  $allProv = @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue)
  foreach ($pat in $junk) {
    foreach ($pkg in @($allPkgs | Where-Object { $_.Name -like $pat })) {
      if ($pkg.NonRemovable -or $pkg.IsFramework) { continue }
      try {
        Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction Stop
        Record @{ type = 'appx'; name = $pkg.Name }; $n++; Did $pkg.Name
      } catch {
        try { Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction Stop; Record @{ type = 'appx'; name = $pkg.Name }; $n++; Did $pkg.Name } catch { }
      }
    }
    foreach ($prov in @($allProv | Where-Object { $_.DisplayName -like $pat })) {
      try { Remove-AppxProvisionedPackage -Online -PackageName $prov.PackageName -ErrorAction Stop | Out-Null } catch { }
    }
  }
  Say ("  {0} removed. Spotify, the Store, the Xbox apps{1}, Photos, Calculator, Media Player, Snipping Tool, Terminal and Notepad stay." -f (Plural $n 'app' 'apps'), $(if ($CutXbox) { ' (no - you said -CutXbox)' } else { '' }))
}

# ---------------------------------------------------------------------------
# debloat: gone, and kept gone
# ---------------------------------------------------------------------------
function Get-DebloatPlan($m) {
  # What is actually on this PC from the two lists above, with the keep rules applied.
  $caps = @(); $feats = @()
  $dismLog = Join-Path $env:TEMP 'omnidx-dism.log'
  # DISM is asked only where nothing cheaper can answer. Measured on the build machine (the check's discovery
  # step, 1.62.0): every name asked of DISM costs half a second warm and a second cold, and the free look asked
  # fifteen. The component store's own record in the registry lists all 7,844 packages in under a second and
  # says which are installed (state 112; an older version of the same package sits at 64, a removed one at 5
  # and then 0), and the optional-feature class answers every feature name at once in one to four seconds.
  # A listing through DISM itself is the one thing never done: 77 to 90 seconds (1.44.0 to 1.47.0).
  $pk = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\Packages'
  $pkgs = $null; try { $pkgs = @(Get-ChildItem -Path $pk -Name -ErrorAction Stop) } catch { $pkgs = $null }
  foreach ($c in $script:Capabilities) {
    if ($c[0] -eq 'Print.Fax.Scan' -and $m.printers) { continue }
    if ($c[0] -eq 'Hello.Face' -and $m.biometric) { continue }
    $decided = $false
    if ($pkgs -ne $null) {
      # Nothing in the component store mentions the piece: it is not on this PC, and DISM need not be asked.
      $cands = @($pkgs | Where-Object { $_ -match $script:CapabilityHints[$c[0]] })
      if (-not $cands.Count) { continue }
      # A known package name decides by its state; any other name is left to DISM.
      $prefixes = @(); if ($script:CapabilityPackages.ContainsKey($c[0])) { $prefixes = @($script:CapabilityPackages[$c[0]]) }
      if ($prefixes.Count) {
        $mine = @($cands | Where-Object { $n = $_; @($prefixes | Where-Object { $n.StartsWith($_, [System.StringComparison]::OrdinalIgnoreCase) }).Count -gt 0 })
        if ($mine.Count) {
          $decided = $true
          foreach ($n in $mine) {
            $state = -1; try { $state = [int](Get-Item -Path (Join-Path $pk $n) -ErrorAction Stop).GetValue('CurrentState') } catch { }
            if ($state -eq 112) { $caps += @{ name = $script:CapabilityIds[$c[0]][0]; what = $c[1] }; break }
          }
        }
      }
    }
    if ($decided) { continue }
    foreach ($id in $script:CapabilityIds[$c[0]]) {
      try { $hit = Get-WindowsCapability -Online -Name $id -LogPath $dismLog -ErrorAction Stop; if ($hit -and $hit.State -eq 'Installed') { $caps += @{ name = $hit.Name; what = $c[1] }; break } } catch { }
    }
  }
  # Every optional feature's state in one read (1 is enabled); DISM by name is the fallback when the class fails.
  # Its cost is the servicing stack's cold start, six to ten seconds on the build machine, and that cost stays
  # here: read in a runspace alongside the machine read (1.65.0) it doubled the read's own WMI laps and the whole
  # look came out five seconds slower on two samples.
  $featState = $null
  try { $featState = @{}; foreach ($o in @(Get-CimInstance -ClassName Win32_OptionalFeature -OperationTimeoutSec 60 -ErrorAction Stop)) { $featState["$($o.Name)"] = [int]$o.InstallState } } catch { $featState = $null }
  foreach ($f in $script:Features) {
    # The old Media Player is a capability and a feature on newer builds; removing the capability takes the feature with it, so it is one item, not two.
    if ($f[0] -eq 'WindowsMediaPlayer' -and ($caps | Where-Object { $_.name -like 'Media.WindowsMediaPlayer*' })) { continue }
    if ($featState -ne $null) { if ($featState.ContainsKey($f[0]) -and $featState[$f[0]] -eq 1) { $feats += @{ name = $f[0]; what = $f[1] } }; continue }
    # A name this build does not have is an error here, and simply not on the list.
    try { $hit = Get-WindowsOptionalFeature -Online -FeatureName $f[0] -LogPath $dismLog -ErrorAction Stop; if ($hit -and $hit.State -eq 'Enabled') { $feats += @{ name = $hit.FeatureName; what = $f[1] } } } catch { }
  }
  $hk = $script:HKCU
  $oneSignedIn = (Test-Path "$hk\Software\Microsoft\OneDrive\Accounts\Personal") -or (Test-Path "$hk\Software\Microsoft\OneDrive\Accounts\Business1")
  $oneSetup = @("$env:SystemRoot\System32\OneDriveSetup.exe", "$env:SystemRoot\SysWOW64\OneDriveSetup.exe", (Join-Path $script:LocalAppData 'Microsoft\OneDrive\OneDriveSetup.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
  $oneInstalled = [bool]($oneSetup -and ((Get-Process OneDrive -ErrorAction SilentlyContinue) -or (Test-Path (Join-Path $script:LocalAppData 'Microsoft\OneDrive\OneDrive.exe')) -or (Test-Path "$env:ProgramFiles\Microsoft OneDrive\OneDrive.exe")))
  @{ caps = $caps; feats = $feats; oneSignedIn = $oneSignedIn; oneInstalled = $oneInstalled; oneSetup = $oneSetup }
}

function Debloat($m) {
  Head "Debloat"
  # Where this phase's time goes, on one line at the end: it has ranged from 36 to 115 seconds on the build machine
  # and the batch line alone (about 20 s) did not explain it. The look, the pieces and the features are timed apart.
  $dt = [System.Diagnostics.Stopwatch]::StartNew(); $dtimes = [ordered]@{}
  $plan = Get-DebloatPlan $m
  $dtimes['look'] = [math]::Round($dt.Elapsed.TotalSeconds, 1); $dt.Restart()
  # OneDrive: gone if nobody is signed in to it. Signed in means in use; it then only loses its auto-start.
  if ($plan.oneInstalled) {
    if ($plan.oneSignedIn) { Keep 'OneDrive' 'you are signed in to it; it just no longer starts with Windows'; Did "OneDrive kept: signed in" }
    else {
      try {
        Get-Process OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Process $plan.oneSetup -ArgumentList '/uninstall' -Wait -WindowStyle Hidden -ErrorAction Stop
        Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OneDrive' 'DisableFileSyncNGSC' 1
        Record @{ type = 'onedrive'; setup = $plan.oneSetup }
        Did "OneDrive uninstalled (nobody was signed in to it). Your files stay where they are; undo reinstalls it."
      } catch { Warn ("OneDrive would not uninstall ({0})." -f $_.Exception.Message) }
    }
  }
  # Legacy pieces of Windows nobody has opened in years. Each one is re-enabled by undo.
  # All of them in one DISM session first: Remove-WindowsCapability opens a session
  # per call and each took ten to fifteen seconds on the build machine.
  $batched = $false
  if (@($plan.caps).Count -gt 1) {
    $dargs = @('/online', '/Remove-Capability') + @($plan.caps | ForEach-Object { "/CapabilityName:$($_.name)" }) + @('/NoRestart', '/Quiet')
    $dsw = [System.Diagnostics.Stopwatch]::StartNew()
    & dism.exe @dargs *>&1 | Out-Null
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 3010) { $batched = $true; foreach ($c in $plan.caps) { Record @{ type = 'capability'; name = $c.name }; Did ("removed {0}" -f $c.what) }; Say ("  ({0} pieces in one DISM session, {1} s)" -f @($plan.caps).Count, [int]$dsw.Elapsed.TotalSeconds) }
    else { Say ("  (DISM would not take them together, exit {0}; one at a time)" -f $LASTEXITCODE) }
  }
  if (-not $batched) {
    foreach ($c in $plan.caps) {
      # A batch that stopped part way may have taken this one already.
      $state = $null; try { $state = (Get-WindowsCapability -Online -Name $c.name -ErrorAction Stop).State } catch { }
      if ("$state" -eq 'NotPresent') { Record @{ type = 'capability'; name = $c.name }; Did ("removed {0}" -f $c.what); continue }
      try { Remove-WindowsCapability -Online -Name $c.name -ErrorAction Stop | Out-Null; Record @{ type = 'capability'; name = $c.name }; Did ("removed {0}" -f $c.what) } catch { Warn ("Could not remove {0} ({1})." -f $c.what, $_.Exception.Message) }
    }
  }
  $dtimes['pieces'] = [math]::Round($dt.Elapsed.TotalSeconds, 1); $dt.Restart()
  foreach ($f in $plan.feats) {
    # A capability removed a moment ago can take the feature with it (the 2009 Media Player is both); look again before touching it.
    $still = $null; try { $still = Get-WindowsOptionalFeature -Online -FeatureName $f.name -ErrorAction Stop } catch { }
    if (-not $still -or $still.State -ne 'Enabled') { Did ("already gone: {0}" -f $f.what); continue }
    # The cmdlet warns "Restart is suppressed because NoRestart is specified" on every call; the run's own Done line says restart.
    try { Disable-WindowsOptionalFeature -Online -FeatureName $f.name -NoRestart -WarningAction SilentlyContinue -ErrorAction Stop | Out-Null; Record @{ type = 'feature'; name = $f.name }; Did ("off: {0}" -f $f.what) } catch { Warn ("Could not switch off {0} ({1})." -f $f.what, $_.Exception.Message) }
  }
  $dtimes['features'] = [math]::Round($dt.Elapsed.TotalSeconds, 1); $dt.Restart()
  # Edge's add-ons: shopping, recommendations, Spotlight, feedback and reporting. Your tabs and settings are untouched.
  $edge = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
  Set-Reg $edge 'EdgeShoppingAssistantEnabled' 0
  Set-Reg $edge 'ShowRecommendationsEnabled' 0
  Set-Reg $edge 'SpotlightExperiencesAndRecommendationsEnabled' 0
  Set-Reg $edge 'PersonalizationReportingEnabled' 0
  Set-Reg $edge 'DiagnosticData' 0
  Set-Reg $edge 'UserFeedbackAllowed' 0
  Set-Reg $edge 'HideFirstRunExperience' 1
  Set-Reg $edge 'EdgeEnhanceImagesEnabled' 0
  Did "Edge: shopping assistant, recommendations, Spotlight, feedback prompts and reporting off"
  # Kept gone: the switches that stop Windows quietly putting apps and suggestions back.
  $cc = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'
  Set-Reg $cc 'DisableWindowsConsumerFeatures' 1
  Set-Reg $cc 'DisableCloudOptimizedContent' 1
  Set-Reg $cc 'DisableConsumerAccountStateContent' 1
  Set-Reg $cc 'DisableSoftLanding' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Explorer' 'DisableSearchBoxSuggestions' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'AllowCloudSearch' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\SystemSettings\AccountNotifications' 'EnableAccountNotifications' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\UserProfileEngagement' 'ScoobeSystemSettingEnabled' 0
  Did "Kept gone: consumer features, suggested apps, account nags and the 'finish setting up' screen are off by policy"
  Say "  Feature updates can re-provision a few Microsoft apps (Outlook, Teams, Copilot). Run the command again after one; same key, same PC, free."
  Say ("  (debloat, where the time went: look {0} s, pieces {1} s, features {2} s)" -f $dtimes['look'], $dtimes['pieces'], $dtimes['features'])
}

<# Caches and temp files that Windows never clears itself. Not undoable,
   because none of it is anything: downloaded update installers already
   applied, peer-to-peer update chunks, temp files older than a day. #>
function Clear-Junk {
  Head "Cleanup"
  $drive = $env:SystemDrive.Substring(0, 1)
  $free0 = 0; try { $free0 = (Get-PSDrive -Name $drive -ErrorAction Stop).Free } catch { }
  foreach ($dir in @($env:TEMP, "$env:SystemRoot\Temp", (Join-Path $script:LocalAppData 'Temp'))) {
    if (-not $dir -or -not (Test-Path $dir)) { continue }
    Get-ChildItem $dir -Force -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
  try {
    Stop-Service wuauserv -Force -ErrorAction SilentlyContinue; Stop-Service bits -Force -ErrorAction SilentlyContinue
    Get-ChildItem "$env:SystemRoot\SoftwareDistribution\Download" -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  } finally { Start-Service bits -ErrorAction SilentlyContinue; Start-Service wuauserv -ErrorAction SilentlyContinue }
  # The cmdlet narrates ("Deleting...", "Successfully deleted") on the information stream; every stream goes quiet.
  try { Delete-DeliveryOptimizationCache -Force -ErrorAction Stop *> $null } catch { }
  $free1 = 0; try { $free1 = (Get-PSDrive -Name $drive -ErrorAction Stop).Free } catch { }
  $mb = [math]::Max(0, [math]::Round(($free1 - $free0) / 1MB))
  if ($mb -ge 1) { Did ("Temp files, the Windows Update download cache and the peer-to-peer update cache cleared: about {0} MB back." -f $mb) }
  else { Did "Temp files, the Windows Update download cache and the peer-to-peer update cache checked: nothing older than a day to clear." }
  Say "  Windows.old (a previous Windows, up to 20 GB) is left alone; Settings > System > Storage > Cleanup recommendations removes it when you are sure."
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
  Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'ShowStartupPanel' 0
  # The presence writer is the one Game Bar process that runs whether or not the bar is open.
  # Game Bar's presence writer, where Game Bar is installed at all; a PC without it has nothing to switch off.
  $pw = 'HKLM:\SOFTWARE\Microsoft\WindowsRuntime\ActivatableClassId\Windows.Gaming.GameBar.PresenceServer.Internal.PresenceWriter'
  if (Test-Path $pw) { Set-Reg $pw 'ActivationType' 0 }
  # Edge: no pre-launch, no background tabs after close.
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'StartupBoostEnabled' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'BackgroundModeEnabled' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'HardwareAccelerationModeEnabled' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'HubsSidebarEnabled' 0
  # Recall (24H2 and later): nothing screenshots your desktop every few seconds.
  Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
  # Typing and inking history stays on the PC (the personal dictionary stops learning; voice typing is untouched),
  # handwriting errors are not reported, the compatibility inventory is off, the Store cannot push installs from
  # the web, the clipboard is not synced through the cloud, and nobody can offer to take the screen over through
  # Remote Assistance (Quick Assist is separate and comes back from the Store). On 11, the account nags on Start go.
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\InputPersonalization' 'RestrictImplicitInkCollection' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\InputPersonalization' 'RestrictImplicitTextCollection' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\TabletPC' 'PreventHandwritingDataSharing' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppCompat' 'DisableInventory' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppCompat' 'AITEnable' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\PushToInstall' 'DisablePushToInstall' 1
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'AllowCrossDeviceClipboard' 0
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Remote Assistance' 'fAllowToGetHelp' 0
  if ($m.win -eq 11) { Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'Start_AccountNotifications' 0 }
  # Lock screen tips and Spotlight ads; Windows Error Reporting off (its service already is).
  Set-Reg $cdm 'RotatingLockScreenOverlayEnabled' 0
  Set-Reg $cdm 'SubscribedContent-338387Enabled' 0
  Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting' 'Disabled' 1
  # The classic right-click menu on 11: one click fewer, every time.
  if ($m.win -eq 11) { Set-Reg 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32' '(default)' '' 'String' }
  Did "Telemetry, the advertising id, activity history, suggestions, Bing in Start, Recall and Edge's reporting off; background apps off; widgets, news, Copilot and Cortana off; Game DVR off, Game Mode on; the classic right-click menu on 11"
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
  # Windows 11 22H2 and later: "End task" on the taskbar's right-click menu, for the game that stops answering.
  if ($m.build -ge 22621) { Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced\TaskbarDeveloperSettings' 'TaskbarEndTask' 1 }
  # The ten-second delay Windows puts in front of startup apps: gone, so anything you kept starts at once.
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize' 'StartupDelayInMSec' 0
  # Store apps pre-launching in the background (Edge, mostly).
  try { if ((Get-MMAgent -ErrorAction Stop).ApplicationPreLaunch) { Disable-MMAgent -ApplicationPreLaunch -ErrorAction Stop; Record @{ type = 'mmagent'; feature = 'ApplicationPreLaunch' }; Did "App pre-launch off" } } catch { }
  # NTFS: stop writing "last accessed" on every file read; let the file system
  # cache more with 16 GB or more; make sure TRIM is on for the SSDs (a
  # cloned or old install sometimes has it off, and the SSD slows over months).
  $fs = { param($setting, $want, $why)
    try {
      $q = (& fsutil behavior query $setting 2>$null) -join ' '
      if ($q -match '= (\d)') { $prev = $Matches[1]; if ($prev -ne $want) { & fsutil behavior set $setting $want | Out-Null; Record @{ type = 'fsutil'; setting = $setting; prev = $prev }; Did $why } }
    } catch { }
  }
  & $fs 'disablelastaccess' '1' 'NTFS last-access stamps off'
  if ($m.ramGb -ge 16) { & $fs 'memoryusage' '2' 'NTFS allowed more memory for its cache' }
  if ($m.allSsd -or $m.nvme) { & $fs 'DisableDeleteNotify' '0' 'TRIM was off for the SSDs; on' }
  # An old guide's "bcdedit /set useplatformclock true" forces the slow HPET as the clock
  # source on a modern CPU: every timer read costs more, and frame pacing suffers. Windows
  # chooses better on its own. The value goes, and undo sets it back.
  $bcd = (& bcdedit /enum '{current}' 2>$null) -join ' '
  if ($bcd -match 'useplatformclock\s+Yes') {
    & bcdedit /deletevalue useplatformclock 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Record @{ type = 'bcdset'; name = 'useplatformclock'; prev = 'true' }; Did "A forced platform clock (HPET) from an old guide removed; Windows picks the clock source again after a restart" }
  }
  Limit-Defender $m
  Say "  Scheduler set for the game in front, throttling off, visuals lean, mouse acceleration off, HAGS on, Defender's scans capped."
}

<# Defender stays, and its scheduled scans stop taking half the CPU: the cap
   is for scans only, never real-time protection, and only while Defender is
   the antivirus in charge. Undo puts the old figure back. #>
function Limit-Defender($m) {
  if ($m.otherAv.Count) { return }
  try {
    $pref = Get-MpPreference -ErrorAction Stop
    $was = [int]$pref.ScanAvgCPULoadFactor
    # A cap is only ever lowered: a PC that already holds its scans under 25% (0 means no cap at all) keeps its own figure.
    if ($was -eq 0 -or $was -gt 25) {
      Set-MpPreference -ScanAvgCPULoadFactor 25 -ErrorAction Stop
      Record @{ type = 'mppref'; name = 'ScanAvgCPULoadFactor'; prev = $was }
      Did ("Defender's scheduled scans capped at 25% of the CPU (was {0}); real-time protection untouched" -f $(if ($was) { "$was%" } else { 'no cap' }))
    } elseif ($was -lt 25) {
      Did ("Defender's scheduled scans already capped at {0}% of the CPU, lower than the tune's 25%: left as it is" -f $was)
    }
  } catch { }
}

# ---------------------------------------------------------------------------
# the OmniDx power plan
# ---------------------------------------------------------------------------
function New-PowerPlan($m) {
  Head "The OmniDx power plan"
  $prevActive = $null
  $act = (& powercfg /getactivescheme) -join ' '
  if ($act -match '([0-9a-f\-]{36})') { $prevActive = $Matches[1] }
  # An OmniDx plan from a previous run is kept and its settings re-applied
  # (every value below is idempotent), so a second run records no power
  # change and putting back a later run alone leaves the plan standing.
  $guid = $null; $created = $null
  foreach ($line in (& powercfg /list)) { if ($line -match '([0-9a-f\-]{36}).*\(OmniDx\)') { $guid = $Matches[1] } }
  if (-not $guid) {
    $ultimate = 'e9a42b02-d5df-448d-aa00-03f14749eb61'; $high = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
    $dup = (& powercfg /duplicatescheme $ultimate) -join ' '
    if ($dup -notmatch '([0-9a-f\-]{36})') { $dup = (& powercfg /duplicatescheme $high) -join ' ' }
    if ($dup -notmatch '([0-9a-f\-]{36})') { Warn "Could not create the power plan."; return }
    $guid = $Matches[1]; $created = $guid
    & powercfg /changename $guid 'OmniDx' 'Built by OmniDx Tune for performance. Undo restores the plan that was active before.' | Out-Null
  }
  $sub = @{ proc = '54533251-82be-4824-96c1-47b60b740d00'; pci = '501a4d13-42af-4429-9fd1-a8218c268e20'; usb = '2a737441-1930-4402-8d77-b2bebba308a3'; disk = '0012ee47-9041-4b5d-9b77-535fba8b1442'; sleep = '238c9fa8-0aad-41ed-83f4-97be242c8f20'; video = '7516b95f-f776-4464-8c53-06167f40cc99'; buttons = '4f971e89-eebd-4455-a8de-9e59040e7347'; gfx = '5fb4938d-1ee8-4b0f-9a3c-5036b0ab995c'; wifi = '19cbb8fa-5279-450e-9fac-8a3d5fedd0c1' }
  # A setting this PC's power driver does not have makes powercfg print an error; that is counted, not shown in red.
  $script:PowerSkipped = 0
  $set = { param($s, $v, $val) $null = & powercfg /setacvalueindex $guid $s $v $val 2>&1; if ($LASTEXITCODE -ne 0) { $script:PowerSkipped++ } }
  # Processor: 100% minimum and maximum, aggressive boost, no core parking, no idle demotion games.
  & $set $sub.proc '893dee8e-2bef-41e0-89c6-b55d0929964c' 100      # min state
  & $set $sub.proc 'bc5038f7-23e0-4960-96da-33abaf5935ec' 100      # max state
  & $set $sub.proc 'be337238-0d82-4146-a960-4f3749d470c7' 2        # boost mode: aggressive
  & $set $sub.proc '0cc5b647-c1df-4637-891a-dec35c318583' 100      # core parking min cores
  & $set $sub.proc 'ea062031-0e34-4ff1-9b6d-eb1059334028' 100      # core parking max cores
  & $set $sub.proc '94d3a615-a899-4ac5-ae2b-e4d8f634367f' 1        # system cooling: active
  & $set $sub.proc '45bcc044-d885-43e2-8605-ee0ec6e96b59' 100      # boost policy
  & $set $sub.proc '36687f9e-e3a5-4dbf-b1dc-15eb381c6863' 0        # energy performance preference: performance. The value a CPPC / HWP CPU reads to pick its clocks (Balanced says 25%).
  & $set $sub.proc '36687f9e-e3a5-4dbf-b1dc-15eb381c6864' 0        # the same for the efficiency cores, where the CPU has them
  if (-not $m.laptop) { & $set $sub.proc '3b04d4fd-1cc7-4f23-ab1c-d1337819c4bb' 0 }  # throttle states: off (desktop; hardware thermal protection is separate)
  & $set $sub.wifi '12bbebe6-58d6-4636-95bb-3217ef867c1a' 0        # wireless adapter power saving: maximum performance (the cause of most Wi-Fi ping spikes)
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
  if ($script:PowerSkipped) { Did ("{0} plan setting(s) this PC does not have were skipped." -f $script:PowerSkipped) }
  if ($created -or ($prevActive -ne $guid)) {
    & powercfg /setactive $guid | Out-Null
    Record @{ type = 'power'; prev = $prevActive; created = $created }
    Did "OmniDx plan created and active: CPU 100/100, boost aggressive, energy preference on performance, no core parking, no throttle states on a desktop, PCIe, USB and Wi-Fi power saving off, no sleep on mains."
  } else { Did "OmniDx plan already active; its settings checked and re-applied." }
  # Hibernation off frees the hiberfile and ends Fast Startup for good - on a desktop.
  if (-not $m.laptop) {
    # The registry says whether hibernation is on in any language; powercfg's text is the fallback.
    $hibOn = $false
    try { $hibOn = ((Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -ErrorAction Stop).HibernateEnabled -eq 1) } catch { $hibOn = (((& powercfg /a) -join ' ') -match 'Hibernate') }
    if ($hibOn) { & powercfg /h off | Out-Null; Record @{ type = 'hibernate'; prev = 'on' }; Did "Hibernation off (desktop): hiberfil.sys gone, clean boots." }
  }
}

# ---------------------------------------------------------------------------
# network: for the game's packets, not for downloads
# ---------------------------------------------------------------------------
function Tune-Network($m) {
  Head "Network"
  # Already set by an earlier run (read back in English; another language re-applies, which is harmless): nothing recorded, so a later run put back alone leaves it.
  $g = (& netsh int tcp show global 2>$null) -join ' '
  if ($g -match 'ECN Capability\s*:\s*disabled' -and $g -match 'Timestamps\s*:\s*disabled' -and $g -match 'Coalescing State\s*:\s*disabled' -and $g -match 'Initial RTO\s*:\s*2000' -and $g -match 'Auto-Tuning Level\s*:\s*normal') {
    Did "TCP already set: autotuning normal, ECN and timestamps off, receive-side scaling on, segment coalescing off."
  } else {
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
  }
  # Nagle off on the adapter you actually use: small packets go now, not after a 200 ms wait.
  $active = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Sort-Object -Property LinkSpeed -Descending
  $ifBase = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces'
  foreach ($a in $active) {
    Say ("  Live adapter: {0} ({1})" -f $a.Name, $a.LinkSpeed)
    $guid = $a.InterfaceGuid
    $p = Join-Path $ifBase $guid
    if (Test-Path $p) { Set-Reg $p 'TcpAckFrequency' 1; Set-Reg $p 'TCPNoDelay' 1; Set-Reg $p 'TcpDelAckTicks' 0 }
    # Adapter power saving and interrupt coalescing off; the names differ by driver, so try each.
    try {
      $pm = Get-NetAdapterPowerManagement -Name $a.Name -ErrorAction Stop
      if ("$($pm.AllowComputerToTurnOffDevice)" -eq 'Enabled' -or "$($pm.DeviceSleepOnDisconnect)" -eq 'Enabled') { Disable-NetAdapterPowerManagement -Name $a.Name -ErrorAction Stop; Record @{ type = 'nicpower'; adapter = $a.Name } }
    } catch { }
    foreach ($prop in @(@('Energy-Efficient Ethernet', 'Disabled'), @('Energy Efficient Ethernet', 'Disabled'), @('EEE', 'Disabled'), @('Green Ethernet', 'Disabled'), @('Power Saving Mode', 'Disabled'), @('Interrupt Moderation', 'Disabled'), @('Ultra Low Power Mode', 'Disabled'), @('Advanced EEE', 'Disabled'), @('Gigabit Lite', 'Disabled'), @('System Idle Power Saver', 'Disabled'), @('Reduce Speed On Power Down', 'Disabled'), @('Flow Control', 'Disabled'))) {
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
  @{ name = 'Minecraft'; exes = @('Minecraft.Windows.exe', 'MinecraftLauncher.exe', 'Minecraft.exe'); notes = @('Java edition: use Sodium (or OptiFine) and give Java 4 GB in the launcher, not more; render distance 12.', 'Bedrock: V-Sync off, render distance 12 chunks, fancy leaves off.') },
  @{ name = 'Roblox'; exes = @('RobloxPlayerBeta.exe'); notes = @('Graphics mode Manual, quality level 3-5, and turn "Reduce Motion" on in settings for the steadiest frames.') },
  @{ name = 'League of Legends'; exes = @('League of Legends.exe'); notes = @('Character quality medium, environment low, effects low, shadows off, anti-aliasing off, frame rate cap uncapped or 240.') },
  @{ name = 'GTA V / Online'; exes = @('GTA5.exe', 'GTA5_Enhanced.exe', 'FiveM.exe', 'FiveM_GTAProcess.exe'); notes = @('FXAA on, MSAA off, VSync off, population density 60%, shadow quality normal, reflection quality normal, grass normal, extended distance scaling off.') },
  @{ name = 'Rust'; exes = @('RustClient.exe'); notes = @('Launch options: -high -maxMem=16384 -malloc=system -force-feature-level-11-0', 'Anti-aliasing FXAA, water quality 0, shadow quality 0, draw distance 1500, grass displacement off.') },
  @{ name = 'Escape from Tarkov'; exes = @('EscapeFromTarkov.exe'); notes = @('Texture quality high (VRAM permitting), shadows low, object LOD 2, overall visibility 400, HBAO off, SSR off, anisotropic per texture.') },
  @{ name = 'PUBG'; exes = @('TslGame.exe'); notes = @('Render scale 100, anti-aliasing low, post-processing very low, shadows very low, textures medium, effects very low, foliage very low, view distance medium.') },
  @{ name = 'The Finals'; exes = @('Discovery-Win64-Shipping.exe', 'Discovery.exe'); notes = @('Destruction is CPU work, so the GPU settings are cheap: texture quality high is free, global illumination low is where the frames are.', 'DLSS / FSR on Quality at 1440p and above; Reflex on + boost; V-Sync and motion blur off.') },
  @{ name = 'Dota 2'; exes = @('dota2.exe'); notes = @('Launch options in Steam: -high -novid', 'Video > use advanced settings: everything low except texture quality, shadow quality off, V-Sync off, max frames 240 or your refresh rate.') },
  @{ name = 'Battlefield 6'; exes = @('BF6.exe', 'bf6.exe'); notes = @('Mesh quality low is the competitive setting (fewer objects drawn); texture quality high is free; effects, lighting and undergrowth low.', 'Future frame rendering on unless input feels heavy; Reflex / Anti-Lag on; DLSS / FSR Quality at 1440p and above.') },
  @{ name = 'Deadlock'; exes = @('project8.exe'); notes = @('Launch options in Steam: -high -novid', 'Shadow quality low, texture quality high, effect detail low; the frame limiter is fps_max in the console.') },
  @{ name = 'Delta Force'; exes = @('DeltaForceClient-Win64-Shipping.exe'); notes = @('DirectX 12 mode, global illumination off, shadows low, anti-aliasing DLSS / FSR Quality, frame limit at your refresh rate.') },
  @{ name = 'ARC Raiders'; exes = @('PioneerGame-Win64-Shipping.exe', 'PioneerGame.exe'); notes = @('Frame generation off for aim; DLSS / FSR Quality; global illumination and shadows low, the rest medium; motion blur off.') },
  @{ name = 'Helldivers 2'; exes = @('helldivers2.exe'); notes = @('Async compute on, render scale native or Quality upscale, anti-aliasing TAA, shadow quality low, particle quality medium, volumetric fog low.') },
  @{ name = 'Warframe'; exes = @('Warframe.x64.exe'); notes = @('DirectX 12 and the enhanced graphics engine on a recent GPU; dynamic resolution off, motion blur off, V-Sync off, max framerate at your refresh rate.') },
  @{ name = 'Destiny 2'; exes = @('destiny2.exe'); notes = @('Framerate cap at your refresh rate (uncapped spikes the CPU); shadow quality low, depth of field and motion blur off, texture quality high, field of view 105.') },
  @{ name = 'Halo Infinite'; exes = @('HaloInfinite.exe'); notes = @('Quality preset low, texture filtering high, async compute on, maximum frame rate at your refresh, minimum frame rate off.') },
  @{ name = 'Dead by Daylight'; exes = @('DeadByDaylight-Win64-Shipping.exe'); notes = @('Quality low, resolution 100%, anti-aliasing off, frame limit 120: the engine ties some timings to the cap.') },
  @{ name = 'Hunt: Showdown 1896'; exes = @('HuntGame.exe'); notes = @('Graphics quality low, texture quality high, shadows medium (you need to see into them), anti-aliasing DLSS / FSR Quality, motion blur off.') },
  @{ name = 'War Thunder'; exes = @('aces.exe'); notes = @('Movie preset off; grass, clouds and water low; anti-aliasing off or TAA at high refresh; V-Sync off.') },
  @{ name = 'World of Warcraft'; exes = @('Wow.exe', 'WowClassic.exe'); notes = @('Graphics quality 5-7, shadow quality low, view distance 7, particle density low, DirectX 12, target FPS at your refresh rate.') },
  @{ name = 'Squad'; exes = @('SquadGame.exe'); notes = @('Shadows low, ambient occlusion off, texture quality high, foliage medium (low removes cover for you only), anti-aliasing FXAA.') },
  @{ name = 'Battlefield 2042'; exes = @('BF2042.exe'); notes = @('Mesh quality low (fewer objects drawn), undergrowth low, effects and lighting low, texture quality high; future frame rendering on; DLSS / FSR Quality at 1440p and above.') },
  @{ name = 'EA Sports FC 26'; exes = @('FC26.exe', 'FC25.exe'); notes = @('Rendering quality medium, MSAA 2x, strand-based hair off, dynamic resolution off, in-game frame limiter off and the cap set at your refresh rate in the driver; DirectX 12.') },
  @{ name = 'NBA 2K26'; exes = @('NBA2K26.exe', 'NBA2K25.exe'); notes = @('Anti-aliasing off or 2x, shadow quality low, crowd detail low, floor reflections off, depth of field off; the frame cap at your refresh rate.') },
  @{ name = 'Palworld'; exes = @('Palworld-Win64-Shipping.exe'); notes = @('DLSS / FSR Quality, view distance medium, grass medium, shadows low, ray tracing off, max FPS at your refresh rate; the world is CPU work, the rest is cheap.') },
  @{ name = 'Path of Exile 2'; exes = @('PathOfExileSteam.exe', 'PathOfExile.exe'); notes = @('DirectX 12 or Vulkan (try both), dynamic culling on, dynamic resolution off, shadows and global illumination low, textures high, frame cap at your refresh rate; the engine multithreading setting on.') },
  @{ name = 'Diablo IV'; exes = @('Diablo IV.exe'); notes = @('Texture quality high (12 GB of VRAM or more), shadows low, SSAO off, fog quality low, reflections off, DLSS / FSR Quality, Reflex on.') },
  @{ name = 'Monster Hunter Wilds'; exes = @('MonsterHunterWilds.exe'); notes = @('DirectX 12, DLSS / FSR Quality, frame generation off unless you are already above 60, shadows medium, ambient occlusion low, ray tracing off, texture quality high with 12 GB of VRAM or more.') },
  @{ name = 'Elden Ring / Nightreign'; exes = @('eldenring.exe', 'nightreign.exe'); notes = @('The engine caps at 60; borderless, auto-detect off, shadows medium, SSAO low, ray tracing off, motion blur off. Steady 60 beats anything else here.') },
  @{ name = 'Cyberpunk 2077'; exes = @('Cyberpunk2077.exe'); notes = @('DLSS / FSR Quality, ray tracing off below an RTX 4070 class card, crowd density medium, screen space reflections low, volumetric fog medium, Reflex on + boost.') },
  @{ name = "Baldur's Gate 3"; exes = @('bg3.exe', 'bg3_dx11.exe'); notes = @('Vulkan on NVIDIA, DirectX 11 on AMD (try both), DLSS / FSR Quality, shadows medium, ambient occlusion off, model detail high, animation level of detail off.') },
  @{ name = 'Star Citizen'; exes = @('StarCitizen.exe'); notes = @('Vulkan renderer, upscaling on, clouds low, volumetric fog low, scattered object distance low; the game is CPU and memory bound: 32 GB and an NVMe drive matter more than any setting.') },
  @{ name = 'DayZ'; exes = @('DayZ_x64.exe', 'DayZ_BE.exe'); notes = @('Object detail low, terrain detail high (spotting), shadows low, ambient occlusion off, post-processing off, clouds low, anti-aliasing FXAA or off.') },
  @{ name = 'Arma Reforger'; exes = @('ArmaReforgerSteam.exe', 'ArmaReforger.exe'); notes = @('Overall quality medium, object draw distance medium, shadows low, anti-aliasing FXAA, VRAM limit 90%, frame cap at your refresh rate.') },
  @{ name = 'Hell Let Loose'; exes = @('HLL-Win64-Shipping.exe'); notes = @('Shadows low, foliage low (less grass drawn at range, for you only), post-processing low, anti-aliasing TAA, textures high, view distance high.') },
  @{ name = 'Genshin Impact'; exes = @('GenshinImpact.exe'); notes = @('Render resolution 1.0, frame rate 120 where offered, shadows medium, volumetric fog off, motion blur off, anti-aliasing SMAA.') },
  @{ name = 'Ready or Not'; exes = @('ReadyOrNot-Win64-Shipping.exe'); notes = @('Shadows low, anti-aliasing TAA, texture quality high, ambient occlusion low, DLSS / FSR Quality, motion blur off.') },
  @{ name = 'Final Fantasy XIV'; exes = @('ffxiv_dx11.exe'); notes = @('DirectX 11, DLSS Quality, shadows: self and party only, ambient occlusion off, real-time reflections off, frame rate cap at your refresh rate.') },
  @{ name = 'STALKER 2'; exes = @('Stalker2-Win64-Shipping.exe'); notes = @('Global illumination (Lumen) low is the whole cost, shadows medium, DLSS / FSR Quality, frame generation off, texture quality high, hair quality low.') },
  @{ name = 'Sea of Thieves'; exes = @('SoTGame.exe'); notes = @('Water detail low, sail quality low, shadow quality low, model detail medium, particle detail low, anti-aliasing TAA, frame cap at your refresh rate.') }
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
  foreach ($r in 'C:\Riot Games', 'D:\Riot Games', 'C:\XboxGames', 'D:\XboxGames', 'C:\Games', 'D:\Games', (Join-Path $script:LocalAppData 'Programs'), (Join-Path $script:LocalAppData 'Roblox\Versions')) {
    if ($r -and (Test-Path $r) -and -not $roots.Contains($r)) { [void]$roots.Add($r) }
  }
  # Program Files, folder by folder, leaving out the vendors no game ships under: walking all of it took twenty seconds.
  $noGame = '^(Microsoft.*|Windows.*|Common Files|Internet Explorer|Git|dotnet|NVIDIA.*|Intel.*|AMD.*|Google|Mozilla.*|Adobe|Java|Python.*|nodejs|Docker.*|WindowsApps|ModifiableWindowsApps|PowerShell|7-Zip|VideoLAN|Realtek.*|Logitech.*|Corsair|Razer.*|Oracle|OpenJDK|Eclipse.*|Android|JetBrains|MSBuild|Reference Assemblies|WindowsPowerShell|MySQL|PostgreSQL|Amazon.*|Azure.*|Notepad\+\+|CMake|LLVM|Go|Rust.*|Mercurial|Subversion|OpenSSL|Uninstall Information|Wolfram.*|Zoom|Slack|Dropbox|OneDrive|Waves.*|Dolby|Creative|Sonic.*|Hyper-V|Application Verifier|Debugging Tools.*|IIS.*|SQL Server.*|Visual Studio.*|Dell|HP|Lenovo|ASUS|MSI|Gigabyte)$'
  foreach ($pf in @("$env:ProgramFiles", "${env:ProgramFiles(x86)}")) {
    if (-not $pf -or -not (Test-Path $pf)) { continue }
    foreach ($d in Get-ChildItem $pf -Directory -ErrorAction SilentlyContinue) { if ($d.Name -notmatch $noGame -and -not $roots.Contains($d.FullName)) { [void]$roots.Add($d.FullName) } }
  }
  return @($roots)
}

function Set-GameProfiles {
  Head "Game profiles"
  $gp = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
  $layers = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'
  $found = @()
  $roots = Get-GameRoots
  # One walk of the game folders, four levels deep, then every game is a lookup;
  # walking Program Files once per game would take minutes.
  # A terabyte of Steam libraries is a lot of folders to walk; the walk stops after twenty-five seconds
  # and says so. The CPU-priority profile is by exe name and needs no path, so a game in a folder not
  # reached still gets it; only its GPU preference and fullscreen setting wait for the next run.
  $index = @{}
  $walk = [System.Diagnostics.Stopwatch]::StartNew(); $walked = 0; $capped = $false
  foreach ($root in $roots) {
    if ($walk.Elapsed.TotalSeconds -gt 25) { $capped = $true; break }
    $walked++
    foreach ($f in Get-ChildItem -Path $root -Filter '*.exe' -Recurse -Depth 4 -File -ErrorAction SilentlyContinue) {
      $k = $f.Name.ToLower()
      if (-not $index.ContainsKey($k)) { $index[$k] = New-Object System.Collections.ArrayList }
      [void]$index[$k].Add($f.FullName)
    }
  }
  Say ("  Looked in {0} game folders in {1} s{2}" -f $walked, [math]::Round($walk.Elapsed.TotalSeconds, 1), $(if ($capped) { " (stopped there; {0} more folders wait for the next run, and every listed game has its CPU profile by name regardless)" -f ($roots.Count - $walked) } else { '' }))
  foreach ($g in $script:Games) {
    foreach ($exe in $g.exes) {
      # Where the game is installed, if it is: the exe by name inside the launchers' own folders.
      $paths = @()
      $k = $exe.ToLower()
      if ($index.ContainsKey($k)) { $paths = @($index[$k] | Select-Object -First 3) }
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
# extreme (opt-in): fewer conveniences, a few more frames
# ---------------------------------------------------------------------------
<# What the people who tune for a living do after the safe tune, minus the
   myths and minus anything that lowers security: the shell drawn plain, the
   services a person might notice going, the overlay plane off, memory
   compression off where there is RAM to spare, the dynamic tick off. Every
   line recorded; undo puts it back; the keep task leaves the personal ones
   alone. Asked about first, because "you will notice" is the point. #>
function Set-Extreme($m) {
  if (-not $Extreme) { return }
  Head "Extreme"
  Say "  Fewer conveniences for a few more frames: notifications, animations, transparency, the search box, clipboard history, nearby sharing, Windows Search, superfetch on an SSD, the Xbox pieces unless they are in use, and the extra services go; the service hosts are grouped the old way, which is twenty to forty processes fewer after a restart. Undo puts every one back." 'White'
  if (-not (Ask "Go extreme?")) { Say "  Skipped. The standard tune stands."; $script:ExtremeDeclined = $true; return }
  $keep = Get-KeepList $m
  $all = @(Get-Service -ErrorAction SilentlyContinue)
  $byName = @{}; foreach ($svc in $all) { $byName[$svc.Name] = $svc }
  $exists = { param($n) if ($byName.ContainsKey($n)) { return $true }; return [bool](Get-Service -Name $n -ErrorAction SilentlyContinue) }
  foreach ($pair in $script:ExtremeServices) {
    $name = $pair[0]; $why = $pair[1]
    if ($keep.ContainsKey($name)) { if (& $exists $name) { Keep $name $keep[$name] }; continue }
    if ($name -eq 'SysMain' -and -not $m.allSsd) { Keep 'SysMain' 'a hard disk benefits from prefetch'; continue }
    $mode = if ($script:ExtremeOff -contains $name) { 'Disabled' } else { 'Manual' }
    if (& $exists $name) { Set-ServiceStart $name $mode $why }
    foreach ($inst in @($all | Where-Object { $_.Name -like ($name + '_*') -and $_.Status -eq 'Running' })) { try { Stop-Service -Name $inst.Name -Force -NoWait -ErrorAction Stop -WarningAction SilentlyContinue } catch { } }
  }
  # The shell, drawn plain: no transparency, no animations, no shadows, no badges, no toasts, no search box.
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency' 0
  Set-Reg 'HKCU:\Control Panel\Desktop\WindowMetrics' 'MinAnimate' '0' 'String'
  Set-Reg 'HKCU:\Control Panel\Desktop' 'UserPreferencesMask' ([byte[]](0x90, 0x12, 0x03, 0x80, 0x10, 0x00, 0x00, 0x00)) 'Binary'
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 2
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarAnimations' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ListviewShadow' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ListviewAlphaSelect' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarBadges' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'SearchboxTaskbarMode' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications' 'ToastEnabled' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings' 'NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'Start_Layout' 1
  if (-not $m.touch) { Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\WindowsInkWorkspace' 'AllowWindowsInkWorkspace' 0 }
  Did "Shell: transparency, animations, shadows, taskbar badges, toasts and the search box off; Start shows more pins"
  # Exclusive fullscreen everywhere, and the multi-plane overlay off: the two settings behind most "stutter fixed" threads.
  Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_DXGIHonorFSEWindowsCompatible' 1
  Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_EFSEFeatureFlags' 0
  Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\Dwm' 'OverlayTestMode' 5
  Did "Exclusive fullscreen honoured for every game; multi-plane overlay off"
  # Memory compression: CPU time spent squeezing pages that 16 GB never needs to squeeze.
  if ($m.ramGb -ge 16) {
    try { if ((Get-MMAgent -ErrorAction Stop).MemoryCompression) { Disable-MMAgent -MemoryCompression -ErrorAction Stop; Record @{ type = 'mmagent'; feature = 'MemoryCompression' }; Did "Memory compression off (16 GB or more)" } } catch { }
  }
  # The dynamic tick: the kernel stops coalescing timer interrupts to save power, which is not what a gaming desktop is for.
  if (-not $m.laptop) {
    $cur = (& bcdedit /enum '{current}' 2>$null) -join ' '
    if ($cur -notmatch 'disabledynamictick\s+Yes') {
      & bcdedit /set disabledynamictick yes 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { Record @{ type = 'bcdedit'; name = 'disabledynamictick' }; Did "Dynamic tick off (desktop)" }
    }
  }
  # Service hosts grouped. On a PC with more than 3.5 GB of RAM Windows gives every service its own
  # svchost.exe (the sixty svchost lines in Task Manager); a threshold above the installed RAM puts them
  # back into shared hosts, the way Windows ran for twenty years and still runs on small PCs. Twenty to
  # forty processes fewer after a restart. The cost: a service that crashes takes its group down with it,
  # which is rare, and a restart fixes it.
  $kb = [int64]($m.ramGb + 1) * 1048576
  if ($kb -gt 2147483647) { $kb = 2147483647 }
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control' 'SvcHostSplitThresholdInKB' ([int]$kb)
  Did "Service hosts grouped after a restart: the svchost.exe count drops by twenty to forty"
  # Shutdown waits two seconds for a slow service or app, not five and twenty.
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control' 'WaitToKillServiceTimeout' '2000' 'String'
  Set-Reg 'HKCU:\Control Panel\Desktop' 'HungAppTimeout' '2000' 'String'
  Set-Reg 'HKCU:\Control Panel\Desktop' 'WaitToKillAppTimeout' '2000' 'String'
  Set-Reg 'HKCU:\Control Panel\Desktop' 'AutoEndTasks' '1' 'String'
  Did "Shutdown and restart wait two seconds for a slow service or app instead of five and twenty, and end a stuck app instead of asking"
  Say "  Extreme applied. Undo puts all of it back; the keep task leaves the shell choices alone."
}

# ---------------------------------------------------------------------------
# memory integrity (opt-in)
# ---------------------------------------------------------------------------
function Set-Vbs($m) {
  if (-not $Aggressive -or -not $m.vbs) { return }
  Head "Memory integrity (VBS / HVCI)"
  if ($m.riot -or $m.faceit) { Say "  Left on. VALORANT's Vanguard and FACEIT require memory integrity (with IOMMU) since 2026, and switching it off would stop them. Nothing changed." 'Yellow'; return }
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
    $(if ($m.laptop -and -not $m.ramSlow) { "1. Memory profile: laptops set the memory speed themselves and most hide the option; if yours shows $mem, enable it, otherwise there is nothing to do here." } elseif ($m.ramSlow) { "1. Memory profile: enable $mem. CONFIRMED OFF on this PC: the RAM runs at $($m.ramNow) MT/s and is rated for $($m.ramRated). This is the single biggest free gain on any PC. Pick the profile matching the speed printed on the sticks$(if ($m.laptop) { ' (on a laptop the option, when there is one, is usually under Advanced > Memory)' })." } elseif ($m.ramRated -and $m.ramNow) { "1. Memory profile: $mem looks to be on already ($($m.ramNow) MT/s of $($m.ramRated) rated). Check it stayed on after any BIOS update or CMOS reset." } else { "1. Memory profile: enable $mem. Your RAM is running at the slow default until you do; this is the single biggest free gain on any PC. Pick the profile matching the speed printed on the sticks." }),
    "2. Re-Size BAR / Smart Access Memory: set Above 4G Decoding = Enabled, then Re-Size BAR Support = Auto/Enabled. Needs CSM off (next line). Worth 5-15% in many games on RTX 30/40/50 and RX 6000+.",
    $(if ($m.uefi) { "3. CSM (Compatibility Support Module): Disabled. You already boot UEFI, so nothing depends on it, and Re-Size BAR needs it off." } else { "3. CSM: you are booting in legacy mode, so leave CSM on for now. Converting to UEFI (mbr2gpt) first is a separate job; Re-Size BAR will wait until then." }),
    $(if ($m.secureBoot) { "4. Secure Boot: already on. Leave it on (VALORANT, Fortnite's anti-cheat and Windows 11 all expect it)." } else { "4. Secure Boot: Enabled. Windows 11 and Vanguard expect it; on 10 it costs nothing. Set OS Type / Secure Boot Mode to Windows UEFI if asked." }),
    $(if ($m.tpm) { "5. TPM: present. Leave fTPM / PTT enabled." } else { "5. TPM: not detected. Enable AMD fTPM (AMD) or Intel PTT (Intel) under Security / Trusted Computing. VALORANT on Windows 11 will not run without it." }),
    $(if ($m.laptop) { "6. Power mode: the maker's app's Performance / Turbo mode raises the CPU and GPU power limits the BIOS does not expose; use it on mains for games and Balanced on battery. Windows' own power mode slider (Settings > System > Power) at Best performance on mains; the OmniDx plan already sets that." } elseif ($m.cpuVendor -eq 'AMD') { "6. Precision Boost Overdrive: Enabled (or Advanced with the Curve Optimizer at a modest negative offset like -15 all-core if you know your cooler). Never a positive voltage offset." } else { "6. Intel: leave MultiCore Enhancement at Auto; set the long and short power limits (PL1/PL2) to the chip's rated maximum if the board runs them lower. Do not touch voltages." }),
    "7. Global C-states / package C-states: Auto is fine. Disabling them buys nothing measurable in games and raises idle heat.",
    "8. Fast Boot: Enabled. Full Screen Logo / Boot Logo: Disabled (a second off every boot).",
    $(if ($m.laptop) { "9. Fans: the BIOS rarely offers a curve on a laptop; the maker's app does (Armoury Crate, Legion Vantage, Omen Gaming Hub, Predator Sense, Dragon Center): set the performance or turbo fan mode for games, and raise the back of the laptop so the intakes breathe. Sustained boost needs airflow more than anything." } else { "9. Fan curves: set the CPU fan to reach 100% by 80 C and the case fans to a steady ramp. Sustained boost needs airflow more than anything." }),
    $(if ($m.laptop) { "10. The GPU switch: in the maker's app (or the BIOS as Hybrid / Discrete / MUX), set Discrete or Ultimate for games so the display is driven by the $($m.gpu) directly rather than through the integrated one; Hybrid is for battery life. Windows > Settings > System > Display > Graphics: set each game to High performance." } elseif ($m.wifiLive) { "10. Onboard devices you do not use: serial port, onboard audio if you use USB audio, RGB controllers. Keep Wi-Fi and Bluetooth on: Wi-Fi is your connection." } else { "10. Onboard devices you do not use: serial port, Wi-Fi/Bluetooth if wired, onboard audio if you use USB audio, RGB controllers. Each one removed is an interrupt source gone." }),
    "11. HPET: leave at default. The 'disable HPET' tweak is from 2013 and hurts more than it helps on modern Windows.",
    $(if ($m.riot -or $m.faceit) { "12. Virtualisation (SVM / VT-x) and IOMMU (AMD-Vi / VT-d): both Enabled. VALORANT's Vanguard and FACEIT require IOMMU with memory integrity since 2026" + $(if ($m.iommu) { "; IOMMU is on here already, so leave it." } else { "; IOMMU is OFF on this PC, and this is the line that matters." }) + " AMD boards: SVM under CPU Configuration, IOMMU under AMD CBS > NBIO. Intel boards: VT-x under CPU Configuration, VT-d under System Agent Configuration." } else { "12. Virtualisation (SVM / VT-x): leave on if you use WSL, Docker, an emulator, or play VALORANT or on FACEIT (their anti-cheat needs it, with IOMMU); otherwise off saves a little scheduling overhead." }),
    $(if ($Extreme) { "" } else { $null }),
    $(if ($Extreme) { "EXTREME - only with a cooler you trust and a memory test to hand. Each of these is what the people tuning for a living set after the list above; none of them is free." } else { $null }),
    $(if ($Extreme) { "  E1. Global C-states: Disabled. Steadier 1% lows on some boards; more idle heat and power. Try it, measure it, keep it only if the lows improve." } else { $null }),
    $(if ($Extreme) { "  E2. Spread Spectrum (CPU and PCIe): Disabled. A hair of clock stability for no emissions margin you will ever measure at home." } else { $null }),
    $(if ($Extreme -and $m.gpuVendor -ne 'Intel' -and -not $m.laptop) { "  E3. Integrated graphics: Disabled, since the $($m.gpu) does the work. Skip this if you use Quick Sync for recording." } elseif ($Extreme -and $m.laptop) { "  E3. Integrated graphics stays: a laptop needs it for battery life and often for the screen itself; the GPU switch in item 10 is the laptop version of this." } else { $null }),
    $(if ($Extreme -and -not $m.laptop) { "  E4. Onboard devices you do not use: the second network port, the serial header, Wake-on-LAN, Bluetooth if you never pair anything, the audio codec if you use USB or a DAC. Each one is a driver and an interrupt fewer." } else { $null }),
    $(if ($Extreme) { "  E5. ErP / EuP: Disabled, so USB keeps power for the mouse and keyboard to wake the PC; Enabled only if you want the lowest off-state draw." } else { $null }),
    $(if ($Extreme) { "  E6. PCIe link speed for the graphics slot: set to the card's generation (Gen 4 or Gen 5) instead of Auto, which stops the link renegotiating under load on a few boards." } else { $null }),
    $(if ($Extreme -and $m.laptop) { "  E7. Undervolting: where the maker's app offers a CPU or GPU undervolt (Legion Vantage, some Armoury Crate models, MSI Center), a small one found by testing lowers heat and holds boost longer; the BIOS on most laptops locks it, and that is that." } elseif ($Extreme -and $m.cpuVendor -eq 'AMD') { "  E7. PBO limits: Motherboard, with a Curve Optimizer negative offset found by testing (start at -10 all-core, run a stress test an hour, step down). Never a positive voltage offset; never above 1.30 V SoC." } elseif ($Extreme) { "  E7. Power limits: PL1 = PL2 at the board's cooling can hold, with the CPU temperature watched under a stress test; an undervolt found by testing (start at -0.050 V) if the board offers one." } else { $null }),
    $(if ($Extreme -and -not $m.laptop) { "  E8. Memory, after the profile: raise tREFI toward 65535 and lower tRFC in steps, testing an hour each; this is where a memory test earns its keep. Stop at the first error and go back one step." } else { $null }),
    $(if ($Extreme) { "  E9. Resizable BAR: on (it is above); with it, also 'Above 4G Decoding' on and CSM off, or the card silently falls back." } else { $null }),
    "",
    "After saving: Windows will boot normally. If it does not (rare, usually CSM), go back in and re-enable the last thing you changed.",
    "Do not update the BIOS unless the vendor's notes mention a fix for your exact problem; a failed flash is the one thing here that cannot be undone from Windows."
  )
  return $lines
}

# ---------------------------------------------------------------------------
# what to do next: five lines at the top of the report
# ---------------------------------------------------------------------------
function Get-NextSteps($m) {
  $steps = @('Restart. The services told to stop are still unwinding until you do, and the after-restart count lands in C:\OmniDx\after-restart.txt at your next sign-in, with the boot time of that start next to the one from before the tune.')
  if ($m.ramSlow) { $steps += "BIOS, item 1: the memory profile is OFF on this PC (the RAM runs at $($m.ramNow) MT/s, rated $($m.ramRated)). That one setting is worth more than the rest of this report." }
  elseif ($m.laptop) { $steps += 'BIOS: item 10, the GPU switch, is the one that matters on a laptop; then the power mode in the maker''s app.' }
  else { $steps += 'BIOS: items 1 to 3 (memory profile, Re-Size BAR, CSM). Ten minutes, and the memory profile alone is the biggest free gain any PC has.' }
  $steps += 'GPU control panel: low latency mode, power management and V-Sync, from the list below. Two minutes.'
  $steps += 'Launchers and overlays: the list below names the one or two settings in each that matter; the overlays are the usual cause of a stutter that "came from nowhere".'
  $steps += 'Any time: $env:OMNIDX_MODE=''status''; irm omnidx.net/go.ps1 | iex shows what is still in place; undo is one line, and it is in this report.'
  return $steps
}

# ---------------------------------------------------------------------------
# GPU control-panel notes
# ---------------------------------------------------------------------------
function Get-GpuNotes($m) {
  switch ($m.gpuVendor) {
    'NVIDIA' { @('NVIDIA Control Panel > Manage 3D settings (global): Low Latency Mode = Ultra, Power management = Prefer maximum performance, Vertical sync = Off, Texture filtering quality = High performance, Shader cache size = 10 GB, Threaded optimisation = Auto.', 'NVIDIA app: in-game overlay off unless you record; Reflex on in every game that has it.', 'Drivers: use the Game Ready driver, clean install ticked, GeForce Experience / NVIDIA app not set to start with Windows (the tune already switched it off).') + $(if ($m.laptop) { @('Laptop: NVIDIA Control Panel > Manage 3D settings > Preferred graphics processor = High-performance NVIDIA processor, and the same per game under Windows > Settings > System > Display > Graphics. Whisper Mode and Battery Boost off on mains; the frame cap they set is what many "my laptop is stuck at 60" threads are about.') } else { @() }) }
    'AMD' { @('AMD Software > Gaming > Graphics: Radeon Anti-Lag = On (Anti-Lag 2 in games that support it), Radeon Boost = Off for competitive, Radeon Chill = Off, Wait for vertical refresh = Off, Texture filtering = Performance, Surface format optimisation = On, Tessellation = AMD optimised.', 'Shader cache = AMD optimised. Enhanced Sync off. Instant replay off unless you record.') + $(if ($m.laptop) { @('Laptop: AMD Software > Gaming > Graphics > Switchable Graphics: set each game to High performance; Radeon Chill off on mains (it is a frame cap dressed as a power saver).') } else { @() }) }
    'Intel' { @('Intel Graphics Command Center: Endurance Gaming off on mains, Adaptive tessellation on, V-Sync off, Anisotropic filtering per-application.') }
    default { @('GPU not identified; use the vendor control panel to set low-latency mode on, power management to maximum performance and V-Sync off.') }
  }
}

<# The launchers and helper apps on this PC, and the one or two settings in
   each that matter: the things the script cannot set for you because each
   keeps its own settings store, so they go in the report instead. #>
<# Marks other "optimizer" scripts leave behind: the ones that cost security or
   updates rather than frames. The tune changes none of them; it names them
   with the way back, so nobody blames the tune for a hole another tool made,
   and nobody keeps a hole they never knew about. #>
function Get-LeftoverNotes($m) {
  $notes = @()
  $v = { param($path, $name) try { return (Get-ItemProperty -Path $path -Name $name -ErrorAction Stop).$name } catch { return $null } }
  if ((& $v 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender' 'DisableAntiSpyware') -eq 1) { $notes += 'Defender is switched off by a policy value another tool set (HKLM\SOFTWARE\Policies\Microsoft\Windows Defender, DisableAntiSpyware = 1). The tune never touches Defender. The way back: delete that value, restart, then Windows Security > Virus and threat protection.' }
  if ((& $v 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' 'NoAutoUpdate') -eq 1) { $notes += 'Automatic Windows updates are off by policy (WindowsUpdate\AU, NoAutoUpdate = 1): security fixes are not arriving. Delete that value to let them.' }
  $wu = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
  if ($wu -and "$($wu.StartType)" -eq 'Disabled') { $notes += 'The Windows Update service (wuauserv) is disabled, and not by the tune: Settings > Windows Update cannot work until it is Manual again (services.msc, or in an admin prompt: sc config wuauserv start= demand).' }
  $fso = & $v 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' 'FeatureSettingsOverride'
  if ($fso -ne $null -and (([int64]$fso) -band 3) -ne 0) { $notes += 'The CPU security mitigations (Spectre, Meltdown) are switched off by another tool (Memory Management, FeatureSettingsOverride). A few percent in some benchmarks; a real hole in a browser. The tune leaves it as found. The way back: delete FeatureSettingsOverride and FeatureSettingsOverrideMask there and restart.' }
  if ((& $v 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'EnableSmartScreen') -eq 0) { $notes += 'SmartScreen is off by policy (Windows\System, EnableSmartScreen = 0), so a downloaded installer is not checked. Delete the value to get it back.' }
  if ((& $v 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'EnableLUA') -eq 0) { $notes += 'User Account Control is off (EnableLUA = 0): every program runs with full rights, and Store apps stop opening. Set it to 1 and restart; the tune runs fine with it on.' }
  if (-not $notes.Count) { $notes += 'Nothing found: no other tool has left Defender, Windows Update, SmartScreen, User Account Control or the CPU mitigations switched off on this PC.' }
  return $notes
}

function Get-LauncherNotes($m) {
  $notes = @()
  $pf = "$env:ProgramFiles"; $pf86 = "${env:ProgramFiles(x86)}"
  $has = { param($p) return [bool]($p -and (Test-Path $p)) }
  $steam = $null; foreach ($k in 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') { try { $steam = (Get-ItemProperty $k -ErrorAction Stop).InstallPath; if ($steam) { break } } catch { } }
  if ($steam) {
    $notes += 'Steam: Settings > Downloads > "Allow background processing of Vulkan shaders" off (it compiles while you play), "Enable shader pre-caching" on. Settings > In Game > the overlay off unless you use it (a browser process inside every game). Settings > Interface > "Run Steam when my computer starts" off (the tune switched the entry off) and "GPU accelerated rendering in web views" on. Per game: Properties > General > Launch options from the PER GAME list.'
    if (& $has (Join-Path $steam 'steamapps\common\wallpaper_engine')) { $notes += 'Wallpaper Engine: Settings > Performance > "Other application fullscreen: pause" and "Other application focused: pause", playback FPS 30; a live wallpaper is a game running behind your game.' }
  }
  if (& $has (Join-Path $env:ProgramData 'Epic\EpicGamesLauncher')) { $notes += 'Epic Games Launcher: Settings > "Run when my computer starts" off, "Enable notifications" off; leave "Throttle downloads" off. The overlay is off by default; keep it so.' }
  if ((& $has (Join-Path $env:ProgramData 'Battle.net')) -or (& $has (Join-Path $pf86 'Battle.net'))) { $notes += 'Battle.net: Settings > General > "Launch Battle.net when I start my computer" off, "On game launch: exit Battle.net completely" (the client is a browser), "Use browser hardware acceleration" on. Streaming off.' }
  if (& $has (Join-Path $env:ProgramData 'Riot Games')) { $notes += 'Riot Client: Settings > General > "Open Riot Client on startup" off. Vanguard stays: VALORANT will not run without it, and Vanguard On-Demand (Windows 11 25H2) needs Secure Boot, TPM 2.0, IOMMU and memory integrity on; the tune leaves all four alone (BIOS items 4, 5 and 12 say where).' }
  if ($m.faceit) { $notes += 'FACEIT: its anti-cheat needs TPM 2.0, Secure Boot, IOMMU and memory integrity on, and Windows 11 from October 2026. The tune leaves all of them alone; the BIOS checklist says where each one is.' }
  if ((& $has (Join-Path $pf 'Electronic Arts\EA Desktop')) -or (& $has (Join-Path $pf86 'Origin'))) { $notes += 'EA app: Settings > Application > "Automatically launch EA app on startup" off; "In-game overlay" off.' }
  if (& $has (Join-Path $pf86 'Ubisoft\Ubisoft Game Launcher')) { $notes += 'Ubisoft Connect: Settings > General > "Launch at startup" off, "Enable in-game overlay" off, "Display notifications" off.' }
  if ((& $has (Join-Path $pf86 'GOG Galaxy')) -or (& $has (Join-Path $pf 'GOG Galaxy'))) { $notes += 'GOG Galaxy: Settings > General > "Launch at startup" off; Game features > overlay off.' }
  if (& $has (Join-Path $script:LocalAppData 'Discord')) { $notes += 'Discord: the tune set hardware acceleration on and start-with-Windows off. Also Settings > Voice & Video > "H.264 hardware acceleration" on, "OpenH264" off; Settings > Windows Settings > "Minimise to tray" on, so closing it does not quit it mid-call.' }
  if ((& $has (Join-Path $pf 'NVIDIA Corporation\NVIDIA app')) -or (& $has (Join-Path $pf 'NVIDIA Corporation\NVIDIA GeForce Experience'))) { $notes += 'NVIDIA app: Settings > "In-game overlay" off unless you record or use Reflex analyzer; "Automatically optimise games" off (it picks quality over frames). Drivers > Game Ready, clean install.' }
  if ((& $has (Join-Path $pf 'AMD\CNext')) -or (& $has (Join-Path $pf 'AMD\RadeonSoftware'))) { $notes += 'AMD Software: Settings > Preferences > "In-game overlay" off unless you record; "Startup" as needed; Performance > Metrics off outside a benchmark.' }
  if ($m.xboxUsed) { $notes += 'Xbox app: Settings > General > "Auto-start" off (the entry the tune switched off), "Show notifications" off. Game Pass games install under C:\XboxGames and are already in the CPU-priority list where the game is listed.' }
  if (& $has (Join-Path $script:LocalAppData 'Overwolf')) { $notes += 'Overwolf (and every app built on it: CurseForge, Outplayed, Tracker.gg, Lethal Company mods): the background app most often behind a stutter that "came from nowhere". Close it before a match, or uninstall it and use the browser versions.' }
  $suites = @()
  if (& $has (Join-Path $pf 'Corsair\CORSAIR iCUE 5 Software')) { $suites += 'iCUE' } elseif (& $has (Join-Path $pf86 'Corsair\CORSAIR iCUE 4 Software')) { $suites += 'iCUE' }
  if (& $has (Join-Path $pf86 'Razer\Synapse3')) { $suites += 'Razer Synapse' } elseif (& $has (Join-Path $pf 'Razer\Synapse')) { $suites += 'Razer Synapse' }
  if (& $has (Join-Path $pf 'LGHUB')) { $suites += 'Logitech G HUB' }
  if (& $has (Join-Path $pf 'SteelSeries\GG')) { $suites += 'SteelSeries GG' }
  if ($m.oem -match 'Armoury Crate') { $suites += 'Armoury Crate' }
  if ($m.oem -match 'MSI Center|Dragon Center') { $suites += 'MSI Center' }
  if ($suites.Count) { $notes += ("{0}: once your lighting and macros are saved to the device (onboard memory), set it not to start with Windows; each of these runs four to twelve processes and polls the hardware all day. Open it when you want to change something." -f ($suites -join ', ')) }
  if (-not $notes.Count) { $notes += 'None of the usual launchers, overlays or peripheral suites found. The same notes apply the day you install one; run the command again and they appear here.' }
  return $notes
}

# ---------------------------------------------------------------------------
# the app: a window around the same script
# ---------------------------------------------------------------------------
<# Everything the window shows before it runs anything, as one object: the
   machine, the advice, the startup entries, the process count, the target.
   -Probe prints it as JSON, which is how the window asks for it from a
   second PowerShell instance without blocking. #>
function Get-Probe {
  $m = Get-Machine
  $script:Warnings.Clear()
  Show-Advice $m
  $entries = @(Get-StartupEntries | Where-Object { $_.on })
  @{
    version = $script:Version
    os = $m.os; cpu = $m.cpu; gpu = $m.gpu; ramGb = $m.ramGb; board = $m.board; bios = $m.bios
    laptop = $m.laptop; nvme = $m.nvme; allSsd = $m.allSsd; refresh = $m.refresh; driverVer = $m.driverVer
    win = $m.win; build = $m.build; gpuVendor = $m.gpuVendor; sticks = $m.sticks; ramNow = $m.ramNow; ramRated = $m.ramRated
    uefi = $m.uefi; secureBoot = $m.secureBoot; tpm = $m.tpm; vbs = $m.vbs; server = [bool]($m.os -match 'Server')
    keeps = @(@($(if ($m.printers) { 'printer' }), $(if ($m.btDevices) { 'Bluetooth' }), $(if ($m.wifi) { 'Wi-Fi' }), $(if ($m.touch) { 'touch' }), $(if ($m.biometric) { 'Windows Hello' }), $(if ($m.vpn) { 'VPN' }), $(if ($m.xboxUsed) { 'Xbox / Game Pass' }), $(if ($m.xboxPad) { 'Xbox controller' })) | Where-Object { $_ })
    warnings = @($script:Warnings)
    startup = @($entries | ForEach-Object { @{ name = $_.name; label = $_.label; wasCut = [bool]$_.wasCut } })
    before = (Get-ProcessCount)
    target = (Get-SafeBar $m)
    lastRun = (Get-LastRun)
    keepOn = [bool](Get-ScheduledTask -TaskName 'OmniDx keep' -ErrorAction SilentlyContinue)
    keyBound = $(try { [string](Get-ItemProperty 'HKLM:\SOFTWARE\OmniDx\Tune' -ErrorAction Stop).Key } catch { '' })
    timings = $m.timings
  }
}

<# The newest summary in C:\OmniDx, for the window's status line. #>
function Get-LastRun {
  $sum = Get-ChildItem $script:Root -Filter 'summary-*.json' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $sum) { return $null }
  try { $s = Get-Content $sum.FullName -Raw | ConvertFrom-Json; return @{ stamp = $s.stamp; before = $s.before; after = $s.after; changes = $s.changes; version = $s.version } } catch { return $null }
}

<# The window. WPF, drawn from XAML held here, so the app is the same one file
   as the command. The work itself runs in a second PowerShell instance with
   this script's text, so the window never freezes; its Write-Host lines
   arrive on the information stream and land in the log as they happen. #>
$script:Xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
  Title="OmniDx Tune" Width="1120" Height="760" MinWidth="960" MinHeight="640" Background="#050308" WindowStartupLocation="CenterScreen"
  FontFamily="Segoe UI" FontSize="13" Foreground="#F1ECFF" UseLayoutRounding="True" SnapsToDevicePixels="True">
  <Window.Resources>
    <LinearGradientBrush x:Key="Grad" StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#6D28D9" Offset="0"/><GradientStop Color="#8B5CF6" Offset="0.45"/><GradientStop Color="#D946EF" Offset="1"/></LinearGradientBrush>
    <Style x:Key="Card" TargetType="Border"><Setter Property="Background" Value="#0E0A17"/><Setter Property="BorderBrush" Value="#2A1F45"/><Setter Property="BorderThickness" Value="1"/><Setter Property="CornerRadius" Value="14"/><Setter Property="Padding" Value="16"/></Style>
    <Style x:Key="Label" TargetType="TextBlock"><Setter Property="FontSize" Value="10.5"/><Setter Property="FontWeight" Value="Bold"/><Setter Property="Foreground" Value="#7D7199"/><Setter Property="Margin" Value="0,0,0,8"/></Style>
    <Style TargetType="TextBlock"><Setter Property="Foreground" Value="#F1ECFF"/></Style>
    <Style TargetType="Button">
      <Setter Property="Background" Value="#1D1530"/><Setter Property="Foreground" Value="#F1ECFF"/><Setter Property="BorderBrush" Value="#2A1F45"/>
      <Setter Property="Padding" Value="14,9"/><Setter Property="FontWeight" Value="SemiBold"/><Setter Property="Cursor" Value="Hand"/><Setter Property="HorizontalAlignment" Value="Stretch"/>
      <Setter Property="Template"><Setter.Value>
        <ControlTemplate TargetType="Button">
          <Border x:Name="bd" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="1" CornerRadius="10" Padding="{TemplateBinding Padding}">
            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <ControlTemplate.Triggers>
            <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="bd" Property="BorderBrush" Value="#8B5CF6"/></Trigger>
            <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.4"/></Trigger>
          </ControlTemplate.Triggers>
        </ControlTemplate>
      </Setter.Value></Setter>
    </Style>
    <Style x:Key="Primary" TargetType="Button" BasedOn="{StaticResource {x:Type Button}}"><Setter Property="Background" Value="{StaticResource Grad}"/><Setter Property="BorderBrush" Value="Transparent"/><Setter Property="Foreground" Value="White"/><Setter Property="FontSize" Value="14"/></Style>
    <Style TargetType="CheckBox"><Setter Property="Foreground" Value="#B3A8CF"/><Setter Property="Margin" Value="0,3,10,3"/><Setter Property="VerticalContentAlignment" Value="Center"/></Style>
    <Style TargetType="TextBox"><Setter Property="Background" Value="#150F22"/><Setter Property="Foreground" Value="#F1ECFF"/><Setter Property="BorderBrush" Value="#2A1F45"/><Setter Property="Padding" Value="8,7"/><Setter Property="CaretBrush" Value="#C084FC"/><Setter Property="SelectionBrush" Value="#8B5CF6"/></Style>
    <Style TargetType="ProgressBar"><Setter Property="Foreground" Value="#8B5CF6"/><Setter Property="Background" Value="#1D1530"/><Setter Property="BorderBrush" Value="#2A1F45"/><Setter Property="Height" Value="8"/></Style>
    <Style TargetType="ScrollBar">
      <Setter Property="Width" Value="8"/><Setter Property="Background" Value="Transparent"/>
      <Setter Property="Template"><Setter.Value>
        <ControlTemplate TargetType="ScrollBar">
          <Grid Background="Transparent">
            <Track x:Name="PART_Track" IsDirectionReversed="True">
              <Track.Thumb><Thumb><Thumb.Template><ControlTemplate TargetType="Thumb"><Border Background="#2A1F45" CornerRadius="4" Margin="1,0"/></ControlTemplate></Thumb.Template></Thumb></Track.Thumb>
              <Track.DecreaseRepeatButton><RepeatButton Command="ScrollBar.LineUpCommand" Opacity="0" Focusable="False"/></Track.DecreaseRepeatButton>
              <Track.IncreaseRepeatButton><RepeatButton Command="ScrollBar.LineDownCommand" Opacity="0" Focusable="False"/></Track.IncreaseRepeatButton>
            </Track>
          </Grid>
        </ControlTemplate>
      </Setter.Value></Setter>
    </Style>
  </Window.Resources>
  <Grid Margin="18">
    <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="190"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
    <DockPanel Grid.Row="0" Margin="2,0,2,14">
      <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
        <Image x:Name="LogoImage" Height="40" Margin="0,0,4,0" VerticalAlignment="Center" Visibility="Collapsed" RenderOptions.BitmapScalingMode="HighQuality"/>
        <Border x:Name="MarkDrawn" Width="34" Height="34" CornerRadius="9" Background="{StaticResource Grad}">
          <Canvas Width="34" Height="34">
            <Rectangle Canvas.Left="7" Canvas.Top="9" Width="15" Height="3" RadiusX="1.5" RadiusY="1.5" Fill="White" Opacity="0.95"/>
            <Rectangle Canvas.Left="7" Canvas.Top="15.5" Width="10" Height="3" RadiusX="1.5" RadiusY="1.5" Fill="White" Opacity="0.7"/>
            <Rectangle Canvas.Left="7" Canvas.Top="22" Width="6" Height="3" RadiusX="1.5" RadiusY="1.5" Fill="White" Opacity="0.45"/>
            <Path Data="M25,6 L19.5,17 L23.5,17 L21.5,28 L28.5,15 L24.5,15 Z" Fill="White"/>
          </Canvas>
        </Border>
        <TextBlock x:Name="WordDrawn" Text="OmniDx" FontSize="21" FontWeight="Bold" Margin="11,0,5,0" VerticalAlignment="Center"/>
        <TextBlock x:Name="TuneDrawn" Text="TUNE" FontSize="11" FontWeight="Bold" Foreground="#7D7199" VerticalAlignment="Center" Margin="0,2,0,0"/>
        <TextBlock x:Name="VersionText" FontSize="11" Foreground="#7D7199" VerticalAlignment="Center" Margin="10,2,0,0"/>
      </StackPanel>
      <TextBlock x:Name="StatusText" HorizontalAlignment="Right" VerticalAlignment="Center" Foreground="#B3A8CF" Text="Reading this PC..."/>
    </DockPanel>
    <Grid Grid.Row="1">
      <Grid.ColumnDefinitions><ColumnDefinition Width="280"/><ColumnDefinition Width="*"/><ColumnDefinition Width="270"/></Grid.ColumnDefinitions>
      <Border Grid.Column="0" Style="{StaticResource Card}" Margin="0,0,12,0">
        <ScrollViewer VerticalScrollBarVisibility="Auto">
          <StackPanel>
            <TextBlock Text="THIS PC" Style="{StaticResource Label}"/>
            <TextBlock x:Name="MachineText" TextWrapping="Wrap" Foreground="#B3A8CF" LineHeight="21" Text="Reading..."/>
            <TextBlock Text="PROCESSES RUNNING NOW" Style="{StaticResource Label}" Margin="0,16,0,2"/>
            <TextBlock x:Name="CountText" Text="-" FontSize="46" FontWeight="Bold" Foreground="#C084FC" Margin="0,-6,0,0"/>
            <TextBlock x:Name="TargetText" Foreground="#7D7199" TextWrapping="Wrap" Margin="0,-4,0,0"/>
            <TextBlock x:Name="AdviceText" TextWrapping="Wrap" Foreground="#FFC247" LineHeight="19" Margin="0,8,0,0"/>
          </StackPanel>
        </ScrollViewer>
      </Border>
      <Border Grid.Column="1" Style="{StaticResource Card}" Margin="0,0,12,0">
        <ScrollViewer VerticalScrollBarVisibility="Auto">
          <StackPanel>
            <TextBlock Text="THE TUNE" Style="{StaticResource Label}"/>
            <UniformGrid Columns="2">
              <CheckBox x:Name="ChkStartup" IsChecked="True" Content="Startup apps off"/>
              <CheckBox x:Name="ChkServices" IsChecked="True" Content="Services this PC does not need"/>
              <CheckBox x:Name="ChkTasks" IsChecked="True" Content="Telemetry tasks"/>
              <CheckBox x:Name="ChkApps" IsChecked="True" Content="Preinstalled apps and trials"/>
              <CheckBox x:Name="ChkDebloat" IsChecked="True" Content="Debloat: legacy Windows, OneDrive"/>
              <CheckBox x:Name="ChkTelemetry" IsChecked="True" Content="Telemetry, ads, background apps"/>
              <CheckBox x:Name="ChkSystem" IsChecked="True" Content="System: scheduler, input, visuals"/>
              <CheckBox x:Name="ChkPower" IsChecked="True" Content="The OmniDx power plan"/>
              <CheckBox x:Name="ChkNetwork" IsChecked="True" Content="Network latency"/>
              <CheckBox x:Name="ChkPrograms" IsChecked="True" Content="Discord, Spotify, browsers"/>
              <CheckBox x:Name="ChkGames" IsChecked="True" Content="Game profiles"/>
              <CheckBox x:Name="ChkNvidia" IsChecked="True" Content="NVIDIA telemetry off"/>
              <CheckBox x:Name="ChkCleanup" IsChecked="True" Content="Clear update caches, temp files"/>
              <CheckBox x:Name="ChkAfterCount" IsChecked="True" Content="Write the after-restart count"/>
              <CheckBox x:Name="ChkKeep" IsChecked="True" Content="Keep it cut after Windows updates"/>
            </UniformGrid>
            <TextBlock Text="STARTS WITH WINDOWS  -  ticked means it gets switched off" Style="{StaticResource Label}" Margin="0,14,0,6"/>
            <WrapPanel x:Name="StartupPanel"><TextBlock Text="Reading..." Foreground="#7D7199"/></WrapPanel>
            <TextBlock Text="OFF UNLESS YOU SAY SO" Style="{StaticResource Label}" Margin="0,14,0,6"/>
            <CheckBox x:Name="ChkXbox"><TextBlock TextWrapping="Wrap" Foreground="#B3A8CF" Text="Cut the Xbox services too (Game Pass and Minecraft need them)"/></CheckBox>
            <CheckBox x:Name="ChkDns" Content="Point DNS at 1.1.1.1"/>
            <CheckBox x:Name="ChkVbs"><TextBlock TextWrapping="Wrap" Foreground="#B3A8CF" Text="Memory integrity off: a few percent more frames, one layer of kernel protection less"/></CheckBox>
            <CheckBox x:Name="ChkExtreme"><TextBlock TextWrapping="Wrap" Foreground="#FFC247" Text="Extreme (caution): every extra service, Game Bar entirely, animations and transparency, the search box, notifications, multi-plane overlay, memory compression, superfetch on SSDs, Windows Search, the dynamic tick, the service hosts grouped the old way (twenty to forty processes fewer), and the Xbox pieces unless you use them. Fewer conveniences, a few more frames; undo the last run alone puts only this back."/></CheckBox>
            <TextBlock Foreground="#7D7199" TextWrapping="Wrap" Margin="0,12,0,0" Text="Discord and Spotify are closed during the run so they can be tuned. A restore point comes first, every change is recorded, and undo is one button. Kept cut means a small task at sign-in puts back whatever a Windows update turned on; it never touches your own settings, and undo removes it."/>
          </StackPanel>
        </ScrollViewer>
      </Border>
      <Border Grid.Column="2" Style="{StaticResource Card}">
        <StackPanel>
          <TextBlock Text="YOUR KEY" Style="{StaticResource Label}"/>
          <TextBox x:Name="KeyBox" FontFamily="Consolas" FontSize="14" CharacterCasing="Upper"/>
          <TextBlock x:Name="KeyNote" Foreground="#7D7199" TextWrapping="Wrap" Margin="0,6,0,0" Text="From the page after you paid. It locks to this PC."/>
          <Button x:Name="BtnRun" Style="{StaticResource Primary}" Content="Run the tune" Margin="0,16,0,8" Height="44" IsEnabled="False"/>
          <Button x:Name="BtnReport" Content="Free report  -  changes nothing" Margin="0,0,0,8" IsEnabled="False"/>
          <Button x:Name="BtnUndo" Content="Undo every run" Margin="0,0,0,8"/>
          <Button x:Name="BtnStatus" Content="What is still in place" Margin="0,0,0,8"/>
          <Button x:Name="BtnOpenReport" Content="Open the report" Margin="0,0,0,8" IsEnabled="False"/>
          <Button x:Name="BtnFolder" Content="Open C:\OmniDx" Margin="0,0,0,8"/>
          <Button x:Name="BtnRestart" Content="Restart now" IsEnabled="False"/>
          <TextBlock x:Name="ResultText" TextWrapping="Wrap" Foreground="#30D38A" Margin="0,14,0,0" FontWeight="SemiBold"/>
        </StackPanel>
      </Border>
    </Grid>
    <Border Grid.Row="2" Style="{StaticResource Card}" Margin="0,12,0,0" Padding="8">
      <TextBox x:Name="LogBox" FontFamily="Consolas" FontSize="12" Foreground="#B3A8CF" IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" BorderThickness="0" Background="Transparent" Text="OmniDx Tune. Nothing has changed yet."/>
    </Border>
    <Grid Grid.Row="3" Margin="2,10,2,0">
      <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
      <ProgressBar x:Name="Progress" Maximum="100" VerticalAlignment="Center" Margin="0,0,16,0"/>
      <TextBlock Grid.Column="1" x:Name="FootText" Foreground="#7D7199" FontSize="11.5" Text="Restore point first. Every change recorded. Undo is one button. Security never lowered."/>
    </Grid>
  </Grid>
</Window>
'@

function Show-Gui {
  try { Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase -ErrorAction Stop } catch { Say "  The app needs the Windows desktop libraries (WPF), which this PC does not have." 'Yellow'; return $false }
  if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne 'STA') { Say "  The app needs an STA thread. Start it from powershell.exe (the one command does), or use the console flow." 'Yellow'; return $false }
  if (-not $script:SelfText -or $script:SelfText.Length -lt 1000) { Say "  The app cannot see its own script text here, so it cannot run the work in the background." 'Yellow'; return $false }

  $w = [System.Windows.Markup.XamlReader]::Parse($script:Xaml)
  $ui = @{}
  foreach ($n in 'LogoImage', 'MarkDrawn', 'WordDrawn', 'TuneDrawn', 'VersionText', 'StatusText', 'MachineText', 'CountText', 'TargetText', 'AdviceText', 'StartupPanel', 'KeyBox', 'KeyNote', 'BtnRun', 'BtnReport', 'BtnUndo', 'BtnStatus', 'BtnFolder', 'BtnRestart', 'BtnOpenReport', 'ResultText', 'LogBox', 'Progress', 'FootText',
                  'ChkStartup', 'ChkServices', 'ChkTasks', 'ChkApps', 'ChkDebloat', 'ChkTelemetry', 'ChkSystem', 'ChkPower', 'ChkNetwork', 'ChkPrograms', 'ChkGames', 'ChkNvidia', 'ChkCleanup', 'ChkAfterCount', 'ChkKeep', 'ChkXbox', 'ChkDns', 'ChkVbs', 'ChkExtreme') {
    $ui[$n] = $w.FindName($n)
  }
  $ui.VersionText.Text = "v$($script:Version)"
  # The eagle, fetched before the window shows (three seconds at most, usually well under one);
  # the drawn mark and the words stay on a PC that is offline. Fetched here rather than left to
  # WPF's own background download, which never lands in the headless draw the check takes.
  try {
    $req = [System.Net.WebRequest]::Create('https://omnidx.net/studio/assets/logo/omnidx-logo-480.png'); $req.Timeout = 3000
    $resp = $req.GetResponse(); $ms = New-Object System.IO.MemoryStream; $resp.GetResponseStream().CopyTo($ms); $resp.Close(); $ms.Position = 0
    $bmp = New-Object System.Windows.Media.Imaging.BitmapImage
    $bmp.BeginInit(); $bmp.StreamSource = $ms; $bmp.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad; $bmp.EndInit(); $bmp.Freeze()
    $ui.LogoImage.Source = $bmp
    $ui.LogoImage.Visibility = 'Visible'; $ui.MarkDrawn.Visibility = 'Collapsed'; $ui.WordDrawn.Visibility = 'Collapsed'; $ui.TuneDrawn.Visibility = 'Collapsed'
  } catch { }
  if ($Key) { $ui.KeyBox.Text = $Key }
  if ($Extreme) { $ui.ChkExtreme.IsChecked = $true }
  $phases = @{ startup = 'ChkStartup'; services = 'ChkServices'; tasks = 'ChkTasks'; apps = 'ChkApps'; debloat = 'ChkDebloat'; telemetry = 'ChkTelemetry'; system = 'ChkSystem'; power = 'ChkPower'; network = 'ChkNetwork'; programs = 'ChkPrograms'; games = 'ChkGames'; nvidia = 'ChkNvidia'; cleanup = 'ChkCleanup' }
  $state = @{ ps = $null; out = $null; handle = $null; seen = 0; seenOut = 0; mode = ''; heads = 0; startup = @(); probe = $null }
  $headsTotal = 19

  $log = { param($line) $ui.LogBox.AppendText($line + "`r`n"); $ui.LogBox.ScrollToEnd() }

  # A second PowerShell instance running this same script with the given
  # parameters. Its Write-Host lines are read off the information stream by
  # the timer below, so the window keeps painting while the work runs.
  $start = { param([hashtable]$params, [string]$mode)
    $ps = [PowerShell]::Create()
    [void]$ps.AddScript('param($text, $p) & ([scriptblock]::Create($text)) @p').AddArgument($script:SelfText).AddArgument($params)
    $inp = New-Object 'System.Management.Automation.PSDataCollection[psobject]'; $inp.Complete()
    $out = New-Object 'System.Management.Automation.PSDataCollection[psobject]'
    $state.ps = $ps; $state.out = $out; $state.seen = 0; $state.seenOut = 0; $state.mode = $mode; $state.heads = 0; $state.started = [System.Diagnostics.Stopwatch]::StartNew()
    $state.handle = $ps.BeginInvoke($inp, $out)
    $ui.BtnRun.IsEnabled = $false; $ui.BtnReport.IsEnabled = $false; $ui.BtnUndo.IsEnabled = $false; $ui.BtnStatus.IsEnabled = $false
    $ui.Progress.IsIndeterminate = ($mode -ne 'run')
  }

  $fill = { param($probe)
    $state.probe = $probe
    $ui.MachineText.Text = @(
      $probe.os,
      "CPU  $($probe.cpu)",
      "GPU  $($probe.gpu)$(if ($probe.driverVer) { "  (driver $($probe.driverVer))" })",
      "RAM  $($probe.ramGb) GB$(if ($probe.sticks) { ", $($probe.sticks) stick$(if ($probe.sticks -ne 1) { 's' })" })$(if ($probe.ramNow) { ", $($probe.ramNow) MT/s" })",
      "Board  $($probe.board)",
      "$(if ($probe.laptop) { 'Laptop' } else { 'Desktop' })$(if ($probe.nvme) { ', NVMe' } elseif ($probe.allSsd) { ', SSD' } else { ', has a hard disk' })$(if ($probe.refresh -ge 24) { ", $($probe.refresh) Hz" })",
      "Secure Boot $(if ($probe.secureBoot) { 'on' } else { 'off' }), TPM $(if ($probe.tpm) { 'yes' } else { 'no' }), memory integrity $(if ($probe.vbs) { 'on' } else { 'off' })",
      "Keeps: $(if ($probe.keeps.Count) { $probe.keeps -join ', ' } else { 'nothing extra' })"
    ) -join "`n"
    $ui.CountText.Text = "$($probe.before)"
    $ui.TargetText.Text = "target after the tune and a restart: about $($probe.target)"
    $ui.AdviceText.Text = $(if ($probe.warnings.Count) { ($probe.warnings | ForEach-Object { "! $_" }) -join "`n" } else { '' })
    $ui.StartupPanel.Children.Clear()
    $state.startup = @()
    if (-not $probe.startup.Count) { $t = New-Object System.Windows.Controls.TextBlock; $t.Text = 'Nothing starts with Windows that is not already off.'; $t.Foreground = '#7D7199'; [void]$ui.StartupPanel.Children.Add($t) }
    foreach ($e in $probe.startup) {
      $cb = New-Object System.Windows.Controls.CheckBox
      $tb = New-Object System.Windows.Controls.TextBlock; $tb.Text = $(if ($e.wasCut) { "$($e.label)  (you turned it back on: left on)" } else { $e.label }); $tb.TextWrapping = 'Wrap'; $tb.Foreground = '#B3A8CF'; $tb.MaxWidth = 250
      $cb.Content = $tb; $cb.IsChecked = (-not $e.wasCut); $cb.Tag = $e.name; $cb.Width = 280
      [void]$ui.StartupPanel.Children.Add($cb); $state.startup += $cb
    }
    if (-not $ui.KeyBox.Text -and $probe.keyBound) { $ui.KeyBox.Text = $probe.keyBound; $ui.KeyNote.Text = 'The key bound to this PC, from your last run. Same key, same PC, free.' }
    if ($probe.lastRun) { $ui.BtnRun.Content = 'Run it again' }
    $ui.StatusText.Text = $(if ($probe.lastRun) { "Read in $([int]$script:Timer.Elapsed.TotalSeconds) s. Last run $($probe.lastRun.stamp -replace '_', ' ' -replace '-(\d\d)$', ':$1'): $($probe.lastRun.before) -> $($probe.lastRun.after) processes$(if ($probe.keepOn) { ', kept cut' })." } else { "Read in $([int]$script:Timer.Elapsed.TotalSeconds) s. Nothing has changed." })
    $ui.BtnRun.IsEnabled = $true; $ui.BtnReport.IsEnabled = $true
    $ui.Progress.IsIndeterminate = $false; $ui.Progress.Value = 0
  }

  $finish = {
    $ui.Progress.IsIndeterminate = $false
    $ui.BtnRun.IsEnabled = $true; $ui.BtnReport.IsEnabled = $true; $ui.BtnUndo.IsEnabled = $true; $ui.BtnStatus.IsEnabled = $true
    if ($state.mode -eq 'run') {
      $ui.Progress.Value = 100
      $done = [regex]::Match($ui.LogBox.Text, 'Processes: (\d+) -> (\d+)')
      $ui.ResultText.Text = $(if ($done.Success) { "Done. $($done.Groups[1].Value) -> $($done.Groups[2].Value) processes now. Restart for the real number, then do the BIOS checklist in the report." } else { 'Finished. Read the log above; the report is in C:\OmniDx.' })
      $ui.StatusText.Text = 'Done. Restart when you are ready.'
      $ui.BtnRestart.IsEnabled = $true
      $ui.BtnOpenReport.IsEnabled = [bool](Get-ChildItem $script:Root -Filter 'report-*.html' -ErrorAction SilentlyContinue)
      $ui.CountText.Text = $(if ($done.Success) { $done.Groups[2].Value } else { $ui.CountText.Text })
    } elseif ($state.mode -eq 'undo') { $ui.StatusText.Text = 'Undo finished. Restart to finish.'; $ui.BtnRestart.IsEnabled = $true }
    elseif ($state.mode -eq 'status') { $ui.StatusText.Text = 'Status read. Nothing changed.' }
    else { $ui.StatusText.Text = 'Report written to C:\OmniDx. Nothing changed.' }
    $state.ps.Dispose(); $state.ps = $null
  }

  $timer = New-Object System.Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds(120)
  $timer.Add_Tick({
    if (-not $state.ps) { return }
    $info = $state.ps.Streams.Information
    while ($state.seen -lt $info.Count) {
      $rec = $info[$state.seen]; $state.seen++
      $msg = $rec.MessageData; $text = if ($msg -and $msg.PSObject.Properties['Message']) { [string]$msg.Message } else { [string]$msg }
      if ($text -eq $null) { continue }
      & $log $text.TrimEnd()
      if ($text -match '^== ' -and $state.mode -eq 'run') { $state.heads++; $ui.Progress.Value = [math]::Min(96, [int](100 * $state.heads / $headsTotal)); $ui.StatusText.Text = $text.Trim(' =') }
    }
    $err = $state.ps.Streams.Error
    while ($state.seenOut -lt $err.Count) { & $log ("  ! " + [string]$err[$state.seenOut]); $state.seenOut++ }
    if ($state.mode -eq 'probe' -and $state.out.Count -gt 0) {
      try { & $fill (ConvertFrom-Json ([string]$state.out[0])) } catch { & $log "  ! Could not read the PC: $($_.Exception.Message)" }
      $state.ps.Dispose(); $state.ps = $null; return
    }
    if ($state.mode -eq 'undo' -and $state.out.Count -gt 0) { foreach ($o in $state.out) { & $log ([string]$o) }; $state.out.Clear() }
    if ($state.mode -eq 'run') { $ui.FootText.Text = ("Running for {0}:{1:00}. Restore point first. Every change recorded." -f [int][math]::Floor($state.started.Elapsed.TotalMinutes), $state.started.Elapsed.Seconds) }
    if ($state.handle.IsCompleted) { & $finish }
  })
  $ui.KeyBox.Add_KeyDown({ param($sender, $e) if ($e.Key -eq 'Return' -and $ui.BtnRun.IsEnabled) { $ui.BtnRun.RaiseEvent((New-Object System.Windows.RoutedEventArgs([System.Windows.Controls.Button]::ClickEvent))) } })
  $ui.BtnOpenReport.Add_Click({ $r = Get-ChildItem $script:Root -Filter 'report-*.html' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($r) { Start-Process $r.FullName } })

  $ui.BtnRun.Add_Click({
    if (-not $state.cleared) { $ui.LogBox.Clear(); $state.cleared = $true }
    $key = ($ui.KeyBox.Text -replace '\s', '').ToUpper()
    if (-not (Read-Key $key)) { $ui.KeyNote.Text = 'That is not an OmniDx key. It looks like TUNE-XXXX-XXXX-XXXX-XXXX.'; $ui.KeyNote.Foreground = '#FF5D6C'; return }
    $ui.KeyNote.Foreground = '#7D7199'; $ui.KeyNote.Text = 'Checking the key, then running. The log below is live.'
    $skip = @(); foreach ($k in $phases.Keys) { if (-not $ui[$phases[$k]].IsChecked) { $skip += $k } }
    $keep = @($state.startup | Where-Object { -not $_.IsChecked } | ForEach-Object { [string]$_.Tag })
    $p = @{ Key = $key; Api = $Api; Yes = $true; NoRestart = $true; Skip = $skip; Keep = $keep }
    if ($ui.ChkXbox.IsChecked) { $p.CutXbox = $true }
    if ($ui.ChkDns.IsChecked) { $p.Dns = $true }
    if ($ui.ChkVbs.IsChecked) { $p.Aggressive = $true }
    if ($ui.ChkExtreme.IsChecked) { $p.Extreme = $true }
    if (-not $ui.ChkAfterCount.IsChecked) { $p.NoAfterCount = $true }
    if (-not $ui.ChkKeep.IsChecked) { $p.NoKeep = $true }
    $ui.LogBox.Clear(); $ui.ResultText.Text = ''; $ui.Progress.Value = 2
    & $start $p 'run'
  })
  $ui.BtnReport.Add_Click({ $ui.LogBox.Clear(); & $start @{ Report = $true; Yes = $true } 'report' })
  $ui.BtnUndo.Add_Click({
    # Two clicks: the first arms it, the second does it. Nothing else in the window is destructive.
    if (-not $state.undoArmed) { $state.undoArmed = $true; $ui.BtnUndo.Content = 'Sure? Click again to undo'; return }
    $state.undoArmed = $false; $ui.BtnUndo.Content = 'Undo every run'
    $ui.LogBox.Clear(); & $start @{ Undo = $true } 'undo'
  })
  $ui.BtnStatus.Add_Click({ $ui.LogBox.Clear(); & $start @{ Status = $true } 'status' })
  $ui.BtnFolder.Add_Click({ New-Item -ItemType Directory -Path $script:Root -Force | Out-Null; Start-Process explorer.exe $script:Root })
  $ui.BtnOpenReport.IsEnabled = [bool](Get-ChildItem $script:Root -Filter 'report-*.html' -ErrorAction SilentlyContinue)
  $ui.BtnRestart.Add_Click({
    if (-not $state.restartArmed) { $state.restartArmed = $true; $ui.BtnRestart.Content = 'Sure? Click again to restart'; return }
    Restart-Computer -Force
  })
  $w.Add_Closing({ if ($state.ps) { try { $state.ps.Stop() } catch { } } })

  if ($Screenshot) {
    # Headless: read the PC in this process, fill the window, draw it to a PNG without showing it.
    try { & $fill (Get-Probe | ConvertTo-Json -Depth 5 -Compress | ConvertFrom-Json) } catch { & $log "  ! $($_.Exception.Message)" }
    $ui.LogBox.Clear()
    & $log '== Reading this PC'; & $log "  $($state.probe.os)"; & $log "  Processes running now: $($state.probe.before)"; & $log '== Your key'; & $log '  Key accepted. Locked to this PC.'
    $ui.KeyBox.Text = 'TUNE-9WQ2-4C9E-GK3R-D94C'; $ui.StatusText.Text = 'Ready.'
    $root = $w.Content
    $size = New-Object System.Windows.Size(1120, 760)
    $root.Measure($size); $root.Arrange((New-Object System.Windows.Rect(0, 0, 1120, 760))); $root.UpdateLayout()
    $bmp = New-Object System.Windows.Media.Imaging.RenderTargetBitmap(1120, 760, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
    $dv = New-Object System.Windows.Media.DrawingVisual
    $dc = $dv.RenderOpen(); $dc.DrawRectangle($w.Background, $null, (New-Object System.Windows.Rect(0, 0, 1120, 760))); $dc.Close()
    $bmp.Render($dv); $bmp.Render($root)
    $enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bmp))
    $dir = Split-Path $Screenshot; if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $fs = [IO.File]::Create($Screenshot); $enc.Save($fs); $fs.Close()
    Say ("  Window drawn to {0}" -f $Screenshot) 'Green'
    return $true
  }

  $timer.Start()
  $ui.LogBox.Clear(); & $log 'Reading this PC. Nothing has changed.'
  & $start @{ Probe = $true } 'probe'
  [void]$w.ShowDialog()
  $timer.Stop()
  return $true
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
function Get-ProcessCount { (Get-Process -ErrorAction SilentlyContinue | Measure-Object).Count }

# The log's headings and done lines for the reports, without a heading that has nothing done under it (the key check, a skipped phase).
function Get-DoneLines {
  $lines = @($script:Log | Where-Object { $_ -match '^(==|  \+)' })
  $out = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^== ') { if ($i + 1 -lt $lines.Count -and $lines[$i + 1] -match '^  \+') { $out += $lines[$i] } }
    else { $out += $lines[$i] }
  }
  # Plain return, so a pipeline gets one line at a time: wrapped as one object, the HTML report's
  # ForEach-Object saw the whole list at once and drew every line into a single heading (1.42.0, 1.43.0).
  return $out
}

<# The numbers that say whether it worked, beyond the process count: memory
   in use, threads and handles alive, and three seconds of idle CPU and DPC
   time. Taken before, taken after, and taken again by the after-restart
   task, so the report compares like with like. Counter names are localised
   on non-English Windows; when they cannot be read they are left out. #>
function Get-Snapshot {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  $procs = @(Get-Process -ErrorAction SilentlyContinue)
  $snap = @{
    processes = $procs.Count
    threads = ($procs | ForEach-Object { $_.Threads.Count } | Measure-Object -Sum).Sum
    handles = ($procs | Measure-Object HandleCount -Sum).Sum
    memUsedMb = $(if ($os) { [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1024) } else { 0 })
    cpuPct = $null; dpcPct = $null
  }
  try {
    $c = Get-Counter -Counter '\Processor(_Total)\% Processor Time', '\Processor(_Total)\% DPC Time' -SampleInterval 1 -MaxSamples 3 -ErrorAction Stop
    $snap.cpuPct = [math]::Round(($c.CounterSamples | Where-Object { $_.Path -like '*Processor Time' } | Measure-Object CookedValue -Average).Average, 1)
    $snap.dpcPct = [math]::Round(($c.CounterSamples | Where-Object { $_.Path -like '*DPC Time' } | Measure-Object CookedValue -Average).Average, 2)
  } catch { }
  return $snap
}

function Format-Snapshot($snap) {
  if (-not $snap) { return '-' }
  $bits = @(("{0} processes" -f $snap.processes), ("{0} threads" -f $snap.threads), ("{0} handles" -f $snap.handles), ("{0} MB in use" -f $snap.memUsedMb))
  if ($snap.cpuPct -ne $null) { $bits += ("idle CPU {0}%" -f $snap.cpuPct) }
  if ($snap.dpcPct -ne $null) { $bits += ("DPC {0}%" -f $snap.dpcPct) }
  return ($bits -join ', ')
}

<# Windows' own measurement of the last full start: event 100 in its boot
   performance log carries the boot time in milliseconds, written a few
   minutes after the desktop appears. Null when the log has nothing yet (a
   fresh install, a build machine, a PC that only ever fast-started). #>
function Get-BootSeconds {
  try {
    $e = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 100 } -MaxEvents 1 -ErrorAction Stop
    if (-not $e) { return $null }
    $t = (([xml]$e.ToXml()).Event.EventData.Data | Where-Object { $_.Name -eq 'BootTime' } | Select-Object -First 1).'#text'
    if ($t) { return [math]::Round([double]$t / 1000, 1) }
  } catch { }
  return $null
}

# ---------------------------------------------------------------------------
# the card: the number, on one picture, for the person who wants to post it
# ---------------------------------------------------------------------------
<# One 1080 x 1080 PNG: the process count before and after, counted on this
   PC by Windows itself, the CPU and GPU, and the words that keep it honest
   (an example run on one PC; yours will differ). Written at the end of a run
   with the "now" number, and again by status mode once the after-restart
   count exists. System.Drawing ships with Windows; a PC without it simply
   has no card, and the run says so in one line. #>
function New-RoundedPath {
  param([float]$x, [float]$y, [float]$w, [float]$h, [float]$r)
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Write-Card {
  param($m, [int]$before, [int]$after, [string]$when)
  $script:Card = $null
  try {
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $w = 1080; $h = 1080
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#050308'))
    # A soft purple glow, top right.
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddEllipse(520, -320, 1000, 1000)
    $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $gp
    $pgb.CenterColor = [System.Drawing.Color]::FromArgb(120, 139, 92, 246)
    $pgb.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 5, 3, 8))
    $g.FillPath($pgb, $gp)
    # The mark, top left: the eagle from the site (one small download, five seconds at most); the
    # three bars and the bolt are drawn instead when the PC is offline or the site is not there.
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#ffffff'))
    $eagle = $null
    try {
      $req = [System.Net.WebRequest]::Create('https://omnidx.net/studio/assets/icons/icon-192.png'); $req.Timeout = 5000
      $resp = $req.GetResponse(); $ms = New-Object System.IO.MemoryStream; $resp.GetResponseStream().CopyTo($ms); $resp.Close()
      $ms.Position = 0; $eagle = [System.Drawing.Image]::FromStream($ms)
    } catch { $eagle = $null }
    if ($eagle) {
      $g.DrawImage($eagle, (New-Object System.Drawing.Rectangle 62, 74, 172, 172))
    } else {
      $mr = New-Object System.Drawing.Rectangle 80, 80, 150, 150
      $lgb = New-Object System.Drawing.Drawing2D.LinearGradientBrush $mr, ([System.Drawing.ColorTranslator]::FromHtml('#5b21b6')), ([System.Drawing.ColorTranslator]::FromHtml('#d946ef')), 45
      $g.FillPath($lgb, (New-RoundedPath 80 80 150 150 34))
      $g.FillPath($white, (New-RoundedPath 107 119 69 14 7))
      $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(184, 255, 255, 255))), (New-RoundedPath 107 148 47 14 7))
      $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(118, 255, 255, 255))), (New-RoundedPath 107 177 26 14 7))
      $bolt = [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF 190, 107), (New-Object System.Drawing.PointF 166, 156), (New-Object System.Drawing.PointF 184, 156), (New-Object System.Drawing.PointF 174, 203), (New-Object System.Drawing.PointF 205, 143), (New-Object System.Drawing.PointF 187, 143))
      $g.FillPolygon($white, $bolt)
    }
    $text = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f1ecff'))
    $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#b3a8cf'))
    $purple = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#c084fc'))
    $font = { param($size, $bold) New-Object System.Drawing.Font 'Segoe UI', ([float]$size), $(if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }), ([System.Drawing.GraphicsUnit]::Pixel) }
    $g.DrawString('OmniDx Tune', (& $font 46 $true), $text, 258, 92)
    $g.DrawString('Processes, counted on this PC by Windows itself', (& $font 27 $false), $muted, 260, 154)
    # The numbers: before, an arrow, after; the font shrinks until the three fit the width.
    $arrow = [string][char]0x2192
    $size = 200
    do {
      $fBig = & $font $size $true
      $fArrow = & $font ([int]($size * 0.6)) $false
      $wb = $g.MeasureString("$before", $fBig).Width; $wa = $g.MeasureString("$after", $fBig).Width; $ww = $g.MeasureString($arrow, $fArrow).Width
      $total = $wb + $ww + $wa + 40
      if ($total -le 940) { break }
      $size -= 10
    } while ($size -gt 90)
    $y = 300
    $x = 70
    $g.DrawString("$before", $fBig, $text, $x, $y)
    $g.DrawString($arrow, $fArrow, $purple, $x + $wb + 8, $y + ($size * 0.28))
    $tr = New-Object System.Drawing.Rectangle ([int]($x + $wb + $ww + 24)), $y, ([int]$wa + 10), ([int]($size * 1.3))
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $tr, ([System.Drawing.ColorTranslator]::FromHtml('#8b5cf6')), ([System.Drawing.ColorTranslator]::FromHtml('#d946ef')), 0
    $g.DrawString("$after", $fBig, $grad, $x + $wb + $ww + 24, $y)
    $fLabel = & $font 30 $false
    $g.DrawString('before', $fLabel, $muted, $x + 12, $y + ($size * 1.22))
    $g.DrawString($when, $fLabel, $muted, $x + $wb + $ww + 36, $y + ($size * 1.22))
    # The machine, trimmed to the width.
    $fit = { param($t, $f, $max) $t = "$t"; while ($t.Length -gt 4 -and $g.MeasureString($t, $f).Width -gt $max) { $t = $t.Substring(0, $t.Length - 2).TrimEnd() + '...' }; return $t }
    $fLine = & $font 34 $false
    $cpu = & $fit $m.cpu $fLine 920
    $gpu = & $fit $m.gpu $fLine 920
    $g.DrawString($cpu, $fLine, $text, 80, 640)
    $g.DrawString($gpu, $fLine, $text, 80, 690)
    $fSmall = & $font 27 $false
    $g.DrawString('An example run on one PC. Yours will differ.', $fSmall, $muted, 80, 766)
    $g.DrawString('The free report shows what it would find on yours, and changes nothing.', $fSmall, $muted, 80, 804)
    $dot = [string][char]0x00B7
    $g.DrawString(("OmniDx Tune v{0} {1} {2}" -f $script:Version, $dot, (Get-Date).ToString('d MMMM yyyy')), $fSmall, $muted, 80, 850)
    $g.DrawString('omnidx.net', (& $font 44 $true), $purple, 80, 930)
    $g.DrawString('One command. Undo in one line. Nothing installed.', $fSmall, $muted, 80, 996)
    $path = Join-Path $script:Root ("card-{0}.png" -f $script:Stamp)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    $script:Card = $path
  } catch { Say ("  (No card this time: {0})" -f $_.Exception.Message) }
}

function Write-Report($m, $before, $after, $changesFile) {
  $script:BootBefore = Get-BootSeconds
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
    $(if ($script:Snapshots) { "  before: " + (Format-Snapshot $script:Snapshots.before) } else { $null }),
    $(if ($script:Snapshots) { "  now:    " + (Format-Snapshot $script:Snapshots.after) } else { $null }),
    $(if ($script:BootBefore -ne $null) { "  last start: $($script:BootBefore) s, Windows' own measurement of the last full start; the first start after the tune lands in after-restart.txt, and status shows both" } else { $null }),
    $(if ((Get-GoneProcesses).Count) { "  gone by name: " + ((Get-GoneProcesses) -join ', ') } else { $null }),
    "  full lists: processes-before-$($script:Stamp).txt and processes-after-$($script:Stamp).txt next to this file; after-restart.txt appears after your next sign-in.", "",
    "NEXT STEPS", @($i = 0; Get-NextSteps $m | ForEach-Object { $i++; "  {0}. {1}" -f $i, $_ }), "",
    "STILL RUNNING (most instances)", @($top), "",
    "KEPT, AND WHY", @($(if ($script:Kept.Count) { $script:Kept | Sort-Object -Unique | ForEach-Object { "  $_" } } else { "  nothing needed keeping" })), "",
    "WHAT WAS DONE", @(Get-DoneLines), "",
    "WARNINGS ($($script:Warnings.Count))", @($(if ($script:Warnings.Count) { $script:Warnings | ForEach-Object { "  ! $_" } } else { "  none" })), "",
    "GPU CONTROL PANEL", @(Get-GpuNotes $m | ForEach-Object { "  - $_" }), "",
    "LAUNCHERS, OVERLAYS AND HELPER APPS", @(Get-LauncherNotes $m | ForEach-Object { "  - $_" }), "",
    "LEFT BY OTHER TOOLS (the tune changes none of these)", @(Get-LeftoverNotes $m | ForEach-Object { "  - $_" }), "",
    "PER GAME", @($gameLines), "",
    "BIOS", @(Get-BiosChecklist $m | ForEach-Object { "  $_" }), "",
    "UNDO", "  Administrator PowerShell:  powershell -ExecutionPolicy Bypass -File C:\OmniDx\undo\undo.ps1", $(if ($script:RestorePointMade) { "  Or Windows Recovery > System Restore > the point named 'OmniDx Tune $($script:Stamp)'." } else { "  (No restore point was made on this run; the undo script is the way back.)" }), "  Changes recorded in: $changesFile", "",
    "STATUS, ANY TIME", "  What is still in place, what an update put back, the keep task, the after-restart count:", "  `$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex", "  Files: README.txt next to this report says what each file here is."
  )
  $flat = @(); foreach ($l in $lines) { if ($l -is [array]) { $flat += $l } elseif ($l -ne $null) { $flat += $l } }
  Set-Content -Path $rep -Value $flat -Encoding UTF8
  Set-Content -Path (Join-Path $script:Root ("bios-{0}.txt" -f (($m.board -replace '[^A-Za-z0-9]+', '-').Trim('-')))) -Value (Get-BiosChecklist $m) -Encoding UTF8
  try { Write-HtmlReport $m $before $after $target $found $changesFile } catch { Warn ("The HTML report was not written ({0}); the text one is." -f $_.Exception.Message) }
  try {
    $summary = @{ version = $script:Version; stamp = $script:Stamp; before = $before; after = $after; target = $target; bootBefore = $script:BootBefore; changes = $script:Changes.Count; warnings = $script:Warnings.Count; seconds = [int]$script:Timer.Elapsed.TotalSeconds; os = $m.os; cpu = $m.cpu; gpu = $m.gpu; ramGb = $m.ramGb; board = $m.board; laptop = $m.laptop; games = $found; snapshots = $script:Snapshots; gone = @(Get-GoneProcesses); phases = $script:Phases; extreme = [bool]$Extreme }
    $summary | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $script:Root ("summary-{0}.json" -f $script:Stamp)) -Encoding UTF8
  } catch { }
  return $rep
}

<# The same report as a page: dark, one column, the numbers up top, the
   BIOS checklist where it can be read on a phone next to the BIOS screen.
   Opens in the browser at the end. The text report stays; this is the one
   people will actually read. #>
function Write-HtmlReport($m, $before, $after, $target, $found, $changesFile) {
  $h = { param($t) [System.Net.WebUtility]::HtmlEncode([string]$t) }
  $list = { param($items) if (-not $items -or -not @($items).Count) { '<p class="muted">none</p>' } else { '<ul>' + ((@($items) | ForEach-Object { '<li>' + (& $h $_) + '</li>' }) -join '') + '</ul>' } }
  $sn = $script:Snapshots
  $row = { param($label, $b, $a) "<tr><td>$label</td><td>$(& $h $b)</td><td>$(& $h $a)</td></tr>" }
  $snapRows = ''
  if ($sn) {
    $snapRows = (& $row 'Processes' $sn.before.processes $sn.after.processes) + (& $row 'Threads' $sn.before.threads $sn.after.threads) + (& $row 'Handles' $sn.before.handles $sn.after.handles) + (& $row 'Memory in use' ("{0} MB" -f $sn.before.memUsedMb) ("{0} MB" -f $sn.after.memUsedMb))
    if ($sn.before.cpuPct -ne $null) { $snapRows += (& $row 'Idle CPU' ("{0}%" -f $sn.before.cpuPct) ("{0}%" -f $sn.after.cpuPct)) + (& $row 'DPC time' ("{0}%" -f $sn.before.dpcPct) ("{0}%" -f $sn.after.dpcPct)) }
  }
  $games = ''
  foreach ($g in $script:Games) { if ($found -contains $g.name) { $games += "<h3>$(& $h $g.name) <span class='tag'>installed</span></h3>" + (& $list $g.notes) } }
  $others = @($script:Games | Where-Object { $found -notcontains $_.name } | ForEach-Object { $_.name })
  if ($others.Count) { $games += "<p class='muted'>Not found on this PC (the same profile applies if you install them): $(& $h ($others -join ', '))</p>" }
  $done = @(Get-DoneLines | ForEach-Object { if ($_ -match '^== ') { "<h4>$(& $h ($_ -replace '^== ', ''))</h4>" } else { "<div class='did'>$(& $h ($_ -replace '^  \+ ', ''))</div>" } }) -join ''
  # The full process lists, folded away: name, how many, memory; taken before and after.
  $procTables = ''
  foreach ($tag in 'before', 'after') {
    $f = Join-Path $script:Root ("processes-{0}-{1}.txt" -f $tag, $script:Stamp)
    if (Test-Path $f) { $procTables += "<details><summary>Every process, $tag ($(@(Get-Content $f).Count) names)</summary><pre>$(& $h ((Get-Content $f) -join "`n"))</pre></details>" }
  }
  $keptCut = [bool](Get-ScheduledTask -TaskName 'OmniDx keep' -ErrorAction SilentlyContinue)
  $html = @"
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OmniDx Tune report - $(& $h $script:Stamp)</title>
<style>
body{margin:0;background:#050308;color:#f1ecff;font:15px/1.6 -apple-system,'Segoe UI',Roboto,system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:36px 20px 80px}
h1{font-size:30px;letter-spacing:-.02em;margin:0 0 4px}h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c084fc;margin:36px 0 12px}
h3{font-size:17px;margin:18px 0 6px}h4{font-size:13px;color:#c084fc;margin:16px 0 4px}
.sub{color:#b3a8cf;margin:0 0 24px}.muted{color:#8a7ea6}.tag{font-size:11px;color:#30d38a;margin-left:8px;font-weight:600}
.big{display:flex;gap:28px;flex-wrap:wrap;margin:18px 0}.big div{background:#0e0a17;border:1px solid #2a1f45;border-radius:14px;padding:16px 20px;min-width:150px}
.big b{display:block;font-size:40px;font-weight:700;letter-spacing:-.03em;background:linear-gradient(115deg,#8b5cf6,#c084fc 45%,#d946ef);-webkit-background-clip:text;background-clip:text;color:transparent}
.big span{font-size:12px;color:#8a7ea6}
table{width:100%;border-collapse:collapse;background:#0e0a17;border:1px solid #2a1f45;border-radius:12px;overflow:hidden}
td,th{padding:9px 14px;border-bottom:1px solid #1b1430;text-align:left;font-size:14px}th{color:#8a7ea6;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em}
ul{padding-left:20px;color:#b3a8cf}li{margin:4px 0}.did{color:#b3a8cf;font-size:13.5px;padding-left:14px}.warn li{color:#ffc247}
code{font-family:ui-monospace,Consolas,monospace;background:#150f22;padding:2px 6px;border-radius:6px;color:#f1ecff;font-size:13px}
details{margin:10px 0;background:#0e0a17;border:1px solid #2a1f45;border-radius:12px;padding:10px 16px}summary{cursor:pointer;color:#c084fc;font-weight:600}
details pre{font:12.5px/1.5 ui-monospace,Consolas,monospace;color:#b3a8cf;overflow:auto;max-height:420px;margin:10px 0 4px}
.bios ul{list-style:none;padding-left:2px}.bios li{margin:8px 0;color:#f1ecff}.bios{background:#0e0a17;border:1px solid #2a1f45;border-radius:14px;padding:6px 18px}
</style></head><body><main>
<h1><img src="https://omnidx.net/studio/assets/icons/icon-192.png" alt="" width="44" height="44" style="vertical-align:middle;margin-right:10px" onerror="this.remove()">OmniDx Tune <span class="muted" style="font-size:16px">v$(& $h $script:Version)</span></h1>
<p class="sub">$(& $h ((Get-Date).ToString('f'))) &middot; $(& $h $m.cpu) &middot; $(& $h $m.gpu) &middot; $(& $h $m.ramGb) GB &middot; $(& $h $m.board)</p>
<div class="big"><div><b>$before</b><span>processes before</span></div><div><b>$after</b><span>now, before a restart</span></div><div><b>~$target</b><span>target for this PC after a restart</span></div>$(if ($script:BootBefore -ne $null) { "<div><b>$($script:BootBefore) s</b><span>last start, before the tune</span></div>" })</div>
$(if ($script:Card) { "<p class='muted'>The card, for posting (the same numbers, on one picture): <code>$(& $h (Split-Path $script:Card -Leaf))</code></p><img src='$(& $h (Split-Path $script:Card -Leaf))' alt='Before and after, on a card' style='max-width:340px;width:100%;border-radius:14px;border:1px solid #2a1f45'>" })
<p class="muted">Many of the "now" processes are only waiting to be stopped. The number after a restart is the one that counts; <code>C:\OmniDx\after-restart.txt</code> gets it at your next sign-in.$(if ($keptCut) { ' Kept cut: a task at each sign-in puts back what a Windows update turns on; undo removes it.' } else { ' Not kept cut: run the command again after a big Windows update, same key, free.' })</p>
<h2>Next steps</h2><ol>$((Get-NextSteps $m | ForEach-Object { '<li>' + (& $h $_) + '</li>' }) -join '')</ol>
$(if ($snapRows) { "<h2>Before and after</h2><table><tr><th></th><th>Before</th><th>Now</th></tr>$snapRows</table>" })
$(if ((Get-GoneProcesses).Count) { "<h2>Gone, by name</h2><p class='muted'>Running before, not running now: " + (& $h ((Get-GoneProcesses) -join ', ')) + "</p>" })
$procTables
<h2>Kept, and why</h2>$(& $list ($script:Kept | Sort-Object -Unique))
<h2>Warnings ($($script:Warnings.Count))</h2><div class="warn">$(& $list $script:Warnings)</div>
<h2>BIOS checklist for $(& $h $m.board)</h2><div class="bios"><ul>$((Get-BiosChecklist $m | Select-Object -Skip 3 | Where-Object { $_ } | ForEach-Object { '<li>' + (& $h $_) + '</li>' }) -join '')</ul></div>
<h2>GPU control panel</h2>$(& $list (Get-GpuNotes $m))
<h2>Launchers, overlays and helper apps</h2>$(& $list (Get-LauncherNotes $m))
<h2>Left by other tools</h2><p class="muted">The tune changes none of these; it names them, with the way back.</p>$(& $list (Get-LeftoverNotes $m))
<h2>Per game</h2>$games
<h2>What was done</h2>$done
<h2>Undo</h2><p>Administrator PowerShell: <code>powershell -ExecutionPolicy Bypass -File C:\OmniDx\undo\undo.ps1</code><br>$(if ($script:RestorePointMade) { "Or Windows Recovery &rsaquo; System Restore &rsaquo; the point named <code>OmniDx Tune $(& $h $script:Stamp)</code>." } else { "No restore point was made on this run (see the warnings); the undo script is the way back." })<br>Changes recorded in <code>$(& $h $changesFile)</code>.</p>
<h2>Status, any time</h2><p>What is still in place, what an update put back, the keep task and the after-restart count: <code>`$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex</code><br><span class="muted">README.txt in C:\OmniDx says what each file there is.</span></p>
<p class="muted" style="margin-top:40px">omnidx.net &middot; one payment, one PC, undo in one line.</p>
</main></body></html>
"@
  $path = Join-Path $script:Root ("report-{0}.html" -f $script:Stamp)
  Set-Content -Path $path -Value $html -Encoding UTF8
  $script:HtmlReport = $path
}

<# The free look. Same read as the tune, then: what it would switch off on
   this PC, counted; what it would keep, and why; the advice; the target.
   Nothing changes and no key is asked for. The BIOS checklist and the
   per-game settings are in the paid report. #>
function Write-Preview($m, $before) {
  Head "What the tune would do here"
  # Where the free look spends its time, for the transcript and the check.
  $sw = [System.Diagnostics.Stopwatch]::StartNew(); $tm = [ordered]@{}
  $lap = { param($name) $tm[$name] = [math]::Round($sw.Elapsed.TotalSeconds, 1); $sw.Restart() }
  $keep = Get-KeepList $m
  $startup = @(Get-StartupEntries | Where-Object { $_.on -and -not (Test-Keep $_.name) })
  & $lap 'startup'
  $svcOff = @(); $svcKeep = @()
  # The service list once, not once per name; and the same rule the run applies: a service already at the
  # mode the tune would set, or already disabled, is not a change, so it is not counted as one here.
  $allSvc = @(Get-Service -ErrorAction SilentlyContinue)
  foreach ($pair in $script:ServiceOff) {
    $name = $pair[0]
    $want = if ($script:ManualOnly -contains $name) { 'Manual' } else { 'Disabled' }
    $svc = @($allSvc | Where-Object { ($_.Name -eq $name -or $_.Name -like ($name + '_*')) -and "$($_.StartType)" -ne 'Disabled' })
    if (-not $svc.Count) { continue }
    if ($keep.ContainsKey($name)) { $svcKeep += ("{0} ({1})" -f $name, $keep[$name]); continue }
    if (-not @($svc | Where-Object { "$($_.StartType)" -ne $want }).Count) { continue }
    $svcOff += ("{0} ({1})" -f $name, $pair[1])
  }
  & $lap 'services'
  $idx = Get-TaskIndex
  $tasks = @(); foreach ($t in $script:TaskList) { $task = $idx[($t[0] + $t[1]).ToLower()]; if ($task -and $task.State -ne 'Disabled') { $tasks += $t[1] } }
  & $lap 'tasks'
  $allPkgs = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue)
  $apps = @(); foreach ($pat in $script:JunkApps) { foreach ($pkg in @($allPkgs | Where-Object { $_.Name -like $pat })) { if (-not ($pkg.NonRemovable -or $pkg.IsFramework)) { $apps += $pkg.Name } } }
  $apps = @($apps | Sort-Object -Unique)
  & $lap 'apps'
  $plan = Get-DebloatPlan $m
  & $lap 'pieces'
  $extras = @($plan.caps | ForEach-Object { $_.what }) + @($plan.feats | ForEach-Object { $_.what })
  if ($plan.oneInstalled -and -not $plan.oneSignedIn) { $extras += 'OneDrive (nobody is signed in to it)' }
  $target = Get-SafeBar $m
  Say ("  Startup entries it would switch off: {0}" -f $startup.Count) 'White'
  foreach ($e in $startup) { Say ("    - {0}" -f $e.label) }
  Say ("  Services it would stop or set to manual: {0}" -f $svcOff.Count) 'White'
  Say ("  Services it would keep for this PC: {0}" -f $svcKeep.Count) 'White'
  foreach ($k in $svcKeep) { Say ("    - {0}" -f $k) }
  Say ("  Scheduled tasks it would switch off: {0}" -f $tasks.Count) 'White'
  Say ("  Preinstalled apps it would remove: {0}" -f $apps.Count) 'White'
  Say ("  Legacy Windows pieces it would remove: {0}" -f $extras.Count) 'White'
  foreach ($x in $extras) { Say ("    - {0}" -f $x) }
  Say ("  Plus: the OmniDx power plan, network latency settings, Discord / Spotify / browser, game profiles, the BIOS checklist for {0}." -f $m.board) 'White'
  Say ("  Processes now: {0}. Target after the tune and a restart: about {1}." -f $before, $target) 'Green'
  Say ("  Looked in {0} s: startup {1}, services {2}, tasks {3}, apps {4}, Windows pieces {5}" -f [math]::Round(($tm.Values | Measure-Object -Sum).Sum, 1), $tm.startup, $tm.services, $tm.tasks, $tm.apps, $tm.pieces)
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
    "  legacy Windows pieces removed: $($extras.Count)", @($extras | ForEach-Object { "    - $_" }),
    "  plus the OmniDx power plan, network, Discord / Spotify / browsers, game profiles, memory integrity only if asked", "",
    "KEPT FOR THIS PC, AND WHY", @($(if ($svcKeep.Count) { $svcKeep | ForEach-Object { "  $_" } } else { "  nothing needed keeping" })), "",
    "WARNINGS ($($script:Warnings.Count))", @($(if ($script:Warnings.Count) { $script:Warnings | ForEach-Object { "  ! $_" } } else { "  none" })), "",
    "LEFT BY OTHER TOOLS (the tune changes none of these)", @(Get-LeftoverNotes $m | ForEach-Object { "  - $_" }), "",
    "THE PAID REPORT ADDS", "  the BIOS checklist for $($m.board) ($($m.bios)), the GPU control-panel settings, and the competitive settings for each game found.",
    "  And after a paid run: the keep task puts back what a Windows update turns on, and status mode says what is still in place, any time.",
    "  Extreme (caution), for after the standard tune: every extra service, Game Bar entirely, the shell drawn plain, notifications off, the overlay plane and memory compression off, and an advanced BIOS list. More frames, fewer conveniences; undo puts it all back.",
    "  omnidx.net - one payment, one PC, undo in one line."
  )
  $flat = @(); foreach ($l in $lines) { if ($l -is [array]) { $flat += $l } else { $flat += $l } }
  Set-Content -Path $rep -Value $flat -Encoding UTF8
  Say ("  Saved: {0}" -f $rep)
  try { Start-Process notepad.exe $rep } catch { }
}

function Invoke-Undo {
  param([switch]$Last)
  $u = Join-Path $script:Root 'undo\undo.ps1'
  if (-not (Test-Path $u)) { Say "Nothing to undo: no run recorded in C:\OmniDx\undo." 'Yellow'; return }
  $recs = @(Get-ChildItem (Join-Path $script:Root 'undo') -Filter 'changes-20*.json' -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
  if (-not $recs.Count) { Say "Nothing to undo: every recorded run has already been put back." 'Yellow'; return }
  if ($Last) {
    Say ("Only the newest run ({0}) goes back; {1} earlier run(s) and the keep task stay." -f ($recs[0].BaseName -replace '^changes-', ''), ($recs.Count - 1)) 'White'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $u -File $recs[0].FullName
    return
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $u
}

function Main {
  Write-Host ''
  Write-Host '  OmniDx Tune' -ForegroundColor Magenta -NoNewline; Write-Host ("  v{0}" -f $script:Version) -ForegroundColor DarkGray
  Write-Host '  200 processes. Under 100. One run.' -ForegroundColor DarkGray
  Write-Host ''

  if ($SelfTest) {
    Say ("  self text: {0} chars, {1} functions" -f $script:SelfText.Length, ([regex]::Matches($script:SelfText, '(?m)^function ')).Count)
    # What the window does on load, without a window: a second instance runs -Probe.
    $ps = [PowerShell]::Create()
    [void]$ps.AddScript('param($text, $p) & ([scriptblock]::Create($text)) @p').AddArgument($script:SelfText).AddArgument(@{ Probe = $true })
    $out = $ps.Invoke()
    $info = @($ps.Streams.Information | ForEach-Object { $m = $_.MessageData; if ($m -and $m.PSObject.Properties['Message']) { [string]$m.Message } else { [string]$m } })
    $probe = $null; try { $probe = ConvertFrom-Json ([string]$out[-1]) } catch { }
    Say ("  runspace probe: {0} output objects, {1} info lines, cpu '{2}', {3} processes, {4} errors" -f $out.Count, $info.Count, $probe.cpu, $probe.before, $ps.Streams.Error.Count) $(if ($probe.cpu) { 'Green' } else { 'Red' })
    foreach ($e in $ps.Streams.Error) { Say ("  ! {0}" -f $e) 'Red' }
    $ps.Dispose()
    return
  }
  # These two only read, so they run from any PowerShell and any account.
  if ($CheckKey) {
    if (-not $Key) { $Key = Read-Host "  Paste the key to check" }
    $parsed = Read-Key $Key
    if ($parsed) {
      $view = Get-ServerView $parsed.key
      if ($view) { Say ("  Valid: {0}. The server says: {1}." -f $parsed.key, $view) 'Green' }
      else { Say ("  Valid: {0} ({1} PC{2}). The server decides whether it was issued and where it is bound." -f $parsed.key, $parsed.seats, $(if ($parsed.seats -ne 1) { 's' } else { '' })) 'Green' }
    }
    else { Say "  That is not an OmniDx key. It looks like TUNE-XXXX-XXXX-XXXX-XXXX; check it for typos." 'Red' }
    return
  }
  if ($Status) { Show-Status; return }
  if ($SupportBundle) { New-SupportBundle; return }
  if ($PSVersionTable.PSEdition -eq 'Core') { Say "  Run this in Windows PowerShell (the blue one, version 5.1), not PowerShell 7: the restore point and Store app commands only exist there. The one command on omnidx.net picks the right one for you." 'Red'; return }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { Say "  Run this in an administrator PowerShell (right-click PowerShell > Run as administrator), or use the one-liner on omnidx.net which does it for you." 'Red'; return }
  if ([Environment]::OSVersion.Version.Major -lt 10) { Say "  Windows 10 or 11 only." 'Red'; return }

  New-Item -ItemType Directory -Path $script:Root -Force | Out-Null
  try { Start-Transcript -Path (Join-Path $script:Root ("log-{0}.txt" -f $script:Stamp)) -Append -ErrorAction Stop | Out-Null } catch { }
  Limit-History
  try {
    if ($Undo) { Invoke-Undo; return }
    if ($UndoLast) { Invoke-Undo -Last; return }
    if ($Probe) { Write-Output (Get-Probe | ConvertTo-Json -Depth 5 -Compress); return }
    if ($Gui) {
      $shown = $false
      try { $shown = Show-Gui } catch { Warn ("The window could not open ({0})." -f $_.Exception.Message) }
      if ($shown) { return } else { Say "  Carrying on in the console." }
    }
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
    # A PC that has run before already holds its key; a second run asks for nothing.
    if (-not $Key) {
      $bound = $null; try { $bound = (Get-ItemProperty 'HKLM:\SOFTWARE\OmniDx\Tune' -ErrorAction Stop).Key } catch { }
      if ($bound) { $Key = $bound; Say "  Using the key already bound to this PC, from your last run." }
    }
    if (-not $Key) { $Key = Read-Host "  Paste your key (from the page after you paid)" }
    $parsed = Read-Key $Key
    if (-not $parsed) { Say "  That is not an OmniDx key. It looks like TUNE-XXXX-XXXX-XXXX-XXXX; check it for typos, or get it again at omnidx.net/studio/activate/." 'Red'; return }
    $hwid = Get-Hwid
    $machine = @{ cpu = $m.cpu; gpu = $m.gpu; board = $m.board; os = $m.os; name = $m.name; version = $script:Version }
    if (-not $Api) {
      # The one command passes the server in; by hand, the script reads the same config.json.
      try {
        $web = New-Object System.Net.WebClient; $web.Headers['User-Agent'] = 'OmniDxTune/script'
        $cfg = $web.DownloadString('https://omnidx.net/tune/config.json?v=' + [DateTime]::UtcNow.Ticks) | ConvertFrom-Json
        if ($cfg.api) { $Api = [string]$cfg.api }
      } catch { }
    }
    if (-not (Test-Licence $parsed $hwid $machine)) { return }

    if ($m.domain) {
      Warn "This PC is joined to a domain (a work or school machine). Group policy can put settings back, and IT may have opinions."
      if (-not (Ask "Carry on anyway?")) { Say "  Stopped. Nothing changed."; return }
    }
    if (Test-PendingReboot) {
      Warn "Windows has an update waiting for a restart. Changing services under a pending update is asking for trouble."
      if (-not $NoRestart -and (Ask "Restart now, then run the command again afterwards? (recommended)")) { Restart-Computer -Force; return }
    }

    $playing = @()
    foreach ($g in $script:Games) { foreach ($exe in $g.exes) { if (Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) -ErrorAction SilentlyContinue) { $playing += $g.name } } }
    if ($playing.Count) {
      Warn ("A game is running ({0}). Its profile cannot be applied while it is open, and stopping services under it is not kind to it." -f (($playing | Sort-Object -Unique) -join ', '))
      if (-not (Ask "Carry on anyway?")) { Say "  Stopped. Close the game and run again."; return }
    }

    Say ""
    Say "  What happens next: a restore point, a backup, then the cut. Nothing that lowers security. Undo is one file." 'White'
    Say "  It will ask which startup apps to leave on, and offer to close Discord and Spotify so they can be tuned." 'White'
    Say "  The debloat removes the preinstalled apps, the PC maker's trials, OneDrive if nobody is signed in to it, and the legacy pieces of Windows; then it clears the update caches. Three to five minutes in all." 'White'
    if (-not (Ask "Go?")) { Say "  Stopped. Nothing changed."; return }

    $skip = @($Skip | ForEach-Object { "$_".ToLower() })
    # Each phase is timed; the seconds go into the summary and one line at the end, so a slow phase is a fact, not a feeling.
    $script:Phases = [ordered]@{}
    $run = { param($name, $block)
      if ($skip -contains $name) { Head ("{0} (skipped)" -f $name); return }
      $psw = [System.Diagnostics.Stopwatch]::StartNew()
      & $block
      $script:Phases[$name] = [math]::Round($psw.Elapsed.TotalSeconds, 1)
    }
    Head "Before the cut"
    Save-ProcessList 'before'
    $snapBefore = Get-Snapshot
    # The report's big number, its table and the Done line all read this one snapshot, so they agree to the process.
    $before = [int]$snapBefore.processes
    Say ("  Before: {0}" -f (Format-Snapshot $snapBefore))
    New-Safety
    & $run 'startup'   { Cut-Startup }
    & $run 'services'  { Cut-Services $m }
    & $run 'tasks'     { Cut-Tasks }
    & $run 'apps'      { Cut-Apps $m }
    & $run 'debloat'   { Debloat $m }
    & $run 'telemetry' { Cut-Telemetry $m }
    & $run 'system'    { Tune-System $m }
    & $run 'power'     { New-PowerPlan $m }
    & $run 'network'   { Tune-Network $m }
    & $run 'programs'  { Tune-Apps $m }
    & $run 'games'     { Set-GameProfiles }
    & $run 'nvidia'    { Tune-Gpu $m }
    & $run 'extreme'   { Set-Extreme $m }
    Set-Vbs $m
    & $run 'cleanup'   { Clear-Junk }
    Register-AfterCount
    if ($skip -contains 'keep') { Head "keep (skipped)"; Remove-KeepTask '-Skip keep' } else { Register-Keep }

    $changesFile = Save-Changes
    Head "Done"
    # The services told to stop take a few seconds to go; the count is taken once they have, up to twenty seconds.
    $stopping = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'StopPending' })
    if ($stopping.Count) {
      Say ("  Waiting for {0} services to finish stopping..." -f $stopping.Count)
      $ssw = [System.Diagnostics.Stopwatch]::StartNew()
      while ($ssw.Elapsed.TotalSeconds -lt 20 -and @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'StopPending' }).Count) { Start-Sleep -Seconds 2 }
    }
    Save-ProcessList 'after'
    $snapAfter = Get-Snapshot
    $after = [int]$snapAfter.processes
    Say ("  After:  {0}" -f (Format-Snapshot $snapAfter))
    $gone = Get-GoneProcesses
    if ($gone.Count) { Say ("  Gone:   {0}" -f ($gone -join ', ')) }
    $script:Snapshots = @{ before = $snapBefore; after = $snapAfter }
    Write-Card $m $before $after 'now, before a restart'
    $rep = Write-Report $m $before $after $changesFile
    $stoppedAny = @($script:Changes | Where-Object { $_.type -eq 'service' }).Count -gt 0
    Say ("  Processes: {0} -> {1} now, in {2} seconds. Restart for the real number{3}" -f $before, $after, [int]$script:Timer.Elapsed.TotalSeconds, $(if ($stoppedAny) { ': the services that were told to stop are still unwinding.' } else { '.' })) 'Green'
    if ($script:Phases.Count) { Say ("  Where the time went: " + (($script:Phases.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object { "{0} {1} s" -f $_.Key, $_.Value }) -join ', ')) }
    Say ("  Report, BIOS checklist, launcher notes and per-game settings: {0}" -f $rep) 'White'
    if ($script:Card) { Say ("  A card with these numbers, for posting: {0} (status mode writes one with the after-restart number)" -f $script:Card) 'White' }
    Say "  Undo, any time: powershell -ExecutionPolicy Bypass -File C:\OmniDx\undo\undo.ps1" 'White'
    Say "  What is still in place, any time: `$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex" 'White'
    Say "  Next: restart, then do the BIOS checklist - the memory profile alone is worth more than half of this." 'White'
    try { if ($script:HtmlReport -and (Test-Path $script:HtmlReport)) { Start-Process $script:HtmlReport } else { Start-Process notepad.exe $rep } } catch { }
    if (-not $NoRestart -and (Ask "Restart now?")) { Invoke-Restart }
  } finally {
    try { Stop-Transcript | Out-Null } catch { }
  }
}

Main
