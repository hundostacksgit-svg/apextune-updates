# OmniDx Edition - the gaming setup of Windows that comes with OmniDx Tune.
#
#   $env:OMNIDX_KEY='TUNE-XXXX-XXXX-XXXX-XXXX'; irm omnidx.net/edition.ps1 | iex
#
# Asks what you want and does it:
#   1  make an OmniDx Edition USB stick for a clean install, out of a Windows stick made by Microsoft's Media
#      Creation Tool (the full experience: Windows installs, the Edition sets itself up, the tune runs, one restart)
#   2  put OmniDx Edition on this PC as it is, no reinstall
#   3  take OmniDx Edition off this PC
# Windows stays the one Microsoft made. The Edition is apps, pictures and settings on top of it; every value it
# changes is written down first, and 3 puts it all back. Your key (from the page after you paid) runs the OmniDx
# tune in Extreme as the last step.
#
#   $env:OMNIDX_EDITION='usb';  irm omnidx.net/edition.ps1 | iex    straight to the USB stick
#   $env:OMNIDX_EDITION='here'; irm omnidx.net/edition.ps1 | iex    straight to this PC as it is
#   $env:OMNIDX_EDITION='undo'; irm omnidx.net/edition.ps1 | iex    take it off this PC
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
# Everything comes from omnidx.net. The Edition's Windows check points this at a copy served on the build machine
# itself (127.0.0.1 only) and answers the questions with the variables read below.
$base = 'https://omnidx.net'
if ("$env:OMNIDX_BASE" -match '^http://(127\.0\.0\.1|localhost)(:\d+)?$') { $base = "$env:OMNIDX_BASE" }
$mode = "$env:OMNIDX_EDITION".ToLower()
$quiet = "$env:OMNIDX_YES" -eq '1'
$installed = Join-Path $env:ProgramFiles 'OmniDx\Edition\setup.ps1'

function Say([string]$t, [string]$c = 'Gray') { Write-Host "  $t" -ForegroundColor $c }
function Sure([string]$q) { if ($quiet) { return $true }; return ((Read-Host "  $q") -match '^\s*[Yy]') }
function Ask([string]$q, [string]$default = '') {
  if ($quiet) { return $default }
  $a = Read-Host "  $q"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default }
  return $a.Trim()
}

$key = "$env:OMNIDX_KEY"
if (-not $key -and $env:OMNIDX_KEYFILE -and (Test-Path $env:OMNIDX_KEYFILE)) {
  # Handed over by the window that asked for administrator rights; read once, then gone.
  try { $key = (Get-Content $env:OMNIDX_KEYFILE -Raw).Trim() } catch { }
  Remove-Item $env:OMNIDX_KEYFILE -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Say 'OmniDx Edition' 'Magenta'
Say 'Genuine Windows from Microsoft, set up for games: the OmniDx look, OmniDx Search, Browser and Hub, Game Boost,' 'DarkGray'
Say 'the lean stage and the tune. Every change is written down first and one command puts it back.' 'DarkGray'
Write-Host ''

if (-not $mode) {
  $hasIt = Test-Path $installed
  Say '1  Make an OmniDx Edition USB stick, for a clean install (the full experience)' 'White'
  Say '2  Put OmniDx Edition on this PC as it is, no reinstall' 'White'
  if ($hasIt) { Say '3  Take OmniDx Edition off this PC' 'White' }
  Write-Host ''
  $pick = Ask $(if ($hasIt) { 'Type 1, 2 or 3 and press Enter' } else { 'Type 1 or 2 and press Enter' })
  $mode = switch ($pick) { '1' { 'usb' } '2' { 'here' } '3' { 'undo' } default { '' } }
  if (-not $mode) { Say 'Nothing picked, so nothing changed.' 'Yellow'; return }
}
if ($mode -notin @('usb', 'here', 'undo', 'fetch')) { Say "Unknown choice '$mode': use usb, here or undo." 'Yellow'; return }
if ($mode -eq 'undo' -and -not (Test-Path $installed)) { Say 'OmniDx Edition is not on this PC (nothing in C:\Program Files\OmniDx\Edition).' 'Yellow'; return }

# Setting the Edition up on this PC, and taking it off, need Windows PowerShell 5.1 with administrator rights; a
# window that is either not elevated or PowerShell 7 hands over to a fresh elevated 5.1 window. The key never goes
# on a command line (Windows keeps those in logs): it crosses in a file in this account's temp folder, read once.
$isAdmin = $false; $isCore = $PSVersionTable.PSEdition -eq 'Core'
if ($mode -in @('here', 'undo')) { $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
if ($mode -in @('here', 'undo') -and (-not $isAdmin -or $isCore)) {
  Say $(if ($isCore) { 'Switching to Windows PowerShell 5.1 with administrator rights...' } else { 'Asking for administrator rights...' }) 'DarkGray'
  $keyFile = ''
  if ($key) { $keyFile = Join-Path $env:TEMP ("omnidx-key-{0}.txt" -f [guid]::NewGuid().ToString('N').Substring(0, 8)); Set-Content -Path $keyFile -Value $key -Encoding ASCII }
  $cmd = "`$env:OMNIDX_KEYFILE='$keyFile'; `$env:OMNIDX_EDITION='$mode'; irm $base/edition.ps1 | iex"
  Start-Process powershell.exe -Verb $(if ($isAdmin) { 'Open' } else { 'RunAs' }) -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $cmd)
  return
}

if ($mode -eq 'undo') {
  Say 'Taking OmniDx Edition off this PC: every value it changed goes back and its apps and tasks go. Restart after it.' 'White'
  Say "The tune's own changes stay until its undo is run: `$env:OMNIDX_MODE='undo'; irm omnidx.net/go.ps1 | iex" 'DarkGray'
  if (-not (Sure 'Type Y and press Enter to go on')) { Say 'Nothing changed.' 'Yellow'; return }
  Set-ExecutionPolicy -Scope Process Bypass -Force
  & $installed -Undo
  return
}

# ---------------------------------------------------------------- the key
# The Edition comes with OmniDx Tune: the key from the page after paying. The key server says whether it is real
# (and not refunded) before anything is downloaded; if the server cannot be reached, the tune checks the key itself
# when it runs.
if ($mode -ne 'fetch') {
  if (-not $key -and -not $quiet) {
    Say 'Your key is on the page after you paid (omnidx.net/studio/activate/), and in the email with it.' 'DarkGray'
    $key = Ask 'Paste your key (TUNE-XXXX-XXXX-XXXX-XXXX) and press Enter'
  }
  if ($key) {
    $c = ($key -replace '[^A-Za-z0-9]', '').ToUpperInvariant()
    if ($c -notmatch '^(TUNE|SQUAD)([A-Z0-9]{16})$') { Say 'That does not look like a key: it looks like TUNE-XXXX-XXXX-XXXX-XXXX.' 'Red'; return }
    $key = '{0}-{1}-{2}-{3}-{4}' -f $Matches[1], $Matches[2].Substring(0, 4), $Matches[2].Substring(4, 4), $Matches[2].Substring(8, 4), $Matches[2].Substring(12, 4)
    $api = ''
    try { $cfg = Invoke-RestMethod -Uri ("$base/tune/config.json?v={0}" -f [DateTime]::UtcNow.Ticks) -TimeoutSec 15; if ($cfg.api) { $api = [string]$cfg.api } } catch { }
    if ($api -and -not $quiet) {
      $r = $null
      try { $r = Invoke-RestMethod -Method Post -Uri ('{0}/v1/tune/check' -f $api.TrimEnd('/')) -ContentType 'application/json' -Body (@{ key = $key } | ConvertTo-Json -Compress) -TimeoutSec 15 } catch { }
      if ($r -and $r.ok) { Say ('Key checked: yours, on {0} of {1} PC{2} so far.' -f $r.used, $r.seats, $(if ($r.seats -ne 1) { 's' } else { '' })) 'Green' }
      elseif ($r) { Say ("The key server says: {0} Nothing has changed. If you paid, the page after paying (omnidx.net/studio/activate/) gets your key again with your receipt number." -f $r.reason) 'Red'; return }
      else { Say 'Could not reach the key server just now; the tune checks the key itself when it runs.' 'Yellow' }
    }
  }
  elseif (-not $quiet) {
    Say 'OmniDx Edition comes with OmniDx Tune ($19.99 once, all sales final): omnidx.net/studio/pricing/' 'Yellow'
    Say 'Buy it, then run this again with the line on the page after paying: your key is already in it.' 'Yellow'
    return
  }
}

# ---------------------------------------------------------------- the download
# One zip and the SHA-256 published next to it; a download that does not match is fetched again, never opened.
function Get-Edition {
  $dir = Join-Path $env:TEMP ('omnidx-edition-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $web = New-Object System.Net.WebClient
  $web.Headers['User-Agent'] = 'OmniDxEdition/go'
  $bust = [DateTime]::UtcNow.Ticks
  $rec = $null
  try { $rec = $web.DownloadString("$base/edition/edition.json?v=$bust") | ConvertFrom-Json } catch { }
  $want = if ($rec) { ([string]$rec.sha256).ToLower() } else { '' }
  if ($want -notmatch '^[0-9a-f]{64}$') { throw 'Could not read the Edition download record from omnidx.net. Check your connection and try again in a minute.' }
  $zip = Join-Path $dir 'omnidx-edition.zip'
  $got = ''
  foreach ($try in 1..2) {
    try { $web.DownloadFile("$base/edition/omnidx-edition.zip?v=$bust-$try", $zip) } catch { continue }
    $got = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
    if ($got -eq $want) { break }
    Say "The download did not match its published hash (attempt $try); fetching again." 'Yellow'
    $got = ''
  }
  if (-not $got) { throw 'Could not download a good copy of OmniDx Edition from omnidx.net. Check your connection and try again in a minute.' }
  Say ('OmniDx Edition {0} downloaded ({1:N1} MB); sha256 {2}... matches the one published next to it.' -f $rec.version, ($rec.bytes / 1MB), $want.Substring(0, 12)) 'DarkGray'
  $to = Join-Path $dir 'edition'
  Expand-Archive -Path $zip -DestinationPath $to -Force
  try { Get-ChildItem $to -Recurse -File | Unblock-File } catch { }
  return $to
}

if ($mode -eq 'fetch') { $d = Get-Edition; Say "Unpacked to $d" 'Green'; return }

# ---------------------------------------------------------------- 2: this PC as it is
if ($mode -eq 'here') {
  Say 'This sets OmniDx Edition up on this PC as it is: the OmniDx look, the taskbar on the left, OmniDx Search on' 'White'
  Say 'Windows + S, OmniDx Browser for web links, OmniDx Hub, the Competitive preset and the lean stage, then the tune' 'White'
  Say "in Extreme with your key. Your files and apps stay. It restarts the PC at the end." 'White'
  Say 'Save your work and close your games first. To take it off later: this command again, option 3.' 'DarkGray'
  if (-not (Sure 'Type Y and press Enter to go on')) { Say 'Nothing changed.' 'Yellow'; return }
  $dir = Get-Edition
  Set-ExecutionPolicy -Scope Process Bypass -Force
  $env:OMNIDX_KEY = $key
  try { & (Join-Path $dir 'setup.ps1') } finally { $env:OMNIDX_KEY = '' }
  return
}

# ---------------------------------------------------------------- 1: the USB stick
function Find-Sticks {
  @([IO.DriveInfo]::GetDrives() | Where-Object {
      $_.IsReady -and $_.Name -ne "$env:SystemDrive\" -and (Test-Path (Join-Path $_.Name 'setup.exe')) -and (Test-Path (Join-Path $_.Name 'sources'))
    })
}
function Show-Stick($d) { '{0}  {1}  {2:N1} GB' -f $d.Name.TrimEnd('\'), $(if ($d.VolumeLabel) { $d.VolumeLabel } else { 'USB' }), ($d.TotalSize / 1GB) }

$drive = "$env:OMNIDX_DRIVE"
if (-not $drive) {
  $opened = $false
  while ($true) {
    $sticks = Find-Sticks
    if ($sticks.Count -eq 1) {
      Say ('Found a Windows USB stick: {0}' -f (Show-Stick $sticks[0])) 'Green'
      if (Sure 'Use it? Type Y and press Enter') { $drive = $sticks[0].Name; break }
      Say 'Nothing changed.' 'Yellow'; return
    }
    if ($sticks.Count -gt 1) {
      Say 'Windows USB sticks found:' 'Green'
      for ($i = 0; $i -lt $sticks.Count; $i++) { Say ('{0}  {1}' -f ($i + 1), (Show-Stick $sticks[$i])) 'White' }
      $n = 0
      if ([int]::TryParse((Ask 'Type the number of the one to use and press Enter'), [ref]$n) -and $n -ge 1 -and $n -le $sticks.Count) { $drive = $sticks[$n - 1].Name; break }
      Say 'Nothing picked, so nothing changed.' 'Yellow'; return
    }
    if ($quiet) { throw 'No Windows USB stick found and OMNIDX_DRIVE not set.' }
    Say 'No Windows USB stick plugged in. Make one with Microsoft Media Creation Tool (free, from Microsoft):' 'Yellow'
    Say '  1. Plug in a USB stick of 8 GB or more. Everything on it is erased.' 'White'
    Say '  2. On the Microsoft page (opening now), under "Create Windows 11 Installation Media", press Download Now and run it.' 'White'
    Say '  3. Accept, keep the language, pick "USB flash drive", then your stick. It takes 20 to 40 minutes.' 'White'
    if (-not $opened) { try { Start-Process 'https://www.microsoft.com/software-download/windows11' } catch { }; $opened = $true }
    if ((Ask 'When the stick is ready, press Enter to look again (or type Q to stop)') -match '^[Qq]') { Say 'Nothing changed.' 'Yellow'; return }
  }
}

$account = if ($env:OMNIDX_ACCOUNT) { "$env:OMNIDX_ACCOUNT" } else { 'Player' }
while (-not $quiet) {
  $account = Ask "A name for your Windows account (press Enter for $account)" $account
  if ($account -match '["/\\\[\]:;|=,+*?<>@]' -or $account.Length -gt 20 -or $account -match '^(administrator|guest|user|admin)$') {
    Say 'Up to 20 letters or numbers, none of " / \ [ ] : ; | = , + * ? < > @, and not Administrator, Guest, User or Admin.' 'Yellow'
    $account = 'Player'; continue
  }
  break
}

$dir = Get-Edition
Set-ExecutionPolicy -Scope Process Bypass -Force
$usbArgs = @{ Drive = $drive; Account = $account }
if ($key) { $usbArgs.Key = $key }
& (Join-Path $dir 'make-usb.ps1') @usbArgs

Write-Host ''
Say 'Next, on the PC you are installing on:' 'Magenta'
Say '1. Back up anything you want to keep. A clean install erases the disk you pick.' 'White'
Say '2. Plug the stick in, restart, and open the boot menu as it starts (F12, F11, F8 or Esc, depending on the' 'White'
Say '   maker; the screen usually says which). Pick the USB stick.' 'White'
Say '3. Windows setup asks which disk to install on: pick it yourself. The rest answers itself.' 'White'
Say '4. At the first sign-in OmniDx Edition sets itself up in a window you can watch (about three minutes, then' 'White'
Say '   the tune), and restarts into it. The account has no password to start with: add one in Settings > Accounts.' 'White'
Say 'The whole guide: omnidx.net/studio/edition/' 'DarkGray'
