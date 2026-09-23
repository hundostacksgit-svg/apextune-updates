# OmniDx Tune - the one command.
#
#   irm omnidx.net/go.ps1 | iex
#
# Gets administrator rights, fetches the tune and opens the app: a window
# that reads your PC, lets you tick what to keep, takes your key and runs the
# tune with a live log. Nothing is installed; it runs from memory and leaves
# its report, its undo script and its backups in C:\OmniDx.
#
#   $env:OMNIDX_MODE='report'; irm omnidx.net/go.ps1 | iex     free look, changes nothing
#   $env:OMNIDX_MODE='undo';   irm omnidx.net/go.ps1 | iex     put everything back
#   $env:OMNIDX_MODE='check';  irm omnidx.net/go.ps1 | iex     check a key's format, nothing else
#   $env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex     what is still in place, what an update put back
#   $env:OMNIDX_MODE='support'; irm omnidx.net/go.ps1 | iex    zip the logs and numbers to the desktop for support
#   $env:OMNIDX_MODE='console'; irm omnidx.net/go.ps1 | iex    the console flow instead of the window
#   $env:OMNIDX_MODE='extreme'; irm omnidx.net/go.ps1 | iex    the app with Extreme ticked (caution: fewer conveniences)
#   $env:OMNIDX_FLAGS='-Aggressive -CutXbox -Dns -NoKeep'       options (see omnidx.net/studio/download/#options)
#   $env:OMNIDX_KEEP='Wallpaper Engine,RTSS'                    startup entries to leave on
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
$base = 'https://omnidx.net'
$mode = "$env:OMNIDX_MODE".ToLower()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$isCore = $PSVersionTable.PSEdition -eq 'Core'
$key = $env:OMNIDX_KEY
if (-not $key -and $env:OMNIDX_KEYFILE -and (Test-Path $env:OMNIDX_KEYFILE)) {
  # Handed over by the window that asked for administrator rights; read once, then gone.
  try { $key = (Get-Content $env:OMNIDX_KEYFILE -Raw).Trim() } catch { }
  Remove-Item $env:OMNIDX_KEYFILE -Force -ErrorAction SilentlyContinue
}
if (-not $mode) { $mode = 'app' }
# Only the key check needs the key here. The tune itself reuses the key
# already bound to this PC, and asks only on a first run.
if (-not $key -and $mode -eq 'check') {
  Write-Host ''
  Write-Host '  OmniDx Tune' -ForegroundColor Magenta
  Write-Host '  Your key is on the page after you paid: omnidx.net/studio/activate/' -ForegroundColor DarkGray
  $key = Read-Host '  Paste your key (TUNE-XXXX-XXXX-XXXX-XXXX)'
  $key = ($key -replace '\s', '').ToUpper()
}

# The tune needs Windows PowerShell 5.1 (Checkpoint-Computer and the Store app
# commands live only there) and administrator rights. A window that is either
# not elevated or PowerShell 7 hands over to a fresh elevated 5.1 window.
# Status and the key check only read, so they run right here, in any PowerShell, without asking for anything.
if (($mode -ne 'status' -and $mode -ne 'check' -and $mode -ne 'support') -and (-not $isAdmin -or $isCore)) {
  Write-Host $(if ($isCore) { '  Switching to Windows PowerShell 5.1 with administrator rights...' } else { '  Asking for administrator rights...' }) -ForegroundColor DarkGray
  # The key never goes on a command line (Windows keeps those in logs). It crosses to the
  # elevated window in a file in this account's own temp folder, which that window deletes.
  $keyFile = ''
  if ($key) { $keyFile = Join-Path $env:TEMP ("omnidx-key-{0}.txt" -f [guid]::NewGuid().ToString('N').Substring(0, 8)); Set-Content -Path $keyFile -Value $key -Encoding ASCII }
  $cmd = "`$env:OMNIDX_KEYFILE='$keyFile'; `$env:OMNIDX_MODE='$mode'; `$env:OMNIDX_FLAGS='$($env:OMNIDX_FLAGS)'; `$env:OMNIDX_KEEP='$($env:OMNIDX_KEEP)'; irm $base/go.ps1 | iex"
  $verb = if ($isAdmin) { 'Open' } else { 'RunAs' }
  Start-Process powershell.exe -Verb $verb -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $cmd)
  return
}

# The licence server, if one is configured, comes from the same place the site reads it.
$web = New-Object System.Net.WebClient
$web.Encoding = [System.Text.Encoding]::UTF8
$web.Headers['User-Agent'] = 'OmniDxTune/go'
$bust = [DateTime]::UtcNow.Ticks
$api = ''; $want = ''
try { $cfg = $web.DownloadString("$base/tune/config.json?v=$bust") | ConvertFrom-Json; if ($cfg.api) { $api = [string]$cfg.api }; if ($cfg.sha256) { $want = ([string]$cfg.sha256).ToLower() } } catch { }

# Fetched fresh every run, past any cache, so a fix reaches you on your next
# run - and checked against the hash published next to it, so a truncated
# download, a stale cache or a tampered copy never runs.
$sha = [System.Security.Cryptography.SHA256]::Create()
$script = ''
foreach ($try in 1..2) {
  try { $script = $web.DownloadString("$base/tune/omnidx.ps1?v=$bust-$try") } catch { $script = '' }
  if (-not $script -or $script.Length -lt 1000 -or $script -notmatch 'function Main') { continue }
  if (-not $want) { break }
  $got = (($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($script)) | ForEach-Object { $_.ToString('x2') }) -join '')
  if ($got -eq $want) { Write-Host ("  Script verified: sha256 {0}... matches the hash published at omnidx.net/tune/config.json" -f $got.Substring(0, 12)) -ForegroundColor DarkGray; break }
  Write-Host ("  The script did not match its published hash (attempt {0}); fetching again." -f $try) -ForegroundColor Yellow
  $script = ''
}
if (-not $script) { throw 'Could not fetch a good copy of the tune from omnidx.net. Check your connection and try again in a minute.' }
$block = [scriptblock]::Create([string]$script)

# Options ride in on one more variable, so the one command never changes.
$opts = @{}
foreach ($f in ("$env:OMNIDX_FLAGS" -split '[\s,]+' | Where-Object { $_ })) {
  $name = $f.TrimStart('-')
  if ($name -match '^(Aggressive|CutXbox|Dns|NoRestorePoint|NoAfterCount|NoKeep|Extreme|Yes)$') { $opts[$name] = $true }
}
if ($env:OMNIDX_KEEP) { $opts['Keep'] = @($env:OMNIDX_KEEP -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
switch ($mode) {
  'undo'   { & $block -Undo }
  'report' { & $block -Report }
  'status' { & $block -Status }
  'support' { & $block -SupportBundle }
  'check'  { & $block -Key $key -CheckKey }
  'app'    { & $block -Key $key -Api $api -Gui @opts }
  'extreme' { & $block -Key $key -Api $api -Gui -Extreme @opts }
  default  { & $block -Key $key -Api $api @opts }
}
